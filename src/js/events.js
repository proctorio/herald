import { brapi } from "./brapi.js";
import { detectTabLanguage, getActiveTab, getTab, getAllFrames, assertExamSafeTabAllowed } from "./defaults.js";
import { registerMessageListener } from "./messaging.js";
import { contentHandlers } from "./content-handlers.js";

brapi.runtime.onInstalled.addListener(function() 
{
	installContextMenus();
});

/**
 * IPC handlers
 */
var handlers = {
	playText: playText,
	playTab: playTab,
	reloadAndPlayTab: reloadAndPlayTab,
	stop: stopAndTeardown,
	pause: pause,
	resume: resume,
	getPlaybackState: getPlaybackState,
	forward: forward,
	rewind: rewind,
	seek: seek
};

registerMessageListener("serviceWorker", handlers);

/**
 * Installers
 */
function installContextMenus() 
{
	if (brapi.contextMenus)
		brapi.contextMenus.create(
			{
				id: "read-selection",
				title: brapi.i18n.getMessage("context_read_selection"),
				contexts: ["selection"]
			},
			function() 
			{
				if (brapi.runtime.lastError) console.error(brapi.runtime.lastError);
				else console.info("Installed context menus");
			}
		);
}

/**
 * Context menu handlers
 */
if (brapi.contextMenus)
	brapi.contextMenus.onClicked.addListener(function(info, tab)
	{
		if (info.menuItemId == "read-selection")
			readSelection(info, tab)
				.catch(handleHeadlessError);
	});

// Unifies the context-menu path with the popup path (finding F8): when the
// click came from the top frame of a scriptable tab, route through playTab,
// whose content script selection path reads only the selection with
// paragraph structure, MathML handling, and the declared page language
// preserved. Fall back to Chrome's flattened info.selectionText only when
// the content script cannot run there (chrome:// and similar), or when the
// selection lives in a subframe the top-frame content script cannot see.
async function readSelection(info, tab)
{
	const tabId = (tab && tab.id != -1) ? tab.id : null;
	if (tabId != null && isTopFrameClick(info))
	{
		try
		{
			// Selections in closed shadow roots or text controls are invisible
			// to the content script even in the top frame; playTab would then
			// read the whole page instead of the selection. Probe first and
			// fall back to the flattened selection text when invisible.
			if (await probeSelectionVisible(tabId))
			{
				await playTab(tabId);

				return;
			}
		}
		catch (err)
		{
			if (!isInjectionBlocked(err)) throw err;
		}
	}
	const lang = tabId != null ? await detectTabLanguage(tabId) : undefined;
	await playText(info.selectionText, {lang: lang});
}

// Reports whether the top frame's own selection is nonempty, which is the
// precondition for the content script selection path to read the right text.
async function probeSelectionVisible(tabId)
{
	const results = await brapi.scripting.executeScript({
		target: {tabId: tabId},
		func: function()
		{
			var selection = window.getSelection && window.getSelection();

			return Boolean(selection && selection.toString().trim());
		}
	});

	return Boolean(results && results[0] && results[0].result);
}

// The context menu reports the frame the click happened in; frameId 0 is
// the top frame. Selections in subframes are invisible to the top-frame
// content script, so only top-frame clicks route through playTab.
export function isTopFrameClick(info)
{
	return !info.frameId;
}

// Decides whether a playTab failure means the content script cannot run in
// that tab, in which case the context-menu read falls back to the flattened
// selection text: the unsupported-page and file-access validations, missing
// optional permissions (the headless context has no prompt UI), and the
// browser refusing script injection. Anything else is a real playback error
// and propagates.
export function isInjectionBlocked(err)
{
	if (!err || !err.message) return false;

	return (/error_page_unreadable|error_file_access|error_add_permissions|cannot access|cannot be scripted|missing host permission/i).test(err.message);
}

/**
 * Shortcut keys handlers
 */
if (brapi.commands)
	brapi.commands.onCommand.addListener(function(command) 
	{
		if (command == "play" || command == "pause") 
		{
			getPlaybackState()
				.then(function(stateInfo) 
				{
					switch (stateInfo.state) 
					{
						case "PLAYING": return command == "pause" ? pause() : stopAndTeardown();
						case "LOADING": return stopAndTeardown();
						case "PAUSED": return resume();
						case "STOPPED": return playTab();
					}
				})
				.catch(handleHeadlessError);
		}
		else if (command == "stop") 
		{
			stopAndTeardown()
				.catch(handleHeadlessError);
		}
		else if (command == "forward") 
		{
			forward()
				.catch(handleHeadlessError);
		}
		else if (command == "rewind") 
		{
			rewind()
				.catch(handleHeadlessError);
		}
	});

/**
 * METHODS
 */
var currentTask = {
	task: null,
	isActive() 
	{
		return this.task && this.task.isActive;
	},
	begin() 
	{
		if (this.task) this.task.cancel();
		
		return this.task = {
			isActive: true,
			cancel() 
			{
				this.isActive = false;
			},
			end() 
			{
				if (!this.isActive) throw new Error("Canceled");
				this.isActive = false;
			}
		};
	},
	cancel() 
	{
		if (this.task) 
		{
			this.task.cancel();
			this.task = null;
		}
	}
};

async function playText(text, opts) 
{
	const hasPlayer = await stop().then(res => res == true, err => false);
	if (!hasPlayer) await injectPlayer(await getActiveTab());
	await sendToPlayer({method: "playText",
																					args: [text, opts]});
}

