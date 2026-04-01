import fs from "node:fs";
import path from "node:path";
import { By, until } from "selenium-webdriver";
import { assert, getE2EMapUrl } from "../lib/shared.mjs";

const BASE_MAP_URL = getE2EMapUrl({
	testKey: "E2E_PLANNING_MAP_URL",
	defaultUrl: "https://map.earthmc.net/",
});
const PAGE_LOAD_TIMEOUT_MS = 30000;
const SIDEBAR_TIMEOUT_MS = 15000;
const UI_TIMEOUT_MS = 20000;
const MAP_AUTH_TIMEOUT_MS = 10000;
const MAP_SETTLE_DELAY_MS = 1200;
const PLACEMENT_COORDS = { x: 14288, z: -3330 };
const CALIBRATION_RANGE_BLOCKS = 1000;
const CALIBRATION_ZOOMS = [0, 1, 2];
const PLANNER_STORAGE_KEY = "emcdynmapplus-planner-nations";
const PLANNER_ARMED_KEY = "emcdynmapplus-planning-placement-armed";
const PUBLISHED_TILE_ZOOM_ATTR = "data-emcdynmapplus-tile-zoom";
const CALIBRATION_NATION = {
	id: "planning-calibration-nation",
	name: "Planning Calibration Nation",
	color: "#00d084",
	outlineColor: "#ff00ff",
	center: PLACEMENT_COORDS,
	rangeRadiusBlocks: CALIBRATION_RANGE_BLOCKS,
};

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

	throw new Error(`Unsupported browser for planning calibration test: ${browserId}`);
}

function buildMapUrl(baseUrl, { x, z }, zoom = 1) {
	const url = new URL(baseUrl);
	url.searchParams.set("world", "minecraft_overworld");
	url.searchParams.set("zoom", String(zoom));
	url.searchParams.set("x", String(x));
	url.searchParams.set("z", String(z));
	return url.toString();
}

async function waitForSidebar(driver) {
	await driver.wait(until.elementLocated(By.css("#sidebar")), SIDEBAR_TIMEOUT_MS);
}

async function waitForUiReady(driver) {
	await waitForSidebar(driver);
	await driver.wait(
		async () =>
			driver.executeScript(`
				return document.readyState === 'complete' || document.readyState === 'interactive';
			`),
		UI_TIMEOUT_MS,
		"Page did not reach an interactive ready state.",
	);
}

async function waitForMapInteractive(driver, phase = "unknown") {
	await waitForUiReady(driver);
	await driver.wait(
		async () =>
			driver.executeScript(`
				const tileZoom = document.documentElement.getAttribute(arguments[0]);
				const mapPane = document.querySelector(".leaflet-map-pane");
				const zoomIn = document.querySelector(".leaflet-control-zoom-in");
				const zoomOut = document.querySelector(".leaflet-control-zoom-out");
				const coords = document.querySelector(".leaflet-control-layers.coordinates");
				return {
					hasTileZoom: tileZoom != null && tileZoom !== "",
					hasMapPane: mapPane instanceof HTMLElement,
					hasZoomControls: zoomIn instanceof HTMLElement && zoomOut instanceof HTMLElement,
					hasCoordinates: coords instanceof HTMLElement,
					coordinatesText: coords?.textContent?.trim?.() || null,
				};
			`, PUBLISHED_TILE_ZOOM_ATTR),
		MAP_AUTH_TIMEOUT_MS,
		`Map did not become interactive during ${phase}.`,
	);
	await driver.sleep(MAP_SETTLE_DELAY_MS);
	const readiness = await driver.executeScript(`
		const tileZoom = document.documentElement.getAttribute(arguments[0]);
		const coords = document.querySelector(".leaflet-control-layers.coordinates");
		return {
			tileZoom: tileZoom == null || tileZoom === "" ? null : Number(tileZoom),
			coordinatesText: coords?.textContent?.trim?.() || null,
			readyState: document.readyState,
		};
	`, PUBLISHED_TILE_ZOOM_ATTR);
	console.log(`Planning calibration map readiness (${phase}):`, readiness);
	return readiness;
}

async function clickExtensionControl(driver, selector, description) {
	const result = await driver.executeScript(`
		const element = document.querySelector(arguments[0]);
		if (!(element instanceof HTMLElement)) return { ok: false, reason: "missing" };
		element.scrollIntoView({ block: "center", inline: "nearest" });
		element.click();
		return {
			ok: true,
			tagName: element.tagName,
			text: element.textContent ?? "",
		};
	`, selector);

	assert(result?.ok, `Could not activate ${description}. details=${JSON.stringify(result)}`);
	return result;
}

