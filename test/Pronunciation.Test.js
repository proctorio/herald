/**
 * @description Tests for pronunciation.js: spoken-form corrections applied
 * to engine-bound text, never to display text (the display-side guarantee
 * is covered in Speech.Test.js against the full playback pipeline).
 */
import { applyPronunciations } from "../src/js/pronunciation.js";

describe("applyPronunciations", () =>
{
	it("rewrites Proctorio to the phonetic respelling", () =>
	{
		expect(applyPronunciations("Proctorio monitors this exam."))
			.toBe("Prock Torio monitors this exam.");
	});

	it("matches any casing", () =>
	{
		expect(applyPronunciations("proctorio")).toBe("Prock Torio");
		expect(applyPronunciations("PROCTORIO")).toBe("Prock Torio");
		expect(applyPronunciations("ProctoriO")).toBe("Prock Torio");
	});

	it("replaces every occurrence in the text", () =>
	{
		const result = applyPronunciations("Proctorio here, proctorio there.");
		expect(result).toBe("Prock Torio here, Prock Torio there.");
	});

	it("preserves possessives and surrounding punctuation", () =>
	{
		expect(applyPronunciations("Proctorio's secure browser (Proctorio)."))
			.toBe("Prock Torio's secure browser (Prock Torio).");
	});

	it("leaves unrelated text untouched, including the bare word proctor", () =>
	{
		const text = "The proctor will proctor this exam.";
		expect(applyPronunciations(text)).toBe(text);
	});

	it("returns empty input unchanged", () =>
	{
		expect(applyPronunciations("")).toBe("");
	});

	it("expands LMS point abbreviations after a number", () =>
	{
		expect(applyPronunciations("33.33 pts")).toBe("33.33 points");
		expect(applyPronunciations("Question 2 5 Pts")).toBe("Question 2 5 points");
		expect(applyPronunciations("10pts")).toBe("10 points");
		expect(applyPronunciations("2 pt")).toBe("2 points");
	});

	it("takes the singular for exactly one point", () =>
	{
		expect(applyPronunciations("1 pts")).toBe("1 point");
		expect(applyPronunciations("1 pt")).toBe("1 point");
		expect(applyPronunciations("1.5 pts")).toBe("1.5 points");
	});

	it("leaves pts alone without a number, and inside longer words", () =>
	{
		expect(applyPronunciations("Earn more pts.")).toBe("Earn more pts.");
		expect(applyPronunciations("PTSD awareness")).toBe("PTSD awareness");
		expect(applyPronunciations("12 ptsd")).toBe("12 ptsd");
	});
});
