/**
 * Builds the Chrome Web Store artifacts: one zip per store channel, named by
 * the manifest version.
 *
 *   build/lectern-<version>.zip       production: clean icons, clean name
 *   build/lectern-beta-<version>.zip  beta: stamped icons, Beta listing name
 *
 * Each zip comes from a fresh channel build of dist/ (tools/build.js), so
 * the working dist state, usually a dev-stamped local build, can never leak
 * into an artifact. Portable across the Windows dev machines and the Linux
 * agents (no shell zip dependency). Source maps never reach an artifact.
 * dist/ is left as the prod build because prod is packaged last.
 */
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import AdmZip from "adm-zip";

rmSync("build", { recursive: true, force: true });
mkdirSync("build", { recursive: true });

for (const channel of ["beta", "prod"])
{
	execFileSync(process.execPath, ["tools/build.js"], {
		stdio: "inherit",
		env: { ...process.env, LECTERN_CHANNEL: channel }
	});

	const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf-8"));
	const infix = channel === "prod" ? "" : `${channel}-`;
	const artifact = `build/lectern-${infix}${manifest.version}.zip`;

	const zip = new AdmZip();
	zip.addLocalFolder("dist", "", entry => !entry.endsWith(".map"));
	zip.writeZip(artifact);

	console.info(`${artifact} written`);
}