async function ensureSidebarOpen(driver) {
	await waitForSidebar(driver);
	const openResult = await driver.executeScript(`
		const sidebar = document.querySelector("#sidebar");
		const summary = document.querySelector("#sidebar-toggle");
		if (!(sidebar instanceof HTMLDetailsElement)) {
			return { ok: false, reason: "missing-sidebar" };
		}

		if (!sidebar.open && summary instanceof HTMLElement) summary.click();
		if (!sidebar.open) {
			sidebar.open = true;
			try {
				localStorage.setItem("emcdynmapplus-sidebar-expanded", "true");
			} catch {}
		}

		return { ok: true, open: sidebar.open };
	`);

	assert(openResult?.ok, `Could not open sidebar. details=${JSON.stringify(openResult)}`);
	await driver.wait(
		async () =>
			driver.executeScript(`
				const sidebar = document.querySelector("#sidebar");
				const content = document.querySelector("#sidebar-content");
				if (!sidebar || !content) return false;
				const style = getComputedStyle(content);
				return sidebar.open && style.display !== "none" && style.visibility !== "hidden";
			`),
		UI_TIMEOUT_MS,
		"Sidebar did not open.",
	);
}

async function clearPlanningState(driver) {
	await driver.executeScript(
		`
			localStorage.setItem(arguments[0], JSON.stringify([]));
			localStorage.setItem(arguments[1], "false");
		`,
		PLANNER_STORAGE_KEY,
		PLANNER_ARMED_KEY,
	);
}

async function switchToPlanningMode(driver) {
	await ensureSidebarOpen(driver);
	const switched = await driver.executeScript(`
		const select = document.querySelector("#map-mode-select");
		const applyButton = document.querySelector("#switch-map-mode");
		if (!select || !applyButton) return false;
		select.value = "planning";
		select.dispatchEvent(new Event("change", { bubbles: true }));
		applyButton.click();
		return true;
	`);
	assert(switched, "Could not switch the sidebar UI to planning mode.");

	await driver.wait(
		async () =>
			driver.executeScript(`
				return localStorage.getItem("emcdynmapplus-mapmode") === "planning"
					&& !!document.querySelector("#planning-place-button");
			`),
		UI_TIMEOUT_MS,
		"Planning mode UI never appeared after switching modes.",
	);
}

async function ensurePlanningModeUi(driver) {
	const hasPlanningUi = await driver.executeScript(`
		return localStorage.getItem("emcdynmapplus-mapmode") === "planning"
			&& !!document.querySelector("#planning-place-button");
	`);
	if (hasPlanningUi) return;
	await switchToPlanningMode(driver);
}

async function seedCalibrationNation(driver) {
	await driver.executeScript(
		`
			localStorage.setItem(arguments[0], JSON.stringify([arguments[1]]));
			localStorage.setItem(arguments[2], "false");
		`,
		PLANNER_STORAGE_KEY,
		CALIBRATION_NATION,
		PLANNER_ARMED_KEY,
	);
}

async function getPublishedTileZoom(driver) {
	return driver.executeScript(`
		const raw = document.documentElement.getAttribute(arguments[0]);
		if (raw == null || raw === "") return null;
		const parsed = Number(raw);
		return Number.isFinite(parsed) ? parsed : raw;
	`, PUBLISHED_TILE_ZOOM_ATTR);
}

async function navigateToCalibrationZoom(driver, requestedZoom) {
	const targetUrl = buildMapUrl(BASE_MAP_URL, PLACEMENT_COORDS, requestedZoom);
	await driver.get(targetUrl);
	const readiness = await waitForMapInteractive(driver, `navigate-zoom-${requestedZoom}`);
	await ensurePlanningModeUi(driver);
	await ensureSidebarOpen(driver);
	return {
		targetUrl,
		requestedZoom,
		reachedZoom: readiness?.tileZoom ?? null,
		readiness,
	};
}

async function measureRenderedNation(driver) {
	return driver.executeScript(`
		return window.EMCDYNMAPPLUS_PAGE_PLANNING_DEBUG?.measureRenderedNation?.({
			outlineColor: arguments[0],
			tolerance: 28,
			minAlpha: 64,
		}) ?? { ok: false, reason: "missing-helper" };
	`, CALIBRATION_NATION.outlineColor);
}

async function waitForRenderedNationMeasurement(driver) {
	await driver.wait(
		async () => {
			const measurement = await measureRenderedNation(driver);
			return measurement?.ok === true;
		},
		UI_TIMEOUT_MS,
		"Rendered planning nation measurement never became ready.",
	);

	await driver.sleep(600);
	return measureRenderedNation(driver);
}

async function armPreview(driver) {
	await ensureSidebarOpen(driver);
	const alreadyArmed = await driver.executeScript(`
		return localStorage.getItem(arguments[0]) === "true";
	`, PLANNER_ARMED_KEY);
	if (alreadyArmed) return;

	await clickExtensionControl(driver, "#planning-place-button", "planning reposition button");
	await driver.wait(
		async () =>
			driver.executeScript(`
				return localStorage.getItem(arguments[0]) === "true";
			`, PLANNER_ARMED_KEY),
		UI_TIMEOUT_MS,
		"Planning preview never armed.",
	);
}

