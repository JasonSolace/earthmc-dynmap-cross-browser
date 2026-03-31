import fs from "node:fs";
import path from "node:path";
import { By, until } from "selenium-webdriver";
import { assert, getE2EMapUrl } from "../lib/shared.mjs";

const MAP_URL = getE2EMapUrl({
	testKey: "E2E_PLANNING_MAP_URL",
	defaultUrl: "https://map.earthmc.net/",
});
const PAGE_LOAD_TIMEOUT_MS = 30000;
const SIDEBAR_TIMEOUT_MS = 15000;
const UI_TIMEOUT_MS = 15000;
const PLACEMENT_COORDS = { x: 14288, z: -3330 };
const PLANNER_STORAGE_KEY = "emcdynmapplus-planner-nations";
const PLANNER_ARMED_KEY = "emcdynmapplus-planning-placement-armed";
const PLANNER_DEBUG_STATE_KEY = "emcdynmapplus-planning-debug-state";
const PLANNING_PLACE_EVENT = "EMCDYNMAPPLUS_PLACE_PLANNING_NATION";

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

	throw new Error(`Unsupported browser for planning test: ${browserId}`);
}

async function waitForSidebar(driver) {
	await driver.wait(until.elementLocated(By.css("#sidebar")), SIDEBAR_TIMEOUT_MS);
}

