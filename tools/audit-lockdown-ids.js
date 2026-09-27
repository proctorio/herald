/**
 * Fails when a Proctorio lockdown extension ID appears in plain text. Herald
 * carries only SHA-256 hashes of those IDs (src/js/lockdown-ids.js), so this
 * check carries no ID either: it hashes every 32-letter a-p run in every file
 * under the target, and every 32-letter window of a longer run, and compares
 * the result against the list. Findings name the file and the hash, never the
 * ID, so a build log cannot leak one.
 *
 * Usage:
 *   node tools/audit-lockdown-ids.js [dir]     # defaults to the repo root
 *
 * Run against dist/ before every store upload; tools/package.js runs it on the
 * package it builds. Exit 0 = clean. Exit 1 = findings. Exit 2 = usage error.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCKDOWN_ID_HASHES } from "../src/js/lockdown-ids.js";

const ID_LENGTH = 32;
const SKIPPED_DIRS = new Set([".git", "node_modules", ".test_output", "test-results", "coverage"]);

/**
 * @description Lists every file under a directory, skipping dependency, VCS
 * and test output directories.
 *
 * @param {string} dir - The directory to walk.
 * @return {string[]} - File paths.
 */
function listFiles(dir)
{
	return readdirSync(dir).flatMap(name =>
	{
		const path = join(dir, name);
		if (!statSync(path).isDirectory()) return [path];

		return SKIPPED_DIRS.has(name) ? [] : listFiles(path);
	});
}

/**
 * @description Finds plain-text occurrences of the IDs behind a hash list.
 *
 * @param {string} root - The directory to scan.
 * @param {string[]} [hashes] - SHA-256 hashes of the IDs to look for.
 * @return {Object} - files (how many were scanned) and findings, each
 * { file, hash }.
 */
export function findLockdownIds(root, hashes = LOCKDOWN_ID_HASHES)
{
	const wanted = new Set(hashes);
	const files = listFiles(root);
	const findings = [];
	for (const file of files)
	{
		const text = readFileSync(file, "latin1").toLowerCase();
		for (const [run] of text.matchAll(/[a-p]{32,}/gu))
		{
			for (let start = 0; start + ID_LENGTH <= run.length; start++)
			{
				const hash = createHash("sha256").update(run.slice(start, start + ID_LENGTH)).digest("hex");
				if (wanted.has(hash)) findings.push({ file: relative(root, file), hash });
			}
		}
	}

	return { files: files.length, findings };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
{
	const target = process.argv[2] ?? ".";
	if (!existsSync(target) || !statSync(target).isDirectory())
	{
		console.error(`error: not a directory: ${target}`);
		process.exit(2);
	}
	const { files, findings } = findLockdownIds(target);
	for (const { file, hash } of findings) console.error(`  XX ${file}: lockdown extension ID in plain text (sha256 ${hash.slice(0, 12)}...)`);
	console.info(findings.length ? `LOCKDOWN IDS FOUND: ${findings.length} in ${target}` : `LOCKDOWN IDS CLEAN: ${files} files in ${target}`);
	process.exit(findings.length ? 1 : 0);
}
