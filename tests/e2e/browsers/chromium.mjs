import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { Builder } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import {
	envFlagEnabled,
	findLatestDriverFromSeleniumCache,
	findOnPath,
	pathIfExists,
} from "../lib/shared.mjs";

function findPythonInstalledChromeDriverPath() {
	if (!process.env.LOCALAPPDATA) return null;

	const pythonBaseDir = path.join(
		process.env.LOCALAPPDATA,
		"Programs",
		"Python",
	);
	if (!fs.existsSync(pythonBaseDir)) return null;

	const pythonDirs = fs
		.readdirSync(pythonBaseDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && entry.name.startsWith("Python"))
		.map((entry) => entry.name)
		.sort((left, right) =>
			right.localeCompare(left, undefined, { numeric: true }),
		);

	for (const pythonDir of pythonDirs) {
		const candidate = path.join(
			pythonBaseDir,
			pythonDir,
			"Lib",
			"site-packages",
			"chromedriver_binary",
			"chromedriver.exe",
		);
		if (fs.existsSync(candidate)) return candidate;
	}

	return null;
}

function isGoogleChromeBinary(chromiumBinaryPath) {
	if (!chromiumBinaryPath) return false;

	return path
		.normalize(chromiumBinaryPath)
		.toLowerCase()
		.includes(path.normalize(path.join("Google", "Chrome", "Application", "chrome.exe")).toLowerCase());
}

function resolveChromiumBinaryPath({ loadsExtension = false } = {}) {
	const explicitCandidates = [
		process.env.CHROMIUM_BINARY,
		process.env.CHROMIUM_BINARY_PATH,
		process.env.CHROME_BINARY,
		process.env.CHROME_BINARY_PATH,
	];

	const installedGoogleChromeCandidates = [
		process.env.LOCALAPPDATA
			? path.join(
					process.env.LOCALAPPDATA,
					"Google",
					"Chrome",
					"Application",
					"chrome.exe",
				)
			: null,
		process.env.ProgramFiles
			? path.join(
					process.env.ProgramFiles,
					"Google",
					"Chrome",
					"Application",
					"chrome.exe",
				)
			: null,
		process.env["ProgramFiles(x86)"]
			? path.join(
					process.env["ProgramFiles(x86)"],
					"Google",
					"Chrome",
					"Application",
					"chrome.exe",
				)
			: null,
	];

	const installedChromiumCandidates = [
		process.env.LOCALAPPDATA
			? path.join(
					process.env.LOCALAPPDATA,
					"Chromium",
					"Application",
					"chrome.exe",
				)
			: null,
		process.env.ProgramFiles
			? path.join(
					process.env.ProgramFiles,
					"Chromium",
					"Application",
					"chrome.exe",
				)
			: null,
		process.env["ProgramFiles(x86)"]
			? path.join(
					process.env["ProgramFiles(x86)"],
					"Chromium",
					"Application",
					"chrome.exe",
				)
			: null,
		findOnPath(["chromium.exe", "chromium"]),
	];

	const installedGoogleChromePathCandidate = findOnPath([
		"chrome.exe",
		"chrome",
		"google-chrome",
		"google-chrome-stable",
	]);

	// Prefer an installed Chrome/Chromium before the repo-local Chrome for
	// Testing bundle in the general case. For extension-based Selenium runs,
	// prefer Chromium-compatible builds before branded Google Chrome because
	// Chrome 137+ ignores --load-extension in branded builds, while Chromium
	// and Chrome for Testing still allow unpacked extension loading.
	const installedCandidates = loadsExtension
		? [
				...installedChromiumCandidates,
				...installedGoogleChromeCandidates,
				installedGoogleChromePathCandidate,
			]
		: [
				...installedGoogleChromeCandidates,
				...installedChromiumCandidates,
				installedGoogleChromePathCandidate,
			];

	const bundledCandidates = [
		path.resolve(".tools", "chrome-win64", "chrome.exe"),
		path.resolve(".tools", "chrome-win64", "chrome-win64", "chrome.exe"),
		path.resolve("tools", "chrome", "chrome.exe"),
	];

	const candidates = loadsExtension
		? [
				...explicitCandidates,
				...installedChromiumCandidates,
				...bundledCandidates,
				...installedGoogleChromeCandidates,
				installedGoogleChromePathCandidate,
			]
		: [
				...explicitCandidates,
				...installedCandidates,
				...bundledCandidates,
			];

	return candidates.map(pathIfExists).find(Boolean) ?? null;
}

