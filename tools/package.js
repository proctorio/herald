/**
 * Builds the Chrome Web Store artifact: build/lectern-<version>.zip, the
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
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import AdmZip from "adm-zip";

rmSync("build", { recursive: true, force: true });
mkdirSync("build", { recursive: true });

execFileSync(process.execPath, ["tools/build.js"], {
	stdio: "inherit",
	env: { ...process.env, LECTERN_CHANNEL: "prod" }
});

// Belt and braces: the store artifact must carry the clean art, never the
// dev-stamped manifest icons a local tree wears.
for (const size of [16, 32, 48, 128])
{
	const packaged = readFileSync(`dist/img/icon-${size}.png`);
	const clean = readFileSync(`src/img/prod/icon-${size}.png`);
	if (!packaged.equals(clean))
	{
		throw new Error(`dist/img/icon-${size}.png does not match the clean store art; refusing to package.`);
	}
}

const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf-8"));
const artifact = `build/lectern-${manifest.version}.zip`;

const zip = new AdmZip();
zip.addLocalFolder("dist", "", entry => !entry.endsWith(".map"));
zip.writeZip(artifact);

console.info(`${artifact} written`);
