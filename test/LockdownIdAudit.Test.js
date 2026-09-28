/**
 * @description Tools/audit-lockdown-ids.js: no lockdown extension ID appears
 * in plain text anywhere in the repository, and the audit finds an ID planted
 * in a file without ever reporting the ID itself.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findLockdownIds } from "../tools/audit-lockdown-ids.js";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @description Makes a random, well-formed extension ID: 32 letters a-p.
 *
 * @return {string} - The ID.
 */
function randomExtensionId()
{
	return Array.from({ length: 32 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 16))).join("");
}

/**
 * @description Writes a file, creating its directory.
 *
 * @param {string} path - The file path.
 * @param {string} text - The contents.
 */
function plant(path, text)
{
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

describe("lockdown ID audit", () =>
{
	it("finds no lockdown extension ID in plain text anywhere in the repository", () =>
	{
		const { files, findings } = findLockdownIds(REPO_ROOT);

		expect(files).toBeGreaterThan(100);
		expect(findings).toEqual([]);
	});

	it("finds a planted ID wherever it sits and reports only the file and hash", () =>
	{
		const id = randomExtensionId();
		const hash = createHash("sha256").update(id).digest("hex");
		const dir = mkdtempSync(join(tmpdir(), "herald-lockdown-audit-"));
		plant(join(dir, "quoted.js"), `const sender = "${id}";`);
		plant(join(dir, "deep", "upper.txt"), id.toUpperCase());
		plant(join(dir, "run.txt"), `abcd${id}ponm`);
		plant(join(dir, "other.txt"), randomExtensionId());
		plant(join(dir, "node_modules", "skipped.js"), id);

		const { findings } = findLockdownIds(dir, [hash]);
		rmSync(dir, { recursive: true,
																force: true });

		expect(findings.map(finding => finding.file).sort()).toEqual([join("deep", "upper.txt"), "quoted.js", "run.txt"]);
		for (const finding of findings) expect(finding.hash).toBe(hash);
		expect(JSON.stringify(findings)).not.toContain(id);
	});
});
