/**
 * @description Tests for tts-engines.js: the browser engine lifecycle, the web
 * speech fallback, the timeout wrapper, the shared voice observable, and the
 * voice selection precedence.
 */
import { vi } from "vitest";
import * as rxjs from "rxjs";
import { browserTtsEngine, voices$, getSpeechVoice, cache, BrowserTtsEngine, WebSpeechEngine, DummyTtsEngine, TimeoutTtsEngine } from "../src/js/tts-engines.js";
import { updateSettings } from "../src/js/defaults.js";

/**
 * @description Voice fixtures shared by the selection tests. Voices$ caches its
 * first emission for the lifetime of the module, so every test in this file
 * uses this same list.
 */
const VOICES = [
	{ voiceName: "Alpha English Offline",
			lang: "en-US",
			remote: false },
	{ voiceName: "Google US English",
			lang: "en-US",
			remote: false },
	{ voiceName: "Remote English",
			lang: "en-GB",
			remote: true },
	{ voiceName: "French Offline",
			lang: "fr-FR",
			remote: false }
];

/**
 * @description Seeds the chrome.tts fake with the shared voice fixtures.
 */
function seedVoices()
{
	chrome.__tts.voices.length = 0;
	for (const voice of VOICES) chrome.__tts.voices.push({ ...voice });
}

/**
 * @description Delivers the final event chrome.tts sends an utterance when a stop()
 * or speak() that did not come from Herald's engine ends it.
 *
 * @param {Object} utterance - The chrome.tts fake's record of the utterance.
 * @param {string} type - The final event type, interrupted or cancelled.
 */
function interruptFromOutside(utterance, type)
{
	utterance.options.onEvent({ type });
}

describe("BrowserTtsEngine", () =>
{
	it("passes text and options to chrome.tts and relays events", async() =>
	{
		const engine = new BrowserTtsEngine();
		const events = [];
		chrome.__tts.eventScript = [{ type: "start" }, { type: "end" }];
		engine.speak("hello", { voice: { voiceName: "Alpha English Offline" },
																										lang: "en-US",
																										rate: 1.5 }, event => events.push(event.type));
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(chrome.__tts.utterances[0].text).toBe("hello");
		expect(chrome.__tts.utterances[0].options.voiceName).toBe("Alpha English Offline");
		expect(chrome.__tts.utterances[0].options.rate).toBe(1.5);
		expect(events).toEqual(["start", "end"]);
	});

	it("prefers voiceId over voiceName when speaking", async() =>
	{
		const engine = new BrowserTtsEngine();
		engine.speak("x", { voice: { voiceName: "MacOS English [Fred]",
																															voiceId: "Fred" } }, () => null);
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(chrome.__tts.utterances[0].options.voiceName).toBe("Fred");
	});

	it("asks chrome.tts for the final interrupted and cancelled events", async() =>
	{
		const engine = new BrowserTtsEngine();
		engine.speak("x", { voice: { voiceName: "Alpha English Offline" } }, () => null);
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(chrome.__tts.utterances[0].options.desiredEventTypes).toEqual(expect.arrayContaining(["interrupted", "cancelled"]));
	});

	it("reports an interrupt it did not cause as an interrupted event", async() =>
	{
		const engine = new BrowserTtsEngine();
		const events = [];
		chrome.__tts.eventScript = [{ type: "start" }];
		engine.speak("x", { voice: { voiceName: "Alpha English Offline" } }, event => events.push(event.type));
		await new Promise(resolve => setTimeout(resolve, 0));
		interruptFromOutside(chrome.__tts.utterances[0], "interrupted");

		expect(events).toEqual(["start", "interrupted"]);
	});

	it("reports a cancelled utterance as interrupted too", async() =>
	{
		const engine = new BrowserTtsEngine();
		const events = [];
		chrome.__tts.eventScript = [{ type: "start" }];
		engine.speak("x", { voice: { voiceName: "Alpha English Offline" } }, event => events.push(event.type));
		await new Promise(resolve => setTimeout(resolve, 0));
		interruptFromOutside(chrome.__tts.utterances[0], "cancelled");

		expect(events).toEqual(["start", "interrupted"]);
	});

	it("stays silent about an interrupt its own stop() caused", async() =>
	{
		const engine = new BrowserTtsEngine();
		const events = [];
		chrome.__tts.eventScript = [{ type: "start" }];
		engine.speak("x", { voice: { voiceName: "Alpha English Offline" } }, event => events.push(event.type));
		await new Promise(resolve => setTimeout(resolve, 0));
		engine.stop();
		interruptFromOutside(chrome.__tts.utterances[0], "interrupted");
		interruptFromOutside(chrome.__tts.utterances[0], "cancelled");

		expect(events).toEqual(["start"]);
	});

	it("stays silent about the interrupt its own next speak() caused", async() =>
	{
		const engine = new BrowserTtsEngine();
		const events = [];
		chrome.__tts.eventScript = [{ type: "start" }];
		engine.speak("first", { voice: { voiceName: "Alpha English Offline" } }, event => events.push(event.type));
		engine.speak("second", { voice: { voiceName: "Alpha English Offline" } }, () => null);
		await new Promise(resolve => setTimeout(resolve, 0));
		interruptFromOutside(chrome.__tts.utterances[0], "interrupted");

		expect(events).toEqual(["start"]);
	});

	it("still reports an outside interrupt on a newer utterance after an earlier stop()", async() =>
	{
		const engine = new BrowserTtsEngine();
		const events = [];
		chrome.__tts.eventScript = [{ type: "start" }];
		engine.speak("first", { voice: { voiceName: "Alpha English Offline" } }, () => null);
		engine.stop();
		engine.speak("second", { voice: { voiceName: "Alpha English Offline" } }, event => events.push(event.type));
		await new Promise(resolve => setTimeout(resolve, 0));
		interruptFromOutside(chrome.__tts.utterances[1], "interrupted");

		expect(events).toEqual(["start", "interrupted"]);
	});

	it("renames compact offline voices on mac", async() =>
	{
		chrome.__config.platformOs = "mac";
		chrome.__tts.voices.push({ voiceName: "Fred",
																													lang: "en-US",
																													remote: false });
		const engine = new BrowserTtsEngine();

		const voices = await engine.getVoices();
		expect(voices[0].voiceId).toBe("Fred");
		expect(voices[0].voiceName).toMatch(/^MacOS .* \[Fred\]$/u);
	});

	it("leaves voices untouched off mac", async() =>
	{
		chrome.__tts.voices.push({ voiceName: "Fred",
																													lang: "en-US",
																													remote: false });
		const engine = new BrowserTtsEngine();

		const voices = await engine.getVoices();
		expect(voices[0].voiceName).toBe("Fred");
		expect(voices[0].voiceId).toBeUndefined();
	});
});

