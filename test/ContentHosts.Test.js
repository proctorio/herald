// @vitest-environment jsdom
/* global jsdom */

/**
 * @description Tests for the hostname routing of getRequireJs in content.js:
 * a site handler is served on the site's own domain and its subdomains, never
 * on a lookalike domain that merely ends with the same letters.
 */
import "../src/js/content.js";

const GENERIC = ["js/content/html-doc.js"];
const ACROBATIQ = ["js/content/html-doc.js", "js/content/acrobatiq.js"];

/**
 * @description Moves the page to a url, then asks the contentScript endpoint
 * which handler scripts to inject.
 *
 * @param {string} url - The page url.
 * @return {Promise<Array<string>>} - The handler script paths.
 */
function getRequireJsAt(url)
{
	jsdom.reconfigure({ url });

	return chrome.runtime.sendMessage({
		dest: "contentScript",
		method: "getRequireJs",
		args: []
	});
}

describe("getRequireJs hostname matching", () =>
{
	it("serves the acrobatiq handler on acrobatiq.com and its subdomains", async() =>
	{
		expect(await getRequireJsAt("https://acrobatiq.com/")).toEqual(ACROBATIQ);
		expect(await getRequireJsAt("https://oli.acrobatiq.com/course")).toEqual(ACROBATIQ);
	});

	it("serves the generic extractor on a lookalike domain", async() =>
	{
		expect(await getRequireJsAt("https://evilacrobatiq.com/")).toEqual(GENERIC);
	});
});
