import { brapi } from "./brapi.js";
import * as rxjs from "./vendor/rxjs.js";
import { defaults, getQueryString, getSettings, updateSettings, getCurrentTab, getActiveTab, updateTab, updateWindow, createWindow, domReady, formatError, isMobileOS, bgPageInvoke, effectiveShowHighlighting, setI18nText, playbackAnnouncementKey, isActivationKey } from "./defaults.js";
import { splitChunkIntoParagraphs } from "./paragraphs.js";
import { registerMessageListener } from "./messaging.js";

var queryString = getQueryString();
const playerCheckIn$ = new rxjs.Subject();

registerMessageListener("popup", {
	playerCheckIn()
	{
		playerCheckIn$.next();
	}
});

domReady().then(function()
{
	if (queryString.isPopup) document.body.classList.add("is-popup");
	else getCurrentTab().then(function(currentTab) { return updateSettings({sourceTabId: currentTab.id}); });
});

getSettings(["showHighlighting", "sourceTabId", "examSafeMode"]).then(async settings =>
{
	// Exam-safe mode never opens windows, so the popout path is skipped and
	// highlighting stays in the popup (milestone M5).
	if (effectiveShowHighlighting(settings.showHighlighting, settings.examSafeMode) == 2 && queryString.isPopup)
	{
		await popout(settings.sourceTabId);
	}
	else
	{
		await init();
	}
}).catch(handleError);

async function popout(tabId)
{
	const activeTab = await getActiveTab();
	const url = brapi.runtime.getURL("popup.html?tab=" + activeTab.id);
	try
	{
		if (!tabId) throw "Create";
		const tab = await updateTab(tabId, {url,
																																						active: true});
		await updateWindow(tab.windowId, {focused: true}).catch(console.error);
		window.close();
	}
	catch (err)
	{
		await createWindow({
			url,
			focused: true,
			type: "popup",
			width: 500,
			height: 600
		});
		window.close();
	}
}

function byId(id)
{
	return document.getElementById(id);
}

// Shows or hides an element the way the display toggle always worked here:
// clearing the inline display restores whatever the stylesheet says.
function setShown(elem, shown)
{
	elem.style.display = shown ? "" : "none";
}

async function init()
{
	await domReady();

	setI18nText();
	byId("btnPlay").addEventListener("click", onPlay);
	byId("btnPause").addEventListener("click", onPause);
	byId("btnStop").addEventListener("click", onStop);
	byId("btnSettings").addEventListener("click", onSettings);
	byId("btnForward").addEventListener("click", onForward);
	byId("btnRewind").addEventListener("click", onRewind);
	byId("decrease-font-size").addEventListener("click", changeFontSize.bind(null, -1));
	byId("increase-font-size").addEventListener("click", changeFontSize.bind(null, +1));
	byId("decrease-window-size").addEventListener("click", changeWindowSize.bind(null, -1));
	byId("increase-window-size").addEventListener("click", changeWindowSize.bind(null, +1));
	byId("toggle-dark-mode").addEventListener("click", toggleDarkMode);

	refreshSize();

	// Clicking the toolbar icon IS the user's explicit read action (and the
	// only thing that grants page access, via activeTab), so reading starts
	// at once, as upstream always did. Decision D7 removed this; testers
	// took the idle popup and the empty popout window for a broken
	// extension, so D7 is reversed (2026-09-24). popup.html loaded any
	// other way, for example as a plain tab, stays idle.
	if (isToolbarLaunch())
	{
		const {state} = await bgPageInvoke("getPlaybackState");
		if (state == "PAUSED" || state == "STOPPED") onPlay();
	}
}

// The real toolbar popup, or the popout window, which only that popup ever
// opens (with the source tab in ?tab=) when the transcript shows in a
// window.
function isToolbarLaunch()
{
	return queryString.tab != null || brapi.extension.getViews({type: "popup"}).includes(window);
}