async function moveCursorToMapCenter(driver) {
	return driver.executeScript(`
		const mapPane = document.querySelector(".leaflet-map-pane");
		if (!(mapPane instanceof HTMLElement)) {
			return { ok: false, reason: "missing-map-pane" };
		}

		const rect = mapPane.getBoundingClientRect();
		const clientX = Math.round(rect.left + rect.width / 2);
		const clientY = Math.round(rect.top + rect.height / 2);
		mapPane.dispatchEvent(new MouseEvent("mousemove", {
			bubbles: true,
			cancelable: true,
			clientX,
			clientY,
			view: window,
		}));

		return { ok: true, clientX, clientY };
	`);
}

async function getCursorPreviewMetrics(driver) {
	return driver.executeScript(`
		return window.EMCDYNMAPPLUS_PAGE_PLANNING_DEBUG?.getCursorPreviewMetrics?.() ?? { ok: false, reason: "missing-helper" };
	`);
}

async function waitForCursorPreviewMetrics(driver) {
	await driver.wait(
		async () => {
			const metrics = await getCursorPreviewMetrics(driver);
			return metrics?.ok === true;
		},
		UI_TIMEOUT_MS,
		"Cursor preview metrics never became available.",
	);

	return getCursorPreviewMetrics(driver);
}

async function runPlanningCalibrationTest({ browser, headless }) {
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

	try {
		await driver.manage().setTimeouts({
			pageLoad: PAGE_LOAD_TIMEOUT_MS,
			script: PAGE_LOAD_TIMEOUT_MS,
		});

		const mapUrl = buildMapUrl(BASE_MAP_URL, PLACEMENT_COORDS, 1);
		console.log("Starting planning calibration test:", {
			browser: browser.label,
			url: mapUrl,
			headless: headless ?? null,
			zooms: CALIBRATION_ZOOMS,
		});

		await driver.get(mapUrl);
		await waitForMapInteractive(driver, "initial-load");
		await clearPlanningState(driver);
		await driver.navigate().refresh();
		await waitForMapInteractive(driver, "after-clear-refresh");
		await switchToPlanningMode(driver);
		await seedCalibrationNation(driver);
		await driver.navigate().refresh();
		await waitForMapInteractive(driver, "after-seed-refresh");

		const results = [];
		for (const zoom of CALIBRATION_ZOOMS) {
			const navigation = await navigateToCalibrationZoom(driver, zoom);
			const renderedMeasurement = await waitForRenderedNationMeasurement(driver);
			await armPreview(driver);

			const moveResult = await moveCursorToMapCenter(driver);
			assert(moveResult?.ok, `Could not move cursor over map. details=${JSON.stringify(moveResult)}`);
			const cursorPreview = await waitForCursorPreviewMetrics(driver);

			const previewDiameterPx = cursorPreview?.ringBounds?.width ?? null;
			const renderedDiameterPx = renderedMeasurement?.renderedDiameterPx ?? null;
			const previewDeltaPx = Number.isFinite(previewDiameterPx) && Number.isFinite(renderedDiameterPx)
				? Number((previewDiameterPx - renderedDiameterPx).toFixed(2))
				: null;

			const result = {
				requestedZoom: zoom,
				reachedZoom: navigation.reachedZoom,
				navigationUrl: navigation.targetUrl,
				renderedDiameterPx,
				blocksPerPixel: renderedMeasurement?.blocksPerPixel ?? null,
				rangeCssBounds: renderedMeasurement?.rangeMeasurement?.cssBounds ?? null,
				matchCount: renderedMeasurement?.rangeMeasurement?.matchCount ?? null,
				cursorPreviewDiameterPx: previewDiameterPx,
				cursorPreviewCenterPx: cursorPreview?.centerBounds?.width ?? null,
				previewDeltaPx,
			};
			results.push(result);
			console.log(`Planning calibration zoom ${zoom}:`, result);
		}

		console.log("Planning calibration summary:", results);
		assert(results.length > 0, "Calibration test did not collect any zoom results.");
		for (const result of results) {
			assert(Number.isFinite(result.renderedDiameterPx), `Rendered diameter was missing for requested zoom ${result.requestedZoom}.`);
			assert(Number.isFinite(result.blocksPerPixel), `Blocks-per-pixel was missing for requested zoom ${result.requestedZoom}.`);
		}
	} finally {
		try {
			await clearPlanningState(driver);
		} catch {}
		await driver.quit();
	}
}

export default {
	id: "planning-calibration",
	suite: "diagnostic",
	description: "Measure rendered planning nation size by zoom and log calibration data",
	run: runPlanningCalibrationTest,
};
