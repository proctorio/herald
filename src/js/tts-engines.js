import { brapi } from "./brapi.js";
import * as rxjs from "./vendor/rxjs.js";
import { promiseTimeout, getSetting, selectSpeechVoice, labelMacVoices } from "./defaults.js";

export var browserTtsEngine = brapi.tts ? new BrowserTtsEngine() : (typeof speechSynthesis != "undefined" ? new WebSpeechEngine() : new DummyTtsEngine());

/**
 * VOICES
 */
export const voices$ = rxjs.defer(() => browserTtsEngine.getVoices()).pipe(rxjs.shareReplay(1));

export async function getSpeechVoice(voiceName, lang) 
{
	const voices = await rxjs.firstValueFrom(voices$);

	return selectSpeechVoice(voices, {
		voiceName,
		lang,
		preferredVoices: lang ? (await getSetting("preferredVoices")) || {} : {},

		// exam-safe mode never selects a network voice, even a pinned one: the
		// browser can expose remote voices (for example Google network voices)
		// through chrome.tts, and reading exam text must stay on-device
		localOnly: await getSetting("examSafeMode")
	});
}

// synthesized audio cache
export const cache = {
	entries: new Map(),
	maxEntries: 5,
	async fetchCached(key, fetchFn, destroyFn) 
	{
		const entry = this.entries.get(key);
		if (entry) return entry.value;
		const value = await fetchFn();
		this.entries.set(key, {value,
																									destroyFn});
		while (this.entries.size > this.maxEntries) 
		{
			const [oldestKey, oldest] = this.entries.entries().next().value;
			oldest.destroyFn?.(oldest.value);
			this.entries.delete(oldestKey);
		}
		
		return value;
	}
};

/*
interface Options {
  voice: {
    voiceName: string
    autoSelect?: boolean
  }
  lang: string
  rate?: number
  pitch?: number
  volume?: number
}

interface Event {
  type: string  // start, end, error, or interrupted: something other than Herald stopped the speech
}

interface Voice {
  voiceName: string
  lang: string
}

interface TtsEngine {
  speak: function(text: string, opts: Options, playbackState$: Observable<"paused"|"resumed">): Observable<TtsEvent>
  getVoices: function(): Voice[]
}
*/

export function BrowserTtsEngine() 
{
	brapi.tts.stop();    // workaround: chrome.tts.speak doesn't work first time on cold start for some reason

	// chrome.tts reports a stop() or a newer speak() as "interrupted" without saying who
	// made the call. Herald marks the utterances it ends itself and relays only the other
	// interrupts, so a stop or speak from elsewhere (another part of the extension, say)
	// can't leave the player waiting on speech that is gone.
	let current;
	this.speak = function(text, options, onEvent) 
	{
		const utterance = {ours: false};
		if (current) current.ours = true;
		current = utterance;
		brapi.tts.speak(text, {
			voiceName: options.voice.voiceId || options.voice.voiceName,
			lang: options.lang,
			rate: options.rate,
			pitch: options.pitch,
			volume: options.volume,
			requiredEventTypes: ["start", "end"],
			desiredEventTypes: ["start", "end", "error", "interrupted", "cancelled"],
			onEvent: event =>
			{
				if (event.type != "interrupted" && event.type != "cancelled") onEvent(event);
				else if (!utterance.ours) onEvent({type: "interrupted"});
			}
		});
	};
	this.stop = function()
	{
		if (current) current.ours = true;
		brapi.tts.stop();
	};
	this.pause = brapi.tts.pause;
	this.resume = brapi.tts.resume;
	this.isSpeaking = brapi.tts.isSpeaking;
	this.getVoices = async function() 
	{
		const voices = await new Promise(f => brapi.tts.getVoices(f)) || [];
		const platform = await brapi.runtime.getPlatformInfo();

		return labelMacVoices(voices, platform.os);
	};
}

