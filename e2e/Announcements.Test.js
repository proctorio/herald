/**
 * Links and buttons are announced screen-reader style (HERALD-6/7/8, owner
 * decisions 2026-09-25): buttons always ("Submit answers, button"); links
 * with visible text only when the reader turns on Announce links, because
 * in running prose they arrive every few words; and a control with no
 * visible text always reads its accessible label ("Flag question, button",
 * "Open help, link"). Announcing never widens what is read: navigation and
 * a toolbar of bare buttons stay silent, and the page DOM is left as found.
 * Jsdom has no layout, so these run in real Chromium.
 */
import { test, expect } from "@playwright/test";
import { launchWithExtension } from "./Harness.js";

const FIXTURE_ORIGIN = "http://localhost:8123";

/**
 * @description Reads the announcements fixture through the service worker
 * and returns the extracted text plus both pages.
 *
 * @param {Object} context - The persistent browser context.
 * @param {string} extensionId - The extension id.
 * @return {Promise<Object>} - The page, the popup, and the extracted text.
 */
async function readFixture(context, extensionId)
{
	const page = await context.newPage();
	await page.goto(`${FIXTURE_ORIGIN}/announcements.html`);
	const popup = await context.newPage();
	await popup.goto(`chrome-extension://${extensionId}/popup.html?isPopup=1`);
	await page.bringToFront();

	await popup.evaluate(() => chrome.runtime.sendMessage({ dest: "serviceWorker",
																																																									method: "playTab",
																																																									args: [] }));
	await page.waitForSelector("iframe[src^='chrome-extension://']", { state: "attached",
																																																																			timeout: 10000 });
	const texts = await popup.evaluate(async origin =>
	{
		const tabs = await chrome.tabs.query({ url: `${origin}/*` });

		return chrome.tabs.sendMessage(tabs[0].id, { dest: "contentScript",
																																															method: "getTexts",
																																															args: [0, true] });
	}, FIXTURE_ORIGIN);
	expect(Array.isArray(texts)).toBe(true);

	return { page,
										popup,
										text: texts.join("\n\n") };
}

test.describe("link and button announcements", () =>
{
	test("buttons are announced by default and text links read plainly", async() =>
	{
		const { context, extensionId } = await launchWithExtension();
		const { popup, text } = await readFixture(context, extensionId);

		expect(text).toContain("Submit answers, button");
		expect(text).toContain("Check work, button");
		expect(text).toContain("Review the course syllabus before you begin");
		expect(text).not.toContain("course syllabus, link");

		await popup.evaluate(() => chrome.runtime.sendMessage({ dest: "serviceWorker",
																																																										method: "stop",
																																																										args: [] }));
		await context.close();
	});

	test("with Announce links on, links are announced after their text", async() =>
	{
		const { context, extensionId, worker } = await launchWithExtension();
		await worker.evaluate(() => chrome.storage.local.set({ announceLinks: true }));
		const { text } = await readFixture(context, extensionId);

		expect(text).toContain("course syllabus, link");
		expect(text).toContain("Submit answers, button");
		await context.close();
	});

	test("icon-only controls read their accessible label, with the option off", async() =>
	{
		const { context, extensionId } = await launchWithExtension();
		const { text } = await readFixture(context, extensionId);

		expect(text).toContain("Flag question, button");
		expect(text).toContain("Open help, link");
		await context.close();
	});

	test("announcing never widens what is read, and the DOM is left as found", async() =>
	{
		const { context, extensionId } = await launchWithExtension();
		const probe = await context.newPage();
		await probe.goto(`${FIXTURE_ORIGIN}/announcements.html`);
		const before = await probe.evaluate(() => document.querySelectorAll("body *").length);
		await probe.close();

		const { page, text } = await readFixture(context, extensionId);
		expect(text).not.toContain("Dashboard");
		expect(text).not.toContain("Zoom in");

		const after = await page.evaluate(() => ({
			surrogates: document.querySelectorAll(".herald-role, .herald-alt, .herald-numbering").length,
			elements: document.querySelectorAll("body *").length - document.querySelectorAll("iframe[src^='chrome-extension://']").length
		}));
		expect(after.surrogates).toBe(0);
		expect(after.elements).toBe(before);
		await context.close();
	});
});
