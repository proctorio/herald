import * as rxjs from "./vendor/rxjs.js";
import { isGoogleNative, isChromeOSNative } from "./defaults.js";
import { browserTtsEngine, TimeoutTtsEngine } from "./tts-engines.js";
import { applyPronunciations } from "./pronunciation.js";

export function Speech(texts, options) 
{
	options.rate = (options.rate || 1) * (isGoogleNative(options.voice) ? 0.9 : 1);

	const isEastAsian = (/^(zh|ko|ja)\b/).test(options.lang);
	const punctuator = isEastAsian ? new EastAsianPunctuator() : new LatinPunctuator();

	for (var i = 0; i < texts.length; i++) if ((/[\w)]$/).test(texts[i])) texts[i] += ".";
	if (texts.length) texts = getChunks(texts.join("\n\n"));

	const engine = pickEngine();
	let enginePlaybackState;

	this.options = options;
	this.play = () => playbackState$.next("resumed");
	this.pause = () => playbackState$.next("paused");
	this.stop = () => cmd$.error({name: "CancellationException",
																															message: "Playback cancelled"});
	this.getState = getState;
	this.getInfo = getInfo;
	this.canForward = () => engine.forward != null || playlist.canForward();
	this.canRewind = () => engine.rewind != null || playlist.canRewind();
	this.forward = () => cmd$.next({name: "forward",
																																	delay: 750});
	this.rewind = () => cmd$.next({name: "rewind",
																																delay: 750});
	this.seek = (index, offset) =>
	{
		cmd$.next({name: "seek",
													index,
													offset});
		playbackState$.next("resumed");
	};
	this.gotoEnd = () => cmd$.next({name: "gotoEnd"});

	function pickEngine() 
	{
		if (isGoogleNative(options.voice)) return new TimeoutTtsEngine(browserTtsEngine, 3 * 1000, 16 * 1000);
		
		return browserTtsEngine;
	}

	function getChunks(text)
	{
		if (isGoogleNative(options.voice))
		{
			var wordLimit = ((/^(de|ru|es|pt|id)/).test(options.lang) ? 32 : 36) * (isEastAsian ? 2 : 1) * options.rate;

			return new WordBreaker(wordLimit, punctuator).breakText(text);
		}
		else
		{
			return new CharBreaker(750, punctuator, 200).breakText(text);
		}
	}

	// Returns the chunk text to play for a seek: the whole chunk when no
	// offset is given, otherwise the chunk sliced at the nearest sentence
	// boundary at or before the offset.
	function getSeekText(text, offset)
	{
		if (!offset) return text;
		const start = getSentenceStart(text, offset);

		return start > 0 ? text.slice(start) : text;
	}

	// Finds the start offset of the sentence containing the given character
	// offset, walking the same paragraph and sentence boundaries the chunker
	// uses so every boundary maps to a real playback position.
	function getSentenceStart(text, offset)
	{
		var start = 0;
		var pos = 0;
		const paragraphs = punctuator.getParagraphs(text);
		for (var p = 0; p < paragraphs.length; p++)
		{
			const sentences = punctuator.getSentences(paragraphs[p]);
			for (var s = 0; s < sentences.length; s++)
			{
				if (pos > offset) return start;
				start = pos;
				pos += sentences[s].length;
			}
		}

		return start;
	}

	async function getState() 
	{
		if (playbackState$.value == "resumed") 
		{
			return await rxjs.firstValueFrom(isLoading$) ? "LOADING" : "PLAYING";
		}
		else 
		{
			return "PAUSED";
		}
	}

	function getInfo() 
	{
		return {
			texts: enginePlaybackState ? enginePlaybackState.texts : texts,
			position: {
				index: enginePlaybackState ? enginePlaybackState.index : playlist.getIndex()
			},
			isRTL: (/^(ar|az|dv|he|iw|ku|fa|ur)\b/).test(options.lang)
		};
	}

	const playbackState$ = new rxjs.BehaviorSubject("paused");
	const playlist = makePlaylist();
	const cmd$ = new rxjs.Subject();
	const isLoadingSubject = new rxjs.BehaviorSubject(false);
	const isLoading$ = isLoadingSubject.pipe(
		rxjs.distinctUntilChanged(),
		rxjs.scan(
			(previous$, isLoading) =>
				rxjs.iif(() => previous$ && isLoading, rxjs.timer(2000), rxjs.of(0)).pipe(rxjs.map(() => isLoading)),
			null
		),
		rxjs.switchAll(),
		rxjs.shareReplay({bufferSize: 1,
																				refCount: false})
	);

	cmd$.pipe(
		rxjs.startWith({name: "first"}),
		rxjs.scan((current, cmd) => 
		{
			switch (cmd.name) 
			{
				case "first": {
					const playback$ = playlist.first();
					
					return playback$ ? {playback$,
																									ts: Date.now()} : null;
				}
				case "forward": {
					if (engine.forward != null) 
					{
						engine.forward();
						
						return current;
					}
					else 
					{
						const playback$ = playlist.forward();
						
						return playback$ ? {playback$,
																										ts: Date.now(),
																										delay: cmd.delay} : null;
					}
				}
				case "rewind": {
					if (engine.rewind != null) 
					{
						engine.rewind();
						
						return current;
					}
					else if (Date.now() - current.ts > 3000) 
					{
						const playback$ = playlist.seek(playlist.getIndex());
						
						return playback$ ? {playback$,
																										ts: Date.now()} : current;
					}
					else 
					{
						const playback$ = playlist.rewind();
						
						return playback$ ? {playback$,
																										ts: Date.now(),
																										delay: cmd.delay} : current;
					}
				}
				case "seek": {
					if (engine.seek != null) 
					{
						engine.seek(cmd.index);
						
						return current;
					}
					else
					{
						const playback$ = playlist.seek(cmd.index, cmd.offset);

						return playback$ ? {playback$,
																										ts: Date.now()} : current;
					}
				}
				case "gotoEnd": {
					const playback$ = playlist.gotoEnd();
					
					return playback$ ? {playback$,
																									ts: Date.now()} : current;
				}
			}
		}, null),
		rxjs.takeWhile(x => x),
		rxjs.distinctUntilChanged(),
		rxjs.debounce(x => (x.delay ? rxjs.timer(x.delay) : rxjs.of(0))),
		rxjs.switchMap(x =>
			rxjs.concat(
				rxjs.of({type: "load"}),
				x.playback$
			))
	)
		.subscribe({
			next(event) 
			{
				isLoadingSubject.next(event.type == "load");
				switch (event.type) 
				{
					case "start":
						if (event.sentenceStartIndicies) 
						{
							enginePlaybackState = {
								texts: event.sentenceStartIndicies.map((startIndex, i, arr) => texts[0].slice(startIndex, arr[i + 1])),
								sentenceStartIndicies: event.sentenceStartIndicies,
								index: 0
							};
						}
						else 
						{
							const nextText = texts[playlist.getIndex() + 1];
							if (nextText && engine.prefetch != null) engine.prefetch(nextText, options);
						}
						break;
					case "sentence":
						if (enginePlaybackState) 
						{
							enginePlaybackState.index = enginePlaybackState.sentenceStartIndicies.indexOf(event.startIndex);
						}
						break;
					case "end":
						if (enginePlaybackState) 
						{
							cmd$.complete();
						}
						else 
						{
							cmd$.next({name: "forward"});
						}
						break;
				}
			},
			complete: () => 
			{
				if (this.onEnd) this.onEnd();
			},
			error: err => 
			{
				if (err.name != "CancellationException") 
				{
					if (this.onEnd) this.onEnd(err);
				}
			}
		});

	function makePlaylist() 
	{
		let index;
		
		return {
			getIndex() 
			{
				return index;
			},
			first() 
			{
				if (0 < texts.length) 
				{
					index = 0;
					
					return makePlayback(texts[index]);
				}
			},
			canForward() 
			{
				return index + 1 < texts.length;
			},
			canRewind() 
			{
				return index > 0;
			},
			forward() 
			{
				if (index + 1 < texts.length) 
				{
					index++;
					
					return makePlayback(texts[index]);
				}
			},
			rewind() 
			{
				if (index > 0) 
				{
					index--;
					
					return makePlayback(texts[index]);
				}
			},
			seek(toIndex, offset)
			{
				if (toIndex >= 0 && toIndex < texts.length)
				{
					index = toIndex;

					return makePlayback(getSeekText(texts[index], offset));
				}
			},
			gotoEnd() 
			{
				const toIndex = texts.length - 1;
				if (toIndex >= 0) 
				{
					index = toIndex;
					
					return makePlayback(texts[index]);
				}
			}
		};
	}

	function makePlayback(text)
	{
		// Pronunciation corrections happen here, after chunking and seek
		// slicing, so every offset in this file keeps referring to the
		// unmodified display text.
		text = applyPronunciations(text);
		if (engine.stop != null) return makePlaybackLegacy(text);
		else return engine.speak(text, options, playbackState$);
	}

	function makePlaybackLegacy(text) 
	{
		return playbackState$.pipe(
			rxjs.distinctUntilChanged(),
			rxjs.scan((playing$, state) => 
			{
				if (state == "resumed") 
				{
					if (playing$) 
					{
						engine.resume();
						
						return playing$;
					}
					else 
					{
						return new rxjs.Observable(observer => 
						{
							engine.speak(text, options, event => 
							{
								if (event.type == "error") observer.error(event.error);
								else observer.next(event);
							});
						});
					}
				}
				else if (state == "paused") 
				{
					if (playing$) 
					{
						if (isGoogleNative(options.voice) || isChromeOSNative(options.voice)) 
						{
							engine.stop();
							
							return null;
						}
						else 
						{
							engine.pause();
							
							return playing$;
						}
					}
					else 
					{
						return null;
					}
				}
			}, null),
			rxjs.distinctUntilChanged(),
			rxjs.switchMap(playing$ => 
			{
				if (playing$) 
				{
					return playing$.pipe(rxjs.finalize(() => engine.stop()));
				}
				else 
				{
					return rxjs.EMPTY;
				}
			}),
			rxjs.takeWhile(event => event.type != "end", true)
		);
	}

	// text breakers

	function WordBreaker(wordLimit, punctuator) 
	{
		this.breakText = breakText;
		function breakText(text) 
		{
			return punctuator.getParagraphs(text).flatMap(breakParagraph);
		}
		function breakParagraph(text) 
		{
			return punctuator.getSentences(text).flatMap(breakSentence);
		}
		function breakSentence(sentence) 
		{
			return merge(punctuator.getPhrases(sentence), breakPhrase);
		}
		function breakPhrase(phrase) 
		{
			var words = punctuator.getWords(phrase);
			var splitPoint = Math.min(Math.ceil(words.length / 2), wordLimit);
			var result = [];
			while (words.length) 
			{
				result.push(words.slice(0, splitPoint).join(""));
				words = words.slice(splitPoint);
			}
			
			return result;
		}
		function merge(parts, breakPart) 
		{
			var result = [];
			var group = {parts: [],
																wordCount: 0};
			var flush = function() 
			{
				if (group.parts.length) 
				{
					result.push(group.parts.join(""));
					group = {parts: [],
														wordCount: 0};
				}
			};
			parts.forEach(function(part) 
			{
				var wordCount = punctuator.getWords(part).length;
				if (wordCount > wordLimit) 
				{
					flush();
					var subParts = breakPart(part);
					for (var i = 0; i < subParts.length; i++) result.push(subParts[i]);
				}
				else 
				{
					if (group.wordCount + wordCount > wordLimit) flush();
					group.parts.push(part);
					group.wordCount += wordCount;
				}
			});
			flush();
			
			return result;
		}
	}

	function CharBreaker(charLimit, punctuator, paragraphCombineThreshold) 
	{
		this.breakText = breakText;
		function breakText(text) 
		{
			return merge(punctuator.getParagraphs(text), breakParagraph, paragraphCombineThreshold);
		}
		function breakParagraph(text) 
		{
			return merge(punctuator.getSentences(text), breakSentence);
		}
		function breakSentence(sentence) 
		{
			return merge(punctuator.getPhrases(sentence), breakPhrase);
		}
		function breakPhrase(phrase) 
		{
			return merge(punctuator.getWords(phrase), breakWord);
		}
		function breakWord(word) 
		{
			var result = [];
			while (word) 
			{
				result.push(word.slice(0, charLimit));
				word = word.slice(charLimit);
			}
			
			return result;
		}
		function merge(parts, breakPart, combineThreshold) 
		{
			var result = [];
			var group = {parts: [],
																charCount: 0};
			var flush = function() 
			{
				if (group.parts.length) 
				{
					result.push(group.parts.join(""));
					group = {parts: [],
														charCount: 0};
				}
			};
			parts.forEach(function(part) 
			{
				var charCount = part.length;
				if (charCount > charLimit) 
				{
					flush();
					var subParts = breakPart(part);
					for (var i = 0; i < subParts.length; i++) result.push(subParts[i]);
				}
				else 
				{
					if (group.charCount + charCount > (combineThreshold || charLimit)) flush();
					group.parts.push(part);
					group.charCount += charCount;
				}
			});
			flush();
			
			return result;
		}
	}

	function LatinPunctuator() 
	{
		var nonSentenceEndingAbbrev = /\b(?:[A-Za-z]|Adm|Assn|Ave|Blvd|Bldg|Brig|Capt|Cmdr|Col|Comdr|Corp|Cpl|Ct|Dept|Dr|Drs|Fig|Figs|Fr|Ft|Gen|Gov|Hon|Inc|Jr|Lieut|Ln|Lt|Ltd|Maj|Messrs|Mmes|Mr|Mrs|Ms|Mt|Mx|No|Nos|Pl|Pres|Prof|Rd|Rep|Reps|Rev|Sen|Sens|Sgt|Sr|St|Ste|Univ|Jan|Feb|Mar|Apr|Aug|Sep|Sept|Oct|Nov|Dec|dept|ed|eds|est|fig|figs|misc|pp|ref|refs|vol|vols|vs)\.\s+$/;
		this.getParagraphs = function(text) 
		{
			return recombine(text.split(/((?:\r?\n\s*){2,})/));
		};
		this.getSentences = function(text) 
		{
			return recombine(text.split(/([!.?]+[\s\u200B]+)/), nonSentenceEndingAbbrev);
		};
		this.getPhrases = function(sentence) 
		{
			return recombine(sentence.split(/([,:;]\s+|\s-+\s+|—\s*)/));
		};
		this.getWords = function(sentence) 
		{
			var tokens = sentence.split(/([#%*+<=>@^_~]|[\s/—\-]+|\.(?=\w{2,})|,(?=\d))/);
			var result = [];
			for (var i = 0; i < tokens.length; i += 2) 
			{
				if (tokens[i]) result.push(tokens[i]);
				if (i + 1 < tokens.length) 
				{
					if ((/^[#%*+<=>@^_~]$/).test(tokens[i + 1])) result.push(tokens[i + 1]);
					else if (result.length) result[result.length - 1] += tokens[i + 1];
				}
			}
			
			return result;
		};
		function recombine(tokens, nonPunc) 
		{
			var result = [];
			for (var i = 0; i < tokens.length; i += 2) 
			{
				var part = (i + 1 < tokens.length) ? (tokens[i] + tokens[i + 1]) : tokens[i];
				if (part) 
				{
					if (nonPunc && result.length && nonPunc.test(result.at(-1))) result[result.length - 1] += part;
					else result.push(part);
				}
			}
			
			return result;
		}
	}

	function EastAsianPunctuator() 
	{
		this.getParagraphs = function(text) 
		{
			return recombine(text.split(/((?:\r?\n\s*){2,})/));
		};
		this.getSentences = function(text) 
		{
			return recombine(text.split(/([!.?]+[\s\u200B]+|[\u3002\uFF01]+)/));
		};
		this.getPhrases = function(sentence) 
		{
			return recombine(sentence.split(/([,:;]\s+|[\u2025\u2026\u3000\u3001\uFF0C\uFF1B]+)/));
		};
		this.getWords = function(sentence) 
		{
			return sentence.replaceAll(/\s+/g, "").split("");
		};
		function recombine(tokens) 
		{
			var result = [];
			for (var i = 0; i < tokens.length; i += 2) 
			{
				if (i + 1 < tokens.length) result.push(tokens[i] + tokens[i + 1]);
				else if (tokens[i]) result.push(tokens[i]);
			}
			
			return result;
		}
	}
}
