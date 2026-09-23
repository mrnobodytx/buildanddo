import importPlugin from 'eslint-plugin-import';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import unicodeEscapePlugin from './eslint.unicode-escapes-plugin.mjs';

export default [
	// vitest.config.js joins vite.config.js here for the same reason: eslint-import-resolver-alias
	// resolves its `@vitejs/plugin-react` import through vite's package exports, hits
	// ERR_PACKAGE_PATH_NOT_EXPORTED for './internal', and THROWS - aborting the entire run with
	// "Oops! Something went wrong" and zero reported violations. Disabling one rule does not help;
	// import/namespace and import/default each crash in turn on the same export-map walk.
	{ ignores: ['node_modules/**', 'dist/**', 'build/**', 'vite.config.js', 'vitest.config.js',
		// VENDORED HORIZONS EDITOR, and it is genuinely broken rather than merely unresolvable:
		// 29 files import '../state/*.js' and plugins/visual-editor/state/ HAS NEVER EXISTED in
		// this repo (0 files tracked, no deletion commit). The build is unaffected because
		// vite.config.js loads only the two entry plugins, neither of which reaches state/.
		// Linting third-party editor code we do not author cannot fix it; the missing tree is
		// recorded as a defect instead of being masked by a per-rule 'off'.
		'plugins/visual-editor/**'] },
	{
		files: ['**/*.js', '**/*.jsx'],
		plugins: { react, 'react-hooks': reactHooks, 'import': importPlugin },
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			parserOptions: { ecmaFeatures: { jsx: true } },
			globals: { ...globals.browser, React: 'readonly', Intl: 'readonly' },
		},
		settings: {
			'react': { version: 'detect' },
			'import/extensions': ['.js', '.jsx'],
			'import/resolver': {
				node: { extensions: ['.js', '.jsx'] },
				alias: { map: [['@', './src']], extensions: ['.js', '.jsx'] },
			},
		},
		rules: {
			...react.configs.recommended.rules,
			...reactHooks.configs.recommended.rules,
			...importPlugin.flatConfigs.recommended.rules,

			// Non-critical rules - disabled since code works fine without them
			'react/prop-types': 'off',
			'react/no-unescaped-entities': 'off',
			'react/display-name': 'off', // Non-critical, component works without displayName
			'react/jsx-uses-react': 'off', // Not needed in React 17+, non-critical
			'react/react-in-jsx-scope': 'off', // Not needed in React 17+, non-critical
			'react/jsx-uses-vars': 'off', // Non-critical, code works fine
			'react/jsx-no-comment-textnodes': 'off', // Non-critical, comments could be visible if put inside the JSX, most cases are just rendering text like '///'

			'no-unused-vars': 'off', // Non-critical, code works fine with unused vars
			'import/no-named-as-default': 'off', // Can cause runtime import errors, usually fine to leave as is
			'import/no-named-as-default-member': 'off', // Can cause runtime import errors

			// Critical rules that prevent runtime errors
			'no-undef': 'error', // Undefined variables cause runtime errors
			'no-empty': ['error', { allowEmptyCatch: true }], // Empty blocks often signal a bug (e.g. missing body)

			// Override recommended import rules for stricter checking
			'import/no-self-import': 'error', // Extremely fast rule, breaking results in infinite loop/bundling error
			// ?public-lessons is resolved by plugins/vite-plugin-public-lessons.js; tests/upgrade/public-lessons.test.mjs checks those imports.
			'import/no-unresolved': ['error', { ignore: ['\\?public-lessons$'] }],

			// Disable expensive rules for performance
			'import/no-cycle': 'off', // AI rarely makes this error, and the rule is very slow to run
		},
	},
	{
		files: ['**/*.jsx'],
		plugins: { horizons: unicodeEscapePlugin },
		rules: { 'horizons/no-unicode-escapes-in-jsx': 'warn' },
	},
	{ files: ['tools/**/*.js', 'tailwind.config.js'], languageOptions: { globals: globals.node } },
	{
		// Vitest suites. `globals: true` in vitest.config.js puts the test API on
		// globalThis, which ESLint cannot infer - without these, 'no-undef' fires
		// on every describe/it/expect.
		files: [
			'vitest.config.js',
			'src/test/**/*.js',
			'src/test/**/*.jsx',
			'src/**/__tests__/**/*.js',
			'src/**/__tests__/**/*.jsx',
			'src/**/*.test.js',
			'src/**/*.test.jsx',
		],
		languageOptions: {
			globals: {
				// Specs read fixture bytes, so Node globals (Buffer) are in scope here as well as
				// the vitest API. Without this, no-undef fires on Buffer in BlueprintSavedPage.
				...globals.node,
				afterAll: 'readonly',
				afterEach: 'readonly',
				beforeAll: 'readonly',
				beforeEach: 'readonly',
				describe: 'readonly',
				expect: 'readonly',
				it: 'readonly',
				suite: 'readonly',
				test: 'readonly',
				vi: 'readonly',
			},
		},
		rules: {
			// vitest and @testing-library ship "exports" subpaths
			// (vitest/config, @testing-library/jest-dom/vitest) that
			// eslint-import-resolver-node cannot follow. The resolver, not the
			// import, is what is out of date - so neither the path nor the named
			// bindings behind it can be checked here.
			'import/no-unresolved': 'off',
			'import/named': 'off',
		},
	},
];
