import { brapi } from "./brapi.js";
import * as rxjs from "./vendor/rxjs.js";
import { config, defaults, getSettings, getSetting, wait, extraAction, truncateRepeatedChars, detectTextLanguage } from "./defaults.js";
import { getSpeechVoice } from "./tts-engines.js";
import { Speech } from "./speech.js";

export function SimpleSource(texts, opts) 
{
	opts = opts || {};
	this.ready = Promise.resolve({
		lang: opts.lang
	});
	this.isWaiting = function() 
	{
		return false;
	};
	this.getCurrentIndex = function() 
	{
		return Promise.resolve(0);
	};
	this.getTexts = function(index) 
	{
		return Promise.resolve(index == 0 ? texts : null);
	};
	this.close = function() 
	{
		return Promise.resolve();
	};
	this.getUri = function() 
	{
		var textLen = texts.reduce(function(sum, text) { return sum + text.length; }, 0);
		
		return "text-selection:(" + textLen + ")" + encodeURIComponent((texts[0] || "").slice(0, 100));
	};
}

export function TabSource() 
{
	var waiting = true;
	var sendToSource;

	this.ready = brapi.storage.local.get(["sourceUri"])
		.then(({sourceUri: uri}) => 
		{
			if (uri.startsWith("contentscript:")) 
			{
				const tabId = Number(uri.slice(14));
				sendToSource = sendToContentScript.bind(null, tabId);
				
				return sendToSource({method: "getDocumentInfo"});
			}
			else throw new Error("Invalid source");
		})
		.finally(function() 
		{
			waiting = false;
		});

	this.isWaiting = function() 
	{
		return waiting;
	};
	this.getCurrentIndex = function() 
	{
		waiting = true;
		
		return sendToSource({method: "getCurrentIndex"})
			.finally(function() { waiting = false; });
	};
	this.getTexts = function(index, quietly) 
	{
		waiting = true;
		
		return sendToSource({method: "getTexts",
																							args: [index, quietly]})
			.finally(function() { waiting = false; });
	};
	this.close = function() 
	{
		return Promise.resolve();
	};
	this.getUri = function() 
	{
		return this.ready
			.then(function(info) { return info.url; });
	};

	async function sendToContentScript(tabId, message) 
	{
		message.dest = "contentScript";
		const result = await brapi.tabs.sendMessage(tabId, message)
			.catch(err => 
			{
				brapi.storage.local.remove("contentScriptTabId");
				if ((/^(A listener indicated|Could not establish)/).test(err.message)) throw new Error(err.message + " " + message.method);
				throw err;
			});
		if (result && result.error) throw result.error;
		else return result;
	}

}

