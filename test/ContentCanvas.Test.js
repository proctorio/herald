// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://school.instructure.com/courses/1"}

/**
 * @description Tests for the Canvas branch of getRequireJs in content.js. On
 * instructure hostnames, quiz pages (by path or by quiz markup in the frame)
 * compose the generic extractor with the canvas-quiz handler; every other
 * Canvas page keeps the generic extractor alone.
 */
import "../src/js/content.js";

const GENERIC = ["js/content/html-doc.js"];
const CANVAS_QUIZ = ["js/content/html-doc.js", "js/content/canvas-quiz.js"];

/**
 * @description Asks the contentScript endpoint which handler scripts to inject.
 *
 * @return {Promise<Array<string>>} - The handler script paths.
 */
function getRequireJs()
{
	return chrome.runtime.sendMessage({ dest: "contentScript",
																																					method: "getRequireJs",
																																					args: [] });
}

describe("getRequireJs on instructure hostnames", () =>
{
	afterEach(() =>
	{
		document.body.innerHTML = "";
		window.history.pushState({}, "", "/courses/1");
	});

	it("serves the generic extractor for non-quiz canvas pages", async() =>
	{
		expect(await getRequireJs()).toEqual(GENERIC);
	});

	it("adds the canvas quiz handler on classic quiz paths", async() =>
	{
		window.history.pushState({}, "", "/courses/1/quizzes/2/take");
		expect(await getRequireJs()).toEqual(CANVAS_QUIZ);
	});

	it("adds the canvas quiz handler on assessment paths", async() =>
	{
		window.history.pushState({}, "", "/assessments/abc123");
		expect(await getRequireJs()).toEqual(CANVAS_QUIZ);
	});

	it("does not treat path segments containing quizzes as quiz paths", async() =>
	{
		window.history.pushState({}, "", "/courses/1/pages/all-about-quizzes-here");
		expect(await getRequireJs()).toEqual(GENERIC);
	});

	it("adds the canvas quiz handler when the frame carries quiz markup", async() =>
	{
		document.body.innerHTML = "<div id=\"questions\"><div class=\"question_holder\"></div></div>";
		expect(await getRequireJs()).toEqual(CANVAS_QUIZ);
	});

	it("recognizes new quizzes tool frames by their display markup", async() =>
	{
		document.body.innerHTML = "<div class=\"display_question\"></div>";
		expect(await getRequireJs()).toEqual(CANVAS_QUIZ);
	});

	it("adds the canvas quiz handler for New Quizzes taken in the page on an assignment url", async() =>
	{
		window.history.pushState({}, "", "/courses/1/assignments/2/taking/3/take");
		expect(await getRequireJs()).toEqual(GENERIC);
		document.body.innerHTML = "<div id=\"new-quizzes-root\"><div id=\"root\"></div></div>";
		expect(await getRequireJs()).toEqual(CANVAS_QUIZ);
	});
});
