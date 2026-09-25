/**
 * Regression gate for the exam extraction blockers (findings F4 and F5 in
 * docs/herald/00-implementation-plan.md, milestone M5): radio answer labels
 * must be read with option numbering, image alt text must be spoken through
 * temporary surrogate spans, screen-reader-only choice legends must not leak
 * into the read text, and extraction must leave the page DOM untouched.
 * Jsdom has no layout, so the :visible and innerText semantics these fixes
 * depend on are pinned here in real Chromium, not in the unit suite.
 */
import { test, expect } from "@playwright/test";
import { launchWithExtension } from "./Harness.js";

const FIXTURE_ORIGIN = "http://localhost:8123";
const LEGEND_TEXT = "Group of answer choices";
const ALT_TEXT = "A bar chart showing plant growth doubling in week two";
const ANSWERS = [
	"The mitochondria supply most of the cell's usable energy",
	"The ribosomes assemble proteins from amino acid chains",
	"The nucleus stores and protects the genetic material",
	"The cell membrane regulates what enters and leaves the cell"
];

/**
 * @description Opens the quiz fixture and the popup page, brings the quiz tab
 * to the front, and starts reading it through the service worker, the same
 * message the toolbar popup sends.
 *
 * @param {Object} context - The persistent browser context.
 * @param {string} extensionId - The extension id.
 * @param {string} [fixture] - The fixture page to read.
 * @return {Promise<Object>} - The quiz page and the popup page.
 */
async function openAndPlayQuiz(context, extensionId, fixture = "quiz.html")
{
	const quiz = await context.newPage();
	await quiz.goto(`${FIXTURE_ORIGIN}/${fixture}`);

	const popup = await context.newPage();
	await popup.goto(`chrome-extension://${extensionId}/popup.html?isPopup=1`);
	await quiz.bringToFront();

	await popup.evaluate(() => chrome.runtime.sendMessage({ dest: "serviceWorker",
																																																									method: "playTab",
																																																									args: [] }));
	await quiz.waitForSelector("iframe[src^='chrome-extension://']", { state: "attached",
																																																																				timeout: 10000 });

	return { quiz,
										popup };
}

/**
 * @description Polls the playback state until it reaches PLAYING or reports a
 * playback error, then returns the final state info.
 *
 * @param {Object} popup - The popup page.
 * @param {number} attempt - The current polling attempt, starting at zero.
 * @return {Promise<Object>} - The playback state info.
 */
async function waitForPlayback(popup, attempt = 0)
{
	const info = await popup.evaluate(() => chrome.runtime.sendMessage({ dest: "serviceWorker",
																																																																						method: "getPlaybackState",
																																																																						args: [] }));
	if (info && (info.state === "PLAYING" || info.playbackError)) return info;
	if (attempt >= 30) return info;
	await popup.waitForTimeout(500);

	return waitForPlayback(popup, attempt + 1);
}

/**
 * @description Reads the extension's extracted view of the fixture text by
 * asking the injected content script for its text blocks.
 *
 * @param {Object} popup - The popup page.
 * @return {Promise<string>} - The extracted text blocks joined into one string.
 */
async function getExtractedText(popup)
{
	const texts = await popup.evaluate(async origin =>
	{
		const tabs = await chrome.tabs.query({ url: `${origin}/*` });

		return chrome.tabs.sendMessage(tabs[0].id, { dest: "contentScript",
																																															method: "getTexts",
																																															args: [0, true] });
	}, FIXTURE_ORIGIN);
	expect(Array.isArray(texts)).toBe(true);

	return texts.join("\n\n");
}

/**
 * @description Stops playback through the service worker.
 *
 * @param {Object} popup - The popup page.
 * @return {Promise<Object>} - The service worker response.
 */
function stopPlayback(popup)
{
	return popup.evaluate(() => chrome.runtime.sendMessage({ dest: "serviceWorker",
																																																										method: "stop",
																																																										args: [] }));
}