describe("WebSpeechEngine", () =>
{
	it("speaks an utterance and relays start and end", async() =>
	{
		const engine = new WebSpeechEngine();
		const events = [];
		engine.speak("hi there", { voice: { voiceName: "Any" } }, event => events.push(event));
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(events.map(e => e.type)).toEqual(["start", "end"]);
		expect(events[1].charIndex).toBe(8);
	});

	it("relays real errors", () =>
	{
		const engine = new WebSpeechEngine();
		const events = [];
		engine.speak("x", { voice: {} }, event => events.push(event));
		speechSynthesis.__state.queue[0].onerror({ error: "synthesis-failed" });

		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("error");
		expect(events[0].error.message).toBe("synthesis-failed");
	});

	it.each(["canceled", "interrupted"])("reports an outside %s as an interrupted event", error =>
	{
		const engine = new WebSpeechEngine();
		const events = [];
		engine.speak("x", { voice: {} }, event => events.push(event));
		speechSynthesis.__state.queue[0].onerror({ error });

		expect(events.map(e => e.type)).toEqual(["interrupted"]);
	});

	it("stays silent about a cancel its own stop() caused", () =>
	{
		const engine = new WebSpeechEngine();
		const events = [];
		engine.speak("x", { voice: {} }, event => events.push(event));
		const utter = speechSynthesis.__state.queue[0];
		engine.stop();
		utter.onerror({ error: "interrupted" });
		utter.onerror({ error: "canceled" });

		expect(events).toEqual([]);
	});

	it("stays silent about the cancel its own next speak() caused", () =>
	{
		const engine = new WebSpeechEngine();
		const events = [];
		engine.speak("first", { voice: {} }, event => events.push(event));
		const first = speechSynthesis.__state.queue[0];
		engine.speak("second", { voice: {} }, () => null);
		first.onerror({ error: "canceled" });

		expect(events).toEqual([]);
	});

	it("still reports an outside cancel on a newer utterance after an earlier stop()", () =>
	{
		const engine = new WebSpeechEngine();
		const events = [];
		engine.speak("first", { voice: {} }, () => null);
		engine.stop();
		engine.speak("second", { voice: {} }, event => events.push(event));
		speechSynthesis.__state.queue[0].onerror({ error: "interrupted" });

		expect(events.map(e => e.type)).toEqual(["interrupted"]);
	});

	it("stop cancels speech and mutes the end event", async() =>
	{
		const engine = new WebSpeechEngine();
		const events = [];
		engine.speak("x", { voice: {} }, event => events.push(event));
		engine.stop();
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(events.map(e => e.type)).not.toContain("end");
		expect(speechSynthesis.__state.canceled).toBe(true);
	});

	it("maps getVoices names onto voiceName", async() =>
	{
		speechSynthesis.__state.voices.push({ name: "Web Voice",
																																								lang: "en-US" });
		const engine = new WebSpeechEngine();

		const voices = await engine.getVoices();
		expect(voices[0].voiceName).toBe("Web Voice");
	});

	it("resolves voices through onvoiceschanged when empty at first", async() =>
	{
		const engine = new WebSpeechEngine();
		const promise = engine.getVoices();
		speechSynthesis.__state.voices.push({ name: "Late Voice",
																																								lang: "en-US" });
		speechSynthesis.onvoiceschanged();

		const voices = await promise;
		expect(voices[0].voiceName).toBe("Late Voice");
	});
});

