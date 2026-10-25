import { brapi } from "./brapi.js";
import { defaults, getSettings, getSetting, selectSpeechVoice, labelMacVoices, detectTextLanguage, isGoogleNative, isChromeOSNative } from "./defaults.js";
import { applyPronunciations } from "./pronunciation.js";

// Lockdown reads (WI-B): text a Proctorio lockdown build sends over the
// lockdown channel, spoken by the service worker with chrome.tts. Herald gets
// the text in the message and never touches the exam page: no script, no
// player frame, no highlighting. The student's own voice settings apply,
// limited to local voices so exam text never leaves the device.
//
// The service worker can sleep in the middle of a read, so whether a lockdown
// read is playing lives in session storage, not in memory. That is what lets
// the lockdown's stop, and Herald's own stop and pause, find the read after a
// restart. Only a lockdown read is ever stopped this way: with no record,
// Herald's own page reading is left alone.
const STATE_KEY = "lockdownRead";

// A lockdown read is at most 10000 characters and ends well within this even at
// the slowest rate. A record older than this lost its end event while the
// service worker slept.
const MAX_READ_MS = 60 * 60 * 1000;

// chrome.tts can take a moment to report speaking after speak(), so a record
// this new is not judged by isSpeaking yet.
const START_GRACE_MS = 10 * 1000;

const FINAL_EVENTS = ["end", "error", "interrupted", "cancelled"];

// Bumped by every claimed read, by every stop from Herald's own controls, and
// by a lockdown stop for the claimed read's tab. A read checks it before and
// after writing its record, so such a stop, or a newer read, that arrives at
// any point before it speaks cancels it.
let requestSeq = 0;

// The tab the latest claimed read came from. A lockdown stop for another tab
// must leave that read alone.
let claimedTabId = null;

// Record changes and the chrome.tts calls that go with them run one at a time,
// so a stop for one tab can't remove or silence a read that another tab
// started in between.
let exclusiveChain = Promise.resolve();

function exclusive(task)
{
	const run = exclusiveChain.then(task);
	exclusiveChain = run.catch(() => null);

	return run;
}

// Claims the next lockdown read for a tab. Claim before any wait that comes
// ahead of startLockdownRead (events.js stops the player first), so a stop for
// that tab that arrives during the wait still cancels this read.
export function claimLockdownRead(tabId = null)
{
	claimedTabId = tabId;

	return ++requestSeq;
}

// Speaks text as a lockdown read from a tab, replacing any lockdown read in
// progress. Throws error_no_voice when no local voice fits; the caller logs it.
export async function startLockdownRead(text, {tabId = null, seq = claimLockdownRead(tabId)} = {})
{
	const settings = await getSettings();
	const lang = await detectTextLanguage(text) || uiLanguage();
	const voices = labelMacVoices(await new Promise(f => brapi.tts.getVoices(f)) || [], (await brapi.runtime.getPlatformInfo()).os);
	const voice = selectSpeechVoice(voices, {
		voiceName: settings.voiceName,
		lang,
		preferredVoices: (await getSetting("preferredVoices")) || {},
		localOnly: true
	});
	if (!voice) throw new Error(JSON.stringify({code: "error_no_voice",
																																													lang}));
	const rate = (await getSetting("rate" + (settings.voiceName || ""))) || defaults.rate;

	// these voices don't pause reliably, so the player stops them instead
	const stopOnPause = isGoogleNative(voice) || isChromeOSNative(voice);

	await exclusive(async() =>
	{
		// a stop or a newer read that came during the lookup cancels this one
		if (seq != requestSeq) return;

		const id = String(seq) + "-" + Date.now();
		await setState({id,
																		tabId,
																		startedAt: Date.now(),
																		paused: false,
																		stopOnPause});

		// a stop that came during the write cancels it too: the read drops its
		// record and stays silent
		if (seq != requestSeq)
		{
			await clearState(id);

			return;
		}

		// stop() also un-pauses the channel, which would otherwise hold the new utterance
		brapi.tts.stop();
		brapi.tts.speak(asPlainText(applyPronunciations(text)), {
			voiceName: voice.voiceId || voice.voiceName,
			lang,
			rate: rate * (isGoogleNative(voice) ? 0.9 : 1),
			pitch: settings.pitch || defaults.pitch,
			volume: settings.volume || defaults.volume,
			requiredEventTypes: ["start", "end"],
			desiredEventTypes: ["start", "end", "error", "interrupted", "cancelled"],
			onEvent: function(event)
			{
				if (FINAL_EVENTS.includes(event.type)) exclusive(() => clearState(id)).catch(console.error);
			}
		});
	});
}