test.describe("quiz extraction", () =>
{
	test("answer choices, numbering, and alt text reach the read text; the sr-only legend does not", async() =>
	{
		const { context, extensionId } = await launchWithExtension();
		const { popup } = await openAndPlayQuiz(context, extensionId);

		const info = await waitForPlayback(popup);
		expect(info && info.playbackError).toBeFalsy();
		expect(info && info.state).toBe("PLAYING");

		const text = await getExtractedText(popup);
		for (const answer of ANSWERS)
		{
			expect(text).toContain(answer);
		}
		expect(text).toMatch(/1\.\s+The mitochondria/u);
		expect(text).toMatch(/2\.\s+The ribosomes/u);
		expect(text).toMatch(/3\.\s+The nucleus/u);
		expect(text).toMatch(/4\.\s+A bar chart/u);
		expect(text).toContain(ALT_TEXT);
		expect(text).not.toContain(LEGEND_TEXT);

		// The rest of the page still reads in document order around the choices.
		expect(text).toContain("Question one.");
		expect(text).toContain("Recorded plant growth by week");
		expect(text).toContain("This trailing paragraph closes the fixture.");

		await stopPlayback(popup);
		await context.close();
	});

	test("a canvas classic quiz reads every question with numbered choices, even after a long instructions paragraph", async() =>
	{
		// Live Canvas pass, 2026-09-25: the long instructions paragraph was the
		// outlier the article trim keys on, so every question after it was
		// cut; and prompts nested apart from their fieldsets meant the choices
		// never became text blocks at all. Question 2's prompt is deliberately
		// shorter than the article threshold.
		const { context, extensionId } = await launchWithExtension();
		const { popup } = await openAndPlayQuiz(context, extensionId, "canvas-classic-quiz.html");

		const info = await waitForPlayback(popup);
		expect(info && info.playbackError).toBeFalsy();

		const text = await getExtractedText(popup);
		expect(text).toContain("This is a proctored checkpoint.");
		expect(text).toContain("Which organelle produces most of a cell's ATP?");
		expect(text).toMatch(/1\.\s+Mitochondrion/u);
		expect(text).toMatch(/2\.\s+Golgi apparatus/u);
		expect(text).toMatch(/3\.\s+Lysosome/u);
		expect(text).toContain("2 + 2 =");
		expect(text).toMatch(/1\.\s+Four/u);
		expect(text).toContain("Glycolysis takes place in the cytoplasm.");
		expect(text).toMatch(/1\.\s+True/u);
		expect(text).toMatch(/2\.\s+False/u);
		expect(text).not.toContain(LEGEND_TEXT);

		// Document order: each prompt precedes its own choices.
		expect(text.indexOf("Which organelle")).toBeLessThan(text.indexOf("Mitochondrion"));
		expect(text.indexOf("Mitochondrion")).toBeLessThan(text.indexOf("2 + 2 ="));
		expect(text.indexOf("2 + 2 =")).toBeLessThan(text.indexOf("Four"));

		await stopPlayback(popup);
		await context.close();
	});

	test("extraction and stop leave the page DOM unchanged", async() =>
	{
		const { context, extensionId } = await launchWithExtension();
		const quizProbe = await context.newPage();
		await quizProbe.goto(`${FIXTURE_ORIGIN}/quiz.html`);
		const before = await quizProbe.evaluate(() => document.querySelectorAll("main *").length);
		await quizProbe.close();

		const { quiz, popup } = await openAndPlayQuiz(context, extensionId);
		await waitForPlayback(popup);
		await getExtractedText(popup);
		await stopPlayback(popup);
		await quiz.waitForTimeout(500);

		const after = await quiz.evaluate(() =>
			({
				elementCount: document.querySelectorAll("main *").length,
				surrogates: document.querySelectorAll(".herald-alt, .herald-numbering").length,
				markedElements: document.querySelectorAll("main [class*='herald']").length,
				legendText: document.querySelector("fieldset legend").textContent.trim(),
				radioCount: document.querySelectorAll("input[type='radio']").length,
				extensionFrames: document.querySelectorAll("iframe[src^='chrome-extension://']").length
			}));
		expect(after.elementCount).toBe(before);
		expect(after.surrogates).toBe(0);
		expect(after.markedElements).toBe(0);
		expect(after.legendText).toBe(LEGEND_TEXT);
		expect(after.radioCount).toBe(4);

		// user stop tears the player frame out: page-wide byte-identical DOM
		expect(after.extensionFrames).toBe(0);
		await context.close();
	});
});
