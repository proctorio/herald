import proctorioConfig from "@proctorio/eslint-config";

export default [
	{
		ignores: ["dist/**", "src/js/vendor/**", ".test_output/**"]
	},
	...proctorioConfig,
	{
		// Extension source keeps upstream-adjacent kebab-case filenames so the
		// fork's divergence from the upstream repository (see FORK.md) stays navigable (decision
		// D11 in docs/herald/00-implementation-plan.md). Tests and tooling
		// follow the house PascalCase rule from the base config.
		files: ["src/js/**/*.js", "tools/**/*.js"],
		rules: {
			"unicorn/filename-case": ["error", { "case": "kebabCase" }]
		}
	},
	{
		// Legacy-fork relaxations for inherited upstream code ONLY. The house
		// profile applies in full to test/ and tools/. Each rule below is
		// relaxed because retrofitting it onto ~5k lines of upstream code is
		// either high regression risk (require-unicode-regexp changes regex
		// semantics; block-scoped-var and vars-on-top force refactors) or a
		// rewrite in disguise (jsdoc on every inherited function). Ratchet:
		// when a file is substantially rewritten in later phases, remove it
		// from this scope by fixing it to full strictness.
		files: ["src/js/**/*.js"],
		languageOptions: {
			globals: {
				"heraldDoc": "readonly"
			}
		},
		rules: {
			"jsdoc/require-jsdoc": "off",
			"jsdoc/require-description-complete-sentence": "off",
			"belgradian/member-prefix-rule": "off",
			"require-unicode-regexp": "off",
			"vars-on-top": "off",
			"block-scoped-var": "off",
			"no-var": "off",
			"no-void": "off",
			"no-sequences": "off",
			"no-return-assign": "off",
			"no-eq-null": "off",
			"eqeqeq": "off",
			"no-nested-ternary": "off",
			"prefer-rest-params": "off",
			"new-cap": "off",
			"object-shorthand": "off",
			"complexity": "off",
			"max-depth": "off",
			"max-statements": "off",
			"max-lines-per-function": "off",
			"max-params": "off",
			"consistent-return": "off",
			"no-await-in-loop": "off",
			"no-undefined": "off",
			"no-plusplus": "off",
			"no-bitwise": "off",
			"radix": "off",
			"guard-for-in": "off",
			"default-case": "off",
			"no-fallthrough": "off",
			"no-use-before-define": "off",
			"prefer-named-capture-group": "off",
			"no-promise-executor-return": "off",
			"array-callback-return": "off",
			"func-style": "off",
			"one-var": "off",
			"no-shadow": "off",
			"no-loop-func": "off",
			"no-param-reassign": "off",
			"prefer-template": "off",
			"no-lonely-if": "off",
			"no-negated-condition": "off",
			"no-else-return": "off",
			"capitalized-comments": "off",
			"multiline-comment-style": "off",
			"line-comment-position": "off",
			"no-inline-comments": "off",
			"id-length": "off",
			"camelcase": "off",
			"promise/param-names": "off",
			"promise/always-return": "off",
			"promise/catch-or-return": "off",
			"promise/no-promise-in-callback": "off",
			"no-unused-vars": ["error", { "args": "none",
																																	"caughtErrors": "none" }],
			"max-statements-per-line": "off",
			"require-await": "off",
			"require-atomic-updates": "off",
			"handle-callback-err": "off",
			"no-continue": "off",
			"no-empty": "off",
			"no-undef-init": "off",
			"no-useless-escape": "off",
			"consistent-this": "off",
			"preserve-caught-error": "off",
			"prefer-spread": "off",
			"unicorn/prefer-string-slice": "off",
			"unicorn/prefer-add-event-listener": "off",
			"no-extend-native": ["error", { "exceptions": ["Array"] }],
			"jsdoc/require-description": "off",
			"jsdoc/require-param-description": "off",
			"jsdoc/require-param-type": "off",
			"jsdoc/require-returns-description": "off"
		}
	},
	{
		// Classic per-site content handlers: injected as plain scripts after
		// the content-base bundle, they intentionally consume the documented
		// global surface (see src/js/content-entries/content-base.js) and the
		// heraldDoc protocol. Not modules. They share the house formatting
		// (decision D12); upstream cherry-picks onto them are three-way merges,
		// not clean applies, which the divergence policy already accepts.
		files: ["src/js/content/**/*.js"],
		rules: {
			// The heraldDoc protocol IS an implicit global handoff between
			// separately injected classic scripts. Some handlers deliberately
			// redeclare or wrap a previously injected handler's global.
			"no-implicit-globals": "off",
			"no-redeclare": "off",
			"no-unused-vars": "off"
		},
		languageOptions: {
			sourceType: "script",
			globals: {
				"heraldDoc": "writable",
				"googleDocsUtil": "writable",
				"getInnerText": "readonly",
				"isNotEmpty": "readonly",
				"isElementVisible": "readonly",
				"fixParagraphs": "readonly",
				"tryGetTexts": "readonly",
				"simulateClick": "readonly",
				"simulateMouseEvent": "readonly",
				"getMath": "readonly",
				"makeMath": "readonly",
				"paragraphSplitter": "readonly",
				"waitMillis": "readonly",
				"repeat": "readonly",
				"getSettings": "readonly",
				"updateSettings": "readonly"
			}
		}
	},
	{
		// Third-party snapshot (Dictus ApS, MIT). Filename kept as shipped.
		files: ["src/js/content/googleDocsUtil.js"],
		rules: {
			"unicorn/filename-case": "off"
		}
	}
];
