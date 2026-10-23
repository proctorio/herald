/**
 * @description Lockdown reads (WI-B): text from the lockdown channel, spoken by
 * the service worker with chrome.tts in one utterance, limited to local voices,
 * and tracked in session storage so stop and pause still find the read after
 * a service worker restart.
 */
import { vi } from "vitest";
import { claimLockdownRead, startLockdownRead, stopLockdownRead, pauseLockdownRead, resumeLockdownRead, getLockdownReadState } from "../src/js/lockdown-read.js";
import { defaults } from "../src/js/defaults.js";

const VOICES = [
	{ voiceName: "Network English",
			lang: "en-US",
			remote: true },
	{ voiceName: "Local English",
			lang: "en-US",
			remote: false },
	{ voiceName: "Local Spanish",
			lang: "es-ES",
			remote: false }
];

const LONG_SPANISH = "La respuesta correcta depende de la pregunta anterior y de los datos del ejercicio que se muestra arriba.";

/**
 * @description Seeds the chrome.tts fake with voices.
 *
 * @param {Array<Object>} [voices] - The voices to offer.
 */
function seedVoices(voices = VOICES)
{
	chrome.__tts.voices.length = 0;
	for (const voice of voices) chrome.__tts.voices.push({ ...voice });
}

/**
 * @description Lets queued fake events and storage promises settle.
 *
 * @param {number} [turns] - The number of macrotask turns to yield.
 * @return {Promise<void>} - Resolves when the turns have elapsed.
 */
function settle(turns = 5)
{
	let chain = Promise.resolve();
	for (let i = 0; i < turns; i++) chain = chain.then(() => new Promise(resolve => setTimeout(resolve, 0)));

	return chain;
}

/**
 * @description Starts a lockdown read whose utterance keeps speaking (the fake
 * delivers start and nothing after it).
 *
 * @param {string} [text] - The text to read.
 * @return {Promise<Object>} - The fake's record of the utterance.
 */
async function startPlaying(text = "Question one")
{
	if (!chrome.__tts.voices.length) seedVoices();
	chrome.__tts.eventScript = [{ type: "start" }];
	await startLockdownRead(text);
	await settle();

	return chrome.__tts.utterances.at(-1);
}

/**
 * @description Rewrites the stored lockdown read record, as time passing would.
 *
 * @param {Object} changes - The fields to change.
 */
async function ageRecord(changes)
{
	const { lockdownRead } = await chrome.storage.session.get("lockdownRead");
	await chrome.storage.session.set({ lockdownRead: { ...lockdownRead,
																																																				...changes } });
}

/**
 * @description Sets whether the chrome.tts fake reports speaking, as the browser
 * would while an utterance plays.
 *
 * @param {boolean} speaking - The new state.
 */
function setSpeaking(speaking)
{
	chrome.__tts.speaking = speaking;
}

/**
 * @description Holds the next session storage write until released, so a test
 * can act while a read is writing its record.
 *
 * @return {Object} - Started resolves when the write begins; release finishes
 * it; restore removes the hold.
 */
function holdNextSessionWrite()
{
	const session = chrome.storage.session;
	const write = session.set;
	const hold = {};
	let begin = null;
	hold.started = new Promise(resolve =>
	{
		begin = resolve;
	});
	const spy = vi.spyOn(session, "set").mockImplementationOnce(items => new Promise(resolve =>
	{
		hold.release = () => resolve(write.call(session, items));
		begin();
	}));
	hold.restore = () => spy.mockRestore();

	return hold;
}