async function playTab(tabId) 
{
	const tab = tabId ? await getTab(tabId) : await getActiveTab();
	if (!tab) throw new Error(JSON.stringify({code: "error_page_unreadable"}));

	// Exam-safe mode reads the active tab only (milestone M5).
	await assertExamSafeTabAllowed(tab);

	const task = currentTask.begin();
	try 
	{
		const handler = contentHandlers.find(h => h.match(tab.url || "", tab.title));
		if (handler.validate) await handler.validate(tab);
		if (handler.getSourceUri) 
		{
			await brapi.storage.local.set({"sourceUri": handler.getSourceUri(tab)});
		}
		else 
		{
			const frameId = handler.getFrameId && await getAllFrames(tab.id).then(frames => handler.getFrameId(frames));
			if (!await contentScriptAlreadyInjected(tab, frameId)) await injectContentScript(tab, frameId, handler.extraScripts);
			await brapi.storage.local.set({"sourceUri": "contentscript:" + tab.id});
		}
	}
	finally 
	{
		task.end();
	}

	const hasPlayer = await stop().then(res => res == true, err => false);
	if (!hasPlayer) await injectPlayer(tab);
	await sendToPlayer({method: "playTab"});
}

async function reloadAndPlayTab(tabId) 
{
	const tab = tabId ? await getTab(tabId) : await getActiveTab();

	const task = currentTask.begin();
	try 
	{
		const tabLoadComplete = new Promise(fulfill => 
		{
			function listener(changeTabId, changeInfo) 
			{
				if (changeTabId == tab.id && changeInfo.status == "complete") 
				{
					brapi.tabs.onUpdated.removeListener(listener);
					fulfill();
				}
			}
			brapi.tabs.onUpdated.addListener(listener);
		});
		await brapi.tabs.reload(tab.id);
		await tabLoadComplete;
	}
	finally 
	{
		task.end();
	}

	await playTab(tab.id);
}

function stop() 
{
	currentTask.cancel();
	
	return sendToPlayer({method: "stop"});
}

// User-initiated stop: also tears the embedded player frame out of the host
// page so a stopped read leaves the page DOM exactly as it was found. The
// plain stop() above stays frame-preserving because playTab uses it as the
// player liveness probe right before reusing or reinjecting the player.
async function stopAndTeardown()
{
	await stop();
	try
	{
		const {sourceUri} = await brapi.storage.local.get(["sourceUri"]);
		if (sourceUri && sourceUri.startsWith("contentscript:"))
		{
			const tabId = Number(sourceUri.slice(14));
			await brapi.scripting.executeScript({
				target: {tabId: tabId},
				func: function(prefix)
				{
					var frames = document.querySelectorAll("iframe[src^='" + prefix + "']");
					for (var i = 0; i < frames.length; i++) frames[i].remove();
				},
				args: [brapi.runtime.getURL("player.html")]
			});
		}
	}
	catch (err)
	{
		// the tab may be gone; a failed teardown must not fail the stop
		console.debug("player frame teardown skipped", err);
	}
}

function pause() 
{
	return sendToPlayer({method: "pause"});
}

function resume() 
{
	return sendToPlayer({method: "resume"});
}

async function getPlaybackState() 
{
	if (currentTask.isActive()) return {state: "LOADING"};
	try 
	{
		return await sendToPlayer({method: "getPlaybackState"}) || {state: "STOPPED"};
	}
	catch (err) 
	{
		return {state: "STOPPED"};
	}
}

function forward() 
{
	return sendToPlayer({method: "forward"});
}

function rewind() 
{
	return sendToPlayer({method: "rewind"});
}

function seek(n, offset)
{
	return sendToPlayer({method: "seek",
																						args: [n, offset]});
}

function handleHeadlessError(err) 
{
	console.error(err);

	// TODO: let user knows somehow
}

async function contentScriptAlreadyInjected(tab, frameId) 
{
	const items = await brapi.scripting.executeScript({
		target: {
			tabId: tab.id,
			frameIds: frameId ? [frameId] : undefined
		},
		func: function() 
		{
			return typeof brapi != "undefined";
		}
	});
	
	return items[0].result == true;
}

async function injectContentScript(tab, frameId, extraScripts) 
{
	await brapi.scripting.executeScript({
		target: {
			tabId: tab.id,
			frameIds: frameId ? [frameId] : undefined
		},
		files: [
			"js/content-entries/content-base.js"
		]
	});
	const files = extraScripts || await brapi.tabs.sendMessage(tab.id, {dest: "contentScript",
																																																																					method: "getRequireJs"});
	await brapi.scripting.executeScript({
		target: {
			tabId: tab.id,
			frameIds: frameId ? [frameId] : undefined
		},
		files: files
	});
	console.info("Content handler", files);
}

async function injectPlayer(tab) 
{
	if (!tab) throw new Error("No tab to host the player");
	if (tab.incognito) 
	{
		// https://developer.chrome.com/docs/extensions/mv3/manifest/incognito/
		throw new Error("Incognito tab");
	}
	const promise = new Promise(f => handlers.playerCheckIn = f);
	await brapi.scripting.executeScript({
		target: {tabId: tab.id},
		func: createPlayerFrame
	});
	await promise;
}

function createPlayerFrame() 
{
	const brapi = (typeof chrome != "undefined") ? chrome : (typeof browser != "undefined" ? browser : {});
	const frame = document.createElement("iframe");
	frame.src = brapi.runtime.getURL("player.html");
	frame.style.position = "absolute";
	frame.style.height = "0";
	frame.style.borderWidth = "0";
	frame.title = "Herald Player";
	frame.setAttribute("aria-hidden", "true");
	document.body.appendChild(frame);
}

async function sendToPlayer(message) 
{
	message.dest = "player";
	const result = await brapi.runtime.sendMessage(message);
	if (result && result.error) throw result.error;
	else return result;
}
