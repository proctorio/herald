/**
 * @description The lockdown channel (decision D8): which extensions Herald
 * answers, and the one structured answer each of their messages gets back.
 * Lockdown builds are known only by the SHA-256 hash of their IDs, so these
 * tests add the hash of an ID generated for this run to the list. No lockdown
 * extension ID appears here.
 */
import { vi } from "vitest";
import { handleExternalMessage, isLockdownSender, registerExternalMessageListener, MESSAGE_TYPES, READ_SELECTION_MAX_LENGTH } from "../src/js/external-messaging.js";
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
																							types: ["hello", "readSelection", "stop"] };

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

	it("supports hello, readSelection and stop in this protocol version", () =>
	{
		expect(MESSAGE_TYPES).toEqual(["hello", "readSelection", "stop"]);
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

	it.each(["announce", "examState", "getState", "toString", "__proto__", "constructor", ""])("rejects the unknown type %j", type =>
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

/**
 * @description Builds a readSelection message.
 *
 * @param {?(Object|Array|string)} [payload] - The payload to send; omitted when absent.
 * @return {Object} - The message.
 */
function readSelection(payload)
{
	const message = { v: 1,
																			type: "readSelection" };
	if (arguments.length) message.payload = payload;

	return message;
}

/**
 * @description Records the channel actions a test wires in, the way events.js
 * wires the real ones.
 *
 * @return {Object} - The actions, each a vi.fn.
 */
function recordedActions()
{
	return { readSelection: vi.fn(),
										stop: vi.fn() };
}

describe("readSelection", () =>
{
	const ACCEPTED = { v: 1,
																				ok: true,
																				type: "readSelection" };

	it("accepts the text right away and reads it after answering", async() =>
	{
		const actions = recordedActions();

		expect(handleExternalMessage(readSelection({ tabId: 7,
																																															text: "Read this" }), LOCKDOWN_BUILD, actions)).toEqual(ACCEPTED);
		expect(actions.readSelection).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(actions.readSelection).toHaveBeenCalledWith("Read this");
	});

	it("passes the text on exactly as sent", async() =>
	{
		const actions = recordedActions();
		const text = "  First line\n\nSecond line, Proctorio  ";
		handleExternalMessage(readSelection({ tabId: 0,
																																								text }), LOCKDOWN_BUILD, actions);
		await Promise.resolve();

		expect(actions.readSelection).toHaveBeenCalledWith(text);
	});

	it("accepts text of exactly 10000 code units, counting a surrogate pair as two", () =>
	{
		expect(READ_SELECTION_MAX_LENGTH).toBe(10000);
		const text = "\u{1F600}".repeat(5000);
		expect(text.length).toBe(10000);

		expect(handleExternalMessage(readSelection({ tabId: 1,
																																															text }), LOCKDOWN_BUILD, recordedActions())).toEqual(ACCEPTED);
	});

	it.each([
		["text over the cap", { tabId: 1,
																										text: "a".repeat(10001) }],
		["empty text", { tabId: 1,
																			text: "" }],
		["blank text", { tabId: 1,
																			text: " \n\t\u00A0 " }],
		["non-string text", { tabId: 1,
																								text: 42 }],
		["null text", { tabId: 1,
																		text: null }],
		["missing text", { tabId: 1 }],
		["missing tabId", { text: "x" }],
		["a negative tabId", { tabId: -1,
																									text: "x" }],
		["a fractional tabId", { tabId: 1.5,
																											text: "x" }],
		["a string tabId", { tabId: "1",
																							text: "x" }],
		["an unsafe integer tabId", { tabId: 2 ** 53,
																																text: "x" }],
		["a NaN tabId", { tabId: Number.NaN,
																				text: "x" }],
		["an extra key", { tabId: 1,
																					text: "x",
																					lang: "en" }],
		["an own __proto__ key", JSON.parse("{\"tabId\": 1, \"text\": \"x\", \"__proto__\": {}}")],
		["a null payload", null],
		["an array payload", [1, "x"]],
		["a string payload", "x"]
	])("refuses %s as malformed and reads nothing", async(label, payload) =>
	{
		const actions = recordedActions();

		expect(handleExternalMessage(readSelection(payload), LOCKDOWN_BUILD, actions)).toEqual(rejection("malformed"));
		await Promise.resolve();
		expect(actions.readSelection).not.toHaveBeenCalled();
	});

	it("refuses a readSelection with no payload as malformed", () =>
	{
		const actions = recordedActions();

		expect(handleExternalMessage(readSelection(), LOCKDOWN_BUILD, actions)).toEqual(rejection("malformed"));
	});

	it("answers ok even when the read fails later, and logs the failure", async() =>
	{
		const logged = vi.spyOn(console, "error").mockImplementation(() => null);
		const actions = { readSelection: vi.fn().mockRejectedValue(new Error("no voice")),
																				stop: vi.fn() };

		expect(handleExternalMessage(readSelection({ tabId: 1,
																																															text: "x" }), LOCKDOWN_BUILD, actions)).toEqual(ACCEPTED);
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(logged).toHaveBeenCalledWith("lockdown channel action", expect.any(Error));
		logged.mockRestore();
	});

	it("answers internal when no read action is wired", () =>
	{
		const logged = vi.spyOn(console, "error").mockImplementation(() => null);

		expect(handleExternalMessage(readSelection({ tabId: 1,
																																															text: "x" }), LOCKDOWN_BUILD)).toEqual(rejection("internal"));
		logged.mockRestore();
	});

	it("gives an unknown extension no answer and reads nothing", async() =>
	{
		const actions = recordedActions();

		expect(handleExternalMessage(readSelection({ tabId: 1,
																																															text: "x" }), fromExtension(randomExtensionId()), actions)).toBeNull();
		await Promise.resolve();
		expect(actions.readSelection).not.toHaveBeenCalled();
	});
});

describe("stop", () =>
{
	it("answers ok and stops the lockdown read after answering", async() =>
	{
		const actions = recordedActions();

		expect(handleExternalMessage({ v: 1,
																																	type: "stop" }, LOCKDOWN_BUILD, actions)).toEqual({ v: 1,
																																																																																					ok: true,
																																																																																					type: "stop" });
		await Promise.resolve();
		expect(actions.stop).toHaveBeenCalledTimes(1);
		expect(actions.readSelection).not.toHaveBeenCalled();
	});

	it.each([[{}], [null], [{ tabId: 1 }]])("refuses the payload %j as malformed", async payload =>
	{
		const actions = recordedActions();

		expect(handleExternalMessage({ v: 1,
																																	type: "stop",
																																	payload }, LOCKDOWN_BUILD, actions)).toEqual(rejection("malformed"));
		await Promise.resolve();
		expect(actions.stop).not.toHaveBeenCalled();
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

	it("hands a lockdown read to the actions it was registered with", async() =>
	{
		const actions = recordedActions();
		registerExternalMessageListener(actions);
		const listener = chrome.runtime.onMessageExternal.listeners.at(-1);
		const sendResponse = vi.fn();

		listener(readSelection({ tabId: 3,
																											text: "Question one" }), LOCKDOWN_BUILD, sendResponse);
		await Promise.resolve();
		expect(sendResponse).toHaveBeenCalledWith({ v: 1,
																																														ok: true,
																																														type: "readSelection" });
		expect(actions.readSelection).toHaveBeenCalledWith("Question one");
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