describe("startLockdownRead", () =>
{
	it("speaks the text in one utterance with the student's voice, rate, pitch and volume", async() =>
	{
		await chrome.storage.local.set({ voiceName: "Local English",
																																			"rateLocal English": 1.5,
																																			pitch: 0.8,
																																			volume: 0.6 });
		const utterance = await startPlaying("Read this question");

		expect(chrome.__tts.utterances).toHaveLength(1);
		expect(utterance.text).toBe("Read this question");
		expect(utterance.options).toMatchObject({ voiceName: "Local English",
																																												rate: 1.5,
																																												pitch: 0.8,
																																												volume: 0.6 });
	});

	it("uses the default rate, pitch and volume when the student set none", async() =>
	{
		const utterance = await startPlaying();

		expect(utterance.options).toMatchObject({ rate: defaults.rate,
																																												pitch: defaults.pitch,
																																												volume: defaults.volume });
	});

	it("uses only local voices, even with a network voice pinned and exam-safe mode off", async() =>
	{
		await chrome.storage.local.set({ voiceName: "Network English",
																																			examSafeMode: false });
		const utterance = await startPlaying();

		expect(utterance.options.voiceName).toBe("Local English");
	});

	it("picks a local voice for the language detected in a long enough text", async() =>
	{
		chrome.__config.detectLanguageResult = { isReliable: true,
																																											languages: [{ language: "es",
																																																									percentage: 97 }] };
		const utterance = await startPlaying(LONG_SPANISH);

		expect(utterance.options.voiceName).toBe("Local Spanish");
		expect(utterance.options.lang).toBe("es");
	});

	it("falls back to the browser's UI language when the text is too short to detect", async() =>
	{
		chrome.i18n.getUILanguage = () => "es-ES";
		try
		{
			const utterance = await startPlaying("Hola");

			expect(utterance.options.voiceName).toBe("Local Spanish");
			expect(utterance.options.lang).toBe("es-ES");
		}
		finally
		{
			delete chrome.i18n.getUILanguage;
		}
	});

	it("falls back to en-US where the browser reports no UI language", async() =>
	{
		const utterance = await startPlaying("Hi");

		expect(utterance.options.lang).toBe("en-US");
		expect(utterance.options.voiceName).toBe("Local English");
	});

	it("fails with error_no_voice and speaks nothing when no local voice fits", async() =>
	{
		seedVoices([VOICES[0]]);

		await expect(startLockdownRead("Question one")).rejects.toThrow("error_no_voice");
		expect(chrome.__tts.utterances).toHaveLength(0);
		expect(await getLockdownReadState()).toBeNull();
	});

	it("applies the pronunciation corrections Herald's own reading uses", async() =>
	{
		const utterance = await startPlaying("Proctorio exam, worth 5 pts");

		expect(utterance.text).toBe("Prock Torio exam, worth 5 points");
	});

	it("reads text shaped like an SSML document as written, not as markup", async() =>
	{
		const utterance = await startPlaying("<speak>Hello<break time='9s'/></speak>");

		expect(utterance.text).toBe("&lt;speak&gt;Hello&lt;break time='9s'/&gt;&lt;/speak&gt;");
	});

	it("leaves other text with angle brackets alone", async() =>
	{
		const utterance = await startPlaying("Is a < b when a = 2 and b > 1?");

		expect(utterance.text).toBe("Is a < b when a = 2 and b > 1?");
	});

	it("speaks a compact macOS voice by its own name", async() =>
	{
		chrome.__config.platformOs = "mac";
		seedVoices([{ voiceName: "Fred",
																lang: "en-US",
																remote: false }]);
		await chrome.storage.local.set({ voiceName: "MacOS English [Fred]" });
		const utterance = await startPlaying();

		expect(utterance.options.voiceName).toBe("Fred");
	});

	it("slows a Google native voice the way Herald's player does", async() =>
	{
		seedVoices([{ voiceName: "Google US English",
																lang: "en-US",
																remote: false }]);
		await chrome.storage.local.set({ "rate": 1 });
		const utterance = await startPlaying();

		expect(utterance.options.rate).toBeCloseTo(defaults.rate * 0.9);
	});

	it("clears the channel before speaking and asks for every final event", async() =>
	{
		const stop = vi.spyOn(chrome.tts, "stop");
		const speak = vi.spyOn(chrome.tts, "speak");
		const utterance = await startPlaying();

		expect(stop).toHaveBeenCalled();
		expect(stop.mock.invocationCallOrder.at(-1)).toBeLessThan(speak.mock.invocationCallOrder.at(-1));
		expect(utterance.options.desiredEventTypes).toEqual(expect.arrayContaining(["end", "error", "interrupted", "cancelled"]));
		stop.mockRestore();
		speak.mockRestore();
	});

	it("gives up when a stop arrives while it looks up the voice", async() =>
	{
		seedVoices();
		const pending = startLockdownRead("Question one");
		await stopLockdownRead();
		await pending;

		expect(chrome.__tts.utterances).toHaveLength(0);
		expect(await getLockdownReadState()).toBeNull();
	});

	it("gives up when a stop arrives between its claim and its start", async() =>
	{
		seedVoices();
		const seq = claimLockdownRead();
		await stopLockdownRead();
		await startLockdownRead("Question one", seq);

		expect(chrome.__tts.utterances).toHaveLength(0);
		expect(await getLockdownReadState()).toBeNull();
	});

	it("gives up, leaving no record, when a stop arrives while it writes its record", async() =>
	{
		seedVoices();
		const hold = holdNextSessionWrite();
		const pending = startLockdownRead("Question one");
		await hold.started;
		const stopped = stopLockdownRead();
		hold.release();
		await Promise.all([pending, stopped]);
		hold.restore();
		await settle();

		expect(chrome.__tts.utterances).toHaveLength(0);
		expect(await chrome.storage.session.get("lockdownRead")).toEqual({});
	});

	it("lets a newer read overtake an older one still looking up its voice", async() =>
	{
		seedVoices();
		chrome.__tts.eventScript = [{ type: "start" }];
		await Promise.all([startLockdownRead("first"), startLockdownRead("second")]);

		expect(chrome.__tts.utterances.map(u => u.text)).toEqual(["second"]);
	});
});