function handleError(err)
{
	if (!err) return;
	if (err.name == "CancellationException") return;

	const status = byId("status");
	if ((/^{/).test(err.message))
	{
		var errInfo = JSON.parse(err.message);

		// formatError produces trusted extension-authored markup (i18n
		// strings with action links), never page content.
		status.innerHTML = formatError(errInfo);
		setShown(status, true);
		for (const link of status.querySelectorAll("a"))
		{
			link.addEventListener("click", function()
			{
				switch (this.getAttribute("href"))
				{
					case "#open-extension-settings":
						brapi.tabs.create({url: "chrome://extensions/?id=" + brapi.runtime.id});
						break;
					case "#request-permissions":
						brapi.permissions.request(errInfo.perms)
							.then(function(granted)
							{
								if (granted)
								{
									if (errInfo.reload) return reloadAndPlay();
									else byId("btnPlay").click();
								}
							});
						break;
				}
			});
		}
	}
	else
	{
		status.textContent = err.message;
		setShown(status, true);
	}
}

rxjs.concat(domReady(), rxjs.interval(500)).subscribe(updateButtons);

// The last playback state the poll observed, so the live region announces
// transitions only, never every poll tick.
var lastPlaybackState = null;

// The transcript state the highlight rendering last saw; jQuery's element
// data store used to carry these.
var highlightTexts = null;
var highlightPosition = null;

async function updateButtons()
{
	const [settings, stateInfo] = await Promise.all([
		getSettings(),
		bgPageInvoke("getPlaybackState")
	]);
	const showHighlighting = effectiveShowHighlighting(settings.showHighlighting, settings.examSafeMode);
	var state = stateInfo.state;
	const speech = stateInfo.speechInfo;
	var playbackErr = stateInfo.playbackError;

	if (playbackErr) handleError(playbackErr);

	const announcementKey = playbackAnnouncementKey(lastPlaybackState, state);
	lastPlaybackState = state;
	if (announcementKey) byId("playback-status").textContent = brapi.i18n.getMessage(announcementKey);

	setShown(byId("btnSettings"), state == "STOPPED");
	const btnPlay = byId("btnPlay");
	setShown(btnPlay, state == "PAUSED" || state == "STOPPED");

	// The play button resumes while paused, so its accessible name must
	// track that behavior change (accessibility spec: do not label a button
	// "play" and change its behavior to pause/resume without changing the
	// accessible name). Only write the attribute when it actually changes.
	const playLabel = brapi.i18n.getMessage(state == "PAUSED" ? "popup_resume_label" : "popup_play_label");
	if (btnPlay.getAttribute("aria-label") != playLabel) btnPlay.setAttribute("aria-label", playLabel);

	// The full transport appears as one stable row the moment loading
	// starts (no layout jump when the voice comes up); the pause button
	// doubles as the loading indicator via a spinner ring, and pressing it
	// while loading pauses the pending playback.
	const btnPause = byId("btnPause");
	setShown(btnPause, state == "PLAYING" || state == "LOADING");
	btnPause.classList.toggle("loading", state == "LOADING");
	setShown(byId("btnStop"), state == "PAUSED" || state == "PLAYING" || state == "LOADING");
	setShown(byId("btnForward"), state == "PLAYING" || state == "PAUSED" || state == "LOADING");
	setShown(byId("btnRewind"), state == "PLAYING" || state == "PAUSED" || state == "LOADING");

	// Transport bounds mirror document.js: rewind and forward are no-ops at
	// the first and last chunk, so the buttons disable there. On a short
	// page both can disable at once, hence the stop-button focus fallback.
	const atFirstChunk = !speech || speech.position.index <= 0;
	const atLastChunk = !speech || speech.position.index >= speech.texts.length - 1;
	setStepButtonDisabled("btnRewind", atFirstChunk, ["btnForward", "btnStop"]);
	setStepButtonDisabled("btnForward", atLastChunk, ["btnRewind", "btnStop"]);

	const showSurfaces = Boolean(showHighlighting && (state == "LOADING" || state == "PAUSED" || state == "PLAYING") && speech);
	setShown(byId("highlight"), showSurfaces);
	setShown(byId("toolbar"), showSurfaces);
	if (showSurfaces) updateHighlighting(speech);
	applyPopupWidth(settings);
}

function updateHighlighting(speech)
{
	const elem = byId("highlight");
	if (!highlightTexts ||
    highlightTexts.length != speech.texts.length ||
    highlightTexts.some((text, i) => text != speech.texts[i])
	)
	{
		elem.style.direction = speech.isRTL ? "rtl" : "";
		highlightTexts = speech.texts;
		highlightPosition = null;
		elem.replaceChildren();

		// One clickable span per PARAGRAPH, not per TTS chunk: chunks may
		// merge several short paragraphs, and clicking the second paragraph
		// of a merged chunk must not seek to the chunk start. Each span maps
		// to its chunk index plus the paragraph's character offset within
		// that chunk, and the seek path slices playback at the nearest
		// sentence boundary at or before that offset. The spans are keyboard
		// actionable (role=button, tabindex, Enter and Space reusing the
		// click path) per the accessibility spec's keyboard-only requirement.
		let paragraphNumber = 0;
		for (const entry of mapParagraphs(speech.texts))
		{
			paragraphNumber++;
			const seek = onSeek.bind(null, entry.chunkIndex, entry.offset);
			const span = makeSpan(entry.text);
			span.style.cursor = "pointer";
			span.dataset.chunkIndex = String(entry.chunkIndex);
			span.setAttribute("role", "button");
			span.setAttribute("tabindex", "0");
			span.setAttribute("title", brapi.i18n.getMessage("popup_read_paragraph_label", [String(paragraphNumber)]));
			span.addEventListener("click", seek);
			span.addEventListener("keydown", function(event)
			{
				if (isActivationKey(event.key))
				{
					event.preventDefault();
					seek();
				}
			});
			elem.appendChild(span);
		}
	}

	const pos = speech.position;
	if (!highlightPosition || positionDiffers(highlightPosition, pos))
	{
		highlightPosition = pos;
		for (const active of elem.querySelectorAll(".active"))
		{
			active.classList.remove("active");
			active.removeAttribute("aria-current");
		}

		// Playback position is chunk-granular (the whole chunk is one
		// utterance), so every paragraph span of the active chunk highlights,
		// which matches the old one-span-per-chunk visual exactly. The
		// active group also carries aria-current plus a border in CSS, so
		// the playing position is never conveyed by color alone.
		const group = Array.from(elem.children).filter(child => Number(child.dataset.chunkIndex) == pos.index);
		for (const child of group)
		{
			child.classList.add("active");
			child.setAttribute("aria-current", "true");
		}
		if (group.length) scrollIntoView(group[0], elem);
	}
}

function mapParagraphs(texts)
{
	const entries = [];
	for (let i = 0; i < texts.length; i++)
	{
		for (const paragraph of splitChunkIntoParagraphs(texts[i]))
		{
			entries.push({text: paragraph.text,
																	chunkIndex: i,
																	offset: paragraph.offset});
		}
	}

	return entries;
}

function makeSpan(text)
{
	// Text nodes plus <br> elements: no markup interpretation of page text.
	const span = document.createElement("span");
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++)
	{
		if (i > 0) span.appendChild(document.createElement("br"));
		span.appendChild(document.createTextNode(lines[i]));
	}

	return span;
}