describe("DummyTtsEngine", () =>
{
	it("reports no voices", async() =>
	{
		const voices = await new DummyTtsEngine().getVoices();
		expect(voices).toEqual([]);
	});
});

describe("TimeoutTtsEngine", () =>
{
	/**
	 * @description Builds a scripted base engine whose event emission the test
	 * controls directly.
	 *
	 * @return {Object} - The fake base engine with an emit hook.
	 */
	function makeBase()
	{
		const base = {
			stops: 0,
			onEvent: null,

			/**
			 * @description Records the speak call and captures the event sink.
			 *
			 * @param {string} text - Ignored.
			 * @param {Object} options - Ignored.
			 * @param {Function} onEvent - The event sink.
			 */
			speak(text, options, onEvent)
			{
				base.onEvent = onEvent;
			},

			/**
			 * @description Counts stop calls.
			 */
			stop()
			{
				base.stops++;
			},

			/**
			 * @description Reports not speaking.
			 *
			 * @param {Function} callback - The callback.
			 */
			isSpeaking(callback)
			{
				callback(false);
			}
		};

		return base;
	}

	beforeEach(() =>
	{
		vi.useFakeTimers();
	});

	afterEach(() =>
	{
		vi.useRealTimers();
	});

	it("passes through start and end from the base engine", async() =>
	{
		const base = makeBase();
		const engine = new TimeoutTtsEngine(base, 1000, 10000);
		const events = [];
		engine.speak("t", {}, event => events.push(event.type));
		base.onEvent({ type: "start" });
		base.onEvent({ type: "end" });
		await vi.advanceTimersByTimeAsync(0);

		expect(events).toEqual(["start", "end"]);
	});

	it("stops and errors when the base never starts, after one retry", async() =>
	{
		const base = makeBase();
		const engine = new TimeoutTtsEngine(base, 1000, 10000);
		const events = [];
		engine.speak("t", {}, event => events.push(event));
		await vi.advanceTimersByTimeAsync(1001);
		await vi.advanceTimersByTimeAsync(1001);

		expect(base.stops).toBe(2);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("error");
	});

	it("generates a synthetic end when the base starts but never ends", async() =>
	{
		const base = makeBase();
		const engine = new TimeoutTtsEngine(base, 1000, 5000);
		const events = [];
		engine.speak("text", {}, event => events.push(event));
		base.onEvent({ type: "start" });
		await vi.advanceTimersByTimeAsync(5001);

		expect(events.map(e => e.type)).toEqual(["start", "end"]);
		expect(events[1].charIndex).toBe(4);
		expect(base.stops).toBe(1);
	});

	it("ends on an interrupted event and never generates an end after it", async() =>
	{
		const base = makeBase();
		const engine = new TimeoutTtsEngine(base, 1000, 5000);
		const events = [];
		engine.speak("text", {}, event => events.push(event.type));
		base.onEvent({ type: "start" });
		base.onEvent({ type: "interrupted" });
		await vi.advanceTimersByTimeAsync(5001);

		expect(events).toEqual(["start", "interrupted"]);
		expect(base.stops).toBe(0);
	});
});

describe("voice selection", () =>
{
	it("emits the browser voices through voices$ and caches them", async() =>
	{
		seedVoices();
		const first = await rxjs.firstValueFrom(voices$);
		expect(first.map(v => v.voiceName)).toContain("Alpha English Offline");
	});

	it("prefers an exact voiceName pin over language matching", async() =>
	{
		seedVoices();
		const voice = await getSpeechVoice("French Offline", "en-US");
		expect(voice.voiceName).toBe("French Offline");
	});

	it("uses the configured preferred voice for the language", async() =>
	{
		seedVoices();
		await updateSettings({ preferredVoices: { en: "Remote English" } });

		const voice = await getSpeechVoice(null, "en-US");
		expect(voice.voiceName).toBe("Remote English");
	});

	it("auto-selects an offline voice for the language first", async() =>
	{
		seedVoices();
		const voice = await getSpeechVoice(null, "en-US");
		expect(voice.remote).toBe(false);
	});

	it("returns nothing when no voice matches the language", async() =>
	{
		seedVoices();
		const voice = await getSpeechVoice(null, "zz");
		expect(voice).toBeUndefined();
	});
});

