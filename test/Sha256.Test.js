/**
 * @description The synchronous SHA-256 the lockdown channel matches senders
 * with, checked against the FIPS 180-4 examples and against node:crypto.
 */
import { createHash } from "node:crypto";
import { sha256Hex } from "../src/js/sha256.js";

const ALPHABET = "abc XYZ 019 é € 😀 \n";

/**
 * @description The node:crypto SHA-256 of a string's UTF-8 bytes.
 *
 * @param {string} text - The input.
 * @return {string} - Lowercase hex digest.
 */
function reference(text)
{
	return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * @description A deterministic mixed ASCII and non-ASCII string.
 *
 * @param {number} length - How many characters to draw.
 * @return {string} - The string.
 */
function mixedText(length)
{
	const chars = [...ALPHABET];

	return Array.from({ length }, (unused, index) => chars[(index * 7 + length) % chars.length]).join("");
}

describe("sha256Hex", () =>
{
	it.each([
		["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
		["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"]
	])("matches the FIPS 180-4 example for %j", (text, digest) =>
	{
		expect(sha256Hex(text)).toBe(digest);
	});

	it("matches node:crypto at every ASCII length through five blocks, padding edges included", () =>
	{
		for (let length = 0; length <= 320; length++)
		{
			const text = "x".repeat(length);
			expect(sha256Hex(text)).toBe(reference(text));
		}
	});

	it("hashes the UTF-8 bytes of non-ASCII text", () =>
	{
		for (let length = 1; length <= 120; length++)
		{
			const text = mixedText(length);
			expect(sha256Hex(text)).toBe(reference(text));
		}
	});
});
