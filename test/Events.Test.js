/**
 * @description Tests for the service worker's context menu unification
 * (finding F8): top-frame selection clicks route through playTab so the
 * content script reads the selection with structure preserved, and the
 * flattened selection text is used only where injection is impossible.
 * Importing events.js registers its listeners against the chrome fake, and
 * the tests drive them through contextMenus.onClicked exactly as chrome
 * would.
 */
import { vi } from "vitest";
import { registerMessageListener } from "../src/js/messaging.js";
import { bgPageInvoke } from "../src/js/defaults.js";
import { isTopFrameClick, isInjectionBlocked } from "../src/js/events.js";

const { TEST_LOCKDOWN_ID } = vi.hoisted(() => ({
	TEST_LOCKDOWN_ID: Array.from({ length: 32 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 16))).join("")
}));

// Lets a lockdown build generated for this run through the allowlist, as in
// ExternalMessaging.Test.js. No real lockdown ID appears here.
vi.mock("../src/js/lockdown-ids.js", async importOriginal =>
{
	const { createHash } = await import("node:crypto");
	const actual = await importOriginal();

	return { LOCKDOWN_ID_HASHES: Object.freeze([...actual.LOCKDOWN_ID_HASHES, createHash("sha256").update(TEST_LOCKDOWN_ID).digest("hex")]) };
});

/**
 * @description Lets the fire-and-forget context menu handler chain settle
 * by yielding a bounded number of macrotask turns.
 *
 * @param {number} [turns] - The number of turns to yield.
 * @return {Promise<void>} - Resolves when the turns have elapsed.
 */
function settle(turns = 10)
{
	let chain = Promise.resolve();
	for (let i = 0; i < turns; i++)
	{
		chain = chain.then(() => new Promise(resolve => setTimeout(resolve, 0)));
	}

	return chain;
}

/**
 * @description Registers a scripted player endpoint that reports an already
 * existing player and records playTab and playText calls.
 *
 * @param {Function} [playTabImpl] - Optional playTab behavior override.
 * @return {Object} - The recorded calls.
 */
function fakePlayer(playTabImpl)
{
	const calls = { playTab: [],
																	playText: [] };
	registerMessageListener("player", {
		stop: () => true,
		playTab()
		{
			if (playTabImpl) return playTabImpl();
			calls.playTab.push([]);

			return null;
		},
		playText(text, opts)
		{
			calls.playText.push([text, opts]);

			return null;
		}
	});

	return calls;
}

/**
 * @description Emits a read-selection context menu click against the
 * listener events.js registered at import time.
 *
 * @param {Object} overrides - OnClickData overrides.
 * @param {?Object} tab - The tab the click happened in.
 */
function clickReadSelection(overrides, tab)
{
	chrome.contextMenus.onClicked.emit({
		menuItemId: "read-selection",
		selectionText: "Selected words",
		frameId: 0,
		...overrides
	}, tab);
}