function resolveChromeDriverPath() {
	const candidates = [
		process.env.CHROMEDRIVER,
		process.env.CHROMEDRIVER_PATH,
		path.resolve(".tools", "chromedriver-win64", "chromedriver.exe"),
		path.resolve("tools", "chromedriver", "chromedriver.exe"),
		process.env.LOCALAPPDATA
			? path.join(
					process.env.LOCALAPPDATA,
					"Microsoft",
					"WinGet",
					"Links",
					"chromedriver.exe",
				)
			: null,
		findLatestDriverFromSeleniumCache("chromedriver"),
		findPythonInstalledChromeDriverPath(),
		findOnPath(["chromedriver.exe", "chromedriver"]),
	];

	return candidates.map(pathIfExists).find(Boolean) ?? null;
}

function readVersionOutput(executablePath, args) {
	try {
		return execFileSync(executablePath, args, {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	} catch {
		return null;
	}
}

function readWindowsExecutableVersion(executablePath) {
	if (process.platform !== "win32" || !executablePath?.toLowerCase().endsWith(".exe")) {
		return null;
	}

	try {
		return execFileSync(
			"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
			[
				"-NoProfile",
				"-Command",
				`(Get-Item -LiteralPath '${escapeForPowerShellSingleQuoted(executablePath)}').VersionInfo.ProductVersion`,
			],
			{
				encoding: "utf8",
				stdio: ["ignore", "pipe", "pipe"],
			},
		).trim();
	} catch {
		return null;
	}
}

function readBrowserVersion(executablePath) {
	// Avoid executing chrome.exe with --version on Windows. On this setup that
	// preflight probe can open a visible browser window and block until it is
	// closed, which delays Selenium before the real session launch begins.
	return readWindowsExecutableVersion(executablePath)
		?? readVersionOutput(executablePath, ["--version"]);
}

function parseMajorVersion(versionText) {
	const match = versionText?.match(/(\d+)\./);
	return match ? Number.parseInt(match[1], 10) : null;
}

function chromiumTraceEnabled() {
	return envFlagEnabled(process.env.E2E_VERBOSE_CHROMIUM_LOGS, false);
}

function chromiumTrace(step, details = null) {
	if (!chromiumTraceEnabled()) return;

	if (details === null || details === undefined) {
		console.log(`[chromium] ${step}`);
		return;
	}

	console.log(`[chromium] ${step}:`, details);
}

function summarizeError(error) {
	if (!error) return null;

	return {
		name: error.name ?? null,
		message: error.message ?? String(error),
		stack: typeof error.stack === "string"
			? error.stack.split("\n").slice(0, 8)
			: null,
	};
}

function readExtensionManifestSummary(extensionPath) {
	if (!extensionPath) return null;

	const manifestPath = path.join(extensionPath, "manifest.json");
	if (!fs.existsSync(manifestPath)) {
		return {
			extensionPath,
			manifestPath,
			exists: false,
		};
	}

	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
		return {
			extensionPath,
			manifestPath,
			exists: true,
			name: manifest.name ?? null,
			version: manifest.version ?? null,
			manifestVersion: manifest.manifest_version ?? null,
			contentScriptCount: Array.isArray(manifest.content_scripts)
				? manifest.content_scripts.length
				: 0,
			webAccessibleResourceCount: Array.isArray(manifest.web_accessible_resources)
				? manifest.web_accessible_resources.length
				: 0,
		};
	} catch (error) {
		return {
			extensionPath,
			manifestPath,
			exists: true,
			parseError: error.message,
		};
	}
}

function escapeForPowerShellSingleQuoted(value) {
	return String(value).replaceAll("'", "''");
}

function cleanupChromeProcesses(chromiumBinaryPath, userDataDir = null) {
	if (process.platform !== "win32") return;

	const escapedBinaryPath = escapeForPowerShellSingleQuoted(chromiumBinaryPath);
	const escapedUserDataDir = userDataDir
		? escapeForPowerShellSingleQuoted(userDataDir)
		: null;

	const command = userDataDir
		? `
			Get-CimInstance Win32_Process |
				Where-Object {
					$_.Name -eq 'chrome.exe' -and
					$_.ExecutablePath -eq '${escapedBinaryPath}' -and
					$_.CommandLine -like '*${escapedUserDataDir}*'
				} |
				ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
		`
		: `
			Get-CimInstance Win32_Process |
				Where-Object {
					$_.Name -eq 'chrome.exe' -and
					$_.ExecutablePath -eq '${escapedBinaryPath}' -and
					$_.CommandLine -like '*emc-dynmapplus-chromium-*'
				} |
				ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
		`;

	try {
		execFileSync(
			"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
			["-NoProfile", "-Command", command],
			{ stdio: ["ignore", "pipe", "pipe"] },
		);
		chromiumTrace("cleanup.complete", {
			chromiumBinaryPath,
			userDataDir,
		});
	} catch {
		// Cleanup is best-effort. If this fails, Selenium's normal shutdown path
		// still runs and we avoid hiding the primary test error.
		chromiumTrace("cleanup.failed", {
			chromiumBinaryPath,
			userDataDir,
		});
	}
}

function isBundledChromiumBinary(chromiumBinaryPath) {
	if (!chromiumBinaryPath) return false;

	const normalizedBinaryPath = path.normalize(chromiumBinaryPath).toLowerCase();
	const bundledCandidates = [
		path.resolve(".tools", "chrome-win64", "chrome.exe"),
		path.resolve(".tools", "chrome-win64", "chrome-win64", "chrome.exe"),
		path.resolve("tools", "chrome", "chrome.exe"),
	].map((candidate) => path.normalize(candidate).toLowerCase());

	return bundledCandidates.includes(normalizedBinaryPath);
}

function isWindowsSandboxAccessDeniedError(error) {
	const message = String(error?.message ?? error ?? "").toLowerCase();
	return (
		message.includes("sandbox cannot access executable") ||
		message.includes("access is denied") ||
		message.includes("(0x5)")
	);
}

async function createDriver({ extensionPath, headless }) {
	chromiumTrace("createDriver.begin", {
		extensionPath,
		headless,
		chromiumHeadlessEnv: process.env.CHROMIUM_HEADLESS ?? null,
		chromiumNoSandboxEnv: process.env.CHROMIUM_NO_SANDBOX ?? null,
	});
	chromiumTrace(
		"createDriver.extensionSummary",
		readExtensionManifestSummary(extensionPath),
	);

	const loadsExtension = Boolean(extensionPath);
	const chromiumBinaryPath = resolveChromiumBinaryPath({ loadsExtension });
	if (!chromiumBinaryPath) {
		throw new Error(
			"Could not find a Chromium binary. Set CHROMIUM_BINARY, CHROMIUM_BINARY_PATH, CHROME_BINARY, or CHROME_BINARY_PATH if Chrome/Chromium is installed in a custom location.",
		);
	}

	const chromeDriverPath = resolveChromeDriverPath();
	const browserVersionText = readBrowserVersion(chromiumBinaryPath);
	const driverVersionText = chromeDriverPath
		? readVersionOutput(chromeDriverPath, ["--version"])
		: null;
	const browserMajor = parseMajorVersion(browserVersionText);
	const driverMajor = parseMajorVersion(driverVersionText);
	const useLocalChromeDriver =
		Boolean(chromeDriverPath) &&
		!(browserMajor && driverMajor && browserMajor !== driverMajor);
	chromiumTrace("createDriver.resolved", {
		chromiumBinaryPath,
		chromeDriverPath,
		browserVersionText,
		driverVersionText,
		browserMajor,
		driverMajor,
		useLocalChromeDriver,
		usesBundledChromiumBinary: isBundledChromiumBinary(chromiumBinaryPath),
	});

	// Clear any stale Chrome for Testing processes left behind by prior runs so
	// a leaked browser window cannot interfere with the next session.
	cleanupChromeProcesses(chromiumBinaryPath);

	const userDataDir = fs.mkdtempSync(
		path.join(os.tmpdir(), "emc-dynmapplus-chromium-"),
	);
	const headlessEnabled =
		typeof headless === "boolean"
			? headless
			: loadsExtension
				? envFlagEnabled(process.env.CHROMIUM_HEADLESS, false)
				: envFlagEnabled(process.env.CHROMIUM_HEADLESS, true);
	const allowGoogleChromeForExtensions = envFlagEnabled(
		process.env.CHROMIUM_ALLOW_GOOGLE_CHROME,
		false,
	);
	let noSandboxEnabled =
		envFlagEnabled(process.env.CHROMIUM_NO_SANDBOX, false) ||
		(loadsExtension && isBundledChromiumBinary(chromiumBinaryPath));
	chromiumTrace("createDriver.runtimeConfig", {
		userDataDir,
		loadsExtension,
		headlessEnabled,
		noSandboxEnabled,
		allowGoogleChromeForExtensions,
	});

	if (
		loadsExtension &&
		isGoogleChromeBinary(chromiumBinaryPath) &&
		!allowGoogleChromeForExtensions
	) {
		throw new Error(
			"Chromium extension tests require Chromium or Chrome for Testing. Branded Google Chrome ignores --load-extension in Chrome 137+ builds, so the unpacked extension will not load reliably. Install Chromium, place Chrome for Testing in .tools/, or set CHROMIUM_BINARY_PATH and CHROMEDRIVER_PATH to a Chromium-compatible browser and matching driver. If you truly need to override this guard, set CHROMIUM_ALLOW_GOOGLE_CHROME=1.",
		);
	}

	function buildOptions() {
		const options = new chrome.Options();
		options.setChromeBinaryPath(chromiumBinaryPath);
		options.setPageLoadStrategy("eager");

		// Disable Chrome's profile picker in Local State before startup.
		options.setLocalState({
			browser: {
				show_profile_picker_on_startup: false,
			},
		});

		// Disable profile/sign-in related prompts in the fresh temp profile.
		options.setUserPreferences({
			browser: {
				show_profile_picker_on_startup: false,
			},
			credentials_enable_service: false,
			profile: {
				password_manager_enabled: false,
				exit_type: "Normal",
				exited_cleanly: true,
			},
		});

		// Always use a brand-new temporary user-data-dir so Chrome never reuses
		// the user's real profile and never needs to ask which profile to open.
		options.addArguments(`--user-data-dir=${userDataDir}`);

		// Suppress first-run and default-browser flows that can open extra UI.
		options.addArguments("--disable-gpu");
		options.addArguments("--no-first-run");
		options.addArguments("--no-default-browser-check");

		// Suppress sign-in/profile creation surfaces that can trigger profile UI.
		options.addArguments("--disable-signin-promo");
		options.addArguments("--disable-sync");
		options.addArguments("--disable-features=SigninIntercept,SigninProfileCreation");

		// Keep the browser session stable for automation.
		options.addArguments("--disable-dev-shm-usage");
		options.addArguments("--remote-debugging-port=0");

		if (loadsExtension) {
			// Extension-based Chromium tests are more stable headful, so keep
			// them headful by default unless CHROMIUM_HEADLESS explicitly forces
			// it on.
			options.addArguments(`--disable-extensions-except=${extensionPath}`);
			options.addArguments(`--load-extension=${extensionPath}`);
		}

		// Start on a blank page so Chrome doesn't show any startup surface first.
		options.addArguments("data:,");

		if (headlessEnabled) {
			options.addArguments("--headless=new");
		}

		// Always use the sandbox workaround for extension-based runs against the
		// repo-local Chrome for Testing binary. That binary is the correct choice
		// for unpacked extension loading, but on this Windows setup it can emit a
		// sandbox access-denied startup failure before succeeding on retry.
		if (noSandboxEnabled) {
			options.addArguments("--no-sandbox");
		}

		chromiumTrace("buildOptions.complete", {
			chromiumBinaryPath,
			userDataDir,
			loadsExtension,
			headlessEnabled,
			noSandboxEnabled,
		});

		return options;
	}

	function buildDriverBuilder() {
		chromiumTrace("buildDriverBuilder.begin", {
			useLocalChromeDriver,
			chromeDriverPath,
			noSandboxEnabled,
		});

		const builder = new Builder()
			.forBrowser("chrome")
			.setChromeOptions(buildOptions());

		if (useLocalChromeDriver) {
			const service = new chrome.ServiceBuilder(chromeDriverPath);
			if (envFlagEnabled(process.env.E2E_VERBOSE_DRIVER_LOGS, false)) {
				if (typeof service.enableVerboseLogging === "function") {
					service.enableVerboseLogging();
				}
				if (typeof service.setStdio === "function") {
					service.setStdio("inherit");
				}
			}

			builder.setChromeService(service);
		}

		chromiumTrace("buildDriverBuilder.complete", {
			useLocalChromeDriver,
			chromeDriverPath,
			noSandboxEnabled,
		});

		return builder;
	}

	if (!useLocalChromeDriver) {
		if (chromeDriverPath && browserMajor && driverMajor && browserMajor !== driverMajor) {
			console.warn(
				`Ignoring chromedriver at ${chromeDriverPath} because Chrome major version ${browserMajor} does not match chromedriver major version ${driverMajor}.`,
			);
		} else if (!chromeDriverPath) {
			console.warn(
				"No local chromedriver was found. Falling back to Selenium Manager.",
			);
		}

		console.warn(
			"If Selenium Manager cannot resolve a driver automatically, set CHROMEDRIVER_PATH to a chromedriver build that matches your installed Chrome major version.",
		);
	}

	let driver;
	try {
		chromiumTrace("builder.build.start", {
			noSandboxEnabled,
			useLocalChromeDriver,
		});
		driver = await buildDriverBuilder().build();
		chromiumTrace("builder.build.success", {
			noSandboxEnabled,
			sessionId: typeof driver?.getSession === "function"
				? String(await driver.getSession())
				: null,
		});
	} catch (err) {
		chromiumTrace("builder.build.error", summarizeError(err));
		const shouldRetryWithoutSandbox =
			!noSandboxEnabled &&
			isBundledChromiumBinary(chromiumBinaryPath) &&
			isWindowsSandboxAccessDeniedError(err);
		chromiumTrace("builder.build.retryDecision", {
			shouldRetryWithoutSandbox,
			noSandboxEnabled,
			usesBundledChromiumBinary: isBundledChromiumBinary(chromiumBinaryPath),
			isWindowsSandboxAccessDenied: isWindowsSandboxAccessDeniedError(err),
		});

		if (shouldRetryWithoutSandbox) {
			// Retry once with --no-sandbox only after the Windows sandbox fails
			// against the bundled Chrome for Testing binary.
			noSandboxEnabled = true;
			cleanupChromeProcesses(chromiumBinaryPath, userDataDir);
			console.warn(
				"Retrying Chromium startup with --no-sandbox after a Windows sandbox access-denied failure from the bundled Chrome binary.",
			);
			try {
				chromiumTrace("builder.build.retryStart", {
					noSandboxEnabled,
					useLocalChromeDriver,
				});
				driver = await buildDriverBuilder().build();
				chromiumTrace("builder.build.retrySuccess", {
					noSandboxEnabled,
					sessionId: typeof driver?.getSession === "function"
						? String(await driver.getSession())
						: null,
				});
			} catch (retryErr) {
				chromiumTrace("builder.build.retryError", summarizeError(retryErr));
				cleanupChromeProcesses(chromiumBinaryPath, userDataDir);
				fs.rmSync(userDataDir, { recursive: true, force: true });
				throw retryErr;
			}
		} else {
			cleanupChromeProcesses(chromiumBinaryPath, userDataDir);
			fs.rmSync(userDataDir, { recursive: true, force: true });
			throw err;
		}
	}

	if (!driver) {
		cleanupChromeProcesses(chromiumBinaryPath, userDataDir);
		fs.rmSync(userDataDir, { recursive: true, force: true });
		throw new Error("Chromium driver build completed without returning a driver.");
	}

	const originalQuit = driver.quit.bind(driver);
	driver.quit = async (...args) => {
		chromiumTrace("driver.quit.begin", {
			userDataDir,
		});
		try {
			return await originalQuit(...args);
		} finally {
			cleanupChromeProcesses(chromiumBinaryPath, userDataDir);
			fs.rmSync(userDataDir, { recursive: true, force: true });
			chromiumTrace("driver.quit.complete", {
				userDataDir,
			});
		}
	};

	return driver;
}

export default {
	id: "chromium",
	label: "Chromium",
	createDriver,
};