describe("lockdown read state", () =>
{
	it("reports PLAYING while the read speaks and nothing once it ends", async() =>
	{
		const utterance = await startPlaying();
		expect(await getLockdownReadState()).toBe("PLAYING");

		utterance.options.onEvent({ type: "end" });
		await settle();
		expect(await getLockdownReadState()).toBeNull();
	});

	it.each(["interrupted", "cancelled", "error"])("forgets the read after a final %s event", async type =>
	{
		const utterance = await startPlaying();
		utterance.options.onEvent({ type });
		await settle();

		expect(await getLockdownReadState()).toBeNull();
	});

	it("keeps the newer read when the replaced read's final event arrives late", async() =>
	{
		const first = await startPlaying("first");
		await startPlaying("second");
		first.options.onEvent({ type: "interrupted" });
		await settle();

		expect(await getLockdownReadState()).toBe("PLAYING");
	});

	it("still finds the read after a service worker restart", async() =>
	{
		await startPlaying();
		vi.resetModules();
		const restarted = await import("../src/js/lockdown-read.js");
		const stop = vi.spyOn(chrome.tts, "stop");

		expect(await restarted.getLockdownReadState()).toBe("PLAYING");
		expect(await restarted.stopLockdownRead()).toBe(true);
		expect(stop).toHaveBeenCalledTimes(1);
		stop.mockRestore();
	});

	it("treats a record older than an hour as over, and stops nothing for it", async() =>
	{
		await startPlaying();
		await ageRecord({ startedAt: Date.now() - (61 * 60 * 1000) });
		const stop = vi.spyOn(chrome.tts, "stop");

		expect(await getLockdownReadState()).toBeNull();
		expect(await stopLockdownRead()).toBe(false);
		expect(stop).not.toHaveBeenCalled();
		stop.mockRestore();
	});

	it("treats a record as over when nothing speaks after the start grace", async() =>
	{
		await startPlaying();
		chrome.__tts.speaking = false;
		await ageRecord({ startedAt: Date.now() - (11 * 1000) });

		expect(await getLockdownReadState()).toBeNull();
		expect(await chrome.storage.session.get("lockdownRead")).toEqual({});
	});

	it("does not judge a brand new read by isSpeaking yet", async() =>
	{
		await startPlaying();
		chrome.__tts.speaking = false;

		expect(await getLockdownReadState()).toBe("PLAYING");
	});
});

describe("stopLockdownRead", () =>
{
	it("stops a playing lockdown read and says so", async() =>
	{
		await startPlaying();
		const stop = vi.spyOn(chrome.tts, "stop");

		expect(await stopLockdownRead()).toBe(true);
		expect(stop).toHaveBeenCalledTimes(1);
		expect(await getLockdownReadState()).toBeNull();
		stop.mockRestore();
	});

	it("stops nothing when no lockdown read is playing, so the student's own read survives", async() =>
	{
		chrome.__tts.speaking = true;
		const stop = vi.spyOn(chrome.tts, "stop");

		expect(await stopLockdownRead()).toBe(false);
		expect(stop).not.toHaveBeenCalled();
		stop.mockRestore();
	});
});

describe("pause and resume", () =>
{
	it("pauses and resumes a lockdown read", async() =>
	{
		await startPlaying();

		expect(await pauseLockdownRead()).toBe(true);
		expect(chrome.__tts.paused).toBe(true);
		chrome.__tts.speaking = false;
		await ageRecord({ startedAt: Date.now() - (11 * 1000) });
		expect(await getLockdownReadState()).toBe("PAUSED");

		setSpeaking(true);
		expect(await resumeLockdownRead()).toBe(true);
		expect(chrome.__tts.paused).toBe(false);
		expect(await getLockdownReadState()).toBe("PLAYING");
	});

	it("does not pause twice", async() =>
	{
		await startPlaying();
		await pauseLockdownRead();
		const pause = vi.spyOn(chrome.tts, "pause");

		expect(await pauseLockdownRead()).toBe(true);
		expect(pause).not.toHaveBeenCalled();
		pause.mockRestore();
	});

	it("does nothing without a lockdown read", async() =>
	{
		const pause = vi.spyOn(chrome.tts, "pause");
		const resume = vi.spyOn(chrome.tts, "resume");

		expect(await pauseLockdownRead()).toBe(false);
		expect(await resumeLockdownRead()).toBe(false);
		expect(pause).not.toHaveBeenCalled();
		expect(resume).not.toHaveBeenCalled();
		pause.mockRestore();
		resume.mockRestore();
	});

	it("does not resume a read that is not paused", async() =>
	{
		await startPlaying();
		const resume = vi.spyOn(chrome.tts, "resume");

		expect(await resumeLockdownRead()).toBe(false);
		expect(resume).not.toHaveBeenCalled();
		resume.mockRestore();
	});

	it("stops instead of pausing a voice that cannot pause", async() =>
	{
		seedVoices([{ voiceName: "Chrome OS US English",
																lang: "en-US",
																remote: false }]);
		await startPlaying();
		const pause = vi.spyOn(chrome.tts, "pause");

		expect(await pauseLockdownRead()).toBe(true);
		expect(pause).not.toHaveBeenCalled();
		expect(await getLockdownReadState()).toBeNull();
		pause.mockRestore();
	});
});