export function WebSpeechEngine() 
{
	var utter;
	let current;    // the utterance Herald spoke last; see BrowserTtsEngine
	this.speak = function(text, options, onEvent)
	{
		const utterance = {ours: false};
		if (current) current.ours = true;    // the cancel() below ends the previous utterance
		current = utterance;
		utter = new SpeechSynthesisUtterance();
		utter.text = text;
		utter.voice = options.voice;
		if (options.lang) utter.lang = options.lang;
		if (options.pitch) utter.pitch = options.pitch;
		if (options.rate) utter.rate = options.rate;
		if (options.volume) utter.volume = options.volume;
		utter.onstart = onEvent.bind(null, {type: "start",
																																						charIndex: 0});
		utter.onend = onEvent.bind(null, {type: "end",
																																				charIndex: text.length});
		utter.onerror = function(event) 
		{
			if (event.error == "canceled" || event.error == "interrupted")
			{
				// a cancel Herald made stays silent; anyone else's ends this playback
				if (!utterance.ours) onEvent({type: "interrupted"});

				return;
			}
			onEvent({type: "error",
												error: new Error(event.error)});
		};
		speechSynthesis.cancel();
		speechSynthesis.speak(utter);
	};
	this.stop = function() 
	{
		if (current) current.ours = true;
		if (utter) utter.onend = null;
		speechSynthesis.cancel();
	};
	this.pause = function() 
	{
		speechSynthesis.pause();
	};
	this.resume = function() 
	{
		speechSynthesis.resume();
	};
	this.isSpeaking = function(callback) 
	{
		callback(speechSynthesis.speaking);
	};
	this.getVoices = function() 
	{
		return promiseTimeout(1500, "Timeout WebSpeech getVoices", new Promise(function(fulfill) 
		{
			var voices = speechSynthesis.getVoices() || [];
			if (voices.length) fulfill(voices);
			else speechSynthesis.onvoiceschanged = function() 
			{
				fulfill(speechSynthesis.getVoices() || []);
			};
		}))
			.then(function(voices) 
			{
				for (var i = 0; i < voices.length; i++) voices[i].voiceName = voices[i].name;
				
				return voices;
			})
			.catch(function(err) 
			{
				console.error(err);
				
				return [];
			});
	};
}

export function DummyTtsEngine() 
{
	this.getVoices = function() 
	{
		return Promise.resolve([]);
	};
}

export function TimeoutTtsEngine(baseEngine, startTimeout, endTimeout) 
{
	let speakSub;
	this.speak = function(text, options, onEvent) 
	{
		speakSub = new rxjs.Observable(observer => 
		{
			baseEngine.speak(text, options, event => observer.next(event));
		}).pipe(
			rxjs.timeout({
				first: startTimeout,
				with() 
				{
					console.debug(`No 'start' event after ${startTimeout}, will call stop() and retry once`);
					baseEngine.stop();
					
					return rxjs.throwError(() => new Error("Timeout, TTS never started, try picking another voice?"));
				}
			}),
			rxjs.retry(1),
			rxjs.mergeMap(event =>
				rxjs.iif(
					() => event.type == "start",
					rxjs.timer(endTimeout).pipe(
						rxjs.map(() => 
						{
							console.debug(`No 'end' event after ${endTimeout}, will call stop() and generate 'end'`);
							baseEngine.stop();
							
							return {type: "end",
															charIndex: text.length};
						}),
						rxjs.startWith(event)
					),
					rxjs.of(event)
				)),
			rxjs.catchError(error => rxjs.of({type: "error",
																																					error})),
			rxjs.takeWhile(event => event.type != "end" && event.type != "error" && event.type != "interrupted", true)
		).subscribe(onEvent);
	};
	this.stop = function() 
	{
		if (speakSub) speakSub.unsubscribe();
		baseEngine.stop();
	};
	this.isSpeaking = baseEngine.isSpeaking;
}
