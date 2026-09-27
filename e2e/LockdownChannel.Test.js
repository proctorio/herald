/**
 * The lockdown channel (decision D8) end to end in real Chromium. Stub
 * lockdown extensions, each keyed for this run only, message the built
 * extension from their service workers: the hash of one stub's ID is in the
 * test copy's lockdown list, and the other stands for any other extension,
 * which Chrome delivers to Herald and Herald must leave unanswered. The same
 * run confirms the channel never touches the open page, that no request
 * leaves the browser, and that the build carries the thirteen lockdown hashes,
 * no stub hash, and no lockdown ID in plain text.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { launchWithExtension } from "./Harness.js";
import { findLockdownIds } from "../tools/audit-lockdown-ids.js";

const FIXTURE_ORIGIN = "http://localhost:8123";
const HELLO = { v: 1,
																type: "hello" };

/**
 * @description Reads a repository file as text.
 *
 * @param {string} relative - Path relative to the repository root.
 * @return {string} - The file contents.
 */
function readRepoFile(relative)
{
	return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf-8");
}

/**
 * @description Decides whether a request URL is allowed under the zero-egress
 * contract (the same origins as ZeroEgress.Test.js).
 *
 * @param {string} url - The request URL.
 * @return {boolean} - True when the URL is an allowed origin.
 */
function isAllowed(url)
{
	return url.startsWith("chrome-extension://") ||
		url.startsWith(FIXTURE_ORIGIN) ||
		url.startsWith("data:") ||
		url.startsWith("blob:") ||
		url.startsWith("about:") ||
		url.startsWith("chrome://");
}

/**
 * @description What a stub receives when Herald refuses its message.
 *
 * @param {string} code - The error code.
 * @return {Object} - The stub-side result.
 */
function refused(code)
{
	return { response: { v: 1,
																						ok: false,
																						error: { code } } };
}

test.describe.serial("lockdown channel", () =>
{
	const offenders = [];
	let launched;
	let article;
	let articleBefore;

	/**
	 * @description Sends a message to Herald from a stub's service worker.
	 *
	 * @param {Object} stub - A stub from launchWithExtension.
	 * @param {(Object|Array|string)} message - The message, well formed or not.
	 * @return {Promise<Object>} - { response } or { error } as the stub saw it.
	 */
	function send(stub, message)
	{
		return stub.worker.evaluate(([heraldId, payload]) => self.sendToHerald(heraldId, payload), [launched.extensionId, message]);
	}

	test.beforeAll(async() =>
	{
		launched = await launchWithExtension({ lockdownStubs: true });
		launched.context.on("request", request =>
		{
			if (!isAllowed(request.url())) offenders.push(request.url());
		});
		article = await launched.context.newPage();
		await article.goto(`${FIXTURE_ORIGIN}/article.html`);
		articleBefore = await article.evaluate(() => document.documentElement.outerHTML);
	});

	test.afterAll(async() =>
	{
		await launched?.context.close();
	});

	test("an allowlisted lockdown build gets the hello handshake", async() =>
	{
		const version = JSON.parse(readRepoFile("dist/manifest.json")).version;
		expect(await send(launched.stubs.allowed, HELLO)).toEqual({ response: { v: 1,
																																																																										ok: true,
																																																																										type: "hello",
																																																																										version,
																																																																										types: ["hello"] } });
	});

	test("Herald does not answer an extension that is not a lockdown build, whatever it sends", async() =>
	{
		// Chrome delivers (the manifest admits every extension), so the send
		// resolves instead of failing with "Could not establish connection",
		// and Herald's silence leaves it with no value: no refusal, no code.
		const probes = [
			HELLO,
			{ v: 2,
				type: "hello" },
			{ v: 1,
				type: "readSelection" },
			{ v: 1,
				type: "hello",
				extra: true },
			"hello"
		];
		const answers = await Promise.all(probes.map(message => send(launched.stubs.unlisted, message)));
		for (const answer of answers) expect(answer).toStrictEqual({ response: undefined });
	});

	test("a protocol version other than 1 is refused", async() =>
	{
		expect(await send(launched.stubs.allowed, { v: 2,
																																														type: "hello" })).toEqual(refused("unsupported_version"));
		expect(await send(launched.stubs.allowed, { v: "1",
																																														type: "hello" })).toEqual(refused("unsupported_version"));
	});

	test("an unknown message type is refused", async() =>
	{
		const answers = await Promise.all(["readSelection", "announce", "examState", "getState"].map(type => send(launched.stubs.allowed, { v: 1,
																																																																																																																																						type })));
		for (const answer of answers) expect(answer).toEqual(refused("unknown_type"));
	});

	test("a malformed payload is refused", async() =>
	{
		const malformed = [
			"hello",
			[HELLO],
			{ v: 1 },
			{ v: 1,
					type: "hello",
					extra: true },
			{ v: 1,
					type: "hello",
					payload: { text: "read me" } }
		];
		const answers = await Promise.all(malformed.map(message => send(launched.stubs.allowed, message)));
		for (const answer of answers) expect(answer).toEqual(refused("malformed"));
	});

	test("the channel never touched the page and no request left the browser", async() =>
	{
		expect(await article.evaluate(() => document.documentElement.outerHTML)).toBe(articleBefore);
		expect(await article.locator("iframe").count()).toBe(0);
		expect(offenders).toEqual([]);
	});

	test("the build carries the thirteen lockdown hashes, no stub, and no lockdown ID in plain text", () =>
	{
		expect(JSON.parse(readRepoFile("dist/manifest.json")).externally_connectable).toEqual({ ids: ["*"] });
		const hashes = readRepoFile("dist/js/lockdown-ids.js");
		expect(hashes).toBe(readRepoFile("src/js/lockdown-ids.js"));
		expect(hashes.match(/"[0-9a-f]{64}"/gu)).toHaveLength(13);
		for (const stub of Object.values(launched.stubs)) expect(hashes).not.toContain(createHash("sha256").update(stub.id).digest("hex"));
		expect(findLockdownIds(fileURLToPath(new URL("../dist", import.meta.url))).findings).toEqual([]);
	});
});
