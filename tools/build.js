/**
 * Builds the distributable extension into dist/.
 *
 * The build is intentionally minimal so that shipped service worker and page
 * files are byte-identical to their sources under src/. Only content scripts
 * are bundled (they must run as classic scripts, so their ESM sources are
 * flattened to IIFE), and only when content entry points exist.
 */
import { cpSync, rmSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
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

// Channel icons. The committed manifest icons (img/icon-*.png) ARE the
// dev-stamped set, pre-compiled by the internal icon tooling, so a raw
// checkout or a default local build side-loads with the dev logo and no
// build step is needed to get it. img/prod holds the clean store art; the
// prod channel (the default on CI, TF_BUILD) swaps it over the manifest
// icons for store packages. Beta channel branding is applied by the
// internal release pipeline, never here: the public repo carries no
// stamping logic and no badge art.
const channel = process.env.LECTERN_CHANNEL ?? (process.env.TF_BUILD ? "prod" : "dev");

if (!["dev", "prod"].includes(channel))
{
	throw new Error(`Unknown LECTERN_CHANNEL "${channel}"; valid channels: dev, prod`);
}

if (channel === "prod")
{
	for (const size of [16, 32, 48, 128])
	{
		copyFileSync(`dist/img/prod/icon-${size}.png`, `dist/img/icon-${size}.png`);
	}
}

// The clean-art source set never ships as a directory in any build.
rmSync("dist/img/prod", { recursive: true, force: true });

console.info(`dist/ built (${channel} channel)`);
