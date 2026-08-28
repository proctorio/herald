/**
 * Builds the distributable extension into dist/.
 *
 * The build is intentionally minimal so that shipped service worker and page
 * files are byte-identical to their sources under src/. Only content scripts
 * are bundled (they must run as classic scripts, so their ESM sources are
 * flattened to IIFE), and only when content entry points exist.
 */
import { cpSync, rmSync, mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const CONTENT_ENTRIES = "src/js/content-entries";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });
cpSync("src", "dist", { recursive: true });

// The MIT attribution ships in every artifact. dist/ must be self-contained
// because the release flow zips it directly (the Plumbing version-pack
// pipeline), not only through tools/package.js.
copyFileSync("LICENSE", "dist/LICENSE");
copyFileSync("NOTICE", "dist/NOTICE");

if (existsSync(CONTENT_ENTRIES))
{
	rmSync("dist/js/content-entries", { recursive: true, force: true });
	buildSync({
		entryPoints: [`${CONTENT_ENTRIES}/*.js`],
		bundle: true,
		format: "iife",
		outdir: "dist/js/content-entries",
		legalComments: "inline",
		target: ["chrome99"]
	});
}

// Channel assembly. Every build produces dist/ for exactly one channel and
// the stamp source sets under img/ never ship in any of them:
//   dev  (the default locally): dev-stamped icons, so a side-loaded unpacked
//        build is visibly a dev build in the toolbar.
//   beta: beta-stamped icons plus the Beta listing name baked into the
//        locale (the store rejects duplicate-name listings; the clean name
//        belongs to the production listing).
//   prod (the default on CI, TF_BUILD): clean icons, clean name.
// tools/package.js builds the beta and prod store zips from fresh builds.
const channel = process.env.LECTERN_CHANNEL ?? (process.env.TF_BUILD ? "prod" : "dev");

if (!["dev", "beta", "prod"].includes(channel))
{
	throw new Error(`Unknown LECTERN_CHANNEL "${channel}"; valid channels: dev, beta, prod`);
}

if (channel !== "prod")
{
	for (const size of [16, 32, 48, 128])
	{
		copyFileSync(`dist/img/${channel}/icon-${size}.png`, `dist/img/icon-${size}.png`);
	}
}

if (channel === "beta")
{
	const messagesPath = "dist/_locales/en/messages.json";
	const messages = JSON.parse(readFileSync(messagesPath, "utf-8"));
	messages.extension_name.message = "Lectern Beta: Text to Speech Reader";
	messages.extension_short_name.message = "Lectern Beta";
	writeFileSync(messagesPath, `${JSON.stringify(messages, null, "\t")}\n`);
}

rmSync("dist/img/beta", { recursive: true, force: true });
rmSync("dist/img/dev", { recursive: true, force: true });

console.info(`dist/ built (${channel} channel)`);
