import { brapi } from "./brapi.js";
import { config, getSettings, getSilenceTrack, waitMillis } from "./defaults.js";
import { registerMessageListener } from "./messaging.js";

(function() 
{
	registerMessageListener("contentScript", {
		getRequireJs: getRequireJs,
		getDocumentInfo: getInfo,
		getCurrentIndex: getCurrentIndex,
		getTexts: getTexts
	});

	function getInfo() 
	{
		return {
			url: location.href,
			title: document.title,
			lang: getLang()
		};
	}

	function getLang() 
	{
		var lang = document.documentElement.lang || document.documentElement.getAttribute("xml:lang");
		if (lang) lang = lang.split(",", 1)[0].replaceAll("_", "-");
		
		return lang;
	}

	function getRequireJs() 
	{
		if (location.hostname == "docs.google.com") 
		{
			if ((/^\/presentation\/d\//).test(location.pathname)) return ["js/content/google-slides.js"];
			else if ((/\/document\/d\//).test(location.pathname)) return ["js/content/googleDocsUtil.js", "js/content/google-doc.js"];
			else if (document.querySelector(".drive-viewer-paginated-scrollable")) return ["js/content/google-drive-doc.js"];
			else return ["js/content/html-doc.js"];
		}
		else if (location.hostname == "drive.google.com") 
		{
			if (document.querySelector(".drive-viewer-paginated-scrollable")) return ["js/content/google-drive-doc.js"];
			else return ["js/content/google-drive-preview.js"];
		}
		else if (location.hostname == "onedrive.live.com" && document.querySelector(".OneUp-pdf--loaded")) return ["js/content/onedrive-doc.js"];
		else if (location.hostname.endsWith(".khanacademy.org")) return ["js/content/khan-academy.js"];
		else if (location.hostname == "acrobatiq.com" || location.hostname.endsWith(".acrobatiq.com")) return ["js/content/html-doc.js", "js/content/acrobatiq.js"];
		else if (location.hostname == "digital.wwnorton.com") return ["js/content/html-doc.js", "js/content/wwnorton.js"];
		else if (location.hostname == "plus.pearson.com") return ["js/content/html-doc.js", "js/content/pearson.js"];
		else if (location.hostname == "www.ixl.com") return ["js/content/ixl.js"];
		else if (location.hostname == "archiveofourown.org") return ["js/content/archiveofourown.js"];
		else if (location.hostname.endsWith(".instructure.com"))
		{
			if (hasQuizPath() || hasQuizMarkup()) return ["js/content/html-doc.js", "js/content/canvas-quiz.js"];
			else return ["js/content/html-doc.js"];
		}
		else return ["js/content/html-doc.js"];
	}

	function hasQuizPath()
	{
		return (/\/(quizzes|assessments)(\/|$)/).test(location.pathname);
	}

	function hasQuizMarkup()
	{
		return Boolean(document.querySelector("#questions, .question_holder, .display_question, .quiz_sortable"));
	}

	async function getCurrentIndex() 
	{
		if (await getSelectedText()) return -100;
		else return heraldDoc.getCurrentIndex();
	}

	async function getTexts(index, quietly) 
	{
		if (index < 0) 
		{
			if (index == -100) return (await getSelectedText()).split(paragraphSplitter);
			else return null;
		}
		else 
		{
			return Promise.resolve(heraldDoc.getTexts(index, quietly))
				.then(function(texts) 
				{
					if (texts && Array.isArray(texts)) 
					{
						if (!quietly) console.log(texts.join("\n\n"));
					}
					
					return texts;
				});
		}
	}

	function getSelectedText() 
	{
		if (heraldDoc.getSelectedText) return heraldDoc.getSelectedText();
		
		return window.getSelection().toString().trim();
	}

	getSettings()
		.then(settings => 
		{
			if (settings.fixBtSilenceGap)
				setInterval(updateSilenceTrack.bind(null, Math.random()), 5000);
		});

	async function updateSilenceTrack(providerId) 
	{
		if (!audioCanPlay()) return;
		const silenceTrack = getSilenceTrack();
		try 
		{
			const should = await sendToPlayer({method: "shouldPlaySilence",
																																						args: [providerId]});
			if (should) silenceTrack.start();
			else silenceTrack.stop();
		}
		catch (err) 
		{
			silenceTrack.stop();
		}
	}

	function audioCanPlay()
	{
		return navigator.userActivation && navigator.userActivation.hasBeenActive;
	}

	// F6 overlay auto-announce (milestone M5): in exam-safe mode, watch for
	// the proctoring intervention overlay and forward its text to the
	// player's announce channel. This is the one sanctioned exception to
	// never reading without an explicit user action. Detection ships
	// disabled: config.EXAM_OVERLAY_SELECTOR is empty until decision D15
	// supplies the overlay DOM contract; the examOverlaySelector storage
	// override exists so tests can exercise the channel until D15 lands.
	getSettings(["examSafeMode", "examOverlaySelector"])
		.then(settings =>
		{
			const selector = getExamOverlaySelector(settings);
			if (selector) watchExamOverlay(selector, announceToPlayer);
		});

	function announceToPlayer(text)
	{
		sendToPlayer({method: "announce",
																args: [text]})
			.catch(console.error);
	}

	async function sendToPlayer(message) 
	{
		message.dest = "player";
		const result = await brapi.runtime.sendMessage(message);
		if (result && result.error) throw result.error;
		else return result;
	}
})();

// helpers --------------------------

export var paragraphSplitter = /(?:\s*\r?\n\s*){2,}/;

export function getInnerText(elem)
{
	var text = elem.innerText;

	return text ? text.trim() : "";
}

// jQuery's :visible test, byte for byte (the element consumes layout
// boxes), shared by the site handlers so extraction decisions never drift
// from the upstream behavior built on it.
export function isElementVisible(elem)
{
	return Boolean(elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length);
}

export function isNotEmpty(text) 
{
	return text;
}

export function fixParagraphs(texts) 
{
	var out = [];
	var para = "";
	for (var i = 0; i < texts.length; i++) 
	{
		if (!texts[i]) 
		{
			if (para) 
			{
				out.push(para);
				para = "";
			}
			continue;
		}
		if (para) 
		{
			if ((/[\u2013\u2014-]$/).test(para)) para = para.slice(0, Math.max(0, para.length - 1));
			else para += " ";
		}
		para += texts[i].replaceAll(/[\u2013\u2014-]\r?\n/g, "");
		if (texts[i].match(/[!"').:?\u2019\u201D]$/)) 
		{
			out.push(para);
			para = "";
		}
	}
	if (para) out.push(para);
	
	return out;
}

export function tryGetTexts(getTexts, millis) 
{
	return waitMillis(500)
		.then(getTexts)
		.then(function(texts) 
		{
			if (texts && !texts.length && millis - 500 > 0) return tryGetTexts(getTexts, millis - 500);
			else return texts;
		});
}

export function simulateMouseEvent(element, eventName, coordX, coordY) 
{
	element.dispatchEvent(new MouseEvent(eventName, {
		view: window,
		bubbles: true,
		cancelable: true,
		clientX: coordX,
		clientY: coordY,
		button: 0
	}));
}

export function simulateClick(elementToClick) 
{
	var box = elementToClick.getBoundingClientRect(),
			coordX = box.left + (box.right - box.left) / 2,
			coordY = box.top + (box.bottom - box.top) / 2;
	simulateMouseEvent(elementToClick, "mousedown", coordX, coordY);
	simulateMouseEvent(elementToClick, "mouseup", coordX, coordY);
	simulateMouseEvent(elementToClick, "click", coordX, coordY);
}

export const getMath = (function()
{
	let promise = Promise.resolve(null);

	return () => promise = promise.then(math => math || makeMath());
})();

// exam overlay announcements (F6) --------------------------

// Debounce window for overlay mutation bursts, in milliseconds.
export const overlayDebounceMillis = 300;

// Resolves the overlay selector to watch: exam-safe mode must be on and a
// selector must be configured. The examOverlaySelector storage key wins
// over the config constant; it is a test seam that decision D15's selector
// contract will replace.
export function getExamOverlaySelector(settings)
{
	if (!settings || !settings.examSafeMode) return null;

	return settings.examOverlaySelector || config.EXAM_OVERLAY_SELECTOR || null;
}

// Watches the document for an element matching the overlay selector and
// calls notify with its text once per overlay element. Mutation bursts are
// debounced, and the observer disconnects on page hide. Returns the stop
// function for callers that need to tear down earlier.
export function watchExamOverlay(selector, notify)
{
	var timer;
	var lastAnnounced;
	const observer = new MutationObserver(function()
	{
		clearTimeout(timer);
		timer = setTimeout(checkOverlay, overlayDebounceMillis);
	});
	observer.observe(document.documentElement, {childList: true,
																																													subtree: true});
	window.addEventListener("pagehide", stopWatching);

	return stopWatching;

	function stopWatching()
	{
		clearTimeout(timer);
		observer.disconnect();
		window.removeEventListener("pagehide", stopWatching);
	}

	function checkOverlay()
	{
		const overlay = document.querySelector(selector);
		if (!overlay || overlay == lastAnnounced) return;
		const text = getOverlayText(overlay);
		if (!text) return;
		lastAnnounced = overlay;
		notify(text);
	}
}

// innerText of an unrendered element falls back to textContent in the
// browser; jsdom (the unit suite) implements no innerText at all, so the
// same fallback is spelled out here.
function getOverlayText(overlay)
{
	const text = overlay.innerText != null ? overlay.innerText : overlay.textContent;

	return text ? text.trim() : "";
}

export async function makeMath() 
{
	// no speech surrogates, math elements are read via their visible text
	return {
		show() {},
		hide() {}
	};
}
