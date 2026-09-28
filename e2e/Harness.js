/**
 * Shared launch helper for the extension integration tests. Loads the built
 * extension from dist/ into a persistent Chromium context and resolves the
 * assigned extension id from the service worker URL.
 */
import { fileURLToPath } from "node:url";
import { createHash, generateKeyPairSync } from "node:crypto";
import { cpSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const E2E_DIST = fileURLToPath(new URL("../.test_output/e2e-dist", import.meta.url));
const STUB_TEMPLATE = fileURLToPath(new URL("fixtures/lockdown-stub", import.meta.url));
const STUBS_DIR = fileURLToPath(new URL("../.test_output/e2e-lockdown-stubs", import.meta.url));
const LOCKDOWN_HASHES_ANCHOR = "export const LOCKDOWN_ID_HASHES = Object.freeze([\n";

// The lockdown stub roles for the lockdown channel tests. The hash of the
// "allowed" stub's ID goes into the test copy's lockdown list; "unlisted" is
// any other extension, which Chrome delivers to Herald (ids "*") and Herald
// must leave unanswered.
const STUB_ROLES = ["allowed", "unlisted"];

// Fixed DevTools port for the toolbar tests: Playwright does not surface the
// toolbar popup as a page, so those tests reach it over the raw protocol.
// The config runs one worker, so a fixed port cannot collide.
const DEBUGGING_PORT = 9555;

/**
 * @description Builds the test copy of the extension. It is byte-identical to
 * dist/ except for ONE addition: a host permission for the local fixture
 * origin. In real use, activeTab grants page access on the user's toolbar
 * click or keyboard shortcut; the tests that do not click the toolbar need
 * the fixture origin to stand in for that grant. Nothing else differs, and
 * the zero-egress assertions run against this build unchanged. The toolbar
 * tests (realBuild) load dist/ itself and get page access the way users do.
 * The lockdown channel tests add their allowed stub's hash on top
 * (allowStubs); no other test copy, and never dist/, carries it.
 *
 * @param {?Object} stubs - Lockdown stubs from buildLockdownStubs, or null.
 */
function buildTestExtension(stubs)
{
	rmSync(E2E_DIST, { recursive: true,
																				force: true });
	cpSync(DIST, E2E_DIST, { recursive: true });
	const manifestPath = `${E2E_DIST}/manifest.json`;
	const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
	manifest.host_permissions = ["http://localhost:8123/*"];
	if (stubs) allowStubs(stubs);
	writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * @description Adds the hash of the "allowed" stub's ID to the test copy's
 * lockdown list (js/lockdown-ids.js). The manifest needs no change: it already
 * admits every extension.
 *
 * @param {Object} stubs - Lockdown stubs from buildLockdownStubs.
 */
function allowStubs(stubs)
{
	const hashesPath = `${E2E_DIST}/js/lockdown-ids.js`;
	const source = readFileSync(hashesPath, "utf-8");
	if (!source.includes(LOCKDOWN_HASHES_ANCHOR)) throw new Error("js/lockdown-ids.js changed shape; update allowStubs in e2e/Harness.js");
	const hash = createHash("sha256").update(stubs.allowed.id).digest("hex");
	writeFileSync(hashesPath, source.replace(LOCKDOWN_HASHES_ANCHOR, `${LOCKDOWN_HASHES_ANCHOR}\t"${hash}", // e2e lockdown stub, test copies only\n`));
}

/**
 * @description Computes the extension ID Chrome derives from a manifest key:
 * the first 16 bytes of the SHA-256 of the DER public key, one hex digit per
 * character, mapped 0-f to a-p.
 *
 * @param {Buffer} der - The DER-encoded public key.
 * @return {string} - The 32-character extension ID.
 */
function extensionIdFromKey(der)
{
	return [...createHash("sha256").update(der)
		.digest("hex")
		.slice(0, 32)].map(digit => String.fromCharCode(97 + parseInt(digit, 16))).join("");
}

/**
 * @description Writes one copy of the lockdown stub per role, each with an
 * RSA key generated for this run, so no stub ID exists outside a test run.
 *
 * @return {Object} - Role to { id, path }.
 */
function buildLockdownStubs()
{
	rmSync(STUBS_DIR, { recursive: true,
																					force: true });
	const stubs = {};
	for (const role of STUB_ROLES)
	{
		const path = `${STUBS_DIR}/${role}`;
		cpSync(STUB_TEMPLATE, path, { recursive: true });
		const der = generateKeyPairSync("rsa", { modulusLength: 2048 }).publicKey.export({ type: "spki",
																																																																																					format: "der" });
		const manifestPath = `${path}/manifest.json`;
		const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
		manifest.key = der.toString("base64");
		manifest.name = `${manifest.name} (${role})`;
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
		stubs[role] = { id: extensionIdFromKey(der),
																		path };
	}

	return stubs;
}

/**
 * @description Resolves the service worker of the extension whose ID passes
 * the test, whether it has already started or starts later.
 *
 * @param {Object} context - The persistent browser context.
 * @param {Function} matchesId - Predicate over an extension ID.
 * @return {Promise<Object>} - The service worker.
 */
function waitForWorker(context, matchesId)
{
	/**
	 * @description Tells whether a service worker belongs to a wanted extension.
	 *
	 * @param {Object} candidate - A service worker.
	 * @return {boolean} - True when its extension ID passes matchesId.
	 */
	const isMatch = candidate => matchesId(new URL(candidate.url()).host);
	const running = context.serviceWorkers().find(isMatch);

	return running ? Promise.resolve(running) : context.waitForEvent("serviceworker", { predicate: isMatch });
}

/**
 * @description Launches Chromium with the built extension loaded and waits
 * for its service worker.
 *
 * @param {Object} [options] - Launch options.
 * @param {boolean} [options.realBuild] - Load dist/ unmodified (no fixture
 * host permission) and enable the protocol access the toolbar tests use.
 * @param {boolean} [options.lockdownStubs] - Also load one lockdown stub per
 * role (see STUB_ROLES) next to the test copy. Not valid with realBuild.
 * @return {Promise<Object>} - The context, extension id, service worker, and
 * (with lockdownStubs) the stubs by role, each { id, path, worker }.
 */
export async function launchWithExtension(options = {})
{
	if (options.realBuild && options.lockdownStubs) throw new Error("lockdownStubs needs the test copy; it cannot run with realBuild");
	let extensionPath = DIST;
	const args = [];
	const stubs = options.lockdownStubs ? buildLockdownStubs() : null;
	if (options.realBuild)
	{
		args.push("--enable-unsafe-extension-debugging", `--remote-debugging-port=${DEBUGGING_PORT}`);
	}
	else
	{
		buildTestExtension(stubs);
		extensionPath = E2E_DIST;
	}
	const stubList = stubs ? Object.values(stubs) : [];
	const paths = [extensionPath, ...stubList.map(stub => stub.path)].join(",");
	const context = await chromium.launchPersistentContext("", {
		channel: "chromium",
		args: [
			`--disable-extensions-except=${paths}`,
			`--load-extension=${paths}`,
			...args
		]
	});
	const worker = await waitForWorker(context, id => !stubList.some(stub => stub.id === id));
	const extensionId = new URL(worker.url()).host;
	const stubWorkers = await Promise.all(stubList.map(stub => waitForWorker(context, id => id === stub.id)));
	stubList.forEach((stub, index) =>
	{
		stub.worker = stubWorkers[index];
	});

	return { context,
										extensionId,
										worker,
										stubs };
}

/**
 * @description Clicks the extension's toolbar icon for a page, exactly as a
 * user does: the browser opens the real toolbar popup and grants activeTab
 * for that tab. Requires a realBuild launch.
 *
 * @param {Object} context - The persistent context from launchWithExtension.
 * @param {string} extensionId - The loaded extension's id.
 * @param {Object} page - The Playwright page whose tab gets the click.
 */
export async function clickToolbarIcon(context, extensionId, page)
{
	const session = await context.browser().newBrowserCDPSession();
	const { targetInfos } = await session.send("Target.getTargets", { filter: [{ type: "tab" }] });
	const tab = targetInfos.find(target => target.url === page.url());
	if (!tab) throw new Error(`No tab target for ${page.url()}`);
	await session.send("Extensions.triggerAction", { id: extensionId,
																																																		targetId: tab.targetId });
	await session.detach();
}

/**
 * @description Attaches to an extension page Playwright does not surface
 * (the toolbar popup, or the popout window) over the raw DevTools protocol.
 * Waits up to ten seconds for a target whose URL contains the fragment.
 *
 * @param {string} urlFragment - Part of the target URL, for example "popup.html".
 * @return {Promise<Object>} - evaluate(expression) and close().
 */
export async function attachToExtensionPage(urlFragment)
{
	let target;
	for (let attempt = 0; attempt < 40 && !target; attempt++)
	{
		const targets = await (await fetch(`http://127.0.0.1:${DEBUGGING_PORT}/json/list`)).json();
		target = targets.find(candidate => candidate.type === "page" && candidate.url.includes(urlFragment));
		if (!target) await new Promise(resolve => setTimeout(resolve, 250));
	}
	if (!target) throw new Error(`No extension page matching ${urlFragment}`);

	const socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) =>
	{
		socket.addEventListener("open", resolve);
		socket.addEventListener("error", reject);
	});
	let nextId = 0;
	const pending = new Map();
	socket.addEventListener("message", event =>
	{
		const message = JSON.parse(event.data);
		if (pending.has(message.id))
		{
			pending.get(message.id)(message);
			pending.delete(message.id);
		}
	});
	const send = (method, params) => new Promise(resolve =>
	{
		const id = ++nextId;
		pending.set(id, resolve);
		socket.send(JSON.stringify({ id,
																															method,
																															params }));
	});

	return {
		url: target.url,
		async evaluate(expression)
		{
			const reply = await send("Runtime.evaluate", { expression,
																																																	awaitPromise: true,
																																																	returnByValue: true });
			if (reply.result?.exceptionDetails) throw new Error(reply.result.exceptionDetails.exception?.description || reply.result.exceptionDetails.text);

			return reply.result?.result?.value;
		},
		close()
		{
			socket.close();
		}
	};
}
