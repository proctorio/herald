/**
 * @description Tests for document.js: the simple and tab sources, and the Doc
 * pipeline including language precedence and end-of-document signaling.
 */
import { vi } from "vitest";
import { SimpleSource, TabSource, Doc } from "../src/js/document.js";
import { registerMessageListener } from "../src/js/messaging.js";

/**
 * @description Seeds one English offline voice so getSpeech can resolve.
 */
function seedEnglishVoice()
{
	chrome.__tts.voices.push({ voiceName: "Alpha English Offline",
																												lang: "en-US",
																												remote: false });
}

/**
 * @description Builds a Doc over a SimpleSource and returns it with an onEnd
 * spy attached.
 *
 * @param {Array<string>} texts - Source texts.
 * @param {Object} [opts] - SimpleSource options.
 * @return {Object} - The doc and the spy.
 */
function makeDoc(texts, opts)
{
	const onEnd = vi.fn();
	const doc = new Doc(new SimpleSource(texts, opts), onEnd);

	return { doc,
										onEnd };
}

describe("SimpleSource", () =>
{
	it("resolves ready with the declared language", async() =>
	{
		const source = new SimpleSource(["a"], { lang: "fr" });
		expect((await source.ready).lang).toBe("fr");
	});

	it("returns the texts only for index zero", async() =>
	{
		const source = new SimpleSource(["a", "b"]);
		expect(await source.getTexts(0)).toEqual(["a", "b"]);
		expect(await source.getTexts(1)).toBeNull();
	});

	it("builds a length-prefixed uri from the first text", () =>
	{
		const source = new SimpleSource(["hello world"]);
		expect(source.getUri()).toBe("text-selection:(11)hello%20world");
	});
});

describe("TabSource", () =>
{
	/**
	 * @description Registers a fake content script endpoint for tab 1.
	 *
	 * @param {Object} handlers - Method handlers.
	 */
	function fakeContentScript(handlers)
	{
		registerMessageListener("contentScript", handlers);
	}

	it("loads document info from the content script named by sourceUri", async() =>
	{
		await chrome.storage.local.set({ sourceUri: "contentscript:1" });
		fakeContentScript({
			getDocumentInfo: () => ({ url: "https://page.example/",
																													lang: "en" })
		});

		const source = new TabSource();
		const info = await source.ready;
		expect(info.url).toBe("https://page.example/");
		expect(source.isWaiting()).toBe(false);
		expect(await source.getUri()).toBe("https://page.example/");
	});

	it("forwards getTexts with its arguments", async() =>
	{
		await chrome.storage.local.set({ sourceUri: "contentscript:1" });
		const seen = [];
		fakeContentScript({
			getDocumentInfo: () => ({}),
			getTexts: (index, quietly) =>
			{
				seen.push([index, quietly]);

				return ["text"];
			}
		});

		const source = new TabSource();
		await source.ready;
		expect(await source.getTexts(2, true)).toEqual(["text"]);
		expect(seen[0]).toEqual([2, true]);
	});

	it("rejects on an invalid source uri", async() =>
	{
		await chrome.storage.local.set({ sourceUri: "garbage:1" });
		const source = new TabSource();
		await expect(source.ready).rejects.toThrow("Invalid source");
	});
});

describe("Doc", () =>
{
	it("reports LOADING before playback starts", () =>
	{
		seedEnglishVoice();
		const { doc } = makeDoc(["short text."]);
		expect(doc.getState()).toBe("LOADING");
	});

	it("plays a short text with the declared language and signals onEnd", async() =>
	{
		seedEnglishVoice();
		chrome.__config.detectLanguageResult = { languages: [{ language: "fr",
																																																									percentage: 95 }] };
		const { doc, onEnd } = makeDoc(["short text."], { lang: "en-US" });

		await doc.play();
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(onEnd).toHaveBeenCalledWith();
	});

	it("lets a confident detection override a mismatched declared language", async() =>
	{
		seedEnglishVoice();
		chrome.__config.detectLanguageResult = { isReliable: true,
																																											languages: [{ language: "fr",
																																																									percentage: 95 }] };
		const longText = ("bonjour tout le monde ".repeat(20)).trim() + ".";
		const { doc } = makeDoc([longText], { lang: "en-US" });

		await expect(doc.play()).rejects.toThrow(/error_no_voice/u);
	});

	it("keeps the declared language when detection agrees by prefix", async() =>
	{
		seedEnglishVoice();
		chrome.__config.detectLanguageResult = { languages: [{ language: "en",
																																																									percentage: 95 }] };
		const longText = ("hello wonderful world of reading ".repeat(10)).trim() + ".";
		const { doc, onEnd } = makeDoc([longText], { lang: "en-US" });

		await doc.play();
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(onEnd).toHaveBeenCalledWith();
	});

	it("rejects with error_no_text when the source has nothing to read", async() =>
	{
		seedEnglishVoice();
		const { doc } = makeDoc([]);
		await expect(doc.play()).rejects.toThrow(/error_no_text/u);
	});

	it("rejects forward and rewind when nothing is active", async() =>
	{
		seedEnglishVoice();
		const { doc } = makeDoc(["text."]);
		await expect(doc.forward()).rejects.toThrow("Can't forward");
		await expect(doc.rewind()).rejects.toThrow("Can't rewind");
		await expect(doc.seek(0)).rejects.toThrow("Can't seek");
	});

	it("replaces urls with a spoken placeholder during preprocessing", async() =>
	{
		seedEnglishVoice();
		const { doc, onEnd } = makeDoc(["read https://secret.example/path now."]);

		await doc.play();
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(onEnd).toHaveBeenCalled();
		expect(chrome.__tts.utterances[0].text).not.toContain("secret.example");
		expect(chrome.__tts.utterances[0].text).toContain("HTTP URL.");
	});
});

