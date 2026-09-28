// @vitest-environment node

/**
 * @description Tests for the store zip entries (tools/zip-entries.js). Every
 * nested file must reach the zip on every Node release package.json allows,
 * so readdirSync here behaves as it does on Node 18.0.0, where the recursive
 * option does not exist and only the top level comes back.
 */
import { vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipEntries } from "../tools/zip-entries.js";

vi.mock("node:fs", async importOriginal =>
{
	const fs = await importOriginal();
	const { readdirSync } = fs;

	return {
		...fs,
		readdirSync: (path, options) => readdirSync(path, options && {
			...options,
			recursive: false
		})
	};
});

describe("zipEntries", () =>
{
	let root;

	beforeAll(() =>
	{
		root = mkdtempSync(join(tmpdir(), "herald-zip-"));
		mkdirSync(join(root, "js", "content"), { recursive: true });
		mkdirSync(join(root, "_locales", "en"), { recursive: true });
		writeFileSync(join(root, "manifest.json"), "{}");
		writeFileSync(join(root, "js", "background.js"), "background");
		writeFileSync(join(root, "js", "background.js.map"), "map");
		writeFileSync(join(root, "js", "content", "acrobatiq.js"), "acrobatiq");
		writeFileSync(join(root, "_locales", "en", "messages.json"), "messages");
	});

	afterAll(() =>
	{
		rmSync(root, {
			recursive: true,
			force: true
		});
	});

	it("lists every nested folder and file except source maps", () =>
	{
		expect(Object.keys(zipEntries(root)).sort()).toEqual([
			"_locales/",
			"_locales/en/",
			"_locales/en/messages.json",
			"js/",
			"js/background.js",
			"js/content/",
			"js/content/acrobatiq.js",
			"manifest.json"
		]);
	});

	it("stores folders flagged as directories and keeps each file's bytes", () =>
	{
		const entries = zipEntries(root);
		const [folderBytes, folderOptions] = entries["js/content/"];
		const [fileBytes, fileOptions] = entries["js/content/acrobatiq.js"];

		expect(folderBytes).toHaveLength(0);
		expect(folderOptions.level).toBe(0);
		expect(folderOptions.attrs & 0x10).toBe(0x10);
		expect(Buffer.from(fileBytes).toString()).toBe("acrobatiq");
		expect(fileOptions.attrs & 0x10).toBe(0);
		expect(fileOptions.os).toBe(3);
	});
});
