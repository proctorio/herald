// Speak-time pronunciation corrections, applied only to the text handed to
// the TTS engine, never to the text the player displays or highlights.
// Engines mangle certain proper nouns ("Proctorio" comes out as
// "proctor I O"), so each entry rewrites a spelling into a phonetic
// respelling the engines pronounce correctly.
//
// Altering the spoken length is safe here: no shipped engine maps character
// positions back into display text (start/end events carry only 0 and
// text.length, and nothing consumes them as offsets), and highlighting is
// chunk-index based. Corrections must stay out of chunking and seek math,
// which operate on display text; speech.js applies them at the last moment
// before the engine (see makePlayback).

// "Prock Torio" was picked by ear against the Windows en-US voices using
// tools/pronunciation-lab.html; the k spelling stops engines from matching
// the dictionary word "proctor" and spelling out the leftover "io".
const corrections = [
	{pattern: /proctorio/gi,
		spokenAs: "Prock Torio"},

	// LMS point values ("33.33 pts", "1 pts" on Canvas quizzes) read as a
	// clipped "pits" or letter by letter. Only a number followed by the
	// abbreviation is rewritten, so words like PTSD are untouched, and a
	// bare 1 takes the singular.
	{pattern: /\b(\d+(?:\.\d+)?)\s*pts?\b/gi,
		spokenAs: (match, value) => value + (value == "1" ? " point" : " points")}
];

// Returns the text with every correction applied, ready for the engine.
export function applyPronunciations(text)
{
	let result = text;
	for (const correction of corrections) result = result.replace(correction.pattern, correction.spokenAs);

	return result;
}
