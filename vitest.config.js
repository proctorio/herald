import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["test/**/*.{Test,test}.js"],
		globals: true,
		environment: "jsdom",
		setupFiles: ["test/Setup.js"],
		reporters: ["default", "junit"],
		outputFile: {
			junit: "./.test_output/test-results.xml"
		},
		coverage: {
			enabled: true,
			provider: "v8",

			// Coverage scope is the core logic modules. Deliberately excluded,
			// each with a different verification path:
			// - vendor/**: third-party bundles.
			// - content/**: classic injected scripts whose behavior depends on
			//   real layout (jQuery :visible, innerText). jsdom has no layout,
			//   so unit assertions there would pin the wrong semantics. They
			//   are exercised in real Chrome by the Playwright suite.
			// - content-entries/**: bundle shims, no logic.
			// - popup/options/player/languages/advanced-options: jQuery DOM
			//   pages, covered by Playwright plus axe scans.
			// - events.js: service worker orchestration (injection, menus,
			//   commands), covered by the Playwright extension harness.
			include: [
				"src/js/brapi.js",
				"src/js/defaults.js",
				"src/js/messaging.js",
				"src/js/external-messaging.js",
				"src/js/lockdown-ids.js",
				"src/js/sha256.js",
				"src/js/content-handlers.js",
				"src/js/tts-engines.js",
				"src/js/speech.js",
				"src/js/paragraphs.js",
				"src/js/document.js",
				"src/js/content.js"
			],
			reporter: ["text", "cobertura"],
			reportsDirectory: "./.test_output",
			thresholds: {
				branches: 80,
				statements: 80,
				functions: 80,
				lines: 80
			}
		}
	}
});
