import fs from "node:fs";
import path from "node:path";
import { By, until } from "selenium-webdriver";
import { assert, getE2EMapUrl } from "../lib/shared.mjs";

const MAP_URL = getE2EMapUrl({
	testKey: "E2E_ARCHIVE_MAP_URL",
	defaultUrl: "https://map.earthmc.net/",
});
const ARCHIVE_DATE = "20251103";
const ARCHIVE_LABEL_DATE = "2025-11-03";
const PAGE_LOAD_TIMEOUT_MS = 30000;
const SIDEBAR_TIMEOUT_MS = 15000;

function getArtifactInfo(browserId) {
	if (browserId === "firefox") {
		return {
			path: path.resolve("dist", "emc-dynmapplus-firefox.xpi"),
			buildCommand: "npm run extension:firefox",
			description: "Firefox package",
		};
	}

	if (browserId === "chromium") {
		return {
			path: path.resolve("dist", "chromium"),
			buildCommand: "npm run extension:chromium",
			description: "Chromium extension directory",
		};
	}

	throw new Error(`Unsupported browser for archive test: ${browserId}`);
}

async function getNavigationDiagnostics(driver) {
	const diagnostics = {
		currentUrl: null,
		readyState: null,
		hasSidebar: null,
		localStorageAccessible: null,
		domCounts: null,
		extensionMarkers: null,
		error: null,
	};

	try {
		diagnostics.currentUrl = await driver.getCurrentUrl();
	} catch (err) {
		diagnostics.currentUrl = `error: ${err.message}`;
	}

	try {
		const scriptData = await driver.executeScript(`
			let localStorageAccessible = false;
			try {
				localStorageAccessible = !!localStorage;
			} catch (err) {
				localStorageAccessible = false;
			}

			return {
				href: window.location.href,
				readyState: document.readyState,
				hasSidebar: !!document.querySelector('#sidebar'),
				localStorageAccessible,
				domCounts: {
					extensionSidebar: document.querySelectorAll('.leaflet-top.leaflet-left > #sidebar').length,
					pageSidebar: document.querySelectorAll('body > #sidebar').length,
					serverInfo: document.querySelectorAll('#server-info').length,
					archiveLabels: document.querySelectorAll('#current-map-mode-label').length,
					alerts: document.querySelectorAll('#alert').length,
					scripts: document.scripts.length,
				},
				extensionMarkers: {
					rootInitialized: document.documentElement?.getAttribute('data-emcdynmapplus-initialized'),
					pageMarkersPresent: !!window.EMCDYNMAPPLUS_PAGE_MARKERS,
					debugFlag: (() => {
						try {
							return localStorage.getItem('emcdynmapplus-debug');
						} catch {
							return null;
						}
					})(),
					mapMode: (() => {
						try {
							return localStorage.getItem('emcdynmapplus-mapmode');
						} catch {
							return null;
						}
					})(),
					archiveDate: (() => {
						try {
							return localStorage.getItem('emcdynmapplus-archive-date');
						} catch {
							return null;
						}
					})(),
					extensionScriptCount: Array.from(document.scripts).filter(script =>
						typeof script.src === 'string' && script.src.startsWith('chrome-extension://')
					).length,
					extensionScriptUrls: Array.from(document.scripts)
						.map(script => script.src)
						.filter(src => typeof src === 'string' && src.startsWith('chrome-extension://'))
						.slice(0, 10),
				},
			};
		`);

		diagnostics.currentUrl = scriptData?.href ?? diagnostics.currentUrl;
		diagnostics.readyState = scriptData?.readyState ?? null;
		diagnostics.hasSidebar = scriptData?.hasSidebar ?? null;
		diagnostics.localStorageAccessible =
			scriptData?.localStorageAccessible ?? null;
		diagnostics.domCounts = scriptData?.domCounts ?? null;
		diagnostics.extensionMarkers = scriptData?.extensionMarkers ?? null;
	} catch (err) {
		diagnostics.error = err.message;
	}

	return diagnostics;
}

async function getUiSnapshot(driver) {
	return driver.executeScript(`
		return {
			href: window.location.href,
			readyState: document.readyState,
			timeOrigin: performance.timeOrigin,
			mapMode: localStorage.getItem('emcdynmapplus-mapmode'),
			archiveDate: localStorage.getItem('emcdynmapplus-archive-date'),
			archiveLabels: Array.from(document.querySelectorAll('#current-map-mode-label')).map(el => el.textContent || ''),
			archiveLabelCount: document.querySelectorAll('#current-map-mode-label').length,
			extensionSidebarCount: document.querySelectorAll('.leaflet-top.leaflet-left > #sidebar').length,
			pageSidebarCount: document.querySelectorAll('body > #sidebar').length,
			serverInfoCount: document.querySelectorAll('#server-info').length,
			nationClaimsCount: document.querySelectorAll('#nation-claims').length,
			alertCount: document.querySelectorAll('#alert').length,
			extensionRootInitialized: document.documentElement?.getAttribute('data-emcdynmapplus-initialized'),
			pageMarkersPresent: !!window.EMCDYNMAPPLUS_PAGE_MARKERS,
			extensionScriptUrls: Array.from(document.scripts)
				.map(script => script.src)
				.filter(src => typeof src === 'string' && src.startsWith('chrome-extension://'))
				.slice(0, 10),
		}
	`);
}

