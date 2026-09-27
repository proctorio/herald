/**
 * @description The lockdown channel (decision D8): which extensions Herald
 * answers, and the one structured answer each of their messages gets back.
 * Lockdown builds are known only by the SHA-256 hash of their IDs, so these
 * tests add the hash of an ID generated for this run to the list. No lockdown
 * extension ID appears here.
 */
import { vi } from "vitest";
import { handleExternalMessage, isLockdownSender, registerExternalMessageListener, MESSAGE_TYPES } from "../src/js/external-messaging.js";
import MANIFEST from "../src/manifest.json";

const { randomExtensionId, TEST_LOCKDOWN_ID } = vi.hoisted(() =>
{
	/**
	 * @description Makes a random, well-formed extension ID: 32 letters a-p.
	 *
	 * @return {string} - The ID.
	 */
	function makeId()
	{
		return Array.from({ length: 32 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 16))).join("");
	}

	return { randomExtensionId: makeId,
										TEST_LOCKDOWN_ID: makeId() };
});

vi.mock("../src/js/lockdown-ids.js", async importOriginal =>
{
	const { createHash } = await import("node:crypto");
	const actual = await importOriginal();

	return { LOCKDOWN_ID_HASHES: Object.freeze([...actual.LOCKDOWN_ID_HASHES, createHash("sha256").update(TEST_LOCKDOWN_ID).digest("hex")]) };
});

const HELLO = { v: 1,
																type: "hello" };
const HELLO_ANSWER = { v: 1,
																							ok: true,
																							type: "hello",
																							version: "0.0.0",
																							types: ["hello"] };

/**
 * @description Builds the sender Chrome reports for a message from another
 * extension's service worker.
 *
 * @param {string} id - The sending extension's ID.
 * @return {Object} - The MessageSender.
 */
function fromExtension(id)
{
	return { id,
										url: `chrome-extension://${id}/background.js` };
}

/**
 * @description The answer Herald gives a lockdown build whose message it
 * refuses.
 *
 * @param {string} code - The error code.
 * @return {Object} - The structured rejection.
 */
function rejection(code)
{
	return { v: 1,
										ok: false,
										error: { code } };
}

const LOCKDOWN_BUILD = fromExtension(TEST_LOCKDOWN_ID);
const NOT_LOCKDOWN = [
	["an unlisted extension", fromExtension(randomExtensionId())],
	["a sender with no extension ID (a web page)", { url: "https://example.com/",
																																																		origin: "https://example.com" }],
	["a sender whose ID is not a string", { id: 7 }],
	["a null sender", null],
	["a listed ID in upper case", fromExtension(TEST_LOCKDOWN_ID.toUpperCase())],
	["a listed ID with a character added", fromExtension(`${TEST_LOCKDOWN_ID}a`)],
	["an empty ID", fromExtension("")]
];

describe("lockdown allowlist", () =>
{
	it("holds the thirteen lockdown builds as distinct SHA-256 hashes", async() =>
	{
		const { LOCKDOWN_ID_HASHES } = await vi.importActual("../src/js/lockdown-ids.js");

		expect(LOCKDOWN_ID_HASHES).toHaveLength(13);
		expect(new Set(LOCKDOWN_ID_HASHES).size).toBe(13);
		for (const hash of LOCKDOWN_ID_HASHES) expect(hash).toMatch(/^[0-9a-f]{64}$/u);
	});

	it("leaves the manifest listing no ID and admitting no web page", () =>
	{
		expect(MANIFEST.externally_connectable).toEqual({ ids: ["*"] });
	});
});

describe("isLockdownSender", () =>
{
	it("accepts an extension whose ID hashes to a listed build", () =>
	{
		expect(isLockdownSender(LOCKDOWN_BUILD)).toBe(true);
	});

	it.each(NOT_LOCKDOWN)("refuses %s", (label, sender) =>
	{
		expect(isLockdownSender(sender)).toBe(false);
	});
});

