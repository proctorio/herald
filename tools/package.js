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
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { sep } from "node:path";
import { execFileSync } from "node:child_process";
import { zipSync } from "fflate";

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

const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf-8"));
const artifact = `build/herald-${manifest.version}.zip`;

// Every folder and file in dist/ except source maps, named with forward
// slashes on every platform. Each entry keeps the attributes adm-zip gave it
// before fflate replaced it: Unix origin, the file's mode and mtime, the
// MS-DOS directory flag on folders. Folders are stored, files deflated.
const entries = {};
for (const relative of readdirSync("dist", { recursive: true }))
{
	const name = relative.split(sep).join("/");
	if (name.endsWith(".map")) continue;
	const stats = statSync(`dist/${relative}`);
	const folder = stats.isDirectory();
	const attributes = { os: 3, attrs: ((stats.mode & 0xffff) << 16 | (folder ? 0x10 : 0)) >>> 0, mtime: stats.mtime };
	if (folder)
	{
		entries[`${name}/`] = [new Uint8Array(0), { ...attributes, level: 0 }];
	}
	else
	{
		entries[name] = [readFileSync(`dist/${relative}`), attributes];
	}
}
writeFileSync(artifact, zipSync(entries));

console.info(`${artifact} written`);