function positionDiffers(left, right)
{
	function rangeDiffers(a, b)
	{
		if (a == null && b == null) return false;
		if (a != null && b != null) return a.startIndex != b.startIndex || a.endIndex != b.endIndex;

		return true;
	}

	return left.index != right.index ||
    rangeDiffers(left.paragraph, right.paragraph) ||
    rangeDiffers(left.sentence, right.sentence) ||
    rangeDiffers(left.word, right.word);
}

function scrollIntoView(child, scrollParent)
{
	const childTop = child.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top;
	const childBottom = childTop + child.offsetHeight;
	if (childTop < 0 || childBottom >= scrollParent.clientHeight)
	{
		const target = scrollParent.scrollTop + childTop - 10;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) scrollParent.scrollTop = target;
		else scrollParent.scrollTo({top: target,
																														behavior: "smooth"});
	}
}

var currentPlayRequestId;

function onPlay()
{
	setShown(byId("status"), false);
	const requestId = currentPlayRequestId = Math.random();
	bgPageInvoke("getPlaybackState")
		.then(function(stateInfo)
		{
			if (stateInfo.state == "PAUSED") return bgPageInvoke("resume");
			else return playTargetTabId().then(tabId => bgPageInvoke("playTab", tabId ? [tabId] : []));
		})
		.then(updateButtons)
		.catch(err =>
		{
			if (requestId == currentPlayRequestId) handleError(err);
			else console.debug("Ignoring error from an earlier request", err);
		});
}

// The tab to read. The popout window carries it in ?tab=. The toolbar popup
// reads the active tab of the window it is attached to, resolved here: the
// service worker's fallback ("active tab of the last focused window") can
// still name another window at the instant the popup opens, which made the
// read-on-click start fail as an unreadable page.
async function playTargetTabId()
{
	if (queryString.tab) return Number(queryString.tab);
	if (!queryString.isPopup) return null;
	const [tab] = await brapi.tabs.query({active: true,
																																							currentWindow: true});

	return tab ? tab.id : null;
}

function reloadAndPlay()
{
	setShown(byId("status"), false);
	bgPageInvoke("reloadAndPlayTab", queryString.tab ? [Number(queryString.tab)] : [])
		.then(updateButtons)
		.catch(handleError);
}

function onPause()
{
	bgPageInvoke("pause")
		.then(updateButtons)
		.catch(handleError);
}

function onStop()
{
	bgPageInvoke("stop")
		.then(updateButtons)
		.catch(handleError);
}

function onSettings()
{
	location.href = "options.html?referer=popup.html";
}

function onForward()
{
	bgPageInvoke("forward")
		.then(updateButtons)
		.catch(handleError);
}