describe("language detection confidence bar", () =>
{
	const frenchDetection = { isReliable: true,
																											languages: [{ language: "fr",
																																									percentage: 95 }] };
	const longEnglishText = ("hello wonderful world of reading ".repeat(10)).trim() + ".";

	/**
	 * @description Plays a doc and asserts it completed with the seeded
	 * English voice, which proves the declared language won.
	 *
	 * @param {Array<string>} texts - Source texts.
	 * @param {string} [lang] - The declared language, omitted when the page
	 * declares none.
	 * @return {Promise<void>} - Resolves when playback ended cleanly.
	 */
	async function expectDeclaredLanguageWins(texts, lang)
	{
		const { doc, onEnd } = makeDoc(texts, { lang });
		await doc.play();
		await new Promise(resolve => setTimeout(resolve, 20));
		expect(onEnd).toHaveBeenCalledWith();
	}

	it("ignores detection when the sampled text is under 100 chars", async() =>
	{
		seedEnglishVoice();
		chrome.__config.detectLanguageResult = frenchDetection;
		await expectDeclaredLanguageWins(["short text."], "en-US");
	});

	it("ignores a detection the browser flags unreliable", async() =>
	{
		seedEnglishVoice();
		chrome.__config.detectLanguageResult = { isReliable: false,
																																											languages: [{ language: "fr",
																																																									percentage: 95 }] };
		await expectDeclaredLanguageWins([longEnglishText], "en-US");
	});

	it("ignores a reliable detection whose top percentage is low", async() =>
	{
		seedEnglishVoice();
		chrome.__config.detectLanguageResult = { isReliable: true,
																																											languages: [{ language: "fr",
																																																									percentage: 60 }] };
		await expectDeclaredLanguageWins([longEnglishText], "en-US");
	});

	it("uses a reliable, dominant detection when no language is declared", async() =>
	{
		seedEnglishVoice();
		chrome.__config.detectLanguageResult = frenchDetection;
		const longText = ("bonjour tout le monde ".repeat(20)).trim() + ".";
		const { doc } = makeDoc([longText], {});

		await expect(doc.play()).rejects.toThrow(/error_no_voice/u);
	});

	it("falls back to the default language when nothing is declared or detected", async() =>
	{
		seedEnglishVoice();
		chrome.__config.detectLanguageResult = { isReliable: false,
																																											languages: [] };
		await expectDeclaredLanguageWins([longEnglishText]);
	});
});

describe("TabSource error mapping", () =>
{
	it("rethrows errors the content script serialized into the response", async() =>
	{
		await chrome.storage.local.set({ sourceUri: "contentscript:1" });
		registerMessageListener("contentScript", {
			getDocumentInfo: () => ({}),
			getTexts: () =>
			{
				throw new Error("extractor exploded");
			}
		});

		const source = new TabSource();
		await source.ready;
		await expect(source.getTexts(0)).rejects.toMatchObject({ message: "extractor exploded" });
	});
});

