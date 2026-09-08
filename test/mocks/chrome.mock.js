/**
 * @description Hand-rolled chrome API fake matching the exact semantics the extension
 * uses: promise-returning MV3 calls, callback-style sendResponse messaging
 * with `return true` async handling, and storage.onChanged events. Kept
 * deliberately small and fully deterministic; extend per test need.
 */

/**
 * @description Creates a fresh chrome fake. Call once per test via resetChrome().
 *
 * @return {Object} - The chrome fake object.
 */
export function makeChrome()
{
	const storageData = {};
	const storageListeners = [];
	const storageAreaListeners = [];
	const messageListeners = [];
	let bootMessageListeners = null;
	const ttsState = { speaking: false,
																				utterances: [],
																				voices: [],
																				eventScript: null };
	const recorded = { executeScript: [],
																				contextMenus: [],
																				permissionRequests: [] };
	const config = {
		platformOs: "win",
		permissionsContains: true,
		fileSchemeAccess: false,
		detectLanguageResult: { isReliable: true,
																										languages: [{ language: "en",
																																								percentage: 100 }] },
		tabDetectLanguage: "en",
		frames: []
	};

	const chrome = {
		__config: config,
		__recorded: recorded,
		__tts: ttsState,

		/**
		 * @description Resets all fake state in place, preserving object identity so that
		 * modules holding a reference from import time stay wired.
		 */
		__reset()
		{
			for (const key of Object.keys(storageData)) delete storageData[key];
			storageListeners.length = 0;
			storageAreaListeners.length = 0;

			// Listeners registered at module import time (before the first reset)
			// are part of the unit under test and survive resets, the way a real
			// service worker's registrations would.
			if (bootMessageListeners === null) bootMessageListeners = [...messageListeners];
			messageListeners.length = 0;
			messageListeners.push(...bootMessageListeners);
			ttsState.speaking = false;
			ttsState.paused = false;
			ttsState.stopped = false;
			ttsState.utterances.length = 0;
			ttsState.voices.length = 0;
			ttsState.eventScript = null;
			for (const key of Object.keys(recorded)) recorded[key].length = 0;
			config.permissionsContains = true;
			config.fileSchemeAccess = false;
			config.detectLanguageResult = { isReliable: true,
																																			languages: [{ language: "en",
																																																	percentage: 100 }] };
			config.tabDetectLanguage = "en";
			config.frames = [];
			config.executeScriptResult = null;
			config.platformOs = "win";
			chrome.tabs.__tabs = [{ id: 1,
																											url: "https://example.com/",
																											active: true,
																											windowId: 1,
																											title: "Example" }];
		},
		__emitStorageChanged(changes)
		{
			for (const listener of storageListeners)
			{
				listener(changes, "local");
			}

			// StorageArea.onChanged listeners receive the changes only, per chrome.
			for (const listener of storageAreaListeners)
			{
				listener(changes);
			}
		},

		runtime: {
			id: "herald-test",

			/**
			 * @description Returns the extension manifest fixture.
			 *
			 * @return {Object} - A minimal manifest.
			 */
			getManifest()
			{
				return { version: "0.0.0",
													name: "Herald Test" };
			},

			/**
			 * @description Resolves an extension-relative URL.
			 *
			 * @param {string} path - The relative path.
			 * @return {string} - The absolute extension URL.
			 */
			getURL(path)
			{
				return "chrome-extension://herald-test/" + path;
			},

			/**
			 * @description Routes a message to registered onMessage listeners with chrome
			 * semantics: a listener returning true responds asynchronously via
			 * sendResponse.
			 *
			 * @param {Object} message - The message payload.
			 * @param {Function} [respond] - Optional callback form.
			 * @return {?Promise<*>} - The first listener response.
			 */
			sendMessage(message, respond)
			{
				const promise = dispatch(message, { id: "herald-test" });
				if (respond)
				{
					promise.then(result => respond(result)).catch(() => null);

					return null;
				}

				return promise;
			},

			onMessage: {
				/**
				 * @description Registers a message listener.
				 *
				 * @param {Function} fn - The listener.
				 */
				addListener(fn)
				{
					messageListeners.push(fn);
				},

				/**
				 * @description Removes a message listener.
				 *
				 * @param {Function} fn - The listener.
				 */
				removeListener(fn)
				{
					const i = messageListeners.indexOf(fn);
					if (i >= 0) messageListeners.splice(i, 1);
				}
			},

			onInstalled: makeEvent(),

			/**
			 * @description Reports the configured platform.
			 *
			 * @return {Promise<Object>} - The platform info.
			 */
			getPlatformInfo()
			{
				return Promise.resolve({ os: config.platformOs || "win" });
			},

			lastError: null
		},

		storage: {
			local: {
				/**
				 * @description Reads keys from the fake store.
				 *
				 * @param {(Array<string>|string|null)} keys - Keys to read.
				 * @param {Function} [callback] - Optional callback form.
				 * @return {Promise<object>|undefined} - The stored subset.
				 */
				get(keys, callback)
				{
					const names = (keys === null || typeof keys === "undefined") ? Object.keys(storageData) : Array.isArray(keys) ? keys : [keys];
					const result = {};
					for (const name of names)
					{
						if (name in storageData) result[name] = storageData[name];
					}
					if (callback)
					{
						callback(result);

						return null;
					}

					return Promise.resolve(result);
				},

				/**
				 * @description Writes items and emits onChanged.
				 *
				 * @param {Object} items - Key value pairs to store.
				 * @param {Function} [callback] - Optional callback form.
				 * @return {(Promise<void>|undefined)} - Resolves when stored.
				 */
				set(items, callback)
				{
					const changes = {};
					for (const key of Object.keys(items))
					{
						changes[key] = { oldValue: storageData[key],
																							newValue: items[key] };
						storageData[key] = items[key];
					}
					chrome.__emitStorageChanged(changes);
					if (callback)
					{
						callback();

						return null;
					}

					return Promise.resolve();
				},

				/**
				 * @description Removes keys and emits onChanged.
				 *
				 * @param {(Array<string>|string)} keys - Keys to remove.
				 * @param {Function} [callback] - Optional callback form.
				 * @return {(Promise<void>|undefined)} - Resolves when removed.
				 */
				remove(keys, callback)
				{
					const names = Array.isArray(keys) ? keys : [keys];
					const changes = {};
					for (const name of names)
					{
						if (name in storageData)
						{
							changes[name] = { oldValue: storageData[name],
																									newValue: null };
							delete storageData[name];
						}
					}
					chrome.__emitStorageChanged(changes);
					if (callback)
					{
						callback();

						return null;
					}

					return Promise.resolve();
				},
				onChanged: {
					/**
					 * @description Registers a StorageArea scoped change listener, which is the
					 * form defaults.js subscribes (brapi.storage.local.onChanged). These
					 * listeners are called with the changes argument only, per chrome.
					 *
					 * @param {Function} fn - The listener.
					 */
					addListener(fn)
					{
						storageAreaListeners.push(fn);
					},

					/**
					 * @description Removes a StorageArea scoped change listener.
					 *
					 * @param {Function} fn - The listener.
					 */
					removeListener(fn)
					{
						const index = storageAreaListeners.indexOf(fn);
						if (index >= 0) storageAreaListeners.splice(index, 1);
					}
				}
			},
			onChanged: {
				/**
				 * @description Registers a storage change listener.
				 *
				 * @param {Function} fn - The listener.
				 */
				addListener(fn)
				{
					storageListeners.push(fn);
				}
			}
		},

		tabs: {
			__tabs: [{ id: 1,
														url: "https://example.com/",
														active: true,
														windowId: 1,
														title: "Example" }],

			/**
			 * @description Queries the fake tab registry.
			 *
			 * @param {Object} filter - Query filter, active and currentWindow supported.
			 * @param {Function} [callback] - Optional callback form.
			 * @return {?Promise<Array<Object>>} - Matching tabs.
			 */
			query(filter, callback)
			{
				let tabs = chrome.tabs.__tabs;
				if (filter && typeof filter.active !== "undefined" && filter.active !== null) tabs = tabs.filter(t => t.active == filter.active);
				if (callback)
				{
					callback(tabs);

					return null;
				}

				return Promise.resolve(tabs);
			},

			/**
			 * @description Gets a tab by id.
			 *
			 * @param {number} id - The tab id.
			 * @param {Function} [callback] - Optional callback form.
			 * @return {?Promise<Object>} - The tab.
			 */
			get(id, callback)
			{
				const tab = chrome.tabs.__tabs.find(t => t.id == id);
				if (callback)
				{
					callback(tab);

					return null;
				}

				return Promise.resolve(tab);
			},

			/**
			 * @description Gets the tab marked current in __tabs, mirroring
			 * chrome.tabs.getCurrent returning the tab the caller runs in, or
			 * nothing outside a tab context.
			 *
			 * @param {Function} callback - The callback receiving the tab or nothing.
			 */
			getCurrent(callback)
			{
				callback(chrome.tabs.__tabs.find(t => t.current));
			},

			/**
			 * @description Detects the fake language of a tab.
			 *
			 * @param {number} [tabId] - The tab id, unused by the fake.
			 * @param {Function} [callback] - Optional callback form.
			 * @return {?Promise<string>} - The configured language.
			 */
			detectLanguage(tabId, callback)
			{
				if (typeof tabId == "function") callback = tabId;
				if (callback)
				{
					callback(config.tabDetectLanguage);

					return null;
				}

				return Promise.resolve(config.tabDetectLanguage);
			},

			onUpdated: makeEvent(),

			/**
			 * @description Sends a message routed through the shared listener registry.
			 *
			 * @param {number} tabId - The target tab id.
			 * @param {Object} message - The payload.
			 * @return {Promise<*>} - The listener response.
			 */
			sendMessage(tabId, message)
			{
				return dispatch(message, { tab: { id: tabId } });
			},

			create: makeRecorderAsync(recorded, "tabsCreate"),
			update: makeRecorderAsync(recorded, "tabsUpdate")
		},

		windows: {
			create: makeRecorderAsync(recorded, "windowsCreate"),
			update: makeRecorderAsync(recorded, "windowsUpdate")
		},

		i18n: {
			/**
			 * @description Returns the message key itself, which keeps assertions readable.
			 *
			 * @param {string} key - The message key.
			 * @return {string} - The key.
			 */
			getMessage(key)
			{
				return key;
			},

			/**
			 * @description Detects language per the configured result.
			 *
			 * @param {string} text - The text to detect, ignored.
			 * @param {Function} [callback] - Optional callback form.
			 * @return {Promise<Object>} - The configured detection result.
			 */
			detectLanguage(text, callback)
			{
				if (callback)
				{
					return callback(config.detectLanguageResult);
				}

				return Promise.resolve(config.detectLanguageResult);
			}
		},

		tts: {
			/**
			 * @description Speaks an utterance; events are driven by ttsState.eventScript
			 * or default to start then end on the next microtasks.
			 *
			 * @param {string} text - The utterance text.
			 * @param {Object} options - Chrome tts options incl. OnEvent.
			 */
			speak(text, options)
			{
				ttsState.speaking = true;
				ttsState.utterances.push({ text,
																															options });
				const script = ttsState.eventScript || [{ type: "start" }, { type: "end" }];
				for (const event of script)
				{
					queueMicrotask(() =>
					{
						if (options && options.onEvent) options.onEvent(event);
						if (event.type == "end" || event.type == "error" || event.type == "interrupted" || event.type == "cancelled") ttsState.speaking = false;
					});
				}
			},

			/**
			 * @description Returns the configured voice fixtures.
			 *
			 * @param {Function} [callback] - Optional callback form.
			 * @return {?Promise<Array<Object>>} - The voices.
			 */
			getVoices(callback)
			{
				if (callback)
				{
					callback(ttsState.voices);

					return null;
				}

				return Promise.resolve(ttsState.voices);
			},

			/**
			 * @description Reports speaking state.
			 *
			 * @param {Function} [callback] - Optional callback form.
			 * @return {(Promise<boolean>|undefined)} - Speaking flag.
			 */
			isSpeaking(callback)
			{
				if (callback)
				{
					callback(ttsState.speaking);

					return null;
				}

				return Promise.resolve(ttsState.speaking);
			},

			/**
			 * @description Stops speech.
			 */
			stop()
			{
				ttsState.speaking = false;
				ttsState.stopped = true;
			},

			/**
			 * @description Pauses speech.
			 */
			pause()
			{
				ttsState.paused = true;
			},

			/**
			 * @description Resumes speech.
			 */
			resume()
			{
				ttsState.paused = false;
			}
		},

		scripting: {
			/**
			 * @description Records the injection request and returns a scripted result.
			 *
			 * @param {Object} request - The executeScript request.
			 * @return {Promise<Array<Object>>} - Scripted results, default single true.
			 */
			executeScript(request)
			{
				recorded.executeScript.push(request);

				return Promise.resolve(config.executeScriptResult || [{ result: true }]);
			}
		},

		contextMenus: {
			/**
			 * @description Records menu creation.
			 *
			 * @param {Object} props - Menu properties.
			 * @param {Function} [callback] - Completion callback.
			 */
			create(props, callback)
			{
				recorded.contextMenus.push(props);
				if (callback) return callback();

				return null;
			},
			onClicked: makeEvent()
		},

		commands: {
			onCommand: makeEvent()
		},

		permissions: {
			/**
			 * @description Answers permission checks per configuration.
			 *
			 * @return {Promise<boolean>} - The configured answer.
			 */
			contains()
			{
				return Promise.resolve(config.permissionsContains);
			},

			/**
			 * @description Records permission requests and grants them.
			 *
			 * @param {Object} perms - The requested permissions.
			 * @return {Promise<boolean>} - Always true.
			 */
			request(perms)
			{
				recorded.permissionRequests.push(perms);

				return Promise.resolve(true);
			}
		},

		extension: {
			/**
			 * @description Answers file scheme access checks per configuration.
			 *
			 * @param {Function} callback - The callback receiving the answer.
			 */
			isAllowedFileSchemeAccess(callback)
			{
				return callback(config.fileSchemeAccess);
			}
		},

		webNavigation: {
			/**
			 * @description Returns the configured frame list.
			 *
			 * @param {Object} details - The request details.
			 * @param {Function} [callback] - Optional callback form.
			 * @return {?Promise<Array<Object>>} - The frames.
			 */
			getAllFrames(details, callback)
			{
				if (callback)
				{
					callback(config.frames);

					return null;
				}

				return Promise.resolve(config.frames);
			}
		}
	};

	/**
	 * @description Dispatches a message to listeners with chrome sendResponse semantics.
	 *
	 * @param {Object} message - The payload.
	 * @param {Object} sender - The sender descriptor.
	 * @return {Promise<*>} - The response.
	 */
	function dispatch(message, sender)
	{
		return new Promise((resolve, reject) =>
		{
			let async = false;
			for (const listener of messageListeners)
			{
				try
				{
					const returned = listener(message, sender, resolve);
					if (returned === true) async = true;
				}
				catch (err)
				{
					reject(err);

					return;
				}
			}
			if (!async) resolve();
		});
	}

	return chrome;
}