describe("handleExternalMessage", () =>
{
	it("answers hello from a lockdown build with the version and supported types", () =>
	{
		expect(handleExternalMessage(HELLO, LOCKDOWN_BUILD)).toEqual(HELLO_ANSWER);
	});

	it("supports only the hello handshake in this protocol version", () =>
	{
		expect(MESSAGE_TYPES).toEqual(["hello"]);
	});

	it.each(NOT_LOCKDOWN)("gives no answer at all to %s", (label, sender) =>
	{
		expect(handleExternalMessage(HELLO, sender)).toBeNull();
	});

	it("gives an unknown extension no answer whatever it sends, so it cannot probe", () =>
	{
		const stranger = fromExtension(randomExtensionId());
		for (const message of ["not even an object", null, { v: 2,
																																																							type: "hello" }, { v: 1,
																																																																										type: "readSelection" }, { v: 1,
																																																																																																					type: "hello",
																																																																																																					extra: true }]) expect(handleExternalMessage(message, stranger)).toBeNull();
	});

	it.each([
		[{ type: "hello" }],
		[{ v: 2,
					type: "hello" }],
		[{ v: 0,
					type: "hello" }],
		[{ v: "1",
					type: "hello" }]
	])("rejects the unsupported version in %j", message =>
	{
		expect(handleExternalMessage(message, LOCKDOWN_BUILD)).toEqual(rejection("unsupported_version"));
	});

	it.each(["readSelection", "announce", "examState", "getState", "toString", "__proto__", "constructor", ""])("rejects the unknown type %j", type =>
	{
		expect(handleExternalMessage({ v: 1,
																																	type }, LOCKDOWN_BUILD)).toEqual(rejection("unknown_type"));
	});

	it.each([
		[null],
		["hello"],
		[42],
		[[HELLO]],
		[{ v: 1 }],
		[{ v: 1,
					type: 7 }],
		[{ v: 1,
					type: "hello",
					extra: true }],
		[{ v: 1,
					type: "hello",
					payload: {} }],
		[{ v: 1,
					type: "hello",
					payload: null }]
	])("rejects the malformed message %j", message =>
	{
		expect(handleExternalMessage(message, LOCKDOWN_BUILD)).toEqual(rejection("malformed"));
	});

	it("answers internal instead of throwing when a handler fails", () =>
	{
		const manifest = vi.spyOn(chrome.runtime, "getManifest").mockImplementation(() =>
		{
			throw new Error("manifest unavailable");
		});
		const logged = vi.spyOn(console, "error").mockImplementation(() => null);

		expect(handleExternalMessage(HELLO, LOCKDOWN_BUILD)).toEqual(rejection("internal"));
		expect(logged).toHaveBeenCalled();

		manifest.mockRestore();
		logged.mockRestore();
	});
});

describe("registerExternalMessageListener", () =>
{
	/**
	 * @description Registers the listener and returns it, so a test can call
	 * it the way Chrome does.
	 *
	 * @return {Function} - The registered onMessageExternal listener.
	 */
	function registerAndCapture()
	{
		registerExternalMessageListener();

		return chrome.runtime.onMessageExternal.listeners.at(-1);
	}

	it("answers a lockdown build synchronously through sendResponse", () =>
	{
		const listener = registerAndCapture();
		const sendResponse = vi.fn();

		expect(listener(HELLO, LOCKDOWN_BUILD, sendResponse)).toBeUndefined();
		expect(sendResponse).toHaveBeenCalledWith(HELLO_ANSWER);
		chrome.runtime.onMessageExternal.removeListener(listener);
	});

	it("sends an unknown extension nothing and does not hold its channel open", () =>
	{
		const listener = registerAndCapture();
		const sendResponse = vi.fn();

		expect(listener(HELLO, fromExtension(randomExtensionId()), sendResponse)).toBeUndefined();
		expect(sendResponse).not.toHaveBeenCalled();
		chrome.runtime.onMessageExternal.removeListener(listener);
	});

	it("is a no-op where the browser has no external messaging", () =>
	{
		const event = chrome.runtime.onMessageExternal;
		delete chrome.runtime.onMessageExternal;

		expect(() => registerExternalMessageListener()).not.toThrow();
		chrome.runtime.onMessageExternal = event;
	});
});