describe("Doc active controls", () =>
{
	/**
	 * @description Starts a doc whose speech stays active because the engine
	 * only ever reports a start event.
	 *
	 * @return {Promise<Object>} - The active doc and its spy.
	 */
	async function makeActiveDoc()
	{
		seedEnglishVoice();
		chrome.__tts.eventScript = [{ type: "start" }];
		const paragraphA = ("alpha ".repeat(25) + "end.").trim();
		const paragraphB = ("beta ".repeat(25) + "end.").trim();
		const made = makeDoc([paragraphA, paragraphB]);
		await made.doc.play();
		await new Promise(resolve => setTimeout(resolve, 10));

		return made;
	}

	it("pauses and reports state through the active speech", async() =>
	{
		const { doc } = await makeActiveDoc();
		await doc.pause();

		expect(chrome.__tts.paused).toBe(true);
		expect(await doc.getState()).toBe("PAUSED");
	});

	it("forwards within the active speech when possible", async() =>
	{
		const { doc } = await makeActiveDoc();
		doc.forward();
		await new Promise(resolve => setTimeout(resolve, 800));

		expect(chrome.__tts.utterances.at(-1).text).toContain("beta");
	});

	it("ignores rewind at the first chunk instead of ending playback", async() =>
	{
		const { doc, onEnd } = await makeActiveDoc();
		doc.rewind();
		doc.rewind();
		doc.rewind();
		await new Promise(resolve => setTimeout(resolve, 800));

		expect(onEnd).not.toHaveBeenCalled();
		expect(chrome.__tts.utterances.at(-1).text).toContain("alpha");
		expect(await doc.getState()).toBe("PLAYING");
	});

	it("ignores forward at the last chunk instead of ending playback", async() =>
	{
		const { doc, onEnd } = await makeActiveDoc();
		doc.forward();
		await new Promise(resolve => setTimeout(resolve, 800));
		expect(chrome.__tts.utterances.at(-1).text).toContain("beta");

		doc.forward();
		doc.forward();
		await new Promise(resolve => setTimeout(resolve, 800));

		expect(onEnd).not.toHaveBeenCalled();
		expect(chrome.__tts.utterances.at(-1).text).toContain("beta");
		expect(await doc.getState()).toBe("PLAYING");
	});

	it("stops and clears the active speech", async() =>
	{
		const { doc } = await makeActiveDoc();
		await doc.stop();

		expect(doc.getState()).toBe("LOADING");
	});

	it("closes without signaling onEnd", async() =>
	{
		const { doc, onEnd } = await makeActiveDoc();
		await doc.close();

		expect(onEnd).not.toHaveBeenCalled();
	});

	it("waits paused after an outside interrupt and replays the chunk on play", async() =>
	{
		const { doc, onEnd } = await makeActiveDoc();
		chrome.__tts.utterances[0].options.onEvent({ type: "interrupted" });

		expect(await doc.getState()).toBe("PAUSED");
		expect(onEnd).not.toHaveBeenCalled();

		await doc.play();
		await new Promise(resolve => setTimeout(resolve, 10));

		expect(chrome.__tts.utterances).toHaveLength(2);
		expect(chrome.__tts.utterances[1].text).toBe(chrome.__tts.utterances[0].text);
	});

	it("seeks through the active speech", async() =>
	{
		const { doc } = await makeActiveDoc();
		await doc.seek(1);
		await new Promise(resolve => setTimeout(resolve, 10));

		expect(chrome.__tts.utterances.at(-1).text).toContain("beta");
	});

	it("passes a seek offset through to the active speech", async() =>
	{
		seedEnglishVoice();
		chrome.__tts.eventScript = [{ type: "start" }];
		const made = makeDoc(["First short paragraph.", "Second short paragraph."]);
		await made.doc.play();
		await new Promise(resolve => setTimeout(resolve, 10));

		const chunk = chrome.__tts.utterances[0].text;
		await made.doc.seek(0, chunk.indexOf("Second"));
		await new Promise(resolve => setTimeout(resolve, 10));

		expect(chrome.__tts.utterances.at(-1).text).toBe("Second short paragraph.");
	});
});

describe("Doc navigation at the bounds", () =>
{
	/**
	 * @description Starts a doc with a single chunk so speech-level navigation
	 * is exhausted in both directions at once.
	 *
	 * @return {Promise<Object>} - The active doc and its spy.
	 */
	async function makeSingleChunkDoc()
	{
		seedEnglishVoice();
		chrome.__tts.eventScript = [{ type: "start" }];
		const made = makeDoc(["only one chunk here."]);
		await made.doc.play();
		await new Promise(resolve => setTimeout(resolve, 10));

		return made;
	}

	// The upstream page-level fallbacks (advance or rewind to another page,
	// ending playback when none exists) are gone: the source is single-page,
	// so they could only ever collapse the player. Both directions are
	// no-ops at their bound and playback continues.
	it("keeps playing when forward is pressed on a single chunk", async() =>
	{
		const { doc, onEnd } = await makeSingleChunkDoc();
		doc.forward();
		doc.forward();
		await new Promise(resolve => setTimeout(resolve, 30));

		expect(onEnd).not.toHaveBeenCalled();
		expect(await doc.getState()).toBe("PLAYING");
	});

	it("keeps playing when rewind is pressed on a single chunk", async() =>
	{
		const { doc, onEnd } = await makeSingleChunkDoc();
		doc.rewind();
		doc.rewind();
		await new Promise(resolve => setTimeout(resolve, 30));

		expect(onEnd).not.toHaveBeenCalled();
		expect(await doc.getState()).toBe("PLAYING");
	});
});