export function Doc(source, onEnd) 
{
	var info;
	var currentIndex;
	var activeSpeech;
	var ready = source.ready
		.then(function(result) { info = result; });
	var foundText;
	const playbackState = new rxjs.BehaviorSubject("resumed");

	this.close = close;
	this.play = play;
	this.stop = stop;
	this.pause = pause;
	this.getState = getState;
	this.getActiveSpeech = getActiveSpeech;
	this.forward = forward;
	this.rewind = rewind;
	this.seek = seek;

	// method close
	function close() 
	{
		playbackState.error({name: "CancellationException",
																							message: "Playback cancelled"});
		
		return ready
			.catch(function() {})
			.then(function() 
			{
				if (activeSpeech) 
				{
					activeSpeech.stop();
					activeSpeech = null;
				}
				source.close();
			});
	}

	// method play
	async function play() 
	{
		if (activeSpeech) return activeSpeech.play();
		await ready;
		await wait(playbackState, "resumed");
		currentIndex = await source.getCurrentIndex();
		await wait(playbackState, "resumed");
		
		return readCurrent();
	}

	async function readCurrent()
	{
		const texts = await source.getTexts(currentIndex).catch(err => null);
		await wait(playbackState, "resumed");
		if (texts)
		{
			if (texts.length)
			{
				foundText = true;

				return read(texts);
			}
			else 
			{
				currentIndex++;
				
				return readCurrent();
			}
		}
		else 
		{
			if (!foundText) throw new Error(JSON.stringify({code: "error_no_text"}));
			if (onEnd) onEnd();
		}
	}

	async function read(texts)
	{
		texts = texts.map(preprocess);
		if (info.detectedLang == null) 
		{
			const lang = await detectLanguage(texts);
			await wait(playbackState, "resumed");
			info.detectedLang = lang || "";
		}
		if (activeSpeech) return;
		activeSpeech = await getSpeech(texts);
		await wait(playbackState, "resumed");
		activeSpeech.onEnd = function(err) 
		{
			if (err) 
			{
				if (onEnd) onEnd(err);
			}
			else 
			{
				activeSpeech = null;
				currentIndex++;
				readCurrent()
					.catch(function(err) 
					{
						if (onEnd) onEnd(err);
					});
			}
		};
		
		return activeSpeech.play();
	}

	function preprocess(text) 
	{
		text = truncateRepeatedChars(text, 3);
		
		return text.replaceAll(/https?:\/\/\S+/g, "HTTP URL.");
	}

	function detectLanguage(texts) 
	{
		var minChars = 240;
		var maxPages = 10;
		var output = combineTexts("", texts);
		if (output.length < minChars) 
		{
			return accumulateMore(output, currentIndex + 1)
				.then(detectLanguageOf)
				.then(extraAction(function() 
				{
					// for sources that couldn't flip page silently, flip back to the current page
					return source.getTexts(currentIndex, true);
				}));
		}
		else 
		{
			return detectLanguageOf(output);
		}

		function combineTexts(output, texts) 
		{
			for (var i = 0; i < texts.length && output.length < minChars; i++) output += (texts[i] + " ");
			
			return output;
		}
		function accumulateMore(output, index) 
		{
			return source.getTexts(index, true)
				.then(function(texts) 
				{
					if (!texts) return output;
					output = combineTexts(output, texts);
					
					return output.length < minChars && index - currentIndex < maxPages ? accumulateMore(output, index + 1) : output;
				});
		}
	}

	// A detected language overrides the declared page language only when it
	// passes the confidence bar in detectTextLanguage (finding F8); anything
	// weaker returns null, which keeps the declared language when one is present.
	function detectLanguageOf(text)
	{
		return detectTextLanguage(text);
	}

	async function getSpeech(texts) 
	{
		const settings = await getSettings();
		settings.rate = await getSetting("rate" + (settings.voiceName || ""));
		var lang = (!info.detectedLang || info.lang && info.lang.startsWith(info.detectedLang)) ? info.lang : info.detectedLang;
		console.log("Declared", info.lang, "- Detected", info.detectedLang, "- Chosen", lang);
		var options = {
			rate: settings.rate || defaults.rate,
			pitch: settings.pitch || defaults.pitch,
			volume: settings.volume || defaults.volume,
			lang: config.langMap[lang] || lang || "en-US"
		};
		const voice = await getSpeechVoice(settings.voiceName, options.lang);
		if (!voice) throw new Error(JSON.stringify({code: "error_no_voice",
																																														lang: options.lang}));
		options.voice = voice;
		
		return new Speech(texts, options);
	}

	// method stop
	function stop() 
	{
		return ready
			.then(function() 
			{
				if (activeSpeech) 
				{
					activeSpeech.stop();
					activeSpeech = null;
				}
			});
	}

	// method pause
	function pause() 
	{
		return ready
			.then(function() 
			{
				if (activeSpeech) return activeSpeech.pause();
			});
	}

	// method getState
	function getState() 
	{
		if (activeSpeech) return activeSpeech.getState();
		else return "LOADING";
	}

	// method getActiveSpeech
	function getActiveSpeech() 
	{
		return Promise.resolve(activeSpeech);
	}

	// method forward. At the last chunk this is a no-op: the source is
	// single-page (html-doc getTexts returns null for any index but 0), so
	// the upstream page-advance this used to fall through to could only
	// stop playback and fire the end-of-document path, collapsing the
	// player. The popup disables the button at this bound; the keyboard
	// command lands here and must behave the same way.
	function forward()
	{
		if (activeSpeech)
		{
			if (activeSpeech.canForward()) activeSpeech.forward();
		}
		else return Promise.reject(new Error("Can't forward, not active"));
	}

	// method rewind. No-op at the first chunk, same reasoning as forward:
	// the upstream page-rewind read a page that does not exist and ended
	// playback.
	function rewind()
	{
		if (activeSpeech)
		{
			if (activeSpeech.canRewind()) activeSpeech.rewind();
		}
		else return Promise.reject(new Error("Can't rewind, not active"));
	}

	function seek(n, offset)
	{
		if (activeSpeech) return activeSpeech.seek(n, offset);
		else return Promise.reject(new Error("Can't seek, not active"));
	}
}
