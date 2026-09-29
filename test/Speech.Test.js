/**
 * @description Tests for speech.js through its public surface: chunking
 * behavior observed via getInfo, and playback control against the scripted
 * chrome.tts fake (the browser engine path, which chrome.tts presence
 * selects).
 */
import { vi } from "vitest";
import { Speech } from "../src/js/speech.js";
import { splitChunkIntoParagraphs } from "../src/js/paragraphs.js";

/**
 * @description Builds a Speech with sane defaults for a plain local voice.
 *
 * @param {Array<string>} texts - The input paragraph texts.
 * @param {Object} [options] - Option overrides.
 * @return {Speech} - The instance.
 */
function makeSpeech(texts, options)
{
	return new Speech(texts, {
		voice: { voiceName: "Alpha English Offline" },
		lang: "en-US",
		...options
	});
}

/**
 * @description Waits until the fake tts has spoken the expected number of
 * utterances or a bounded number of microtask turns has elapsed.
 *
 * @param {number} count - The expected utterance count.
 * @param {number} [triesLeft] - Remaining poll turns.
 * @return {Promise<void>} - Resolves when reached.
 */
function waitForUtterances(count, triesLeft = 200)
{
	if (chrome.__tts.utterances.length >= count || triesLeft <= 0) return Promise.resolve();

	return new Promise(resolve => setTimeout(resolve, 0)).then(() => waitForUtterances(count, triesLeft - 1));
}

describe("chunking", () =>
{
	it("appends sentence punctuation to bare paragraphs", () =>
	{
		const speech = makeSpeech(["hello"]);
		expect(speech.getInfo().texts[0]).toBe("hello.");
	});

	it("merges short paragraphs into one chunk up to the combine threshold", () =>
	{
		const speech = makeSpeech(["First short paragraph.", "Second short paragraph."]);
		expect(speech.getInfo().texts).toHaveLength(1);
		expect(speech.getInfo().texts[0]).toContain("First short paragraph.");
		expect(speech.getInfo().texts[0]).toContain("Second short paragraph.");
	});

	it("keeps paragraphs apart once they exceed the combine threshold", () =>
	{
		const paragraphA = ("alpha ".repeat(25) + "end.").trim();
		const paragraphB = ("beta ".repeat(25) + "end.").trim();
		const speech = makeSpeech([paragraphA, paragraphB]);

		expect(speech.getInfo().texts).toHaveLength(2);
	});

	it("splits an oversized paragraph at sentence boundaries and respects abbreviations", () =>
	{
		const sentenceA = "Dr. " + "aaa ".repeat(180).trim() + " done.";
		const sentenceB = "Then " + "bbb ".repeat(180).trim() + " finished.";
		const speech = makeSpeech([sentenceA + " " + sentenceB]);

		const chunks = speech.getInfo().texts;
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks[0].startsWith("Dr. ")).toBe(true);
		expect(chunks[0].trim().endsWith("done.")).toBe(true);
	});

	it("uses word-based chunks for google native voices", () =>
	{
		const words = "word ".repeat(100).trim() + ".";
		const speech = makeSpeech([words], { voice: { voiceName: "Google US English" } });

		const chunks = speech.getInfo().texts;
		expect(chunks.length).toBeGreaterThan(1);
	});

	it("reports right-to-left languages", () =>
	{
		expect(makeSpeech(["x"], { lang: "ar" }).getInfo().isRTL).toBe(true);
		expect(makeSpeech(["x"]).getInfo().isRTL).toBe(false);
	});
});

