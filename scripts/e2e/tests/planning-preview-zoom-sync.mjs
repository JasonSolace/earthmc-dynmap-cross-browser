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
const PREVIEW_ZOOM_SEQUENCE_UP = [1, 2, 3, 4, 5];
const PREVIEW_ZOOM_SEQUENCE_DOWN = [4, 3, 2, 1, 0];
const PREVIEW_NATION = {
	id: "planning-preview-zoom-sync-nation",
	name: "Planning Preview Zoom Sync Nation",
	color: "#00d084",
	outlineColor: "#ff00ff",
	center: PLACEMENT_COORDS,
	rangeRadiusBlocks: PREVIEW_RANGE_BLOCKS,
};
const PLANNER_STORAGE_KEY = "emcdynmapplus-planner-nations";
const PLANNER_ARMED_KEY = "emcdynmapplus-planning-placement-armed";
const PUBLISHED_TILE_ZOOM_ATTR = "data-emcdynmapplus-tile-zoom";
const DIAMETER_TOLERANCE_PX = 12;
const CHANGE_THRESHOLD_PX = 60;
const EXPECTED_CURSOR_DIAMETER_BY_ZOOM = {
	0: 258,
	1: 508,
	2: 1007,
	3: 2010,
	4: 4016,
	5: 8028,
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

	throw new Error(`Unsupported browser for planning preview zoom sync test: ${browserId}`);
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

async function collectSnapshot(driver) {
	return driver.executeScript(`
		const helper = window.EMCDYNMAPPLUS_PAGE_PLANNING_DEBUG;
		return {
			cursorPreview: helper?.getCursorPreviewMetrics?.() ?? null,
			renderedNation: helper?.measureRenderedNation?.({
				outlineColor: arguments[0],
				tolerance: 28,
				minAlpha: 64,
			}) ?? null,
		};
	`, PREVIEW_NATION.outlineColor);
}

async function waitForPreviewDiameterChange(driver, previousDiameter) {
	await driver.wait(
		async () => {
			const snapshot = await collectSnapshot(driver);
			const nextDiameter = snapshot?.cursorPreview?.ringBounds?.width ?? null;
			return Number.isFinite(nextDiameter)
				&& Math.abs(nextDiameter - previousDiameter) >= CHANGE_THRESHOLD_PX;
		},
		UI_TIMEOUT_MS,
		`Preview diameter did not change by at least ${CHANGE_THRESHOLD_PX}px.`,
	);
}

async function clickZoomControl(driver, selector, description) {
	await clickExtensionControl(driver, selector, description);
	await driver.sleep(MAP_SETTLE_DELAY_MS);
}

function assertClose(actual, expected, tolerance, label) {
	assert(Number.isFinite(actual), `${label} was not numeric. actual=${actual}`);
	const delta = Math.abs(actual - expected);
	assert(delta <= tolerance, `${label} was outside tolerance. actual=${actual}, expected=${expected}, tolerance=${tolerance}, delta=${delta}`);
	return delta;
}

async function runPlanningPreviewZoomSyncTest({ browser, headless }) {
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

		const startUrl = buildMapUrl(BASE_MAP_URL, PLACEMENT_COORDS, 0);
		console.log("Starting planning preview zoom sync test:", {
			browser: browser.label,
			url: startUrl,
			headless: headless ?? null,
			rangeBlocks: PREVIEW_RANGE_BLOCKS,
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
		await armPreview(driver);

		const moveResult = await moveCursorToMapCenter(driver);
		assert(moveResult?.ok, `Could not move cursor over map. details=${JSON.stringify(moveResult)}`);
		await driver.sleep(250);

		const zoom0 = await collectSnapshot(driver);
		const initialPreviewDiameterPx = zoom0.cursorPreview?.ringBounds?.width ?? null;
		assertClose(
			initialPreviewDiameterPx,
			EXPECTED_CURSOR_DIAMETER_BY_ZOOM[0],
			DIAMETER_TOLERANCE_PX,
			"Initial zoom0 preview diameter",
		);
		assert(
			zoom0.cursorPreview?.zoomLevel === 0,
			`Initial preview zoom level was incorrect. actual=${zoom0.cursorPreview?.zoomLevel}, expected=0`,
		);

		const upwardResults = [];
		let previousPreviewDiameterPx = initialPreviewDiameterPx;
		for (const zoom of PREVIEW_ZOOM_SEQUENCE_UP) {
			await clickZoomControl(driver, ".leaflet-control-zoom-in", `zoom in control to ${zoom}`);
			await waitForPreviewDiameterChange(driver, previousPreviewDiameterPx);
			const snapshot = await collectSnapshot(driver);
			const cursorPreviewDiameterPx = snapshot.cursorPreview?.ringBounds?.width ?? null;
			const deltaFromExpected = assertClose(
				cursorPreviewDiameterPx,
				EXPECTED_CURSOR_DIAMETER_BY_ZOOM[zoom],
				DIAMETER_TOLERANCE_PX,
				`Zoom${zoom} preview diameter after zoom without mousemove`,
			);
			assert(
				snapshot.cursorPreview?.zoomLevel === zoom,
				`Preview zoom level after zoom-in was incorrect. actual=${snapshot.cursorPreview?.zoomLevel}, expected=${zoom}`,
			);
			upwardResults.push({
				zoom,
				cursorPreviewDiameterPx,
				deltaFromExpected,
				zoomLevel: snapshot.cursorPreview?.zoomLevel ?? null,
				zoomSource: snapshot.cursorPreview?.zoomSource ?? null,
			});
			previousPreviewDiameterPx = cursorPreviewDiameterPx;
		}

		const downwardResults = [];
		for (const zoom of PREVIEW_ZOOM_SEQUENCE_DOWN) {
			await clickZoomControl(driver, ".leaflet-control-zoom-out", `zoom out control to ${zoom}`);
			await waitForPreviewDiameterChange(driver, previousPreviewDiameterPx);
			const snapshot = await collectSnapshot(driver);
			const cursorPreviewDiameterPx = snapshot.cursorPreview?.ringBounds?.width ?? null;
			const deltaFromExpected = assertClose(
				cursorPreviewDiameterPx,
				EXPECTED_CURSOR_DIAMETER_BY_ZOOM[zoom],
				DIAMETER_TOLERANCE_PX,
				`Zoom${zoom} preview diameter after zoom without mousemove`,
			);
			assert(
				snapshot.cursorPreview?.zoomLevel === zoom,
				`Preview zoom level after zoom-out was incorrect. actual=${snapshot.cursorPreview?.zoomLevel}, expected=${zoom}`,
			);
			downwardResults.push({
				zoom,
				cursorPreviewDiameterPx,
				deltaFromExpected,
				zoomLevel: snapshot.cursorPreview?.zoomLevel ?? null,
				zoomSource: snapshot.cursorPreview?.zoomSource ?? null,
			});
			previousPreviewDiameterPx = cursorPreviewDiameterPx;
		}

		const summary = {
			initial: {
				zoom: 0,
				cursorPreviewDiameterPx: initialPreviewDiameterPx,
				zoomLevel: zoom0.cursorPreview?.zoomLevel ?? null,
				zoomSource: zoom0.cursorPreview?.zoomSource ?? null,
			},
			upwardResults,
			downwardResults,
		};
		console.log("Planning preview zoom sync summary:", summary);
	} finally {
		try {
			await clearPlanningState(driver);
		} catch {}
		await driver.quit();
	}
}

export default {
	id: "planning-preview-zoom-sync",
	description: "Assert armed cursor preview resizes after on-page zoom without extra mouse movement",
	run: runPlanningPreviewZoomSyncTest,
};