describe("cache", () =>
{
	it("returns cached values without refetching and evicts oldest with destroy", async() =>
	{
		cache.entries.clear();
		let fetches = 0;
		const destroyed = [];

		/**
		 * @description Fetches a value, counting invocations.
		 *
		 * @return {Promise<number>} - The fetch count.
		 */
		const fetchFn = () => Promise.resolve(++fetches);

		/**
		 * @description Records destroyed values.
		 *
		 * @param {number} value - The evicted value.
		 */
		const destroyFn = value => destroyed.push(value);

		await cache.fetchCached("a", fetchFn, destroyFn);
		await cache.fetchCached("a", fetchFn, destroyFn);
		expect(fetches).toBe(1);

		await Promise.all(["b", "c", "d", "e", "f"].map(key => cache.fetchCached(key, fetchFn, destroyFn)));
		expect(cache.entries.size).toBe(5);
		expect(destroyed).toEqual([1]);
		expect(cache.entries.has("a")).toBe(false);
	});
});

describe("browserTtsEngine singleton", () =>
{
	it("is a BrowserTtsEngine when chrome.tts exists", () =>
	{
		expect(typeof browserTtsEngine.speak).toBe("function");
		expect(typeof browserTtsEngine.getVoices).toBe("function");
	});
});

describe("engine edges", () =>
{
	it("web speech getVoices resolves empty after the timeout", async() =>
	{
		vi.useFakeTimers();
		const engine = new WebSpeechEngine();
		const promise = engine.getVoices();
		await vi.advanceTimersByTimeAsync(1600);

		expect(await promise).toEqual([]);
		vi.useRealTimers();
	});

	it("falls back to auto-select when the preferred voice is gone", async() =>
	{
		seedVoices();
		await updateSettings({ preferredVoices: { en: "Uninstalled Voice" } });

		const voice = await getSpeechVoice(null, "en-US");
		expect(voice.remote).toBe(false);
	});

	it("browser engine reports speaking state through chrome.tts", async() =>
	{
		const engine = new BrowserTtsEngine();
		chrome.__tts.speaking = true;

		const speaking = await new Promise(resolve => engine.isSpeaking(resolve));
		expect(speaking).toBe(true);
	});

	it("timeout engine delegates isSpeaking to its base", () =>
	{
		let asked = false;
		const engine = new TimeoutTtsEngine({
			isSpeaking: callback =>
			{
				asked = true;
				callback(false);
			}
		}, 1000, 5000);

		engine.isSpeaking(() => null);
		expect(asked).toBe(true);
	});
});

describe("web speech transport controls", () =>
{
	it("pauses, resumes and reports speaking state", () =>
	{
		const engine = new WebSpeechEngine();
		engine.pause();
		expect(speechSynthesis.__state.paused).toBe(true);
		engine.resume();
		expect(speechSynthesis.__state.paused).toBe(false);

		speechSynthesis.__state.speaking = true;
		let speaking = null;
		engine.isSpeaking(value =>
		{
			speaking = value;
		});
		expect(speaking).toBe(true);
	});
});

describe("web speech utterance options", () =>
{
	it("applies lang, pitch, rate and volume when provided", () =>
	{
		const engine = new WebSpeechEngine();
		engine.speak("configured", { voice: { voiceName: "V" },
																															lang: "fr-FR",
																															pitch: 1.2,
																															rate: 0.8,
																															volume: 0.5 }, () => null);

		const utter = speechSynthesis.__state.queue[0];
		expect(utter.lang).toBe("fr-FR");
		expect(utter.pitch).toBe(1.2);
		expect(utter.rate).toBe(0.8);
		expect(utter.volume).toBe(0.5);
	});
});

describe("exam-safe voice selection", () =>
{
	it("never selects a remote voice while exam-safe mode is on, even a pinned one", async() =>
	{
		seedVoices();
		await updateSettings({ examSafeMode: true });

		const pinned = await getSpeechVoice("Remote English", "en-GB");
		expect(pinned).toBeDefined();
		expect(pinned.remote).toBe(false);

		const auto = await getSpeechVoice(null, "en-US");
		expect(auto.remote).toBe(false);
	});
});