describe("playback", () =>
{
	it("does not speak until play is invoked", async() =>
	{
		makeSpeech(["quiet until played."]);
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(chrome.__tts.utterances).toHaveLength(0);
	});

	it("plays chunks sequentially and signals onEnd", async() =>
	{
		const paragraphA = ("alpha ".repeat(25) + "end.").trim();
		const paragraphB = ("beta ".repeat(25) + "end.").trim();
		const speech = makeSpeech([paragraphA, paragraphB]);
		const onEnd = vi.fn();
		speech.onEnd = onEnd;

		speech.play();
		await waitForUtterances(2);
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(chrome.__tts.utterances).toHaveLength(2);
		expect(chrome.__tts.utterances[0].text).toContain("alpha");
		expect(chrome.__tts.utterances[1].text).toContain("beta");
		expect(onEnd).toHaveBeenCalledWith();
	});

	it("reports PAUSED before play and pauses the engine mid speech", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["some text to read."]);
		expect(await speech.getState()).toBe("PAUSED");

		speech.play();
		await waitForUtterances(1);
		speech.pause();

		expect(chrome.__tts.paused).toBe(true);
		expect(await speech.getState()).toBe("PAUSED");
	});

	it("stops for google native voices instead of pausing", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["some text to read."], { voice: { voiceName: "Google US English" } });
		speech.play();
		await waitForUtterances(1);
		speech.pause();

		expect(chrome.__tts.stopped).toBe(true);
	});

	it("does not signal onEnd after an explicit stop", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["some text to read."]);
		const onEnd = vi.fn();
		speech.onEnd = onEnd;
		speech.play();
		await waitForUtterances(1);
		speech.stop();
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(onEnd).not.toHaveBeenCalled();
	});

	it("propagates engine errors to onEnd", async() =>
	{
		chrome.__tts.eventScript = [{ type: "error",
																																error: new Error("voice broke") }];
		const speech = makeSpeech(["some text to read."]);
		const onEnd = vi.fn();
		speech.onEnd = onEnd;
		speech.play();
		await waitForUtterances(1);
		await new Promise(resolve => setTimeout(resolve, 0));

		expect(onEnd).toHaveBeenCalled();
		expect(onEnd.mock.calls[0][0].message).toBe("voice broke");
	});

	it("seeks to a chunk index and resumes there", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const paragraphA = ("alpha ".repeat(25) + "end.").trim();
		const paragraphB = ("beta ".repeat(25) + "end.").trim();
		const speech = makeSpeech([paragraphA, paragraphB]);
		speech.seek(1);
		await waitForUtterances(1);

		expect(chrome.__tts.utterances[0].text).toContain("beta");
		expect(speech.getInfo().position.index).toBe(1);
	});

	it("exposes forward and rewind capability from the playlist", () =>
	{
		const paragraphA = ("alpha ".repeat(25) + "end.").trim();
		const paragraphB = ("beta ".repeat(25) + "end.").trim();
		const speech = makeSpeech([paragraphA, paragraphB]);

		expect(speech.canForward()).toBe(true);
		expect(speech.canRewind()).toBe(false);
	});
});

describe("seek with offset", () =>
{
	it("starts playback at a paragraph boundary inside a merged chunk", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["First short paragraph.", "Second short paragraph."]);
		const chunk = speech.getInfo().texts[0];
		expect(speech.getInfo().texts).toHaveLength(1);

		speech.seek(0, chunk.indexOf("Second"));
		await waitForUtterances(1);

		expect(chrome.__tts.utterances[0].text).toBe("Second short paragraph.");
		expect(speech.getInfo().position.index).toBe(0);
	});

	it("accepts offsets computed by the popup paragraph mapping", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["Opening paragraph text.", "Closing paragraph text."]);
		const chunk = speech.getInfo().texts[0];
		const paragraphs = splitChunkIntoParagraphs(chunk);
		expect(paragraphs).toHaveLength(2);

		speech.seek(0, paragraphs[1].offset);
		await waitForUtterances(1);

		expect(chrome.__tts.utterances[0].text).toBe("Closing paragraph text.");
	});

	it("snaps a mid-sentence offset back to the sentence start", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["Alpha alpha alpha. Beta beta beta."]);
		const chunk = speech.getInfo().texts[0];

		speech.seek(0, chunk.indexOf("beta"));
		await waitForUtterances(1);

		expect(chrome.__tts.utterances[0].text).toBe("Beta beta beta.");
	});

	it("plays the whole chunk when the offset is zero or missing", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["First short paragraph.", "Second short paragraph."]);
		const chunk = speech.getInfo().texts[0];

		speech.seek(0, 0);
		await waitForUtterances(1);

		expect(chrome.__tts.utterances[0].text).toBe(chunk);
	});

	it("clamps an offset past the end of the chunk to its last sentence", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["Alpha alpha alpha. Beta beta beta."]);

		speech.seek(0, 10000);
		await waitForUtterances(1);

		expect(chrome.__tts.utterances[0].text).toBe("Beta beta beta.");
	});
});