describe("context menu read-selection", () =>
{
	it("routes a top-frame selection click through playTab", async() =>
	{
		const calls = fakePlayer();
		clickReadSelection({}, chrome.tabs.__tabs[0]);
		await settle();

		expect(calls.playTab).toHaveLength(1);
		expect(calls.playText).toHaveLength(0);
		const { sourceUri } = await chrome.storage.local.get(["sourceUri"]);
		expect(sourceUri).toBe("contentscript:1");
	});

	it("falls back to the flattened selection text on unscriptable pages", async() =>
	{
		chrome.tabs.__tabs[0].url = "chrome://settings/";
		const calls = fakePlayer();
		clickReadSelection({}, chrome.tabs.__tabs[0]);
		await settle();

		expect(calls.playTab).toHaveLength(0);
		expect(calls.playText).toEqual([["Selected words", { lang: "en" }]]);
	});

	it("falls back when the selection click came from a subframe", async() =>
	{
		const calls = fakePlayer();
		clickReadSelection({ frameId: 7 }, chrome.tabs.__tabs[0]);
		await settle();

		expect(calls.playTab).toHaveLength(0);
		expect(calls.playText).toHaveLength(1);
	});

	it("does not fall back on errors that are not injection failures", async() =>
	{
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => null);
		const calls = fakePlayer(() =>
		{
			throw new Error("engine exploded");
		});
		clickReadSelection({}, chrome.tabs.__tabs[0]);
		await settle();

		expect(calls.playText).toHaveLength(0);
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});

describe("lockdown reads in the service worker", () =>
{
	const LOCKDOWN = { id: TEST_LOCKDOWN_ID,
																				url: `chrome-extension://${TEST_LOCKDOWN_ID}/background.js` };

	/**
	 * @description Sends a lockdown channel message the way Chrome delivers it
	 * to the listener events.js registered at import time.
	 *
	 * @param {string} type - The message type.
	 * @param {Object} [payload] - The payload, omitted when absent.
	 * @return {?Object} - The synchronous answer, if any.
	 */
	function fromLockdown(type, payload)
	{
		const message = { v: 1,
																				type };
		if (arguments.length > 1) message.payload = payload;
		const sendResponse = vi.fn();
		chrome.runtime.onMessageExternal.emit(message, LOCKDOWN, sendResponse);

		return sendResponse.mock.calls.length ? sendResponse.mock.calls[0][0] : null;
	}

	/**
	 * @description Registers a player endpoint that counts what Herald asks it
	 * to do, and reports itself stopped.
	 *
	 * @return {Object} - The counts and the texts it was asked to play.
	 */
	function recordingPlayer()
	{
		const calls = { stop: 0,
																		pause: 0,
																		resume: 0,
																		forward: 0,
																		rewind: 0,
																		seek: 0,
																		playText: [] };
		registerMessageListener("player", {
			stop()
			{
				calls.stop++;

				return true;
			},
			pause()
			{
				calls.pause++;
			},
			resume()
			{
				calls.resume++;
			},
			forward()
			{
				calls.forward++;
			},
			rewind()
			{
				calls.rewind++;
			},
			seek()
			{
				calls.seek++;
			},
			playText(text)
			{
				calls.playText.push(text);

				return null;
			},
			getPlaybackState()
			{
				return { state: "STOPPED" };
			}
		});

		return calls;
	}

	const ACCEPTED = { v: 1,
																				ok: true,
																				type: "readSelection" };

	beforeEach(() =>
	{
		chrome.__tts.voices.push({ voiceName: "Local English",
																													lang: "en-US",
																													remote: false });
		chrome.__tts.eventScript = [{ type: "start" }];
	});

	it("speaks a lockdown selection after stopping Herald's player, touching no page", async() =>
	{
		const player = recordingPlayer();

		expect(fromLockdown("readSelection", { tabId: 1,
																																									text: "Question one" })).toEqual(ACCEPTED);
		await settle();

		expect(player.stop).toBe(1);
		expect(chrome.__tts.utterances.map(u => u.text)).toEqual(["Question one"]);
		expect(chrome.__recorded.executeScript).toHaveLength(0);
		expect(await bgPageInvoke("getPlaybackState")).toEqual({ state: "PLAYING" });
	});

	it("speaks a lockdown selection when Herald has no player at all", async() =>
	{
		expect(fromLockdown("readSelection", { tabId: 1,
																																									text: "Question one" })).toEqual(ACCEPTED);
		await settle();

		expect(chrome.__tts.utterances.map(u => u.text)).toEqual(["Question one"]);
		expect(chrome.__recorded.executeScript).toHaveLength(0);
	});

	it("lets a read the student started from Herald survive a lockdown stop", async() =>
	{
		const player = recordingPlayer();
		await bgPageInvoke("playText", ["The student's own read", {}]);
		const ttsStop = vi.spyOn(chrome.tts, "stop");

		expect(fromLockdown("stop")).toEqual({ v: 1,
																																									ok: true,
																																									type: "stop" });
		await settle();

		expect(ttsStop).not.toHaveBeenCalled();
		expect(player.stop).toBe(1);
		expect(player.playText).toEqual(["The student's own read"]);
		ttsStop.mockRestore();
	});

	it("ends a lockdown read on a lockdown stop", async() =>
	{
		recordingPlayer();
		fromLockdown("readSelection", { tabId: 1,
																																		text: "Question one" });
		await settle();
		const ttsStop = vi.spyOn(chrome.tts, "stop");
		fromLockdown("stop");
		await settle();

		expect(ttsStop).toHaveBeenCalledTimes(1);
		expect(await bgPageInvoke("getPlaybackState")).toEqual({ state: "STOPPED" });
		ttsStop.mockRestore();
	});

	it("honors a stop sent right after readSelection, while Herald is still stopping its player", async() =>
	{
		const player = recordingPlayer();

		expect(fromLockdown("readSelection", { tabId: 1,
																																									text: "Question one" })).toEqual(ACCEPTED);
		expect(fromLockdown("stop")).toEqual({ v: 1,
																																									ok: true,
																																									type: "stop" });
		await settle();

		expect(player.stop).toBe(1);
		expect(chrome.__tts.utterances).toHaveLength(0);
		expect(await chrome.storage.session.get("lockdownRead")).toEqual({});
		expect(await bgPageInvoke("getPlaybackState")).toEqual({ state: "STOPPED" });
	});

	it("still speaks a readSelection sent right after a stop", async() =>
	{
		recordingPlayer();
		fromLockdown("stop");
		fromLockdown("readSelection", { tabId: 1,
																																		text: "Question one" });
		await settle();

		expect(chrome.__tts.utterances.map(u => u.text)).toEqual(["Question one"]);
		expect(await bgPageInvoke("getPlaybackState")).toEqual({ state: "PLAYING" });
	});

	it("lets the student's own read replace a lockdown read", async() =>
	{
		const player = recordingPlayer();
		fromLockdown("readSelection", { tabId: 1,
																																		text: "Question one" });
		await settle();
		const ttsStop = vi.spyOn(chrome.tts, "stop");
		await bgPageInvoke("playText", ["The student's own read", {}]);

		expect(ttsStop).toHaveBeenCalled();
		expect(player.playText).toEqual(["The student's own read"]);
		expect(await bgPageInvoke("getPlaybackState")).toEqual({ state: "STOPPED" });
		ttsStop.mockRestore();
	});

	it("lets the student's page read replace a lockdown read", async() =>
	{
		const calls = fakePlayer();
		fromLockdown("readSelection", { tabId: 1,
																																		text: "Question one" });
		await settle();
		const ttsStop = vi.spyOn(chrome.tts, "stop");
		await bgPageInvoke("playTab", [1]);

		expect(ttsStop).toHaveBeenCalled();
		expect(calls.playTab).toHaveLength(1);
		ttsStop.mockRestore();
	});

	it("drives a lockdown read with Herald's pause, play and stop shortcuts, never touching a page", async() =>
	{
		const player = recordingPlayer();
		await chrome.storage.local.set({ sourceUri: "contentscript:1" });
		fromLockdown("readSelection", { tabId: 1,
																																		text: "Question one" });
		await settle();

		chrome.commands.onCommand.emit("pause");
		await settle();
		expect(chrome.__tts.paused).toBe(true);
		expect(await bgPageInvoke("getPlaybackState")).toEqual({ state: "PAUSED" });

		chrome.commands.onCommand.emit("play");
		await settle();
		expect(chrome.__tts.paused).toBe(false);
		expect(await bgPageInvoke("getPlaybackState")).toEqual({ state: "PLAYING" });

		chrome.commands.onCommand.emit("stop");
		await settle();
		expect(await bgPageInvoke("getPlaybackState")).toEqual({ state: "STOPPED" });
		expect(chrome.__recorded.executeScript).toHaveLength(0);
		expect(player).toMatchObject({ stop: 1,
																																	pause: 0,
																																	resume: 0 });
	});

	it("makes forward, rewind and seek do nothing during a lockdown read", async() =>
	{
		const player = recordingPlayer();
		fromLockdown("readSelection", { tabId: 1,
																																		text: "Question one" });
		await settle();

		await bgPageInvoke("forward");
		await bgPageInvoke("rewind");
		await bgPageInvoke("seek", [1]);

		expect(player).toMatchObject({ forward: 0,
																																	rewind: 0,
																																	seek: 0 });
	});

	it("still sends pause, resume, forward and stop to the player when no lockdown read plays", async() =>
	{
		const player = recordingPlayer();
		await chrome.storage.local.set({ sourceUri: "contentscript:1" });

		await bgPageInvoke("pause");
		await bgPageInvoke("resume");
		await bgPageInvoke("forward");
		await bgPageInvoke("stop");

		expect(player).toMatchObject({ pause: 1,
																																	resume: 1,
																																	forward: 1,
																																	stop: 1 });
		expect(chrome.__recorded.executeScript).toHaveLength(1);
	});
});

describe("isInjectionBlocked", () =>
{
	it("matches the unreadable, file access, and permission validations", () =>
	{
		for (const code of ["error_page_unreadable", "error_file_access", "error_add_permissions"])
		{
			expect(isInjectionBlocked(new Error(JSON.stringify({ code })))).toBe(true);
		}
	});

	it("matches browser injection refusals", () =>
	{
		expect(isInjectionBlocked(new Error("Cannot access a chrome:// URL"))).toBe(true);
		expect(isInjectionBlocked(new Error("Cannot access contents of the page."))).toBe(true);
		expect(isInjectionBlocked(new Error("The extensions gallery cannot be scripted."))).toBe(true);
		expect(isInjectionBlocked(new Error("Missing host permission for the tab"))).toBe(true);
	});

	it("does not match playback errors or empty values", () =>
	{
		expect(isInjectionBlocked(new Error("TTS voice missing"))).toBe(false);
		expect(isInjectionBlocked(null)).toBe(false);
		expect(isInjectionBlocked({})).toBe(false);
	});
});

describe("isTopFrameClick", () =>
{
	it("treats frame zero and a missing frame id as top frame", () =>
	{
		expect(isTopFrameClick({ frameId: 0 })).toBe(true);
		expect(isTopFrameClick({})).toBe(true);
	});

	it("treats a nonzero frame id as a subframe", () =>
	{
		expect(isTopFrameClick({ frameId: 7 })).toBe(false);
	});
});
