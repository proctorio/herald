/**
 * The path real users take, end to end: click the toolbar icon, and the page
 * is read aloud with its transcript on screen. These tests load dist/ exactly
 * as shipped (no fixture host permission), so page access comes only from the
 * activeTab grant of the real toolbar click. Every other e2e test messages
 * the service worker directly with a stand-in permission; that gap is how a
 * popup that never started reading (P0, 2026-09-20) passed the whole suite.
 */
import { test, expect } from "@playwright/test";
import { launchWithExtension, clickToolbarIcon, attachToExtensionPage } from "./Harness.js";

const FIXTURE_ORIGIN = "http://localhost:8123";

const READ_STATE = `chrome.runtime.sendMessage({ dest: "serviceWorker", method: "getPlaybackState", args: [] })
	.then(info => ({ state: info.state, error: info.playbackError || null }))`;

const TRANSCRIPT = `(() =>
{
	const pane = document.getElementById("highlight");
	return { shown: pane.checkVisibility(), paragraphs: pane.children.length, text: pane.textContent };
})()`;

/**
 * @description Polls an extension page until playback is underway and the
 * transcript pane shows paragraphs, or ten seconds pass.
 *
 * @param {Object} surface - A page from attachToExtensionPage.
 * @return {Promise<Object>} - The last observed playback state and pane.
 */
async function waitForReading(surface)
{
	let observed;
	for (let attempt = 0; attempt < 40; attempt++)
	{
		observed = { playback: await surface.evaluate(READ_STATE),
															transcript: await surface.evaluate(TRANSCRIPT) };
		const reading = observed.playback.state == "PLAYING" || observed.playback.state == "LOADING";
		if (reading && observed.transcript.shown && observed.transcript.paragraphs > 0) break;
		await new Promise(resolve => setTimeout(resolve, 250));
	}

	return observed;
}

test.describe("toolbar click", () =>
{
	test("clicking the icon reads the page and shows its transcript, with no second click", async() =>
	{
		const { context, extensionId } = await launchWithExtension({ realBuild: true });
		const article = await context.newPage();
		await article.goto(`${FIXTURE_ORIGIN}/article.html`);

		await clickToolbarIcon(context, extensionId, article);
		const popup = await attachToExtensionPage("popup.html?isPopup=1");
		const observed = await waitForReading(popup);

		expect(observed.playback.error).toBeNull();
		expect(["PLAYING", "LOADING"]).toContain(observed.playback.state);
		expect(observed.transcript.shown).toBe(true);
		expect(observed.transcript.paragraphs).toBeGreaterThan(0);
		expect(observed.transcript.text).toContain("first paragraph of the fixture article");
		await expect(article.locator("iframe[src^='chrome-extension://']")).toHaveCount(1);

		popup.close();
		await context.close();
	});

	test("with the transcript in a new window, the window reads and shows the page, not a bare play button", async() =>
	{
		const { context, extensionId, worker } = await launchWithExtension({ realBuild: true });
		await worker.evaluate(() => chrome.storage.local.set({ showHighlighting: 2 }));
		const article = await context.newPage();
		await article.goto(`${FIXTURE_ORIGIN}/article.html`);

		await clickToolbarIcon(context, extensionId, article);
		const popout = await attachToExtensionPage("popup.html?tab=");
		const observed = await waitForReading(popout);

		expect(observed.playback.error).toBeNull();
		expect(["PLAYING", "LOADING"]).toContain(observed.playback.state);
		expect(observed.transcript.shown).toBe(true);
		expect(observed.transcript.text).toContain("first paragraph of the fixture article");

		popout.close();
		await context.close();
	});
});
