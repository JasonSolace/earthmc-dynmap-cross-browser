import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import chromium from "./browsers/chromium.mjs";
import firefox from "./browsers/firefox.mjs";
import { envFlagEnabled } from "./lib/shared.mjs";

const BROWSERS = new Map(
	[chromium, firefox].map((browser) => [browser.id, browser]),
);

const TESTS_DIR = fileURLToPath(new URL("./tests", import.meta.url));
const KNOWN_SUITES = new Set(["smoke", "diagnostic", "all"]);

function parseArgs(argv) {
	const options = {
		browser: "all",
		test: "all",
		suite: "smoke",
		list: false,
		help: false,
		headless: envFlagEnabled(process.env.npm_config_headless, false)
			? true
			: undefined,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		if (arg === "--browser") {
			options.browser = argv[++i] ?? "";
			continue;
		}

		if (arg === "--test") {
			options.test = argv[++i] ?? "";
			continue;
		}

		if (arg === "--suite") {
			options.suite = argv[++i] ?? "";
			continue;
		}

		if (arg === "--list") {
			options.list = true;
			continue;
		}

		if (arg === "--headless") {
			options.headless = true;
			continue;
		}

		if (arg === "--help" || arg === "-h") {
			options.help = true;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

async function loadTests() {
	const entries = fs
		.readdirSync(TESTS_DIR, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith(".mjs"))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right));

	const tests = [];
	for (const entry of entries) {
		const modulePath = path.join(TESTS_DIR, entry);
		const loaded = await import(pathToFileURL(modulePath).href);
		const test = loaded.default;

		if (!test?.id || typeof test.run !== "function") {
			throw new Error(`Invalid test module: ${entry}`);
		}

		test.suite = test.suite === "diagnostic" ? "diagnostic" : "smoke";
		tests.push(test);
	}

	return tests;
}

function selectBrowsers(browserOption) {
	if (browserOption === "all") return [...BROWSERS.values()];

	const browser = BROWSERS.get(browserOption);
	if (!browser) {
		throw new Error(
			`Unknown browser "${browserOption}". Expected one of: all, ${[...BROWSERS.keys()].join(", ")}`,
		);
	}

	return [browser];
}

function selectTests(tests, testOption, suiteOption) {
	if (testOption === "all") {
		if (!KNOWN_SUITES.has(suiteOption)) {
			throw new Error(
				`Unknown suite "${suiteOption}". Expected one of: ${[...KNOWN_SUITES].join(", ")}`,
			);
		}

		if (suiteOption === "all") return tests;
		return tests.filter((candidate) => candidate.suite === suiteOption);
	}

	const test = tests.find((candidate) => candidate.id === testOption);
	if (!test) {
		throw new Error(
			`Unknown test "${testOption}". Available tests: ${tests.map((candidate) => candidate.id).join(", ")}`,
		);
	}

	return [test];
}

function printHelp() {
	console.log(`Usage: node tests/e2e/run.mjs [--browser <id>|all] [--suite <smoke|diagnostic|all>] [--test <id>|all] [--list] [--headless]

Examples:
  node tests/e2e/run.mjs
  node tests/e2e/run.mjs --suite smoke --browser chromium
  node tests/e2e/run.mjs --suite diagnostic --browser chromium
  node tests/e2e/run.mjs --browser firefox
  node tests/e2e/run.mjs --test archive
  node tests/e2e/run.mjs --browser chromium --test archive
  node tests/e2e/run.mjs --headless
  node tests/e2e/run.mjs --list`);
}

function printInventory(tests) {
	console.log("Browsers:");
	for (const browser of BROWSERS.values()) {
		console.log(`- ${browser.id}`);
	}

	console.log("Tests:");
	for (const test of tests) {
		console.log(`- ${test.id} [${test.suite}]: ${test.description ?? "No description"}`);
	}
}

function formatResultLabel(result) {
	return `${result.test} on ${result.browser}`;
}

function summarizeResults(results, selectedBrowsers, selectedTests, suite) {
	const passedResults = results.filter((result) => result.status === "passed");
	const failedResults = results.filter((result) => result.status === "failed");

	return {
		total: results.length,
		passed: passedResults.length,
		failed: failedResults.length,
		browsers: selectedBrowsers.map((entry) => entry.id),
		tests: selectedTests.map((entry) => entry.id),
		suite,
		failedTests: [...new Set(failedResults.map((result) => result.test))],
		failedRuns: failedResults.map((result) => ({
			test: result.test,
			browser: result.browser,
			durationMs: result.durationMs,
			error: result.error?.message || String(result.error),
		})),
	};
}

export async function runE2E({
	browser = "all",
	test = "all",
	suite = "smoke",
	list = false,
	headless = undefined,
} = {}) {
	const tests = await loadTests();

	if (list) {
		printInventory(tests);
		return { ok: true, listed: true, tests: 0, failures: 0 };
	}

	const selectedBrowsers = selectBrowsers(browser);
	const selectedTests = selectTests(tests, test, suite);
	const results = [];

	for (const selectedTest of selectedTests) {
		for (const selectedBrowser of selectedBrowsers) {
			const label = `${selectedTest.id} on ${selectedBrowser.id}`;
			const startedAt = Date.now();

			console.log(`\n[RUN] ${label}`);

			try {
				await selectedTest.run({
					browser: selectedBrowser,
					headless,
				});
				const durationMs = Date.now() - startedAt;
				console.log(`[PASS] ${label} (${durationMs}ms)`);
				results.push({
					browser: selectedBrowser.id,
					test: selectedTest.id,
					status: "passed",
					durationMs,
				});
			} catch (err) {
				const durationMs = Date.now() - startedAt;
				console.error(`[FAIL] ${label} (${durationMs}ms)`);
				console.error(err?.stack || err?.message || String(err));
				results.push({
					browser: selectedBrowser.id,
					test: selectedTest.id,
					status: "failed",
					durationMs,
					error: err,
				});
			}
		}
	}

	const summary = summarizeResults(
		results,
		selectedBrowsers,
		selectedTests,
		test === "all" ? suite : "explicit",
	);

	console.log("\nE2E summary:", summary);
	if (summary.failedRuns.length > 0) {
		console.log("Failed runs:");
		for (const failedRun of summary.failedRuns) {
			console.log(`- ${formatResultLabel(failedRun)}: ${failedRun.error}`);
		}
	}

	return {
		ok: summary.failed === 0,
		listed: false,
		tests: results.length,
		failures: summary.failed,
		summary,
		results,
	};
}

const isCliEntrypoint =
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCliEntrypoint) {
	try {
		const args = parseArgs(process.argv.slice(2));

		if (args.help) {
			printHelp();
		} else {
			const result = await runE2E(args);
			if (!result.ok) process.exitCode = 1;
		}
	} catch (err) {
		console.error(err?.stack || err?.message || String(err));
		printHelp();
		process.exitCode = 1;
	}
}
