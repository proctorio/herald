/**
 * @description Guards what Herald's service worker loads. The tts-engines.js
 * module stops all of Herald's speech as it loads (BrowserTtsEngine's cold-start
 * workaround calls chrome.tts.stop()), and the worker loads its modules again
 * each time it wakes, which can be in the middle of a lockdown read: a pause
 * would then stop the read instead. So the worker must never load
 * tts-engines.js, and loading its modules must not stop speech.
 */
import { vi } from "vitest";

const loaded = vi.hoisted(() => new Set());

// Pass-through mocks that only record that the module was loaded.
vi.mock("../src/js/tts-engines.js", importOriginal =>
{
	loaded.add("tts-engines.js");

	return importOriginal();
});

vi.mock("../src/js/lockdown-read.js", importOriginal =>
{
	loaded.add("lockdown-read.js");

	return importOriginal();
});

describe("the service worker's modules", () =>
{
	it("include lockdown-read.js but never tts-engines.js, and loading them stops no speech", async() =>
	{
		await import("../src/background.js");

		// lockdown-read.js shows the recording sees the worker's imports
		expect(loaded.has("lockdown-read.js")).toBe(true);
		expect(loaded.has("tts-engines.js")).toBe(false);
		expect(chrome.__tts.stopped).toBe(false);
	});
});