/**
 * @description Creates a minimal chrome event object recording listeners.
 *
 * @return {Object} - The event fake.
 */
function makeEvent()
{
	const listeners = [];

	return {
		listeners,

		/**
		 * @description Registers a listener.
		 *
		 * @param {Function} fn - The listener.
		 */
		addListener(fn)
		{
			listeners.push(fn);
		},

		/**
		 * @description Removes a listener.
		 *
		 * @param {Function} fn - The listener.
		 */
		removeListener(fn)
		{
			const index = listeners.indexOf(fn);
			if (index >= 0) listeners.splice(index, 1);
		},

		/**
		 * @description Fires the event to all listeners.
		 *
		 * @param {...*} args - Event arguments.
		 */
		emit(...args)
		{
			for (const fn of listeners) fn(...args);
		}
	};
}

/**
 * @description Creates an async recorder function storing calls under the given key.
 * Supports both promise form and chrome's optional trailing callback form,
 * responding with a fixed { id: 99 } object either way.
 *
 * @param {Object} recorded - The shared recording map.
 * @param {string} key - The map key.
 * @return {Function} - The recorder.
 */
function makeRecorderAsync(recorded, key)
{
	recorded[key] = [];

	return (...args) =>
	{
		const callback = (typeof args.at(-1) == "function") ? args.pop() : null;
		recorded[key].push(args);
		if (callback)
		{
			callback({ id: 99 });

			return null;
		}

		return Promise.resolve({ id: 99 });
	};
}