async function getMarkersSummary(driver) {
	return driver.executeAsyncScript(`
		const done = arguments[arguments.length - 1];
		fetch('/tiles/minecraft_overworld/markers.json', { cache: 'no-store' })
			.then(async response => {
				const data = await response.json();
				const markerLayer = Array.isArray(data)
					? data.find(layer => layer?.id === 'towny' && Array.isArray(layer?.markers))
						|| data.find(layer => Array.isArray(layer?.markers))
					: null;
				done({
					ok: true,
					layerCount: Array.isArray(data) ? data.length : null,
					markerCount: markerLayer ? markerLayer.markers.length : null,
					markerLayerId: markerLayer?.id ?? null,
					layerIds: Array.isArray(data) ? data.map(layer => layer?.id ?? null) : [],
				});
			})
			.catch(error => {
				done({
					ok: false,
					error: String(error),
				});
			});
	`);
}

async function runArchiveSmokeTest({ browser, headless }) {
	const artifact = getArtifactInfo(browser.id);
	if (!fs.existsSync(artifact.path)) {
		throw new Error(
			`Missing ${artifact.description}: ${artifact.path}. Run "${artifact.buildCommand}" first.`,
		);
	}

	const driver = await browser.createDriver({
		extensionPath: artifact.path,
		headless,
	});
	const logs = [];

	try {
		let hasLiveLogCapture = false;

		if (typeof browser.tryAttachConsoleCapture === "function") {
			try {
				hasLiveLogCapture = await browser.tryAttachConsoleCapture(driver, logs);
			} catch (err) {
				console.warn(
					`Console capture unavailable in this ${browser.label} Selenium setup:`,
					err.message,
				);
			}
		}

		await driver.manage().setTimeouts({
			pageLoad: PAGE_LOAD_TIMEOUT_MS,
			script: PAGE_LOAD_TIMEOUT_MS,
		});

		console.log("Extension artifact diagnostics:", {
			browser: browser.label,
			artifactPath: artifact.path,
			exists: fs.existsSync(artifact.path),
			manifestPath: browser.id === "chromium"
				? path.join(artifact.path, "manifest.json")
				: artifact.path,
			manifestExists: browser.id === "chromium"
				? fs.existsSync(path.join(artifact.path, "manifest.json"))
				: fs.existsSync(artifact.path),
		});

		console.log("Starting navigation:", {
			browser: browser.label,
			url: MAP_URL,
			headless: headless ?? null,
			pageLoadStrategy: "eager",
			pageLoadTimeoutMs: PAGE_LOAD_TIMEOUT_MS,
		});

		try {
			await driver.get(MAP_URL);
			console.log("Navigation returned from driver.get");
			console.log(
				"Navigation diagnostics after driver.get:",
				await getNavigationDiagnostics(driver),
			);
		} catch (err) {
			console.error("Navigation failed or timed out during driver.get:", {
				name: err.name,
				message: err.message,
			});
			const diagnostics = await getNavigationDiagnostics(driver);
			console.log("Navigation diagnostics after driver.get failure:", diagnostics);

			if (
				!(
					diagnostics.hasSidebar ||
					diagnostics.readyState === "interactive" ||
					diagnostics.readyState === "complete"
				)
			) {
				throw err;
			}

			console.warn(
				"Proceeding after navigation failure because partial page state is available.",
			);
		}

		try {
			await driver.wait(
				until.elementLocated(By.css("#sidebar")),
				SIDEBAR_TIMEOUT_MS,
			);
			console.log("Sidebar located after navigation.");
		} catch (err) {
			console.error("Sidebar did not appear after navigation:", {
				name: err.name,
				message: err.message,
			});
			console.log(
				"Navigation diagnostics after sidebar wait failure:",
				await getNavigationDiagnostics(driver),
			);
			throw err;
		}

		const liveSnapshot = await getUiSnapshot(driver);
		console.log("Initial live UI snapshot:", liveSnapshot);

		const liveMarkers = await getMarkersSummary(driver);
		console.log("Initial live markers summary:", liveMarkers);

		await driver.executeScript(
			`
				localStorage.setItem('emcdynmapplus-mapmode', 'archive');
				localStorage.setItem('emcdynmapplus-archive-date', arguments[0]);
			`,
			ARCHIVE_DATE,
		);

		console.log("Archive state written to localStorage:", {
			mapMode: "archive",
			archiveDate: ARCHIVE_DATE,
		});

		await driver.navigate().refresh();

		await driver.wait(
			async () => {
				const text = await driver.executeScript(
					`return document.querySelector('#current-map-mode-label')?.textContent ?? ''`,
				);
				return text.includes(ARCHIVE_LABEL_DATE);
			},
			15000,
			"Archive label never showed requested archive date.",
		);

		const archiveLabelSnapshot = await getUiSnapshot(driver);
		console.log("Archive label appeared snapshot:", archiveLabelSnapshot);

		const archiveMarkersFirst = await getMarkersSummary(driver);
		console.log("First archive markers summary:", archiveMarkersFirst);

		const timeline = [];
		for (let i = 1; i <= 7; i++) {
			await driver.sleep(1000);
			const snapshot = await getUiSnapshot(driver);
			timeline.push(snapshot);
			console.log(`Archive timeline snapshot ${i}:`, snapshot);
		}

		const archiveMarkersSecond = await getMarkersSummary(driver);
		console.log("Second archive markers summary:", archiveMarkersSecond);

		const finalLabel = await driver.executeScript(
			`return document.querySelector('#current-map-mode-label')?.textContent ?? ''`,
		);

		assert(
			finalLabel.includes(ARCHIVE_LABEL_DATE),
			`Archive label did not persist. Final label: ${finalLabel}`,
		);
		assert(
			archiveLabelSnapshot.archiveLabelCount === 1,
			`Archive UI rendered duplicate labels immediately after load. count=${archiveLabelSnapshot.archiveLabelCount}`,
		);
		assert(
			liveMarkers.ok,
			`Failed to fetch live markers summary: ${liveMarkers.error || "unknown error"}`,
		);
		assert(
			archiveMarkersFirst.ok,
			`Failed to fetch first archive markers summary: ${archiveMarkersFirst.error || "unknown error"}`,
		);
		assert(
			archiveMarkersSecond.ok,
			`Failed to fetch second archive markers summary: ${archiveMarkersSecond.error || "unknown error"}`,
		);
		assert(
			archiveMarkersFirst.markerCount !== liveMarkers.markerCount,
			`Archive markers did not differ from live markers. live=${liveMarkers.markerCount}, archive=${archiveMarkersFirst.markerCount}`,
		);
		assert(
			archiveMarkersSecond.markerCount === archiveMarkersFirst.markerCount,
			`Archive marker count did not persist. first=${archiveMarkersFirst.markerCount}, second=${archiveMarkersSecond.markerCount}`,
		);
		assert(
			!finalLabel.includes(`(${ARCHIVE_LABEL_DATE}) (${ARCHIVE_LABEL_DATE})`),
			`Archive label duplicated the archive date in the final UI. finalLabel=${finalLabel}`,
		);

		if (hasLiveLogCapture) {
			const joined = logs.join("\n");

			if (joined.includes("timed out waiting for modified markers event")) {
				throw new Error(
					"Archive bridge timed out and likely fell back to live markers.",
				);
			}

			if (
				joined.includes("markers were not modified, returning original response")
			) {
				throw new Error("Archive markers fell back to original live markers.");
			}
		} else {
			console.warn(
				`Live ${browser.label} console capture is unavailable in this Selenium setup.`,
			);
			console.warn(
				"This run asserted DOM-visible archive state and marker payload stability.",
			);
		}

		const timelineOrigins = [
			...new Set(timeline.map((snapshot) => snapshot.timeOrigin)),
		];
		const duplicateLabelFrames = timeline.filter(
			(snapshot) => snapshot.archiveLabelCount > 1,
		);
		const duplicateExtensionSidebarFrames = timeline.filter(
			(snapshot) => snapshot.extensionSidebarCount > 1,
		);

		console.log("Archive timeline summary:", {
			browser: browser.label,
			uniqueTimeOrigins: timelineOrigins,
			duplicateLabelFrames: duplicateLabelFrames.length,
			duplicateExtensionSidebarFrames: duplicateExtensionSidebarFrames.length,
			finalLabel,
			liveMarkerCount: liveMarkers.markerCount,
			archiveMarkerCountFirst: archiveMarkersFirst.markerCount,
			archiveMarkerCountSecond: archiveMarkersSecond.markerCount,
		});
	} finally {
		await driver.quit();
	}
}

export default {
	id: "archive",
	description: "Archive persistence smoke test",
	run: runArchiveSmokeTest,
};
