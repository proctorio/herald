/**
 * @description Tests for defaults.js: the settings API over fake storage, the rxjs
 * settings observables, query string parsing, voice grouping and selection,
 * string escaping, the StateMachine, and the assorted promise helpers. All
 * chrome interaction goes through the fake stubbed in setup.
 */
import { vi } from "vitest";
import * as rxjs from "../src/js/vendor/rxjs.js";
import { FakeAudio } from "./mocks/speech_synthesis.mock.js";
import {
	assert,
	assertExamSafeTabAllowed,
	bgPageInvoke,
	config,
	createTab,
	createWindow,
	defaults,
	detectTabLanguage,
	domReady,
	effectiveShowHighlighting,
	escapeHtml,
	escapeXml,
	extraAction,
	findVoiceByLang,
	findVoiceByName,
	formatError,
	getActiveTab,
	getAllFrames,
	getBrowser,
	getCurrentTab,
	getFirstLanguage,
	getHotkeySettingsUrl,
	getQueryString,
	getSetting,
	getSettings,
	getSilenceTrack,
	getTab,
	getVoiceLanguages,
	groupVoicesByLang,
	immediate,
	isActivationKey,
	isChromeOSNative,
	isGoogleNative,
	isMacOSNative,
	isMobileOS,
	isOfflineVoice,
	languageTable,
	lazy,
	makeSilenceTrack,
	observeSetting,
	parseLang,
	parseQueryString,
	playbackAnnouncementKey,
	promiseTimeout,
	repeat,
	removeAllAttrs,
	setI18nText,
	setTabUrl,
	settingsChange$,
	setupDarkMode,
	StateMachine,
	truncateRepeatedChars,
	updateSetting,
	updateSettings,
	updateTab,
	updateWindow,
	wait,
	waitMillis,
	when,
	clearSettings
} from "../src/js/defaults.js";

/**
 * @description Waits one macrotask so promise chains behind the fake storage flush.
 *
 * @return {Promise<void>} - Resolves on the next macrotask.
 */