// Stops a lockdown read. With a tabId (the lockdown's stop) it stops only a
// read that came from that tab, whether still in flight or speaking; with none
// (Herald's own controls) it stops any lockdown read. Returns false, and stops
// nothing, when there is no such read, so Herald's own reading survives a
// lockdown stop.
export function stopLockdownRead(tabId = null)
{
	// decided at once, in message order, before any wait
	if (tabId === null || tabId === claimedTabId) requestSeq++;

	return exclusive(() => stopRecordedRead(tabId));
}

// Pauses the lockdown read; false when there is none to pause.
export function pauseLockdownRead()
{
	return exclusive(async() =>
	{
		const state = await getState();
		if (!state || state.paused) return Boolean(state);
		if (state.stopOnPause)
		{
			requestSeq++;

			return stopRecordedRead(null);
		}
		brapi.tts.pause();
		await setState({...state,
																		paused: true});

		return true;
	});
}

// Resumes a paused lockdown read; false when there is none.
export function resumeLockdownRead()
{
	return exclusive(async() =>
	{
		const state = await getState();
		if (!state || !state.paused) return false;
		brapi.tts.resume();
		await setState({...state,
																		paused: false});

		return true;
	});
}

// "PLAYING" or "PAUSED" while a lockdown read is active, otherwise null.
export function getLockdownReadState()
{
	return exclusive(async() =>
	{
		const state = await getState();
		if (!state) return null;

		return state.paused ? "PAUSED" : "PLAYING";
	});
}

// Stops the recorded read if it matches tabId (any read for null). Runs inside
// exclusive(), so no other read can write its record in between.
async function stopRecordedRead(tabId)
{
	const state = await getState();
	if (!state || (tabId !== null && state.tabId !== tabId)) return false;
	await brapi.storage.session.remove(STATE_KEY);
	brapi.tts.stop();

	return true;
}

// The current record, or null when there is none or it no longer describes
// speech: too old, or past the start grace with nothing speaking (isSpeaking
// is browser-wide, so true does not prove the read is still ours, but false
// proves it is over).
async function getState()
{
	const {[STATE_KEY]: state} = await brapi.storage.session.get(STATE_KEY);
	if (!state) return null;
	const age = Date.now() - state.startedAt;
	const stale = age > MAX_READ_MS || (!state.paused && age > START_GRACE_MS && !await new Promise(f => brapi.tts.isSpeaking(f)));
	if (stale)
	{
		await brapi.storage.session.remove(STATE_KEY);

		return null;
	}

	return state;
}

function setState(state)
{
	return brapi.storage.session.set({[STATE_KEY]: state});
}

// Clears the record only if it is still this read's, so the end of a replaced
// read can't clear the read that replaced it.
async function clearState(id)
{
	const {[STATE_KEY]: state} = await brapi.storage.session.get(STATE_KEY);
	if (state && state.id == id) await brapi.storage.session.remove(STATE_KEY);
}

// chrome.tts treats a complete SSML document as markup. Lockdown text is read
// as written, so markup-shaped text is escaped.
function asPlainText(text)
{
	if (!(/^\s*<(speak|\?xml)\b/i).test(text)) return text;

	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function uiLanguage()
{
	return brapi.i18n.getUILanguage && brapi.i18n.getUILanguage() || "en-US";
}
