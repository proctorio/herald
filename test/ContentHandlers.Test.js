/**
 * @description Tests for content-handlers.js: the per-site routing table consumed with
 * first-match-wins semantics, each handler's validate gate, and the frame
 * pickers for embedded document viewers. Handler indices below mirror the
 * table order in the source file.
 */
import { contentHandlers, pageHasQuizToolFrame } from "../src/js/content-handlers.js";
import { config } from "../src/js/defaults.js";

const UNSUPPORTED = 0;
const FILE = 1;
const GOOGLE_DOCS = 2;
const ONEDRIVE = 3;
const LUOA = 4;
const CANVAS = 5;
const DEFAULT = 6;

/**
 * @description Parses the JSON payload the handlers throw inside Error messages.
 *
 * @param {Error} err - The thrown or rejected error.
 * @return {Object} - The parsed payload.
 */
function errorInfo(err)
{
	return JSON.parse(err.message);
}

describe("routing matrix, first match wins in table order", () =>
{
	it.each([
		["https://chromewebstore.google.com/detail/x", "", UNSUPPORTED],
		["https://addons.mozilla.org/en-US/firefox/", "", UNSUPPORTED],
		["chrome://extensions/", "", UNSUPPORTED],
		["about:blank", "", UNSUPPORTED],
		["file:///C:/docs/paper.pdf", "", FILE],
		["https://docs.google.com/document/d/abc123/edit", "", GOOGLE_DOCS],
		["https://onedrive.live.com/edit.aspx?resid=1", "Report.docx - OneDrive", ONEDRIVE],
		["https://contoso.sharepoint.com/sites/x/doc.aspx", "", ONEDRIVE],
		["https://www.dropbox.com/s/abc/notes.docx?dl=0", "", ONEDRIVE],
		["https://luoa.instructure.com/courses/123", "", LUOA],
		["https://school.instructure.com/courses/1/quizzes/2/take", "", CANVAS],
		["https://school.instructure.com/courses/1/assignments/9", "", DEFAULT],
		["https://school.instructure.com/courses/1/quizzes/9", "", CANVAS],
		["https://school.test.instructure.com/quizzes", "", CANVAS],
		["https://school.instructure.com/assessments/abc", "", CANVAS],
		["https://example.com/article", "", DEFAULT],
		["https://docs.google.com/spreadsheets/d/x/edit", "", DEFAULT],
		["https://onedrive.live.com/edit.aspx?resid=1", "Slides.pptx - OneDrive", DEFAULT],
		["https://www.dropbox.com/s/abc/notes.pdf", "", DEFAULT],
		["https://luoa.instructure.com/about", "", DEFAULT],
		["https://school.instructure.com/calendar", "", DEFAULT],
		["https://instructure.com/courses/1", "", DEFAULT],
		["https://evil.example/school.instructure.com/quizzes/1", "", DEFAULT]
	])("routes %s (title %s) to handler %i", (url, title, expectedIndex) =>
	{
		expect(contentHandlers.findIndex(handler => handler.match(url, title))).toBe(expectedIndex);
	});

	it("orders handlers so a specific match shadows the catch-all", () =>
	{
		const url = "https://docs.google.com/document/d/abc/edit";
		const matching = contentHandlers
			.map((handler, index) => (handler.match(url, "") ? index : -1))
			.filter(index => index >= 0);
		expect(matching).toEqual([GOOGLE_DOCS, DEFAULT]);
	});

	it("supports RegExp entries in config.unsupportedSites", () =>
	{
		config.unsupportedSites.push(/^https:\/\/blocked\.example\//u);
		try
		{
			expect(contentHandlers.findIndex(handler => handler.match("https://blocked.example/page", ""))).toBe(UNSUPPORTED);
		}
		finally
		{
			config.unsupportedSites.pop();
		}
	});
});

describe("unsupported sites handler", () =>
{
	it("always rejects the page as unreadable", () =>
	{
		let thrown = null;
		try
		{
			contentHandlers[UNSUPPORTED].validate();
		}
		catch (err)
		{
			thrown = err;
		}
		expect(errorInfo(thrown)).toEqual({ code: "error_page_unreadable" });
	});
});

describe("file scheme handler", () =>
{
	it("validates when file scheme access is granted", async() =>
	{
		chrome.__config.fileSchemeAccess = true;
		await expect(contentHandlers[FILE].validate()).resolves.toBeUndefined();
	});

	it("throws error_file_access when file scheme access is off", async() =>
	{
		chrome.__config.fileSchemeAccess = false;
		const err = await contentHandlers[FILE].validate().catch(caught => caught);
		expect(errorInfo(err)).toEqual({ code: "error_file_access" });
	});
});

describe("google docs handler", () =>
{
	const handler = contentHandlers[GOOGLE_DOCS];

	beforeEach(() =>
	{
		// The alreadyAsked latch is state on the module singleton; clear it so
		// each test exercises the handler from a fresh install state.
		delete handler.alreadyAsked;
	});

	it("asks once for the docs origin permission with a reload flag", async() =>
	{
		chrome.__config.permissionsContains = false;
		const err = await handler.validate().catch(caught => caught);
		expect(errorInfo(err)).toEqual({
			code: "error_add_permissions",
			perms: { origins: ["https://docs.google.com/document/d/"] },
			reload: true
		});

		// Second validate hits the alreadyAsked latch and passes silently even
		// though the permission is still missing.
		expect(typeof handler.validate()).toBe("undefined");
	});

	it("passes when the permission is already granted", async() =>
	{
		chrome.__config.permissionsContains = true;
		await expect(handler.validate()).resolves.toBeUndefined();
	});
});

describe("onedrive document handler", () =>
{
	const handler = contentHandlers[ONEDRIVE];

	it("requires webNavigation plus the word editor origins", async() =>
	{
		chrome.__config.permissionsContains = false;
		const err = await handler.validate().catch(caught => caught);
		const info = errorInfo(err);
		expect(info.code).toBe("error_add_permissions");
		expect(info.perms).toEqual({
			permissions: ["webNavigation"],
			origins: [
				"https://word-edit.officeapps.live.com/",
				"https://usc-word-edit.officeapps.live.com/"
			]
		});
		expect("reload" in info).toBe(false);
	});

	it("passes when permissions are granted", async() =>
	{
		chrome.__config.permissionsContains = true;
		await expect(handler.validate()).resolves.toBeUndefined();
	});

	it("picks the word editor frame from the frame list", () =>
	{
		expect(handler.getFrameId([
			{ frameId: 0,
					url: "https://onedrive.live.com/edit.aspx" },
			{ frameId: 7,
					url: "https://usc-word-edit.officeapps.live.com/we/wordeditorframe.aspx" }
		])).toBe(7);
		expect(handler.getFrameId([
			{ frameId: 3,
					url: "https://word-edit.officeapps.live.com/we/frame.aspx" }
		])).toBe(3);
		expect(typeof handler.getFrameId([{ frameId: 0,
																																						url: "https://other.example/" }])).toBe("undefined");
	});

	it("injects the onedrive content script", () =>
	{
		expect(handler.extraScripts).toEqual(["js/content/onedrive-doc.js"]);
	});
});

describe("luoa.instructure.com handler", () =>
{
	const handler = contentHandlers[LUOA];

	it("requires webNavigation plus the s3 content origin", async() =>
	{
		chrome.__config.permissionsContains = false;
		const err = await handler.validate().catch(caught => caught);
		expect(errorInfo(err)).toEqual({
			code: "error_add_permissions",
			perms: {
				permissions: ["webNavigation"],
				origins: ["https://luoa-content.s3.amazonaws.com/"]
			}
		});
	});

	it("passes when permissions are granted", async() =>
	{
		chrome.__config.permissionsContains = true;
		await expect(handler.validate()).resolves.toBeUndefined();
	});

	it("picks the s3 lesson frame, skipping frames without a url", () =>
	{
		expect(handler.getFrameId([
			{ frameId: 0,
					url: "https://luoa.instructure.com/courses/1" },
			{ frameId: 4 },
			{ frameId: 5,
					url: "https://luoa-content.s3.amazonaws.com/lesson.html" }
		])).toBe(5);
		expect(typeof handler.getFrameId([{ frameId: 0,
																																						url: "https://luoa.instructure.com/courses/1" }])).toBe("undefined");
	});
});

describe("canvas lms handler", () =>
{
	const handler = contentHandlers[CANVAS];

	const TAB = { id: 1 };

	it("reads a classic quiz with no permission prompt: no tool frame, no extra permissions", async() =>
	{
		chrome.__config.executeScriptResult = [{ result: false }];
		chrome.__config.permissionsContains = false;
		await expect(handler.validate(TAB)).resolves.toBeUndefined();
		await expect(handler.needsFrames(TAB)).resolves.toBe(false);
	});

	it("requires webNavigation plus the instructure origins when a new quizzes tool frame is present", async() =>
	{
		chrome.__config.executeScriptResult = [{ result: true }];
		chrome.__config.permissionsContains = false;
		const err = await handler.validate(TAB).catch(caught => caught);
		expect(errorInfo(err)).toEqual({
			code: "error_add_permissions",
			perms: {
				permissions: ["webNavigation"],
				origins: ["https://*.instructure.com/"]
			}
		});
	});

	it("passes a tool frame page when permissions are granted", async() =>
	{
		chrome.__config.executeScriptResult = [{ result: true }];
		chrome.__config.permissionsContains = true;
		await expect(handler.validate(TAB)).resolves.toBeUndefined();
	});

	it("probes the tab's top frame only, with the self-contained page function", async() =>
	{
		chrome.__config.executeScriptResult = [{ result: false }];
		await handler.needsFrames(TAB);
		const request = chrome.__recorded.executeScript.at(-1);
		expect(request.target).toEqual({ tabId: 1 });
		expect(request.func).toBe(pageHasQuizToolFrame);
	});

	it("picks the new quizzes lti tool frame by its quiz-lti hostname", () =>
	{
		expect(handler.getFrameId([
			{ frameId: 0,
					url: "https://school.instructure.com/courses/1/assignments/2" },
			{ frameId: 3,
					url: "https://school.quiz-lti-iad-prod.instructure.com/participant-sessions/4/take" }
		])).toBe(3);
	});

	it("picks an instructure child frame on a different host than the top frame", () =>
	{
		expect(handler.getFrameId([
			{ frameId: 0,
					url: "https://school.instructure.com/courses/1/quizzes/2" },
			{ frameId: 9,
					url: "https://tool.instructure.com/lti/launch" }
		])).toBe(9);
	});

	it("skips same-host frames, foreign frames, and frames without a url", () =>
	{
		expect(typeof handler.getFrameId([
			{ frameId: 0,
					url: "https://school.instructure.com/courses/1/quizzes/2/take" },
			{ frameId: 4 },
			{ frameId: 5,
					url: "https://school.instructure.com/courses/1/quizzes/2/preview" },
			{ frameId: 6,
					url: "https://player.example/embed" },
			{ frameId: 7,
					url: "not a url" }
		])).toBe("undefined");
	});

	it("stays in the top frame for classic quizzes with no tool frame", () =>
	{
		expect(typeof handler.getFrameId([
			{ frameId: 0,
					url: "https://school.instructure.com/courses/1/quizzes/2/take" }
		])).toBe("undefined");
	});
});

describe("default handler", () =>
{
	it("matches anything and imposes no validation", () =>
	{
		const handler = contentHandlers[DEFAULT];
		expect(handler.match()).toBe(true);
		expect(handler.match("chrome-error://anything", "")).toBe(true);
		expect(typeof handler.validate).toBe("undefined");
	});
});

describe("pageHasQuizToolFrame (runs in the page)", () =>
{
	afterEach(() =>
	{
		document.body.replaceChildren();
	});

	it("is false on a classic quiz page, including foreign helper frames", () =>
	{
		document.body.innerHTML = "<fieldset><legend>Group of answer choices</legend></fieldset>" +
			"<iframe src='https://sso.canvaslms.com/post_message_forwarding'></iframe>" +
			"<iframe src='/courses/1/files/2/preview'></iframe>";
		expect(pageHasQuizToolFrame()).toBe(false);
	});

	it("is true for Canvas's LTI container, whatever its src", () =>
	{
		document.body.innerHTML = "<iframe id='tool_content' name='tool_content' src='/courses/1/external_tools/retrieve'></iframe>";
		expect(pageHasQuizToolFrame()).toBe(true);
	});

	it("is true for a quiz-lti frame on another host", () =>
	{
		document.body.innerHTML = "<iframe src='https://school.quiz-lti-iad-prod.instructure.com/participant-sessions/4/take'></iframe>";
		expect(pageHasQuizToolFrame()).toBe(true);
	});

	it("ignores unparseable srcs", () =>
	{
		document.body.innerHTML = "<iframe src='http://[bad'></iframe>";
		expect(pageHasQuizToolFrame()).toBe(false);
	});
});