function nextTick()
{
	return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * @description Reports whether a promise has already settled, by racing it against a
 * fresh macrotask marker.
 *
 * @param {Promise<*>} promise - The promise to probe.
 * @return {Promise<boolean>} - True when the promise settled first.
 */
async function isSettled(promise)
{
	const marker = {};
	const winner = await Promise.race([promise, nextTick().then(() => marker)]);

	return winner !== marker;
}

afterEach(() =>
{
	vi.useRealTimers();
	vi.restoreAllMocks();
	document.body.classList.remove("dark-mode");
	document.body.innerHTML = "";
});

describe("settings API", () =>
{
	it("getSettings with no argument reads only the default setting names", async() =>
	{
		await updateSettings({ voiceName: "Alice",
																									unrelated: "x" });
		const settings = await getSettings();
		expect(settings.voiceName).toBe("Alice");
		expect("unrelated" in settings).toBe(false);
	});

	it("getSettings with explicit names reads those keys", async() =>
	{
		await updateSettings({ unrelated: "x" });
		const settings = await getSettings(["unrelated"]);
		expect(settings).toEqual({ unrelated: "x" });
	});

	it("updateSetting and getSetting round trip a single value", async() =>
	{
		await updateSetting("pitch", 1.5);
		expect(await getSetting("pitch")).toBe(1.5);
	});

	it("clearSettings with no argument removes only the default setting names", async() =>
	{
		await updateSettings({ rate: 2,
																									unrelated: "keep" });
		await clearSettings();
		expect(await getSetting("rate")).toBeUndefined();
		expect(await getSetting("unrelated")).toBe("keep");
	});

	it("clearSettings with explicit names removes those keys", async() =>
	{
		await updateSettings({ unrelated: "gone" });
		await clearSettings(["unrelated"]);
		expect(await getSetting("unrelated")).toBeUndefined();
	});

	it("exports the documented default speech parameters", () =>
	{
		expect(defaults).toMatchObject({ rate: 1,
																																			pitch: 1,
																																			volume: 1 });
	});
});

describe("settingsChange$ and observeSetting", () =>
{
	it("settingsChange$ emits the change set for every storage write", async() =>
	{
		const emitted = [];
		const sub = settingsChange$.subscribe(changes => emitted.push(changes));
		await updateSettings({ rate: 2 });
		sub.unsubscribe();
		expect(emitted).toHaveLength(1);
		expect(emitted[0].rate.newValue).toBe(2);
	});

	it("observeSetting emits the current value then subsequent new values", async() =>
	{
		await updateSetting("volume", 0.5);
		const values = [];
		const sub = observeSetting("volume").subscribe(value => values.push(value));
		await nextTick();
		await updateSetting("volume", 0.8);
		sub.unsubscribe();
		expect(values).toEqual([0.5, 0.8]);
	});

	it("observeSetting ignores changes to other settings", async() =>
	{
		await updateSetting("rate", 1);
		const values = [];
		const sub = observeSetting("rate").subscribe(value => values.push(value));
		await nextTick();
		await updateSetting("volume", 0.2);
		sub.unsubscribe();
		expect(values).toEqual([1]);
	});
});

describe("query strings", () =>
{
	it("parseQueryString decodes keys, values and plus signs", () =>
	{
		const query = parseQueryString("?greeting=hello+world&pct=100%25&empty");
		expect(query.greeting).toBe("hello world");
		expect(query.pct).toBe("100%");
		expect("empty" in query).toBe(true);
		expect(typeof query.empty).toBe("undefined");
	});

	it("parseQueryString rejects input without a leading question mark", () =>
	{
		expect(() => parseQueryString("a=1")).toThrow("Invalid argument");
	});

	it("getQueryString parses location.search and returns empty for none", () =>
	{
		history.pushState({}, "", "/?tabId=42");
		expect(getQueryString()).toEqual({ tabId: "42" });
		history.pushState({}, "", "/");
		expect(getQueryString()).toEqual({});
	});
});

describe("parseLang", () =>
{
	it("splits language and dialect, lowercasing and normalizing underscores", () =>
	{
		expect(parseLang("en-US")).toEqual({ lang: "en",
																																							rest: "us" });
		expect(parseLang("pt_BR")).toEqual({ lang: "pt",
																																							rest: "br" });
	});

	it("leaves the dialect unset when absent", () =>
	{
		const parsed = parseLang("fr");
		expect(parsed.lang).toBe("fr");
		expect(typeof parsed.rest).toBe("undefined");
	});
});

describe("voice helpers", () =>
{
	const usFemale = { voiceName: "US F",
																				lang: "en-US",
																				gender: "female" };
	const usMale = { voiceName: "US M",
																		lang: "en-US" };
	const plainEnglish = { voiceName: "EN",
																								lang: "en" };
	const british = { voiceName: "GB",
																			lang: "en-GB" };
	const anyLang = { voiceName: "ANY" };

	it("groupVoicesByLang groups by parsed language with yue and cmn aliased to zh", () =>
	{
		const cantonese = { voiceName: "Canto",
																						langs: ["yue-HK"] };
		const grouped = groupVoicesByLang([usFemale, cantonese, anyLang]);
		expect(grouped.en).toEqual([usFemale]);
		expect(grouped.zh).toEqual([cantonese]);
		expect(grouped["<any>"]).toEqual([anyLang]);
	});

	it("getVoiceLanguages returns langs, wraps lang, or nothing", () =>
	{
		expect(getVoiceLanguages({ langs: ["a", "b"] })).toEqual(["a", "b"]);
		expect(getVoiceLanguages({ lang: "en" })).toEqual(["en"]);
		expect(typeof getVoiceLanguages({})).toBe("undefined");
	});

	it("getFirstLanguage prefers the langs list over lang", () =>
	{
		expect(getFirstLanguage({ langs: ["de", "en"],
																												lang: "fr" })).toBe("de");
		expect(getFirstLanguage({ lang: "fr" })).toBe("fr");
	});

	it("voice predicates classify by remote flag and name prefixes", () =>
	{
		expect(isOfflineVoice({ remote: false })).toBe(true);
		expect(isOfflineVoice({ remote: true })).toBe(false);
		expect(isOfflineVoice({})).toBe(false);
		expect(isGoogleNative({ voiceName: "Google US English" })).toBe(true);
		expect(isGoogleNative({ voiceName: "NotGoogle US" })).toBe(false);
		expect(isChromeOSNative({ voiceName: "Chrome OS US English" })).toBe(true);
		expect(isChromeOSNative({ voiceName: "ChromeOS US" })).toBe(false);
		expect(isMacOSNative({ voiceName: "MacOS Alex" })).toBe(true);
		expect(isMacOSNative({ voiceName: "macOS Alex" })).toBe(false);
	});

	it("findVoiceByName matches exactly or returns null", () =>
	{
		expect(findVoiceByName([usFemale, usMale], "US M")).toBe(usMale);
		expect(findVoiceByName([usFemale], "nope")).toBeNull();
	});

	it("findVoiceByLang prefers a female exact dialect match", () =>
	{
		expect(findVoiceByLang([usMale, usFemale], "en-US")).toBe(usFemale);
	});

	it("findVoiceByLang falls back to any exact dialect match", () =>
	{
		expect(findVoiceByLang([british, usMale], "en-US")).toBe(usMale);
	});

	it("findVoiceByLang prefers a dialectless voice over a dialect mismatch", () =>
	{
		expect(findVoiceByLang([british, plainEnglish], "en-US")).toBe(plainEnglish);
	});

	it("findVoiceByLang falls back to en-US for an English dialect mismatch", () =>
	{
		expect(findVoiceByLang([british, usMale], "en-AU")).toBe(usMale);
	});

	it("findVoiceByLang prefers a language-agnostic voice over a dialect mismatch", () =>
	{
		expect(findVoiceByLang([british, anyLang], "de-DE")).toBe(anyLang);
	});

	it("findVoiceByLang uses the dialect mismatch as the last resort", () =>
	{
		expect(findVoiceByLang([british], "en-AU")).toBe(british);
	});

	it("findVoiceByLang returns nothing when no voice matches", () =>
	{
		expect(typeof findVoiceByLang([{ lang: "fr-FR" }], "de")).toBe("undefined");
	});
});

describe("tab helpers", () =>
{
	it("getActiveTab resolves the active tab", async() =>
	{
		chrome.tabs.__tabs.push({ id: 2,
																												active: false });
		const tab = await getActiveTab();
		expect(tab.id).toBe(1);
	});

	it("getTab resolves a tab by id", async() =>
	{
		chrome.tabs.__tabs.push({ id: 5,
																												url: "https://five.example/" });
		const tab = await getTab(5);
		expect(tab.url).toBe("https://five.example/");
	});

	it("getCurrentTab resolves the tab marked current", async() =>
	{
		chrome.tabs.__tabs.push({ id: 7,
																												current: true });
		const tab = await getCurrentTab();
		expect(tab.id).toBe(7);
	});

	it("getCurrentTab rejects when there is no current tab", async() =>
	{
		await expect(getCurrentTab()).rejects.toThrow("Could not get current tab");
	});

	it("setTabUrl asks the browser to navigate the tab", async() =>
	{
		await setTabUrl(3, "https://target.example/");
		expect(chrome.__recorded.tabsUpdate).toEqual([[3, { url: "https://target.example/" }]]);
	});

	it("updateTab resolves with the updated tab", async() =>
	{
		const tab = await updateTab(3, { muted: true });
		expect(tab.id).toBe(99);
		expect(chrome.__recorded.tabsUpdate).toEqual([[3, { muted: true }]]);
	});

	it("createTab without waitForLoad resolves as soon as the tab exists", async() =>
	{
		const tab = await createTab("https://new.example/");
		expect(tab.id).toBe(99);
		expect(chrome.__recorded.tabsCreate).toEqual([[{ url: "https://new.example/" }]]);
	});

	it("createTab with waitForLoad resolves only when that tab completes", async() =>
	{
		const pending = createTab("https://slow.example/", true);
		chrome.tabs.onUpdated.emit(98, { status: "complete" });
		expect(await isSettled(pending)).toBe(false);
		chrome.tabs.onUpdated.emit(99, { status: "loading" });
		expect(await isSettled(pending)).toBe(false);
		chrome.tabs.onUpdated.emit(99, { status: "complete" });
		const tab = await pending;
		expect(tab.id).toBe(99);
	});

	it("createWindow and updateWindow resolve with the window", async() =>
	{
		const created = await createWindow({ url: "player.html" });
		expect(created.id).toBe(99);
		const updated = await updateWindow(99, { focused: true });
		expect(updated.id).toBe(99);
		expect(chrome.__recorded.windowsCreate).toEqual([[{ url: "player.html" }]]);
		expect(chrome.__recorded.windowsUpdate).toEqual([[99, { focused: true }]]);
	});
});

describe("browser info helpers", () =>
{
	it("getBrowser identifies opera, firefox and defaults to chrome", () =>
	{
		const realNavigator = navigator;
		expect(getBrowser()).toBe("chrome");
		vi.stubGlobal("navigator", { userAgent: "Opera/9.80 (Windows NT)" });
		expect(getBrowser()).toBe("opera");
		vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Gecko/20100101 Firefox/128.0" });
		expect(getBrowser()).toBe("firefox");
		vi.stubGlobal("navigator", realNavigator);
	});

	it("getHotkeySettingsUrl maps the detected browser to its settings page", () =>
	{
		const realBrowserId = config.browserId;
		try
		{
			config.browserId = "chrome";
			expect(getHotkeySettingsUrl()).toBe("chrome://extensions/configureCommands");
			config.browserId = "opera";
			expect(getHotkeySettingsUrl()).toBe("opera://settings/configureCommands");
			config.browserId = "firefox";
			expect(getHotkeySettingsUrl()).toBe("chrome-extension://herald-test/shortcuts.html");
		}
		finally
		{
			config.browserId = realBrowserId;
		}
	});

	it("isMobileOS is false for a desktop user agent", () =>
	{
		expect(isMobileOS()).toBe(false);
	});
});

describe("formatError", () =>
{
	it("substitutes placeholders and renders markdown links as anchors", () =>
	{
		const message = formatError({ code: "Voice {voice} failed, see [docs](faq.html)",
																																voice: "Alice" });
		expect(message).toBe("Voice Alice failed, see <a href='#faq.html'>docs</a>");
	});
});

describe("escaping and truncation", () =>
{
	it("escapeHtml escapes every character in the entity map", () =>
	{
		expect(escapeHtml("<>&\"'/`=")).toBe("&lt;&gt;&amp;&quot;&#39;&#x2F;&#x60;&#x3D;");
	});

	it("escapeXml escapes the five xml special characters", () =>
	{
		expect(escapeXml("<tag attr=\"a\" other='b'>&</tag>")).toBe("&lt;tag attr=&quot;a&quot; other=&apos;b&apos;&gt;&amp;&lt;/tag&gt;");
	});

	it("truncateRepeatedChars caps runs of a repeated character at max", () =>
	{
		expect(truncateRepeatedChars("aaaaa", 3)).toBe("aaa");
		expect(truncateRepeatedChars("hellooooo world", 3)).toBe("hellooo world");
	});

	it("truncateRepeatedChars leaves digits and short runs alone", () =>
	{
		expect(truncateRepeatedChars("11111", 3)).toBe("11111");
		expect(truncateRepeatedChars("abc", 2)).toBe("abc");
	});
});

describe("StateMachine", () =>
{
	it("requires an IDLE state", () =>
	{
		expect(() => new StateMachine({ ACTIVE: {} })).toThrow("Missing IDLE state");
	});

	it("transitions via string shorthand and runs onTransitionIn", () =>
	{
		let entered = 0;
		const machine = new StateMachine({
			IDLE: { go: "ACTIVE" },
			ACTIVE: {
				onTransitionIn()
				{
					entered++;
				}
			}
		});
		expect(machine.getState()).toBe("IDLE");
		machine.trigger("go");
		expect(machine.getState()).toBe("ACTIVE");
		expect(entered).toBe(1);
	});

	it("passes trigger arguments to the handler and follows its return value", () =>
	{
		const seen = [];
		const machine = new StateMachine({
			IDLE: {
				input(first, second)
				{
					seen.push(first, second);

					return "DONE";
				}
			},
			DONE: {}
		});
		machine.trigger("input", 1, "x");
		expect(seen).toEqual([1, "x"]);
		expect(machine.getState()).toBe("DONE");
	});

	it("stays in the same state when the handler returns null", () =>
	{
		const machine = new StateMachine({
			IDLE: {
				noop()
				{
					return null;
				}
			}
		});
		machine.trigger("noop");
		expect(machine.getState()).toBe("IDLE");
	});

	it("throws for an event the current state does not handle", () =>
	{
		const machine = new StateMachine({ IDLE: {} });
		expect(() => machine.trigger("missing")).toThrow("No handler 'missing' in state IDLE");
	});

	it("throws for an unknown next-state name", () =>
	{
		const machine = new StateMachine({ IDLE: { go: "NOPE" } });
		expect(() => machine.trigger("go")).toThrow("Unknown next-state NOPE");
	});

	it("throws when a handler returns a truthy non-string", () =>
	{
		const machine = new StateMachine({
			IDLE: {
				go()
				{
					return 42;
				}
			}
		});
		expect(() => machine.trigger("go")).toThrow("Event handler must return next-state's name or null to stay in same state");
	});

	it("forbids triggering an event from inside a handler", () =>
	{
		let machine = null;
		machine = new StateMachine({
			IDLE: {
				go()
				{
					machine.trigger("go");

					return null;
				}
			}
		});
		expect(() => machine.trigger("go")).toThrow("Cannot trigger an event while inside an event handler");
	});
});

describe("promise helpers", () =>
{
	it("waitMillis resolves after the given time", async() =>
	{
		vi.useFakeTimers();
		const pending = waitMillis(500);
		await vi.advanceTimersByTimeAsync(499);
		expect(vi.getTimerCount()).toBe(1);
		await vi.advanceTimersByTimeAsync(1);
		expect(vi.getTimerCount()).toBe(0);
		await expect(pending).resolves.toBeUndefined();
	});

	it("wait resolves with the first observable value equal to the target", async() =>
	{
		await expect(wait(rxjs.of(1, 2, 3), 2)).resolves.toBe(2);
	});

	it("promiseTimeout passes through fulfillment and rejection before the deadline", async() =>
	{
		await expect(promiseTimeout(1000, "too slow", Promise.resolve("value"))).resolves.toBe("value");
		await expect(promiseTimeout(1000, "too slow", Promise.reject(new Error("boom")))).rejects.toThrow("boom");
	});

	it("promiseTimeout rejects with the message when the deadline passes", async() =>
	{
		vi.useFakeTimers();
		const pending = promiseTimeout(50, "too slow", new Promise(() => {}));
		const assertion = expect(pending).rejects.toThrow("too slow");
		vi.advanceTimersByTime(50);
		await assertion;
	});

	it("extraAction runs the side effect and passes the data through", async() =>
	{
		const seen = [];
		const tap = extraAction(data => seen.push(data));
		await expect(tap("payload")).resolves.toBe("payload");
		expect(seen).toEqual(["payload"]);
	});

	it("repeat requires an action", () =>
	{
		expect(() => repeat()).toThrow("Missing action");
		expect(() => repeat({})).toThrow("Missing action");
	});

	it("repeat stops when the until predicate is satisfied", async() =>
	{
		let count = 0;
		const result = await repeat({ action: () => ++count,
																																until: value => value >= 3 });
		expect(result).toBe(3);
	});

	it("repeat stops at max repetitions", async() =>
	{
		let count = 0;
		const result = await repeat({ action: () => ++count,
																																max: 2 });
		expect(result).toBe(2);
	});

	it("repeat waits delay between repetitions", async() =>
	{
		vi.useFakeTimers();
		let count = 0;
		const promise = repeat({ action: () => ++count,
																											delay: 100,
																											max: 3 });
		await vi.advanceTimersByTimeAsync(0);
		expect(count).toBe(1);
		await vi.advanceTimersByTimeAsync(200);
		await expect(promise).resolves.toBe(3);
		expect(count).toBe(3);
	});

	it("lazy evaluates once and caches, immediate evaluates now", () =>
	{
		let calls = 0;
		const getValue = lazy(() =>
		{
			calls++;

			return { token: 1 };
		});
		expect(getValue()).toBe(getValue());
		expect(calls).toBe(1);
		expect(immediate(() => 5)).toBe(5);
	});

	it("assert throws with the given or default message on falsy input", () =>
	{
		expect(() => assert(true, "nope")).not.toThrow();
		expect(() => assert(0, "custom")).toThrow("custom");
		expect(() => assert(false)).toThrow("Assertion failed");
	});

	it("when picks the first matching branch and evaluates lazily", () =>
	{
		expect(when(true, "yes").else("no")).toBe("yes");
		expect(when(false, "yes").else("no")).toBe("no");
		expect(when(false, "a").when(true, "b").else("c")).toBe("b");
		expect(when(true, "first").when(true, "second").else("third")).toBe("first");
		expect(when(() => true, () => "computed").else("x")).toBe("computed");
		expect(when(false, "a").else(() => "lazy")).toBe("lazy");
	});
});

describe("chrome wrappers", () =>
{
	it("getAllFrames resolves the frame list for the tab", async() =>
	{
		chrome.__config.frames = [{ frameId: 0,
																														url: "https://top.example/" }];
		await expect(getAllFrames(1)).resolves.toEqual([{ frameId: 0,
																																																				url: "https://top.example/" }]);
	});

	it("detectTabLanguage resolves the detected language", async() =>
	{
		chrome.__config.tabDetectLanguage = "fr";
		await expect(detectTabLanguage(1)).resolves.toBe("fr");
	});

	it("detectTabLanguage maps 'und' to no result", async() =>
	{
		chrome.__config.tabDetectLanguage = "und";
		expect(typeof await detectTabLanguage(1)).toBe("undefined");
	});

	it("detectTabLanguage swallows detection errors", async() =>
	{
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(chrome.tabs, "detectLanguage").mockImplementation(() =>
		{
			throw new Error("no tab");
		});
		expect(typeof await detectTabLanguage(1)).toBe("undefined");
	});

	it("bgPageInvoke resolves the service worker response and rejects errors", async() =>
	{
		chrome.runtime.onMessage.addListener((request, sender, sendResponse) =>
		{
			if (request.method === "good") sendResponse({ value: request.args[0] * 2 });
			else sendResponse({ error: { message: "nope" } });

			return true;
		});
		await expect(bgPageInvoke("good", [21])).resolves.toEqual({ value: 42 });
		await expect(bgPageInvoke("bad", [])).rejects.toEqual({ message: "nope" });
	});
});

describe("groupBy polyfill", () =>
{
	it("groups values into arrays by key", () =>
	{
		expect(["apple", "avocado", "banana"].groupBy(word => word[0])).toEqual({
			a: ["apple", "avocado"],
			b: ["banana"]
		});
	});

	it("skips items whose key selector returns null", () =>
	{
		expect(["skip", "keep"].groupBy(word => (word === "skip" ? null : "kept"))).toEqual({ kept: ["keep"] });
	});

	it("supports a custom value reducer and drops keys the reducer clears", () =>
	{
		expect([1, 2, 3].groupBy(() => "sum", (acc, value) => (acc || 0) + value)).toEqual({ sum: 6 });

		// The reducer clears the key by producing no value; Array.find supplies
		// that without an undefined literal.
		expect([1, 2].groupBy(() => "key", (acc, value) => [value].find(odd => odd % 2 === 1))).toEqual({});
	});
});

describe("dark mode", () =>
{
	it("applies the stored darkMode boolean once the DOM is ready", async() =>
	{
		await updateSetting("darkMode", true);
		const ready = setupDarkMode();
		document.dispatchEvent(new Event("DOMContentLoaded"));
		await ready;
		expect(document.body.classList.contains("dark-mode")).toBe(true);
	});

	it("removes the class when darkMode is stored false", async() =>
	{
		document.body.classList.add("dark-mode");
		await updateSetting("darkMode", false);
		const ready = setupDarkMode();
		document.dispatchEvent(new Event("DOMContentLoaded"));
		await ready;
		expect(document.body.classList.contains("dark-mode")).toBe(false);
	});

	it("leaves the class off when darkMode is unset and the OS is light", async() =>
	{
		const ready = setupDarkMode();
		document.dispatchEvent(new Event("DOMContentLoaded"));
		await ready;
		expect(document.body.classList.contains("dark-mode")).toBe(false);
	});
});

describe("DOM helpers with a minimal jQuery stand-in", () =>
{
	/**
	 * @description Minimal jQuery stand-in covering exactly the surface domReady and
	 * setI18nText use: ready callbacks, selector iteration, data, is, val, text.
	 *
	 * @param {(Function|string|Element)} arg - Ready callback, selector, or element.
	 * @return {?Object} - A tiny wrapper over the matched elements.
	 */
	function jqStub(arg)
	{
		if (typeof arg === "function")
		{
			arg();

			return null;
		}
		const elements = (typeof arg === "string") ? Array.from(document.querySelectorAll(arg)) : [arg];

		return {
			each(fn)
			{
				elements.forEach((el, index) => fn.call(el, index, el));

				return this;
			},
			data(key)
			{
				return elements[0].dataset[key];
			},
			is(selector)
			{
				return elements[0].matches(selector);
			},
			val(value)
			{
				elements[0].value = value;

				return this;
			},
			text(value)
			{
				elements[0].textContent = value;

				return this;
			},
			attr(name, value)
			{
				elements[0].setAttribute(name, value);

				return this;
			}
		};
	}

	beforeEach(() =>
	{
		vi.stubGlobal("$", jqStub);
	});

	afterEach(() =>
	{
		vi.stubGlobal("$", null);
	});

	it("domReady resolves via the ready callback", async() =>
	{
		await expect(domReady()).resolves.toBeUndefined();
	});

	it("setI18nText fills text of spans and value of inputs from i18n keys", () =>
	{
		document.body.innerHTML = "<span data-i18n=\"hello_key\"></span><input data-i18n=\"input_key\">";
		setI18nText();
		expect(document.querySelector("span").textContent).toBe("hello_key");
		expect(document.querySelector("input").value).toBe("input_key");
	});

	it("setI18nText sets aria-label on icon-only controls from data-i18n-label", () =>
	{
		document.body.innerHTML = "<button data-i18n-label=\"stop_key\">stop</button>";
		setI18nText();
		expect(document.querySelector("button").getAttribute("aria-label")).toBe("stop_key");
	});
});

describe("isActivationKey", () =>
{
	it("accepts Enter, Space, and the legacy Spacebar name", () =>
	{
		expect(isActivationKey("Enter")).toBe(true);
		expect(isActivationKey(" ")).toBe(true);
		expect(isActivationKey("Spacebar")).toBe(true);
	});

	it("rejects other keys", () =>
	{
		expect(isActivationKey("Escape")).toBe(false);
		expect(isActivationKey("a")).toBe(false);
		expect(isActivationKey("Tab")).toBe(false);
	});
});

describe("playbackAnnouncementKey", () =>
{
	it("maps each state transition to its status message key", () =>
	{
		expect(playbackAnnouncementKey("STOPPED", "LOADING")).toBe("popup_status_loading");
		expect(playbackAnnouncementKey("LOADING", "PLAYING")).toBe("popup_status_playing");
		expect(playbackAnnouncementKey("PLAYING", "PAUSED")).toBe("popup_status_paused");
		expect(playbackAnnouncementKey("PAUSED", "STOPPED")).toBe("popup_status_stopped");
	});

	it("stays silent on the first observed state", () =>
	{
		expect(playbackAnnouncementKey(null, "PLAYING")).toBeNull();
	});

	it("stays silent when the state has not changed between polls", () =>
	{
		expect(playbackAnnouncementKey("PLAYING", "PLAYING")).toBeNull();
	});

	it("stays silent for an unknown state", () =>
	{
		expect(playbackAnnouncementKey("PLAYING", "REWINDING")).toBeNull();
	});
});

describe("silence track", () =>
{
	it("getSilenceTrack lazily builds a single shared track", () =>
	{
		const track = getSilenceTrack();
		expect(getSilenceTrack()).toBe(track);
		expect(typeof track.start).toBe("function");
		expect(typeof track.stop).toBe("function");
	});

	it("makeSilenceTrack plays on start and pauses 15s after stop", () =>
	{
		const instances = [];

		/**
		 * @description Audio fake subclass recording constructed instances.
		 */
		class RecordingAudio extends FakeAudio
		{
			/**
			 * @description Creates and records the instance.
			 *
			 * @param {string} [src] - Optional source URL.
			 */
			constructor(src)
			{
				super(src);
				instances.push(this);
			}
		}
		vi.stubGlobal("Audio", RecordingAudio);
		vi.useFakeTimers();
		try
		{
			const track = makeSilenceTrack();
			const audio = instances[0];
			expect(audio.src).toBe("chrome-extension://herald-test/sound/silence.mp3");
			expect(audio.loop).toBe(true);

			track.start();
			expect(audio.paused).toBe(false);

			track.stop();
			expect(audio.paused).toBe(false);
			vi.advanceTimersByTime(15000);
			expect(audio.paused).toBe(true);

			track.start();
			expect(audio.played).toBe(2);
			track.stop();
			track.start();
			vi.advanceTimersByTime(20000);
			expect(audio.paused).toBe(false);
		}
		finally
		{
			vi.stubGlobal("Audio", FakeAudio);
		}
	});
});

describe("exam-safe mode", () =>
{
	it("defaults examSafeMode to false and includes it in the settings lists", async() =>
	{
		expect(defaults.examSafeMode).toBe(false);
		await updateSettings({ examSafeMode: true });
		expect((await getSettings()).examSafeMode).toBe(true);
		await clearSettings();
		expect(typeof await getSetting("examSafeMode")).toBe("undefined");
	});

	it("assertExamSafeTabAllowed allows any tab while the mode is off", async() =>
	{
		await expect(assertExamSafeTabAllowed({ id: 42 })).resolves.toBeUndefined();
	});

	it("assertExamSafeTabAllowed allows the active tab while the mode is on", async() =>
	{
		await updateSetting("examSafeMode", true);
		await expect(assertExamSafeTabAllowed({ id: 1 })).resolves.toBeUndefined();
	});

	it("assertExamSafeTabAllowed refuses a non-active tab while the mode is on", async() =>
	{
		await updateSetting("examSafeMode", true);
		chrome.tabs.__tabs.push({ id: 42,
																												url: "https://other.example/",
																												active: false });
		await expect(assertExamSafeTabAllowed({ id: 42 })).rejects.toThrow("error_exam_safe_tab");
	});

	it("assertExamSafeTabAllowed refuses when no tab or no active tab exists", async() =>
	{
		await updateSetting("examSafeMode", true);
		await expect(assertExamSafeTabAllowed(null)).rejects.toThrow("error_exam_safe_tab");
		chrome.tabs.__tabs.length = 0;
		await expect(assertExamSafeTabAllowed({ id: 1 })).rejects.toThrow("error_exam_safe_tab");
	});

	it("effectiveShowHighlighting collapses the window surface to the popup in exam-safe mode", () =>
	{
		expect(effectiveShowHighlighting(2, true)).toBe(1);
		expect(effectiveShowHighlighting("2", true)).toBe(1);
	});

	it("effectiveShowHighlighting passes other values through unchanged", () =>
	{
		expect(effectiveShowHighlighting(2, false)).toBe(2);
		expect(effectiveShowHighlighting(0, true)).toBe(0);
		expect(effectiveShowHighlighting(1, true)).toBe(1);
		expect(effectiveShowHighlighting(null, true)).toBe(defaults.showHighlighting);
	});
});

describe("language table and misc", () =>
{
	it("languageTable maps codes to display names", () =>
	{
		expect(languageTable.getNameFromCode("en-US")).toBe("English (United States)");
		expect(typeof languageTable.getNameFromCode("xx-XX")).toBe("undefined");
	});

	it("removeAllAttrs strips attributes, recursively when asked", () =>
	{
		document.body.innerHTML = "<div id=\"outer\" class=\"a\"><span id=\"inner\" title=\"t\"></span></div>";
		const outer = document.getElementById("outer");
		removeAllAttrs(outer);
		expect(outer.attributes).toHaveLength(0);
		expect(document.querySelector("span").attributes).toHaveLength(2);
		removeAllAttrs(outer, true);
		expect(document.querySelector("span").attributes).toHaveLength(0);
	});
});
