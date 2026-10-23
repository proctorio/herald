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

// Bumped by every start and stop request. A start whose voice lookup is
// overtaken by a newer request gives up instead of speaking stale text.
let requestSeq = 0;

// Speaks text as a lockdown read, replacing any lockdown read in progress.
// Throws error_no_voice when no local voice fits; the caller logs it.
export async function startLockdownRead(text)
{
	const seq = ++requestSeq;
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
	if (seq != requestSeq) return;

	const id = String(seq) + "-" + Date.now();

	// these voices don't pause reliably, so the player stops them instead
	const stopOnPause = isGoogleNative(voice) || isChromeOSNative(voice);
	await setState({id,
																	startedAt: Date.now(),
																	paused: false,
																	stopOnPause});

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
			if (FINAL_EVENTS.includes(event.type)) clearState(id).catch(console.error);
		}
	});
}

// Stops the lockdown read. Returns false, and stops nothing, when no lockdown
// read is playing, so Herald's own reading survives a lockdown stop.
export async function stopLockdownRead()
{
	requestSeq++;
	if (!await getState()) return false;
	await brapi.storage.session.remove(STATE_KEY);
	brapi.tts.stop();

	return true;
}

// Pauses the lockdown read; false when there is none to pause.
export async function pauseLockdownRead()
{
	const state = await getState();
	if (!state || state.paused) return Boolean(state);
	if (state.stopOnPause) return stopLockdownRead();
	brapi.tts.pause();
	await setState({...state,
																	paused: true});

	return true;
}

// Resumes a paused lockdown read; false when there is none.
export async function resumeLockdownRead()
{
	const state = await getState();
	if (!state || !state.paused) return false;
	brapi.tts.resume();
	await setState({...state,
																	paused: false});

	return true;
}

// "PLAYING" or "PAUSED" while a lockdown read is active, otherwise null.
export async function getLockdownReadState()
{
	const state = await getState();
	if (!state) return null;

	return state.paused ? "PAUSED" : "PLAYING";
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