describe("navigation", () =>
{
	/**
	 * @description Builds a two-chunk speech ready for navigation tests.
	 *
	 * @return {Speech} - The instance.
	 */
	function makeTwoChunks()
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const paragraphA = ("alpha ".repeat(25) + "end.").trim();
		const paragraphB = ("beta ".repeat(25) + "end.").trim();

		return makeSpeech([paragraphA, paragraphB]);
	}

	it("forwards to the next chunk after the debounce delay", async() =>
	{
		vi.useFakeTimers();
		const speech = makeTwoChunks();
		speech.play();
		await vi.advanceTimersByTimeAsync(10);
		speech.forward();
		await vi.advanceTimersByTimeAsync(800);

		expect(chrome.__tts.utterances.at(-1).text).toContain("beta");
		vi.useRealTimers();
	});

	it("rewinds to the previous chunk shortly after a forward", async() =>
	{
		vi.useFakeTimers();
		const speech = makeTwoChunks();
		speech.play();
		await vi.advanceTimersByTimeAsync(10);
		speech.seek(1);
		await vi.advanceTimersByTimeAsync(10);
		speech.rewind();
		await vi.advanceTimersByTimeAsync(800);

		expect(chrome.__tts.utterances.at(-1).text).toContain("alpha");
		vi.useRealTimers();
	});

	it("restarts the current chunk when rewinding after the grace period", async() =>
	{
		vi.useFakeTimers();
		const speech = makeTwoChunks();
		speech.play();
		await vi.advanceTimersByTimeAsync(10);
		speech.seek(1);
		await vi.advanceTimersByTimeAsync(4000);
		speech.rewind();
		await vi.advanceTimersByTimeAsync(800);

		expect(chrome.__tts.utterances.at(-1).text).toContain("beta");
		expect(speech.getInfo().position.index).toBe(1);
		vi.useRealTimers();
	});

	it("jumps to the last chunk with gotoEnd", async() =>
	{
		vi.useFakeTimers();
		const speech = makeTwoChunks();
		speech.play();
		await vi.advanceTimersByTimeAsync(10);
		speech.gotoEnd();
		await vi.advanceTimersByTimeAsync(10);

		expect(speech.getInfo().position.index).toBe(1);
		vi.useRealTimers();
	});
});

describe("pronunciation", () =>
{
	it("speaks the corrected form while the transcript keeps the original spelling", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["Proctorio monitors this exam."]);
		speech.play();
		await waitForUtterances(1);

		expect(chrome.__tts.utterances[0].text).toContain("Prock Torio");
		expect(chrome.__tts.utterances[0].text).not.toMatch(/proctorio/iu);
		expect(speech.getInfo().texts[0]).toContain("Proctorio");
		expect(speech.getInfo().texts[0]).not.toContain("Prock Torio");
	});

	it("applies the correction to seek slices without shifting display offsets", async() =>
	{
		chrome.__tts.eventScript = [{ type: "start" }];
		const speech = makeSpeech(["Opening paragraph text.", "Proctorio reads this part."]);
		const chunk = speech.getInfo().texts[0];
		expect(speech.getInfo().texts).toHaveLength(1);

		speech.seek(0, chunk.indexOf("Proctorio"));
		await waitForUtterances(1);

		expect(chrome.__tts.utterances[0].text).toBe("Prock Torio reads this part.");
	});
});

describe("east asian chunking", () =>
{
	it("chunks east asian text by characters with its own punctuation", () =>
	{
		const text = "你好世界。".repeat(30);
		const speech = makeSpeech([text], { lang: "zh-CN",
																																						voice: { voiceName: "Google 普通话" } });

		expect(speech.getInfo().texts.length).toBeGreaterThan(0);
	});

	it("applies the reduced word limit languages", () =>
	{
		const words = "wort ".repeat(120).trim() + ".";
		const speech = makeSpeech([words], { lang: "de-DE",
																																							voice: { voiceName: "Google Deutsch" } });

		expect(speech.getInfo().texts.length).toBeGreaterThan(1);
	});

	it("treats only zh, ko and ja language subtags as east asian", () =>
	{
		const sentence = "word ".repeat(30).trim() + ".";
		const chunksFor = lang => makeSpeech([sentence], {
			lang,
			voice: { voiceName: "Google US English" }
		}).getInfo().texts;

		expect(chunksFor("ja-JP").length).toBeGreaterThan(1);
		expect(chunksFor("en-US")).toHaveLength(1);
		for (const lang of ["kok-IN", "en-u-ca-japanese"]) expect(chunksFor(lang)).toEqual(chunksFor("en-US"));
	});
});

describe("degenerate input", () =>
{
	it("hard-splits a single word longer than the character limit", () =>
	{
		const monster = "a".repeat(2000) + ".";
		const speech = makeSpeech([monster]);

		const chunks = speech.getInfo().texts;
		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks[0].length).toBeLessThanOrEqual(750);
	});
});