function isDocumentUnloadedError(error) {
	const message = error?.message || String(error);
	return message.includes("Document was unloaded");
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

async function getPlanningStateWithRetry(driver) {
	try {
		return await getPlanningState(driver);
	} catch (error) {
		if (!isDocumentUnloadedError(error)) throw error;
		await waitForUiReady(driver);
		return getPlanningState(driver);
	}
}

async function getPlanningLayerSummaryWithRetry(driver) {
	try {
		return await getPlanningLayerSummary(driver);
	} catch (error) {
		if (!isDocumentUnloadedError(error)) throw error;
		await waitForUiReady(driver);
		return getPlanningLayerSummary(driver);
	}
}

async function waitForPlanningLayerState(driver, shouldExist) {
	await driver.wait(
		async () => {
			const summary = await getPlanningLayerSummaryWithRetry(driver);
			if (!summary?.ok) return false;
			return shouldExist
				? summary.hasPlanningLayer && summary.planningLayerMarkerCount >= 2
				: !summary.hasPlanningLayer;
		},
		UI_TIMEOUT_MS,
		shouldExist
			? "Planning layer did not appear after placement."
			: "Planning layer did not disappear after removal.",
	);

	return getPlanningLayerSummaryWithRetry(driver);
}

async function clickExtensionControl(driver, selector, description) {
	const result = await driver.executeScript(`
		const element = document.querySelector(arguments[0]);
		if (!(element instanceof HTMLElement)) {
			return { ok: false, reason: 'missing' };
		}

		element.scrollIntoView({ block: 'center', inline: 'nearest' });
		element.click();
		return {
			ok: true,
			tagName: element.tagName,
			text: element.textContent ?? '',
			disabled: 'disabled' in element ? !!element.disabled : false,
		};
	`, selector);

	assert(
		result?.ok,
		`Could not activate ${description}. details=${JSON.stringify(result)}`,
	);
	return result;
}

async function ensureSidebarOpen(driver) {
	await waitForSidebar(driver);
	const openResult = await driver.executeScript(`
		const sidebar = document.querySelector('#sidebar');
		const summary = document.querySelector('#sidebar-toggle');
		if (!(sidebar instanceof HTMLDetailsElement)) {
			return { ok: false, reason: 'missing-sidebar' };
		}

		if (!sidebar.open && summary instanceof HTMLElement) {
			summary.click();
		}
		if (!sidebar.open) {
			sidebar.open = true;
			try {
				localStorage.setItem('emcdynmapplus-sidebar-expanded', 'true');
			} catch {}
		}

		return {
			ok: true,
			open: sidebar.open,
			hasSummary: summary instanceof HTMLElement,
		};
	`);
	assert(
		openResult?.ok,
		`Could not open sidebar. details=${JSON.stringify(openResult)}`,
	);

	await driver.wait(
		async () =>
			driver.executeScript(`
				const sidebar = document.querySelector('#sidebar');
				const content = document.querySelector('#sidebar-content');
				if (!sidebar || !content) return false;
				const style = getComputedStyle(content);
				return sidebar.open && style.display !== 'none' && style.visibility !== 'hidden';
			`),
		UI_TIMEOUT_MS,
		"Sidebar did not open.",
	);
}

async function clearPlanningState(driver) {
	await driver.executeScript(
		`
			localStorage.setItem(arguments[0], JSON.stringify([]));
			localStorage.setItem(arguments[1], 'false');
		`,
		PLANNER_STORAGE_KEY,
		PLANNER_ARMED_KEY,
	);
}

async function switchToPlanningMode(driver) {
	await ensureSidebarOpen(driver);
	const switched = await driver.executeScript(`
		const select = document.querySelector('#map-mode-select');
		const applyButton = document.querySelector('#switch-map-mode');
		if (!select || !applyButton) return false;
		select.value = 'planning';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		applyButton.click();
		return true;
	`);
	assert(switched, "Could not switch the sidebar UI to planning mode.");

	await driver.wait(
		async () =>
			driver.executeScript(`
				return localStorage.getItem('emcdynmapplus-mapmode') === 'planning'
					&& !!document.querySelector('#planning-place-button');
			`),
		UI_TIMEOUT_MS,
		"Planning mode UI never appeared after switching modes.",
	);
}

async function getPlanningState(driver) {
	return driver.executeScript(`
		let nations = [];
		let debugState = null;
		try {
			nations = JSON.parse(localStorage.getItem(arguments[0]) || '[]');
		} catch {
			nations = [];
		}
		try {
			debugState = JSON.parse(localStorage.getItem(arguments[2]) || 'null');
		} catch {
			debugState = null;
		}

		return {
			mapMode: localStorage.getItem('emcdynmapplus-mapmode'),
			armed: localStorage.getItem(arguments[1]),
			debugState,
			nationCount: nations.length,
			nations,
			placeButtonText: document.querySelector('#planning-place-button')?.textContent ?? null,
			removeButtonText: document.querySelector('#planning-remove-button')?.textContent ?? null,
			centerLabel: document.querySelector('#planning-center-label')?.textContent ?? null,
			rangeValue: document.querySelector('#planning-range-input')?.value ?? null,
		};
	`, PLANNER_STORAGE_KEY, PLANNER_ARMED_KEY, PLANNER_DEBUG_STATE_KEY);
}

async function getPlanningLayerSummary(driver) {
	return driver.executeAsyncScript(`
		const done = arguments[arguments.length - 1];
		fetch('/tiles/minecraft_overworld/markers.json', { cache: 'no-store' })
			.then(async response => {
				const data = await response.json();
				const planningLayer = Array.isArray(data)
					? data.find(layer => layer?.id === 'planning-nations')
					: null;
				done({
					ok: true,
					layerCount: Array.isArray(data) ? data.length : null,
					hasPlanningLayer: !!planningLayer,
					planningLayerMarkerCount: Array.isArray(planningLayer?.markers)
						? planningLayer.markers.length
						: 0,
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

async function armPlanningPlacement(driver) {
	await ensureSidebarOpen(driver);
	await clickExtensionControl(driver, "#planning-place-button", "planning place button");

	await driver.wait(
		async () =>
			driver.executeScript(`
				return localStorage.getItem(arguments[0]) === 'true'
					&& document.querySelector('#planning-place-button')?.textContent === 'Click Map To Place';
			`, PLANNER_ARMED_KEY),
		UI_TIMEOUT_MS,
		"Planning placement did not arm after pressing the place button.",
	);
}

async function simulateMapPlacement(driver, coords) {
	const result = await driver.executeScript(`
		const coordsControl = document.querySelector('.leaflet-control-layers.coordinates');
		if (coordsControl instanceof HTMLElement) {
			coordsControl.textContent = \`X ${arguments[0]} Z ${arguments[1]}\`;
		}

		document.dispatchEvent(new CustomEvent(arguments[2], {
			detail: {
				source: 'e2e-test',
				center: { x: arguments[0], z: arguments[1] },
			},
		}));

		return {
			ok: true,
			coordsText: coordsControl?.textContent ?? null,
			eventName: arguments[2],
			hasCoordsControl: !!coordsControl,
		};
	`, coords.x, coords.z, PLANNING_PLACE_EVENT);

	assert(
		result?.ok,
		`Could not simulate map placement. details=${JSON.stringify(result)}`,
	);
}

async function waitForPlacedNation(driver) {
	await driver.wait(
		async () => {
			const state = await getPlanningStateWithRetry(driver);
			return state?.nationCount === 1
				&& state?.armed === "false"
				&& state?.nations?.[0]?.center?.x === PLACEMENT_COORDS.x
				&& state?.nations?.[0]?.center?.z === PLACEMENT_COORDS.z;
		},
		UI_TIMEOUT_MS,
		`Planning nation was never stored after placement.`,
	);
}

async function waitForRemovedNation(driver) {
	await driver.wait(
		async () => {
			const state = await getPlanningStateWithRetry(driver);
			return state?.nationCount === 0 && state?.armed === "false";
		},
		UI_TIMEOUT_MS,
		"Planning nation was never removed from storage.",
	);
}

async function runPlanningFlowTest({ browser, headless }) {
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

		console.log("Starting planning test:", {
			browser: browser.label,
			url: MAP_URL,
			headless: headless ?? null,
		});

		await driver.get(MAP_URL);
		await waitForSidebar(driver);
		await clearPlanningState(driver);
		await driver.navigate().refresh();
		await waitForSidebar(driver);
		await switchToPlanningMode(driver);

		const initialState = await getPlanningState(driver);
		const initialLayerSummary = await getPlanningLayerSummary(driver);
		console.log("Initial planning state:", initialState);
		console.log("Initial planning layer summary:", initialLayerSummary);

		assert(initialState.mapMode === "planning", `Expected planning mode, got ${initialState.mapMode}`);
		assert(initialState.nationCount === 0, `Expected no planning nations before test, got ${initialState.nationCount}`);
		assert(initialLayerSummary.ok, `Failed to fetch markers.json before placement: ${initialLayerSummary.error || "unknown error"}`);
		assert(!initialLayerSummary.hasPlanningLayer, "Planning layer unexpectedly existed before placement.");

		await armPlanningPlacement(driver);
		const armedState = await getPlanningStateWithRetry(driver);
		console.log("Armed planning state:", armedState);
		assert(armedState.armed === "true", `Expected armed placement state, got ${armedState.armed}`);

		const placementDispatchResult = await simulateMapPlacement(driver, PLACEMENT_COORDS);
		let postDispatchState = null;
		try {
			postDispatchState = await getPlanningStateWithRetry(driver);
		} catch (error) {
			console.warn("Could not capture immediate post-dispatch planning state:", error?.message || String(error));
		}
		console.log("Planning placement dispatch result:", placementDispatchResult);
		console.log("Planning state immediately after placement dispatch:", postDispatchState);
		await waitForPlacedNation(driver);
		await waitForUiReady(driver);

		const placedState = await getPlanningStateWithRetry(driver);
		const placedLayerSummary = await waitForPlanningLayerState(driver, true);
		console.log("Placed planning state:", placedState);
		console.log("Placed planning layer summary:", placedLayerSummary);

		assert(placedLayerSummary.ok, `Failed to fetch markers.json after placement: ${placedLayerSummary.error || "unknown error"}`);
		assert(
			placedLayerSummary.planningLayerMarkerCount >= 2,
			`Planning layer had unexpected marker count after placement: ${placedLayerSummary.planningLayerMarkerCount}`,
		);

		await ensureSidebarOpen(driver);
		await clickExtensionControl(driver, "#planning-remove-button", "planning remove button");
		await waitForRemovedNation(driver);
		await waitForUiReady(driver);

		const removedState = await getPlanningStateWithRetry(driver);
		const removedLayerSummary = await waitForPlanningLayerState(driver, false);
		console.log("Removed planning state:", removedState);
		console.log("Removed planning layer summary:", removedLayerSummary);

		assert(removedLayerSummary.ok, `Failed to fetch markers.json after removal: ${removedLayerSummary.error || "unknown error"}`);
		assert(removedState.nationCount === 0, `Expected no planning nations after removal, got ${removedState.nationCount}`);
	} catch (error) {
		try {
			console.log("Planning failure state snapshot:", await getPlanningStateWithRetry(driver));
			console.log("Planning failure layer snapshot:", await getPlanningLayerSummaryWithRetry(driver));
		} catch (snapshotError) {
			console.warn("Could not capture planning failure snapshots:", snapshotError?.message || String(snapshotError));
		}
		throw error;
	} finally {
		await driver.quit();
	}
}

export default {
	id: "planning",
	description: "Planning create/remove nation flow",
	run: runPlanningFlowTest,
};
