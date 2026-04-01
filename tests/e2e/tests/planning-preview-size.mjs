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
const PREVIEW_RANGE_BLOCKS = 1000;
const LARGE_PREVIEW_RANGE_BLOCKS = 3500;
const PREVIEW_ZOOMS = [0, 1, 2];
const LARGE_PREVIEW_ZOOMS = [0, 1, 2, 3, 4];
const DIAMETER_TOLERANCE_PX = 8;
const DELTA_TOLERANCE_PX = 8;
const LARGE_PREVIEW_DIAMETER_TOLERANCE_PX = 16;
const EXPECTED_RENDERED_DIAMETER_BY_ZOOM = {
	0: 254,
	1: 504,
	2: 1003,
};
const EXPECTED_CURSOR_DIAMETER_BY_ZOOM = {
	0: 258,
	1: 508,
	2: 1007,
};
const EXPECTED_LARGE_CURSOR_RAW_DIAMETER_BY_ZOOM = {
	0: 889,
	1: 1764,
	2: 3511,
	3: 7022,
	4: 14042,
};
const PLANNER_STORAGE_KEY = "emcdynmapplus-planner-nations";
const PLANNER_ARMED_KEY = "emcdynmapplus-planning-placement-armed";
const PUBLISHED_TILE_ZOOM_ATTR = "data-emcdynmapplus-tile-zoom";
const PREVIEW_NATION = {
	id: "planning-preview-size-nation",
	name: "Planning Preview Size Nation",
	color: "#00d084",
	outlineColor: "#ff00ff",
	center: PLACEMENT_COORDS,
	rangeRadiusBlocks: PREVIEW_RANGE_BLOCKS,
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

	throw new Error(`Unsupported browser for planning preview size test: ${browserId}`);
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
				return document.readyState === "complete" || document.readyState === "interactive";
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
				return tileZoom != null && tileZoom !== ""
					&& mapPane instanceof HTMLElement
					&& zoomIn instanceof HTMLElement
					&& zoomOut instanceof HTMLElement;
			`, PUBLISHED_TILE_ZOOM_ATTR),
		MAP_AUTH_TIMEOUT_MS,
		`Map did not become interactive during ${phase}.`,
	);
	await driver.sleep(MAP_SETTLE_DELAY_MS);
}

async function clickExtensionControl(driver, selector, description) {
	const result = await driver.executeScript(`
		const element = document.querySelector(arguments[0]);
		if (!(element instanceof HTMLElement)) return { ok: false, reason: "missing" };
		element.scrollIntoView({ block: "center", inline: "nearest" });
		element.click();
		return { ok: true, text: element.textContent ?? "" };
	`, selector);

	assert(result?.ok, `Could not activate ${description}. details=${JSON.stringify(result)}`);
	return result;
}

async function ensureSidebarOpen(driver) {
	await waitForSidebar(driver);
	await driver.executeScript(`
		const sidebar = document.querySelector("#sidebar");
		const summary = document.querySelector("#sidebar-toggle");
		if (!(sidebar instanceof HTMLDetailsElement)) return false;
		if (!sidebar.open && summary instanceof HTMLElement) summary.click();
		if (!sidebar.open) {
			sidebar.open = true;
			try {
				localStorage.setItem("emcdynmapplus-sidebar-expanded", "true");
			} catch {}
		}
		return true;
	`);
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

async function seedPreviewNation(driver) {
	await driver.executeScript(
		`
			localStorage.setItem(arguments[0], JSON.stringify([arguments[1]]));
			localStorage.setItem(arguments[2], "false");
		`,
		PLANNER_STORAGE_KEY,
		PREVIEW_NATION,
		PLANNER_ARMED_KEY,
	);
}

async function seedPlanningNation(driver, nation) {
	await driver.executeScript(
		`
			localStorage.setItem(arguments[0], JSON.stringify([arguments[1]]));
			localStorage.setItem(arguments[2], "false");
		`,
		PLANNER_STORAGE_KEY,
		nation,
		PLANNER_ARMED_KEY,
	);
}

async function navigateToPreviewZoom(driver, requestedZoom) {
	const targetUrl = buildMapUrl(BASE_MAP_URL, PLACEMENT_COORDS, requestedZoom);
	await driver.get(targetUrl);
	await waitForMapInteractive(driver, `navigate-zoom-${requestedZoom}`);
	await ensurePlanningModeUi(driver);
	await ensureSidebarOpen(driver);
	return targetUrl;
}

async function armPreview(driver) {
	const alreadyArmed = await driver.executeScript(`
		return localStorage.getItem(arguments[0]) === "true";
	`, PLANNER_ARMED_KEY);
	if (alreadyArmed) return;

	await ensureSidebarOpen(driver);
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
		if (!(mapPane instanceof HTMLElement)) return { ok: false, reason: "missing-map-pane" };
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

async function collectPreviewSnapshot(driver) {
	return driver.executeScript(`
		const helper = window.EMCDYNMAPPLUS_PAGE_PLANNING_DEBUG;
		return {
			cursorPreview: helper?.getCursorPreviewMetrics?.() ?? null,
			renderedNation: helper?.measureRenderedNation?.({
				outlineColor: arguments[0],
				tolerance: 28,
				minAlpha: 64,
			}) ?? null,
			projectionSignals: helper?.getProjectionSignals?.() ?? null,
		};
	`, PREVIEW_NATION.outlineColor);
}

function assertWithinTolerance(actual, expected, tolerance, label) {
	assert(
		Number.isFinite(actual),
		`${label} was not numeric. actual=${actual}`,
	);
	const delta = Math.abs(actual - expected);
	assert(
		delta <= tolerance,
		`${label} was outside tolerance. actual=${actual}, expected=${expected}, tolerance=${tolerance}, delta=${delta}`,
	);
	return delta;
}

async function runPlanningPreviewSizeTest({ browser, headless }) {
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

		const startUrl = buildMapUrl(BASE_MAP_URL, PLACEMENT_COORDS, 1);
		console.log("Starting planning preview size test:", {
			browser: browser.label,
			url: startUrl,
			headless: headless ?? null,
			zooms: PREVIEW_ZOOMS,
			largeRangeZooms: LARGE_PREVIEW_ZOOMS,
			tolerancePx: DIAMETER_TOLERANCE_PX,
		});

		await driver.get(startUrl);
		await waitForMapInteractive(driver, "initial-load");
		await clearPlanningState(driver);
		await driver.navigate().refresh();
		await waitForMapInteractive(driver, "after-clear-refresh");
		await switchToPlanningMode(driver);
		await seedPreviewNation(driver);
		await driver.navigate().refresh();
		await waitForMapInteractive(driver, "after-seed-refresh");

		const results = [];
		for (const zoom of PREVIEW_ZOOMS) {
			const targetUrl = await navigateToPreviewZoom(driver, zoom);
			await armPreview(driver);
			const moveResult = await moveCursorToMapCenter(driver);
			assert(moveResult?.ok, `Could not move cursor over map. details=${JSON.stringify(moveResult)}`);
			await driver.sleep(250);

			const snapshot = await collectPreviewSnapshot(driver);
			const renderedDiameterPx = snapshot.renderedNation?.renderedDiameterPx ?? null;
			const cursorPreviewDiameterPx = snapshot.cursorPreview?.ringBounds?.width ?? null;
			const previewDeltaPx = Number.isFinite(cursorPreviewDiameterPx) && Number.isFinite(renderedDiameterPx)
				? Number((cursorPreviewDiameterPx - renderedDiameterPx).toFixed(2))
				: null;

			const expectedRendered = EXPECTED_RENDERED_DIAMETER_BY_ZOOM[zoom];
			const expectedCursor = EXPECTED_CURSOR_DIAMETER_BY_ZOOM[zoom];
			const renderedDeltaFromExpected = assertWithinTolerance(
				renderedDiameterPx,
				expectedRendered,
				DIAMETER_TOLERANCE_PX,
				`Rendered diameter for zoom ${zoom}`,
			);
			const cursorDeltaFromExpected = assertWithinTolerance(
				cursorPreviewDiameterPx,
				expectedCursor,
				DIAMETER_TOLERANCE_PX,
				`Cursor preview diameter for zoom ${zoom}`,
			);
			const cursorVsRenderDelta = assertWithinTolerance(
				Math.abs(previewDeltaPx),
				0,
				DELTA_TOLERANCE_PX,
				`Cursor/render delta for zoom ${zoom}`,
			);

			const result = {
				requestedZoom: zoom,
				targetUrl,
				expectedRenderedDiameterPx: expectedRendered,
				renderedDiameterPx,
				renderedDeltaFromExpected,
				expectedCursorDiameterPx: expectedCursor,
				cursorPreviewDiameterPx,
				cursorDeltaFromExpected,
				previewDeltaPx,
				cursorVsRenderDelta,
				cursorPreviewCenterPx: snapshot.cursorPreview?.centerBounds?.width ?? null,
				blocksPerPixel: snapshot.renderedNation?.blocksPerPixel ?? null,
				projectionZoomSource: snapshot.projectionSignals?.zoomSource ?? null,
				projectionZoomLevel: snapshot.projectionSignals?.zoomLevel ?? null,
			};
			results.push(result);
			console.log(`Planning preview size zoom ${zoom}:`, result);
		}

		const largeRangeNation = {
			...PREVIEW_NATION,
			id: "planning-preview-size-large-range-nation",
			name: "Planning Preview Size Large Range Nation",
			rangeRadiusBlocks: LARGE_PREVIEW_RANGE_BLOCKS,
		};
		await seedPlanningNation(driver, largeRangeNation);
		await driver.navigate().refresh();
		await waitForMapInteractive(driver, "after-large-range-refresh");

		const largeRangeResults = [];
		for (const zoom of LARGE_PREVIEW_ZOOMS) {
			const targetUrl = await navigateToPreviewZoom(driver, zoom);
			await armPreview(driver);
			const moveResult = await moveCursorToMapCenter(driver);
			assert(moveResult?.ok, `Could not move cursor over map for large range case. details=${JSON.stringify(moveResult)}`);
			await driver.sleep(250);

			const snapshot = await collectPreviewSnapshot(driver);
			const cursorPreviewDiameterPx = snapshot.cursorPreview?.ringBounds?.width ?? null;
			const rawCursorPreviewDiameterPx = snapshot.cursorPreview?.rawDiameterPx ?? null;
			const cursorPreviewWasClamped = snapshot.cursorPreview?.diameterWasClamped ?? null;
			const expectedRawCursor = EXPECTED_LARGE_CURSOR_RAW_DIAMETER_BY_ZOOM[zoom];
			const rawCursorDeltaFromExpected = assertWithinTolerance(
				rawCursorPreviewDiameterPx,
				expectedRawCursor,
				LARGE_PREVIEW_DIAMETER_TOLERANCE_PX,
				`Large-range raw cursor preview diameter for zoom ${zoom}`,
			);
			assert(
				cursorPreviewWasClamped === false,
				`Large-range cursor preview was unexpectedly clamped at zoom ${zoom}. raw=${rawCursorPreviewDiameterPx}, visible=${cursorPreviewDiameterPx}`,
			);

			const result = {
				requestedZoom: zoom,
				targetUrl,
				expectedRawCursorDiameterPx: expectedRawCursor,
				rawCursorPreviewDiameterPx,
				rawCursorDeltaFromExpected,
				cursorPreviewDiameterPx,
				cursorPreviewWasClamped,
				cursorPreviewCenterPx: snapshot.cursorPreview?.centerBounds?.width ?? null,
				projectionZoomSource: snapshot.projectionSignals?.zoomSource ?? null,
				projectionZoomLevel: snapshot.projectionSignals?.zoomLevel ?? null,
			};
			largeRangeResults.push(result);
			console.log(`Planning preview size large-range zoom ${zoom}:`, result);
		}

		console.log("Planning preview size summary:", results);
		console.log("Planning preview size large-range summary:", largeRangeResults);
		assert(results.length === PREVIEW_ZOOMS.length, "Planning preview size test did not collect all zoom results.");
		assert(largeRangeResults.length === LARGE_PREVIEW_ZOOMS.length, "Planning preview size test did not collect all large-range zoom results.");
	} finally {
		try {
			await clearPlanningState(driver);
		} catch {}
		await driver.quit();
	}
}

export default {
	id: "planning-preview-size",
	suite: "diagnostic",
	description: "Assert cursor preview diameter matches expected calibrated values by zoom",
	run: runPlanningPreviewSizeTest,
};