function onRewind()
{
	bgPageInvoke("rewind")
		.then(updateButtons)
		.catch(handleError);
}

function onSeek(n, offset)
{
	bgPageInvoke("seek", [n, offset])
		.then(updateButtons)
		.catch(handleError);
}

// Step bounds shared by the click guards and the disabled states: the font
// steps map to getFontSize's cases, the window steps to getWindowSize's.
var FONT_SIZE_RANGE = [1, 8];
var WINDOW_SIZE_RANGE = [1, 3];

function changeFontSize(delta)
{
	getSettings(["highlightFontSize"])
		.then(function(settings)
		{
			var newSize = (settings.highlightFontSize || defaults.highlightFontSize) + delta;
			if (newSize >= FONT_SIZE_RANGE[0] && newSize <= FONT_SIZE_RANGE[1]) return updateSettings({highlightFontSize: newSize}).then(refreshSize);
		})
		.catch(handleError);
}

function changeWindowSize(delta)
{
	getSettings(["highlightWindowSize"])
		.then(function(settings)
		{
			var newSize = (settings.highlightWindowSize || defaults.highlightWindowSize) + delta;
			if (newSize >= WINDOW_SIZE_RANGE[0] && newSize <= WINDOW_SIZE_RANGE[1]) return updateSettings({highlightWindowSize: newSize}).then(refreshSize);
		})
		.catch(handleError);
}

function refreshSize()
{
	return getSettings(["highlightFontSize", "highlightWindowSize"])
		.then(function(settings)
		{
			const highlight = byId("highlight");
			highlight.style.fontSize = getFontSize(settings);
			updateSizeButtons(settings);
			if (queryString.isPopup)
			{
				highlight.style.height = getWindowSize(settings)[1] + "px";
				applyPopupWidth(settings);
			}
		});
}

// Disables a step button at its bound. When the button being disabled holds
// keyboard focus, focus moves to the first visible enabled counterpart so
// the focus position is never silently dropped to the page (disabled
// buttons leave the tab order).
function setStepButtonDisabled(id, disabled, counterpartIds)
{
	const button = byId(id);
	if (disabled && document.activeElement == button)
	{
		for (const counterpartId of counterpartIds)
		{
			const counterpart = byId(counterpartId);
			if (counterpart.checkVisibility() && !counterpart.disabled)
			{
				counterpart.focus();
				break;
			}
		}
	}
	button.disabled = disabled;
}

function updateSizeButtons(settings)
{
	var fontSize = settings.highlightFontSize || defaults.highlightFontSize;
	var windowSize = settings.highlightWindowSize || defaults.highlightWindowSize;
	setStepButtonDisabled("decrease-font-size", fontSize <= FONT_SIZE_RANGE[0], ["increase-font-size"]);
	setStepButtonDisabled("increase-font-size", fontSize >= FONT_SIZE_RANGE[1], ["decrease-font-size"]);
	setStepButtonDisabled("decrease-window-size", windowSize <= WINDOW_SIZE_RANGE[0], ["increase-window-size"]);
	setStepButtonDisabled("increase-window-size", windowSize >= WINDOW_SIZE_RANGE[1], ["decrease-window-size"]);
}

// The toolbar popup window follows an explicit width set on BOTH html and
// body: Chrome's popup auto-resize only ever grows intrinsic widths (height
// shrinks fine, width ratchets; verified against a real popup via
// chrome.action.openPopup), and a definite width on the html element is
// what releases the ratchet so the window also shrinks. The body is
// border-box (popup.css), so the window width equals the value set here:
// the configured window size while the transcript shows, a compact
// constant when idle.
var IDLE_POPUP_WIDTH = 250;

function applyPopupWidth(settings)
{
	if (!queryString.isPopup || isMobileOS()) return;
	const width = byId("highlight").checkVisibility() ? getWindowSize(settings)[0] : IDLE_POPUP_WIDTH;
	document.documentElement.style.width = width + "px";
	document.body.style.width = width + "px";
}

function getFontSize(settings)
{
	switch (settings.highlightFontSize || defaults.highlightFontSize)
	{
		case 1: return ".9em";
		case 2: return "1em";
		case 3: return "1.1em";
		case 4: return "1.2em";
		case 5: return "1.3em";
		case 6: return "1.4em";
		case 7: return "1.5em";
		default: return "1.6em";
	}
}

function getWindowSize(settings)
{
	switch (settings.highlightWindowSize || defaults.highlightWindowSize)
	{
		case 1: return [430, 330];
		case 2: return [550, 420];
		default: return [750, 450];
	}
}

function toggleDarkMode()
{
	const darkMode = document.body.classList.toggle("dark-mode");
	updateSettings({darkMode});
}
