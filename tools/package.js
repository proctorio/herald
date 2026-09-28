/**
 * Builds the Chrome Web Store artifact: build/herald-<version>.zip, the
 * production package (clean icons, clean name), from a fresh prod-channel
 * build of dist/ so the working dist state (a dev-stamped local build by
 * default) can never leak into it. Portable across the Windows dev machines
 * and the Linux agents (no shell zip dependency). Source maps never reach
 * the artifact.
 *
 * This is the only package the public repo produces. The beta channel
 * package is assembled by the internal release pipeline from this zip plus
 * the internal icon tooling; no channel branding logic lives here.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { zipSync } from "fflate";
import { zipEntries } from "./zip-entries.js";
import { findLockdownIds } from "./audit-lockdown-ids.js";

rmSync("build", { recursive: true, force: true });
mkdirSync("build", { recursive: true });

execFileSync(process.execPath, ["tools/build.js"], {
	stdio: "inherit",
	env: { ...process.env, HERALD_CHANNEL: "prod" }
});

// Belt and braces: the store artifact must carry the clean art, never the
// dev-stamped manifest icons a local tree wears.
for (const name of ["icon", "action"])
{
	for (const size of [16, 32, 48, 128])
	{
		const packaged = readFileSync(`dist/img/${name}-${size}.png`);
		const clean = readFileSync(`src/img/prod/${name}-${size}.png`);
		if (!packaged.equals(clean))
		{
			throw new Error(`dist/img/${name}-${size}.png does not match the clean store art; refusing to package.`);
		}
	}
}

// Only hashes of the lockdown extension IDs may ship (src/js/lockdown-ids.js);
// refuse a package that carries one in plain text.
const { findings } = findLockdownIds("dist");
if (findings.length)
{
	throw new Error(`dist carries ${findings.length} lockdown extension ID(s) in plain text; refusing to package. Run node tools/audit-lockdown-ids.js dist.`);
}

const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf-8"));
const artifact = `build/herald-${manifest.version}.zip`;

// Every folder and file in dist/ except source maps; see zip-entries.js.
writeFileSync(artifact, zipSync(zipEntries("dist")));

console.info(`${artifact} written`);
