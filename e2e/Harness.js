/**
 * Shared launch helper for the extension integration tests. Loads the built
 * extension from dist/ into a persistent Chromium context and resolves the
 * assigned extension id from the service worker URL.
 */
import { fileURLToPath } from "node:url";
import { cpSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const DIST = fileURLToPath(new URL("../dist", import.meta.url));
const E2E_DIST = fileURLToPath(new URL("../.test_output/e2e-dist", import.meta.url));

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
 */
function buildTestExtension()
{
	rmSync(E2E_DIST, { recursive: true,
																				force: true });
	cpSync(DIST, E2E_DIST, { recursive: true });
	const manifestPath = `${E2E_DIST}/manifest.json`;
	const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
	manifest.host_permissions = ["http://localhost:8123/*"];
	writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * @description Launches Chromium with the built extension loaded and waits
 * for its service worker.
 *
 * @param {Object} [options] - Launch options.
 * @param {boolean} [options.realBuild] - Load dist/ unmodified (no fixture
 * host permission) and enable the protocol access the toolbar tests use.
 * @return {Promise<Object>} - The context, extension id, and service worker.
 */
export async function launchWithExtension(options = {})
{
	let extensionPath = DIST;
	const args = [];
	if (options.realBuild)
	{
		args.push("--enable-unsafe-extension-debugging", `--remote-debugging-port=${DEBUGGING_PORT}`);
	}
	else
	{
		buildTestExtension();
		extensionPath = E2E_DIST;
	}
	const context = await chromium.launchPersistentContext("", {
		channel: "chromium",
		args: [
			`--disable-extensions-except=${extensionPath}`,
			`--load-extension=${extensionPath}`,
			...args
		]
	});
	const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
	const extensionId = new URL(worker.url()).host;

	return { context,
										extensionId,
										worker };
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
