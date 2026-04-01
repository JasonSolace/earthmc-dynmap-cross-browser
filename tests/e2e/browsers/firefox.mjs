import path from "node:path";
import { Builder } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import {
	envFlagEnabled,
	findLatestDriverFromSeleniumCache,
	findOnPath,
	pathIfExists,
} from "../lib/shared.mjs";

function resolveFirefoxBinaryPath() {
	const candidates = [
		process.env.FIREFOX_BINARY,
		process.env.FIREFOX_BINARY_PATH,
		process.env.ProgramFiles
			? path.join(process.env.ProgramFiles, "Mozilla Firefox", "firefox.exe")
			: null,
		process.env["ProgramFiles(x86)"]
			? path.join(
					process.env["ProgramFiles(x86)"],
					"Mozilla Firefox",
					"firefox.exe",
				)
			: null,
		findOnPath(["firefox.exe", "firefox"]),
	];

	return candidates.map(pathIfExists).find(Boolean) ?? null;
}

function resolveGeckoDriverPath() {
	const candidates = [
		process.env.GECKODRIVER,
		process.env.GECKODRIVER_PATH,
		process.env.LOCALAPPDATA
			? path.join(
					process.env.LOCALAPPDATA,
					"Microsoft",
					"WinGet",
					"Links",
					"geckodriver.exe",
				)
			: null,
		findLatestDriverFromSeleniumCache("geckodriver"),
		findOnPath(["geckodriver.exe", "geckodriver"]),
	];

	return candidates.map(pathIfExists).find(Boolean) ?? null;
}

async function tryAttachConsoleCapture(driver, logs) {
	if (typeof driver.onLogEvent !== "function") return false;

	await driver.onLogEvent((entry) => {
		const text =
			typeof entry === "string"
				? entry
				: entry?.text || entry?.message || JSON.stringify(entry);
		logs.push(text);
	});

	return true;
}

async function createDriver({ extensionPath, headless }) {
	const firefoxBinaryPath = resolveFirefoxBinaryPath();
	if (!firefoxBinaryPath) {
		throw new Error(
			"Could not find Firefox binary. Set FIREFOX_BINARY or FIREFOX_BINARY_PATH if Firefox is installed in a custom location.",
		);
	}

	const geckoDriverPath = resolveGeckoDriverPath();
	if (!geckoDriverPath) {
		throw new Error(
			"Could not find geckodriver. Set GECKODRIVER or GECKODRIVER_PATH if geckodriver is installed in a custom location.",
		);
	}

	const options = new firefox.Options();
	const headlessEnabled =
		typeof headless === "boolean"
			? headless
			: envFlagEnabled(process.env.FIREFOX_HEADLESS, false);
	options.setPreference("devtools.console.stdout.content", true);
	options.setBinary(firefoxBinaryPath);
	if (headlessEnabled) {
		options.addArguments("-headless");
	}
	options.setPageLoadStrategy("eager");

	const service = new firefox.ServiceBuilder(geckoDriverPath);
	if (envFlagEnabled(process.env.E2E_VERBOSE_DRIVER_LOGS, false)) {
		service.enableVerboseLogging();
		service.setStdio("inherit");
	}

	const driver = await new Builder()
		.forBrowser("firefox")
		.setFirefoxOptions(options)
		.setFirefoxService(service)
		.build();

	const addonId = await driver.installAddon(extensionPath, true);
	console.log("Installed addon:", addonId);

	return driver;
}

export default {
	id: "firefox",
	label: "Firefox",
	createDriver,
	tryAttachConsoleCapture,
};
