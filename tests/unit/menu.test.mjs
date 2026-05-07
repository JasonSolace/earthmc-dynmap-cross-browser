import test from "node:test";
import assert from "node:assert/strict";

import { loadPlainScript, loadPlainScripts } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

function findById(node, id) {
	if (!node || typeof node !== "object") return null;
	if (node.id === id) return node;
	for (const child of node.children || []) {
		const result = findById(child, id);
		if (result) return result;
	}
	return null;
}

function findByLabel(node, text) {
	if (!node || typeof node !== "object") return null;
	if (node.textContent === text) return node;
	for (const child of node.children || []) {
		const result = findByLabel(child, text);
		if (result) return result;
	}
	return null;
}

function findByTitle(node, title) {
	if (!node || typeof node !== "object") return null;
	if (node.getAttribute?.("title") === title) return node;
	for (const child of node.children || []) {
		const result = findByTitle(child, title);
		if (result) return result;
	}
	return null;
}

function enableRecursiveIdQueries(element) {
	if (!element || typeof element !== "object") return element;
	element.querySelector = function querySelector(selector) {
		if (typeof selector === "string" && selector.startsWith("#")) {
			return findById(this, selector.slice(1));
		}
		return null;
	};
	return element;
}

function enableToggleAttribute(element) {
	if (!element || typeof element !== "object") return element;
	element.toggleAttribute = function toggleAttribute(name, force) {
		const shouldEnable =
			force == null ? this.getAttribute(name) == null : Boolean(force);
		if (shouldEnable) {
			this.setAttribute(name, "");
			return true;
		}
		this.removeAttribute(name);
		return false;
	};
	return element;
}

function createElementFactory(document) {
	return function createElement(tagName, props = {}, children = []) {
		const element = enableRecursiveIdQueries(document.createElement(tagName));
		if (props.id) element.id = props.id;
		if (props.className) element.className = props.className;
		if (props.text) element.textContent = props.text;
		if (props.htmlFor) element.htmlFor = props.htmlFor;
		if (props.type) element.type = props.type;
		if (props.placeholder) element.placeholder = props.placeholder;
		if (props.value != null) element.value = props.value;
		if (props.hidden != null) element.hidden = props.hidden;
		if (props.disabled != null) element.disabled = props.disabled;
		if (props.attrs) {
			for (const [name, value] of Object.entries(props.attrs)) {
				element.setAttribute(name, value);
			}
		}
		for (const child of children) {
			if (child != null) element.appendChild(child);
		}
		return element;
	};
}

function addElementFactory() {
	return function addElement(parent, child) {
		parent.appendChild(child);
		return child;
	};
}

function addSidebarSectionFactory(document) {
	return function addSidebarSection(parent) {
		const section = enableRecursiveIdQueries(document.createElement("section"));
		parent.appendChild(section);
		return section;
	};
}

function loadMenu(options = {}) {
	const { extraGlobals = {}, ...rest } = options;
	return loadPlainScripts(
		[
			"resources/planning-state.js",
			"resources/planning-runtime.js",
			"resources/planning-projection.js",
			"src/menu-planning-preview.js",
			"src/menu-planning.js",
			"src/menu-map-controls.js",
			"src/menu-options.js",
			"src/menu-sidebar.js",
			"src/menu.js",
		],
		[
			"DEFAULT_MAP_MODE",
			"PLANNING_LEAFLET_ZOOM_ATTR",
			"getPreferredLiveMapMode",
			"formatMapModeLabel",
			"addMainMenu",
			"addOptions",
			"syncDynmapPlusLayerOptions",
			"resolveLinkedDynmapPlusLayerToggleChanges",
			"parseZoomFromTileUrl",
			"getPlanningPreviewScaleInfo",
			"getScaledPreviewDiameterMetrics",
			"getPlanningCursorPreviewDebugInfo",
			"normalizePlanningRange",
			"normalizePlanningNation",
			"searchArchive",
			"isValidArchiveDateInput",
		],
		{
			...rest,
			extraGlobals: {
				ARCHIVE_DATE: {
					MIN: "2022-05-01",
					MAX: "2026-03-31",
				},
				...extraGlobals,
			},
		},
	);
}

test("menu chooses a stable live mode preference", () => {
	const { exports, localStorage } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "archive",
			"emcdynmapplus-last-live-mapmode": "alliances",
		},
	});

	assert.equal(exports.getPreferredLiveMapMode(), "alliances");
	localStorage["emcdynmapplus-last-live-mapmode"] = "archive";
	assert.equal(exports.getPreferredLiveMapMode("overclaim"), "overclaim");
	assert.equal(exports.getPreferredLiveMapMode("archive"), exports.DEFAULT_MAP_MODE);
});

test("menu defaults fresh installs to the live map mode", () => {
	const { exports } = loadMenu();

	assert.equal(exports.DEFAULT_MAP_MODE, "default");
	assert.equal(exports.getPreferredLiveMapMode(), "default");
	assert.equal(exports.formatMapModeLabel(exports.DEFAULT_MAP_MODE), "View: Live Map");
});

test("menu formats archive and live mode labels", () => {
	const { exports } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-archive-date": "20260330",
		},
	});

	assert.equal(exports.formatMapModeLabel("archive"), "Archive Snapshot: 2026-03-30");
	assert.equal(exports.formatMapModeLabel("meganations"), "View: Mega Nations");
	assert.equal(exports.formatMapModeLabel("archive", ""), "Archive Snapshot");
});

test("menu parses tile zooms from live tile URLs", () => {
	const { exports } = loadMenu();

	assert.equal(
		exports.parseZoomFromTileUrl(
			"https://map.earthmc.net/tiles/minecraft_overworld/3/0_0.png",
		),
		3,
	);
	assert.equal(
		exports.parseZoomFromTileUrl(
			"https://map.earthmc.net/tiles/minecraft_overworld/-1/0_0.webp?cache=1",
		),
		-1,
	);
	assert.equal(exports.parseZoomFromTileUrl("https://example.com/nope.png"), null);
});

test("menu uses measured planning zoom data when the map publishes it", () => {
	const { exports, document } = loadMenu();
	document.documentElement.setAttribute(
		exports.PLANNING_LEAFLET_ZOOM_ATTR,
		"3",
	);

	assert.deepEqual(normalize(exports.getPlanningPreviewScaleInfo()), {
		zoomLevel: 3,
		zoomSource: "leaflet",
		urlZoom: 1,
		leafletZoom: 3,
		runtimeZoom: null,
		runtimeZoomSource: null,
		publishedTileZoom: null,
		dominantTileZoom: null,
		tileImageZoom: null,
		publishedTileUrl: null,
		tileSrc: null,
		tileSummary: null,
		mapContainer: null,
		tilePaneScale: null,
		tileLayerScale: null,
		mapPaneScale: null,
		overlayCanvasScale: null,
		effectiveZoomFromTilePaneScale: null,
		effectiveZoomFromTileLayerScale: null,
		liveMeasuredBlocksPerPixel: null,
		blocksPerPixel: 0.997009,
		calibrationMode: "measured-table",
	});
});

test("menu falls back cleanly when no planning zoom signals are available", () => {
	const { exports, location } = loadMenu({
		locationHref: "https://map.earthmc.net/",
	});

	assert.equal(exports.getPlanningPreviewScaleInfo().calibrationMode, "zoom-fallback");
	assert.equal(exports.getPlanningPreviewScaleInfo().blocksPerPixel, 3.968254);
	location.href = "https://map.earthmc.net/";
	assert.deepEqual(normalize(exports.getScaledPreviewDiameterMetrics(100000)), {
		rawDiameterPx: 50400,
		previewDiameterPx: 32767,
		wasClamped: true,
	});
});

test("menu derives planning preview scale for negative leaflet zooms", () => {
	const { exports, document } = loadMenu();
	document.documentElement.setAttribute(
		exports.PLANNING_LEAFLET_ZOOM_ATTR,
		"-1",
	);

	assert.equal(exports.getPlanningPreviewScaleInfo().zoomLevel, -1);
	assert.equal(exports.getPlanningPreviewScaleInfo().calibrationMode, "derived-fallback");
	assert.equal(exports.getPlanningPreviewScaleInfo().blocksPerPixel, 15.873016);
	assert.deepEqual(normalize(exports.getScaledPreviewDiameterMetrics(5000)), {
		rawDiameterPx: 630,
		previewDiameterPx: 630,
		wasClamped: false,
	});
});

test("menu prefers live render measurements for planning preview scale", () => {
	const { exports, document } = loadMenu();
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-ready",
		"true",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-blocks-per-pixel",
		"12.5",
	);
	document.documentElement.setAttribute(
		exports.PLANNING_LEAFLET_ZOOM_ATTR,
		"-1",
	);

	assert.equal(exports.getPlanningPreviewScaleInfo().zoomLevel, -1);
	assert.equal(
		exports.getPlanningPreviewScaleInfo().calibrationMode,
		"live-render-measured",
	);
	assert.equal(exports.getPlanningPreviewScaleInfo().blocksPerPixel, 12.5);
	assert.equal(
		exports.getPlanningPreviewScaleInfo().liveMeasuredBlocksPerPixel,
		12.5,
	);
	assert.deepEqual(normalize(exports.getScaledPreviewDiameterMetrics(5000)), {
		rawDiameterPx: 800,
		previewDiameterPx: 800,
		wasClamped: false,
	});
});

test("menu prefers exact projected preview diameter over scalar live measurements", () => {
	const { context, document } = loadMenu();
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-ready",
		"true",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-map-blocks-per-pixel",
		"20",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-preview-exact-kind",
		"nation",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-preview-exact-range-blocks",
		"5000",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-preview-exact-diameter-px",
		"312",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-preview-exact-mode",
		"exact-projected",
	);

	const debugInfo =
		context.EMCDYNMAPPLUS_MENU_PLANNING.getPlanningCursorPreviewDebugInfo();
	assert.equal(debugInfo.calibrationMode, "exact-projected");
	assert.equal(debugInfo.diameterMetrics.previewDiameterPx, 312);
	assert.equal(debugInfo.exactPreviewAttrs.diameterPx, "312");
});

test("menu prefers town-specific live render measurements for town preview scale", () => {
	const { exports, document } = loadMenu();
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-ready",
		"true",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-blocks-per-pixel",
		"12.5",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-town-blocks-per-pixel",
		"14.2",
	);
	document.documentElement.setAttribute(
		exports.PLANNING_LEAFLET_ZOOM_ATTR,
		"1",
	);

	assert.equal(
		exports.getPlanningPreviewScaleInfo({ kind: "town", label: "Add Town" })
			.blocksPerPixel,
		14.2,
	);
	assert.equal(
		exports.getPlanningPreviewScaleInfo({ kind: "town", label: "Add Town" })
			.liveMeasuredBlocksPerPixel,
		14.2,
	);
	assert.deepEqual(
		normalize(
			exports.getScaledPreviewDiameterMetrics(1500, {
				kind: "town",
				label: "Add Town",
			}),
		),
		{
			rawDiameterPx: 211,
			previewDiameterPx: 211,
			wasClamped: false,
		},
	);
});

test("menu falls back to generic live map measurements before any specific planning shape exists", () => {
	const { exports, document } = loadMenu();
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-ready",
		"true",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-map-blocks-per-pixel",
		"20",
	);
	document.documentElement.setAttribute(
		exports.PLANNING_LEAFLET_ZOOM_ATTR,
		"0",
	);

	assert.equal(
		exports.getPlanningPreviewScaleInfo({ kind: "nation", label: "Add Nation" })
			.blocksPerPixel,
		20,
	);
	assert.equal(
		exports.getPlanningPreviewScaleInfo({ kind: "town", label: "Add Town" })
			.blocksPerPixel,
		20,
	);
});

test("menu prefers generic live map measurements over shape-specific live measurements", () => {
	const { exports, document } = loadMenu();
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-ready",
		"true",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-map-blocks-per-pixel",
		"20",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-blocks-per-pixel",
		"12.5",
	);
	document.documentElement.setAttribute(
		"data-emcdynmapplus-planning-live-town-blocks-per-pixel",
		"14.2",
	);

	assert.equal(
		exports.getPlanningPreviewScaleInfo({ kind: "nation", label: "Planning Nation" })
			.blocksPerPixel,
		20,
	);
	assert.equal(
		exports.getPlanningPreviewScaleInfo({ kind: "town", label: "Add Town" })
			.blocksPerPixel,
		20,
	);
});

test("menu normalizes stored planning nation data", () => {
	const { exports, localStorage } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-planning-default-range": "4200",
		},
	});

	assert.equal(exports.normalizePlanningRange("401.6"), 402);
	assert.equal(exports.normalizePlanningRange("bad"), null);
	assert.deepEqual(
		normalize(
			exports.normalizePlanningNation({
			center: { x: 10.7, z: -4.2 },
			rangeRadiusBlocks: "8192.4",
			name: "",
			color: "",
			outlineColor: "",
			towns: [
				{
					name: "Alpha Town",
					x: 100.8,
					z: -55.2,
					rangeRadiusBlocks: "1000.9",
				},
				{
					name: "Beta Town",
					x: 90.2,
					z: 41.7,
				},
				{
					name: "Broken Town",
					x: "bad",
					z: 0,
				},
			],
			}),
		),
		{
			id: "hardcoded-demo-nation",
			name: "Planning Nation",
			color: "#d98936",
			outlineColor: "#fff3cf",
			rangeRadiusBlocks: 5000,
			center: { x: 11, z: -4 },
			towns: [
				{
					id: "hardcoded-demo-town-1",
					name: "Alpha Town",
					x: 101,
					z: -55,
					rangeRadiusBlocks: 1500,
				},
				{
					id: "hardcoded-demo-town-2",
					name: "Beta Town",
					x: 90,
					z: 42,
					rangeRadiusBlocks: 1500,
				},
			],
		},
	);
	localStorage["emcdynmapplus-planning-default-range"] = "3200";
	assert.equal(
		exports.normalizePlanningNation({
			center: { x: 1, z: 2 },
		}).rangeRadiusBlocks,
		5000,
	);
	localStorage["emcdynmapplus-planning-default-range"] = "0";
	assert.equal(
		exports.normalizePlanningNation({
			center: { x: 3, z: 4 },
		}).rangeRadiusBlocks,
		5000,
	);
});

test("menu validates archive dates before switching the extension into archive mode", () => {
	const alerts = [];
	const { exports, localStorage, location } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "meganations",
		},
		extraGlobals: {
			showAlert(message) {
				alerts.push(message);
			},
		},
	});

	exports.searchArchive("2022-04-30");
	assert.equal(alerts.length, 1);
	assert.equal(location.reloadCalled, 0);
	assert.equal(localStorage["emcdynmapplus-mapmode"], "meganations");

	exports.searchArchive("2026-03-30", "alliances");
	assert.equal(location.reloadCalled, 1);
	assert.equal(localStorage["emcdynmapplus-mapmode"], "archive");
	assert.equal(localStorage["emcdynmapplus-last-live-mapmode"], "alliances");
	assert.equal(localStorage["emcdynmapplus-archive-date"], "20260330");
	assert.equal(exports.isValidArchiveDateInput("2026-03-30"), true);
});

test("menu options dark-mode toggle reflects effective system-dark startup state", () => {
	const env = loadPlainScript("src/menu-options.js", [], {
		extraGlobals: {
			matchMedia(query) {
				return {
					matches: query === "(prefers-color-scheme: dark)",
				};
			},
		},
	});
	const optionsHelpers = env.context.EMCDYNMAPPLUS_MENU_OPTIONS.createMenuOptions({
		createElement(tagName, props = {}, children = []) {
			const element = env.document.createElement(tagName);
			if (props.id) element.id = props.id;
			if (props.className) element.className = props.className;
			if (props.text) element.textContent = props.text;
			if (props.htmlFor) element.htmlFor = props.htmlFor;
			if (props.type) element.type = props.type;
			if (props.attrs) {
				for (const [name, value] of Object.entries(props.attrs)) {
					element.setAttribute(name, value);
				}
			}
			for (const child of children) {
				if (child != null) element.appendChild(child);
			}
			return element;
		},
		addElement(parent, child) {
			parent.appendChild(child);
			return child;
		},
	});

	const layersList = env.document.createElement("div");
	const section = optionsHelpers.addOptions(layersList, "default");

	function findById(node, id) {
		if (!node || typeof node !== "object") return null;
		if (node.id === id) return node;
		for (const child of node.children || []) {
			const result = findById(child, id);
			if (result) return result;
		}
		return null;
	}

	const darkModeToggle = findById(section, "toggle-darkmode");
	assert.ok(darkModeToggle);
	assert.equal(darkModeToggle.checked, true);
});

test("menu options section rehomes Dynmap+ leaflet labels and preserves regular labels", () => {
	const { exports, document } = loadMenu({
		extraGlobals: {
			createElement(tagName, props = {}, children = []) {
				const element = document.createElement(tagName);
				if (props.id) element.id = props.id;
				if (props.className) element.className = props.className;
				if (props.text) element.textContent = props.text;
				if (props.htmlFor) element.htmlFor = props.htmlFor;
				if (props.type) element.type = props.type;
				if (props.value != null) element.value = props.value;
				if (props.attrs) {
					for (const [name, value] of Object.entries(props.attrs)) {
						element.setAttribute(name, value);
					}
				}
				for (const child of children) {
					if (child != null) element.appendChild(child);
				}
				return element;
			},
			addElement(parent, child) {
				parent.appendChild(child);
				return child;
			},
		},
	});

	const layersList = document.createElement("div");
	const dynmapLabel = document.createElement("label");
	dynmapLabel.dataset.emcdynmapplusLayerOwner = "dynmapplus";
	dynmapLabel.dataset.emcdynmapplusLayerSection = "dynmapplus";
	dynmapLabel.dataset.emcdynmapplusLayerId = "countryBorders";
	dynmapLabel.dataset.emcdynmapplusLayerName = "Country Borders";
	const dynmapInput = document.createElement("input");
	dynmapInput.className = "leaflet-control-layers-selector";
	dynmapInput.dataset.emcdynmapplusLayerId = "countryBorders";
	dynmapInput.dataset.emcdynmapplusLayerName = "Country Borders";
	dynmapLabel.__queryMap.set("input.leaflet-control-layers-selector", dynmapInput);

	const regularLabel = document.createElement("label");
	const regularInput = document.createElement("input");
	regularInput.className = "leaflet-control-layers-selector";
	regularLabel.__queryMap.set("input.leaflet-control-layers-selector", regularInput);

	layersList.__queryAllMap.set("label", [dynmapLabel, regularLabel]);
	layersList.children = [dynmapLabel, regularLabel];

	const section = exports.addOptions(layersList, "meganations");
	const optionsMenu = section.children.find((child) => child.id === "options-menu");

	assert.ok(section);
	assert.ok(optionsMenu);
	assert.equal(optionsMenu.children.includes(dynmapLabel), true);
	assert.equal(optionsMenu.children.includes(regularLabel), false);
});

test("menu options section dedupes rehomed Dynmap+ leaflet labels by layer id", () => {
	const { exports, document } = loadMenu({
		extraGlobals: {
			createElement(tagName, props = {}, children = []) {
				const element = document.createElement(tagName);
				if (props.id) element.id = props.id;
				if (props.className) element.className = props.className;
				if (props.text) element.textContent = props.text;
				if (props.htmlFor) element.htmlFor = props.htmlFor;
				if (props.type) element.type = props.type;
				if (props.value != null) element.value = props.value;
				if (props.attrs) {
					for (const [name, value] of Object.entries(props.attrs)) {
						element.setAttribute(name, value);
					}
				}
				for (const child of children) {
					if (child != null) element.appendChild(child);
				}
				return element;
			},
			addElement(parent, child) {
				parent.appendChild(child);
				return child;
			},
		},
	});

	const createDynmapLabel = () => {
		const label = document.createElement("label");
		label.dataset.emcdynmapplusLayerOwner = "dynmapplus";
		label.dataset.emcdynmapplusLayerSection = "dynmapplus";
		label.dataset.emcdynmapplusLayerId = "countryBorders";
		label.dataset.emcdynmapplusLayerName = "Country Borders";
		const input = document.createElement("input");
		input.className = "leaflet-control-layers-selector";
		input.dataset.emcdynmapplusLayerId = "countryBorders";
		input.dataset.emcdynmapplusLayerName = "Country Borders";
		label.__queryMap.set("input.leaflet-control-layers-selector", input);
		return label;
	};

	const layersList = document.createElement("div");
	const firstDynmapLabel = createDynmapLabel();
	const duplicateDynmapLabel = createDynmapLabel();
	layersList.__queryAllMap.set("label", [firstDynmapLabel, duplicateDynmapLabel]);
	layersList.children = [firstDynmapLabel, duplicateDynmapLabel];

	const section = exports.addOptions(layersList, "meganations");
	const optionsMenu = section.children.find((child) => child.id === "options-menu");
	optionsMenu.__queryAllMap.set("label", [firstDynmapLabel]);
	exports.syncDynmapPlusLayerOptions(layersList, optionsMenu);

	const borderLabels = optionsMenu.children.filter(
		(child) => child.dataset?.emcdynmapplusLayerId === "countryBorders",
	);
	const uniqueBorderLabels = [...new Set(borderLabels)];

	assert.equal(uniqueBorderLabels.length, 1);
});

test("menu keeps country and state border toggles mutually exclusive", () => {
	const { exports } = loadMenu();

	assert.deepEqual(
		Array.from(
			exports.resolveLinkedDynmapPlusLayerToggleChanges("stateBorders", true).entries(),
		),
		[
			["stateBorders", true],
			["countryBorders", false],
		],
	);
	assert.deepEqual(
		Array.from(
			exports.resolveLinkedDynmapPlusLayerToggleChanges("countryBorders", true).entries(),
		),
		[
			["countryBorders", true],
			["stateBorders", false],
		],
	);
	assert.deepEqual(
		Array.from(
			exports.resolveLinkedDynmapPlusLayerToggleChanges("stateBorders", false).entries(),
		),
		[["stateBorders", false]],
	);
});

test("menu shell builds the floating sidebar with the expected live mode label", () => {
	const { exports, document } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "meganations",
		},
		extraGlobals: {
			createElement(tagName, props = {}, children = []) {
				const element = document.createElement(tagName);
				if (props.id) element.id = props.id;
				if (props.className) element.className = props.className;
				if (props.text) element.textContent = props.text;
				if (props.htmlFor) element.htmlFor = props.htmlFor;
				if (props.type) element.type = props.type;
				if (props.value != null) element.value = props.value;
				if (props.attrs) {
					for (const [name, value] of Object.entries(props.attrs)) {
						element.setAttribute(name, value);
					}
				}
				for (const child of children) {
					if (child != null) element.appendChild(child);
				}
				return element;
			},
			addElement(parent, child) {
				parent.appendChild(child);
				return child;
			},
		},
	});

	const host = document.createElement("div");
	const sidebar = exports.addMainMenu(host);

	function findById(node, id) {
		if (!node || typeof node !== "object") return null;
		if (node.id === id) return node;
		for (const child of node.children || []) {
			const result = findById(child, id);
			if (result) return result;
		}
		return null;
	}

	function findByClass(node, className) {
		if (!node || typeof node !== "object") return null;
		if (
			typeof node.className === "string" &&
			node.className.split(/\s+/).includes(className)
		) {
			return node;
		}
		for (const child of node.children || []) {
			const result = findByClass(child, className);
			if (result) return result;
		}
		return null;
	}

	const modeLabel = findById(sidebar, "current-map-mode-label");
	assert.ok(sidebar);
	assert.equal(sidebar.id, "sidebar");
	assert.ok(modeLabel);
	assert.equal(modeLabel.textContent, "View: Mega Nations");
	assert.equal(findByClass(sidebar, "sidebar-eyebrow"), null);
	assert.equal(findByClass(sidebar, "sidebar-title"), null);
});

test("planning allows chaining towns from connected town ranges", () => {
	const alerts = [];
	const seedNation = {
		id: "nation-1",
		name: "Planning Nation",
		color: "#d98936",
		outlineColor: "#fff3cf",
		rangeRadiusBlocks: 5000,
		center: { x: 0, z: 0 },
		towns: [],
	};
	const { context, document, localStorage } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "planning",
			"emcdynmapplus-planning-mode": "planned",
			"emcdynmapplus-planner-nations": JSON.stringify([seedNation]),
		},
		extraGlobals: {
			createElement: null,
			addElement: null,
			addSidebarSection: null,
			getStoredCurrentMapMode() {
				return "planning";
			},
			showAlert(message) {
				alerts.push(message);
			},
		},
	});
	const createElement = createElementFactory(document);
	const addElement = addElementFactory();
	enableToggleAttribute(document.documentElement);
	context.createElement = createElement;
	context.addElement = addElement;
	context.addSidebarSection = addSidebarSectionFactory(document);
	const mapPane = document.createElement("div");
	mapPane.__closestMap.set(".leaflet-container", mapPane);
	document.body.appendChild(mapPane);

	const sidebar = document.createElement("div");
	context.EMCDYNMAPPLUS_MENU_PLANNING.addPlanningSection(sidebar);

	const placeTownButton = findById(sidebar, "planning-place-town-button");
	assert.ok(placeTownButton);
	placeTownButton.dispatchEvent({ type: "click", target: placeTownButton });

	document.dispatchEvent(
		new context.CustomEvent("EMCDYNMAPPLUS_PLACE_PLANNING_NATION", {
			detail: {
				center: { x: 5000, z: 0 },
				source: "test-first-town",
			},
		}),
	);
	placeTownButton.dispatchEvent({ type: "click", target: placeTownButton });
	document.dispatchEvent(
		new context.CustomEvent("EMCDYNMAPPLUS_PLACE_PLANNING_NATION", {
			detail: {
				center: { x: 6500, z: 0 },
				source: "test-chained-town",
			},
		}),
	);

	const savedNation = JSON.parse(localStorage["emcdynmapplus-planner-nations"])[0];
	assert.equal(
		alerts.includes(
			"Town centers must be placed within the nation range or a connected town range.",
		),
		false,
	);
	assert.equal(savedNation.towns.length, 2);
	assert.deepEqual(
		savedNation.towns.map((town) => ({ x: town.x, z: town.z })),
		[
			{ x: 5000, z: 0 },
			{ x: 6500, z: 0 },
		],
	);
});

test("planning keeps disconnected towns and marks them in the sidebar", () => {
	const alerts = [];
	const seedNation = {
		id: "nation-1",
		name: "Planning Nation",
		color: "#d98936",
		outlineColor: "#fff3cf",
		rangeRadiusBlocks: 5000,
		center: { x: 0, z: 0 },
		towns: [
			{
				id: "town-1",
				name: "Alpha Town",
				x: 6501,
				z: 0,
				rangeRadiusBlocks: 1500,
			},
		],
	};
	const { context, document, localStorage } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "planning",
			"emcdynmapplus-planning-mode": "planned",
			"emcdynmapplus-planner-nations": JSON.stringify([seedNation]),
		},
		extraGlobals: {
			createElement: null,
			addElement: null,
			addSidebarSection: null,
			getStoredCurrentMapMode() {
				return "planning";
			},
			showAlert(message) {
				alerts.push(message);
			},
		},
	});
	const createElement = createElementFactory(document);
	const addElement = addElementFactory();
	enableToggleAttribute(document.documentElement);
	context.createElement = createElement;
	context.addElement = addElement;
	context.addSidebarSection = addSidebarSectionFactory(document);
	const mapPane = document.createElement("div");
	mapPane.__closestMap.set(".leaflet-container", mapPane);
	document.body.appendChild(mapPane);

	const sidebar = document.createElement("div");
	context.EMCDYNMAPPLUS_MENU_PLANNING.addPlanningSection(sidebar);

	assert.equal(alerts.length, 0);
	const savedNation = JSON.parse(localStorage["emcdynmapplus-planner-nations"])[0];
	assert.equal(savedNation.rangeRadiusBlocks, 5000);
	const townList = findById(sidebar, "planning-town-list");
	assert.ok(townList);
	assert.equal(
		townList.children.some(
			(child) => child.getAttribute?.("data-state") === "disconnected",
		),
		true,
	);
});

test("planning uses fixed town range for existing and future planned towns", () => {
	const seedNation = {
		id: "nation-1",
		name: "Planning Nation",
		color: "#d98936",
		outlineColor: "#fff3cf",
		rangeRadiusBlocks: 5000,
		center: { x: 0, z: 0 },
		towns: [
			{
				id: "town-1",
				x: 1200,
				z: 0,
				rangeRadiusBlocks: 1500,
			},
			{
				id: "town-2",
				x: 2600,
				z: 0,
				rangeRadiusBlocks: 1800,
			},
		],
	};
	const { context, document, localStorage } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "planning",
			"emcdynmapplus-planning-mode": "planned",
			"emcdynmapplus-planner-nations": JSON.stringify([seedNation]),
		},
		extraGlobals: {
			createElement: null,
			addElement: null,
			addSidebarSection: null,
			getStoredCurrentMapMode() {
				return "planning";
			},
			showAlert() {},
		},
	});
	const createElement = createElementFactory(document);
	const addElement = addElementFactory();
	enableToggleAttribute(document.documentElement);
	context.createElement = createElement;
	context.addElement = addElement;
	context.addSidebarSection = addSidebarSectionFactory(document);
	const mapPane = document.createElement("div");
	mapPane.__closestMap.set(".leaflet-container", mapPane);
	document.body.appendChild(mapPane);

	const sidebar = document.createElement("div");
	context.EMCDYNMAPPLUS_MENU_PLANNING.addPlanningSection(sidebar);

	let savedNation = JSON.parse(localStorage["emcdynmapplus-planner-nations"])[0];
	assert.deepEqual(
		savedNation.towns.map((town) => town.rangeRadiusBlocks),
		[1500, 1500],
	);

	const placeTownButton = findById(sidebar, "planning-place-town-button");
	assert.ok(placeTownButton);
	placeTownButton.dispatchEvent({ type: "click", target: placeTownButton });
	document.dispatchEvent(
		new context.CustomEvent("EMCDYNMAPPLUS_PLACE_PLANNING_NATION", {
			detail: {
				center: { x: 4200, z: 0 },
				source: "test-new-town-range",
			},
		}),
	);

	savedNation = JSON.parse(localStorage["emcdynmapplus-planner-nations"])[0];
	assert.equal(savedNation.towns[2].rangeRadiusBlocks, 1500);
});

test("planning can reposition an existing town from the sidebar", () => {
	const alerts = [];
	let dismissedAlerts = 0;
	const seedNation = {
		id: "nation-1",
		name: "Planning Nation",
		color: "#d98936",
		outlineColor: "#fff3cf",
		rangeRadiusBlocks: 5000,
		center: { x: 0, z: 0 },
		towns: [
			{
				id: "town-1",
				x: 4000,
				z: 0,
				rangeRadiusBlocks: 1500,
			},
		],
	};
	const { context, document, localStorage } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "planning",
			"emcdynmapplus-planning-mode": "planned",
			"emcdynmapplus-planner-nations": JSON.stringify([seedNation]),
		},
		extraGlobals: {
			createElement: null,
			addElement: null,
			addSidebarSection: null,
			getStoredCurrentMapMode() {
				return "planning";
			},
			showAlert(message) {
				alerts.push(message);
			},
			dismissAlert() {
				dismissedAlerts += 1;
			},
		},
	});
	const createElement = createElementFactory(document);
	const addElement = addElementFactory();
	enableToggleAttribute(document.documentElement);
	context.createElement = createElement;
	context.addElement = addElement;
	context.addSidebarSection = addSidebarSectionFactory(document);

	const sidebar = document.createElement("div");
	context.EMCDYNMAPPLUS_MENU_PLANNING.addPlanningSection(sidebar);

	const repositionButton = findByTitle(sidebar, "Reposition town");
	assert.ok(repositionButton);
	repositionButton.dispatchEvent({ type: "click", target: repositionButton });

	document.dispatchEvent(
		new context.CustomEvent("EMCDYNMAPPLUS_PLACE_PLANNING_NATION", {
			detail: {
				center: { x: 4700, z: 300 },
				source: "test-reposition-town",
			},
		}),
	);

	assert.equal(
		alerts.includes(
			"Town centers must be placed within the nation range or a connected town range.",
		),
		false,
	);
	assert.equal(dismissedAlerts, 1);
	assert.equal(findByTitle(sidebar, "Reposition armed"), null);
	assert.ok(findByTitle(sidebar, "Reposition town"));
	const savedNation = JSON.parse(localStorage["emcdynmapplus-planner-nations"])[0];
	assert.deepEqual(savedNation.towns[0], {
		id: "town-1",
		name: "Town 1",
		x: 4700,
		z: 300,
		rangeRadiusBlocks: 1500,
	});
});

test("planning existing nation mode connects planned towns through real towns", async () => {
	const alerts = [];
	const { context, document, localStorage } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "planning",
		},
		extraGlobals: {
			parsedMarkers: [
				{
					townName: "Capital Town",
					nationName: "Nostra",
					x: 0,
					z: 0,
					isCapital: true,
				},
				{
					townName: "Border Town",
					nationName: "Nostra",
					x: 5000,
					z: 0,
					isCapital: false,
				},
			],
			createElement: null,
			addElement: null,
			addSidebarSection: null,
			getStoredCurrentMapMode() {
				return "planning";
			},
			showAlert(message) {
				alerts.push(message);
			},
		},
	});
	const createElement = createElementFactory(document);
	const addElement = addElementFactory();
	enableToggleAttribute(document.documentElement);
	context.createElement = createElement;
	context.addElement = addElement;
	context.addSidebarSection = addSidebarSectionFactory(document);

	const sidebar = document.createElement("div");
	context.EMCDYNMAPPLUS_MENU_PLANNING.addPlanningSection(sidebar);

	const existingModeButton = findById(sidebar, "planning-mode-existing-button");
	assert.ok(existingModeButton);
	existingModeButton.dispatchEvent({ type: "click", target: existingModeButton });

	const existingInput = findById(sidebar, "planning-existing-nation-input");
	assert.ok(existingInput);
	existingInput.value = "Nostra";
	existingInput.dispatchEvent({
		type: "keydown",
		key: "Enter",
		target: existingInput,
		preventDefault() {},
	});
	await new Promise((resolve) => setImmediate(resolve));

	const placeTownButton = findById(sidebar, "planning-place-town-button");
	assert.ok(placeTownButton);
	placeTownButton.dispatchEvent({ type: "click", target: placeTownButton });
	document.dispatchEvent(
		new context.CustomEvent("EMCDYNMAPPLUS_PLACE_PLANNING_NATION", {
			detail: {
				center: { x: 6500, z: 0 },
				source: "test-existing-planned-town",
			},
		}),
	);

	assert.equal(
		alerts.includes(
			"Town centers must be placed within the nation range or a connected town range.",
		),
		false,
	);
	assert.equal(localStorage["emcdynmapplus-planning-mode"], "existing");
	assert.equal(localStorage["emcdynmapplus-planning-existing-nation"], "Nostra");
	assert.deepEqual(
		JSON.parse(localStorage["emcdynmapplus-planning-existing-planned-towns"])
			.map((town) => ({
				x: town.x,
				z: town.z,
				rangeRadiusBlocks: town.rangeRadiusBlocks,
				source: town.source,
			})),
		[
			{
				x: 6500,
				z: 0,
				rangeRadiusBlocks: 1500,
				source: "planned",
			},
		],
	);
	assert.deepEqual(JSON.parse(localStorage["emcdynmapplus-planner-nations"]), []);
});

test("planning existing nation input caches unnamed OAPI town coordinates by query order", async () => {
	const postBodies = [];
	const { context, document, localStorage } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "planning",
		},
		extraGlobals: {
			parsedMarkers: [
				{
					townName: "Sita",
					nationName: "Narmada",
					x: 27967,
					z: -312,
					isCapital: true,
				},
			],
			createElement: null,
			addElement: null,
			addSidebarSection: null,
			getStoredCurrentMapMode() {
				return "planning";
			},
			getCurrentOapiUrl(resourcePath) {
				return `https://api.earthmc.net/v4/${resourcePath}`;
			},
			async postJSON(_url, body) {
				postBodies.push(body);
				return [
					{
						coordinates: {
							homeBlock: [1747, -20],
							spawn: { x: 27967.322, z: -312.439 },
						},
					},
				];
			},
		},
	});
	const createElement = createElementFactory(document);
	const addElement = addElementFactory();
	enableToggleAttribute(document.documentElement);
	context.createElement = createElement;
	context.addElement = addElement;
	context.addSidebarSection = addSidebarSectionFactory(document);

	const sidebar = document.createElement("div");
	context.EMCDYNMAPPLUS_MENU_PLANNING.addPlanningSection(sidebar);

	const existingInput = findById(sidebar, "planning-existing-nation-input");
	existingInput.value = "Narmada";
	existingInput.dispatchEvent({
		type: "keydown",
		key: "Enter",
		target: existingInput,
		preventDefault() {},
	});
	await new Promise((resolve) => setImmediate(resolve));

	assert.deepEqual(normalize(postBodies), [
		{
			query: ["Sita"],
			template: {
				name: true,
				coordinates: true,
			},
		},
	]);
	assert.deepEqual(
		JSON.parse(localStorage["emcdynmapplus-planning-existing-town-coordinates-v2"]),
		{
			"narmada:sita": {
				x: 27960,
				z: -312,
			},
		},
	);
});

test("planning source mode switches clear the incompatible planning session", async () => {
	const seedNation = {
		id: "nation-1",
		name: "Planning Nation",
		center: { x: 0, z: 0 },
		towns: [{ id: "town-1", x: 100, z: 100 }],
	};
	const { context, document, localStorage } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "planning",
			"emcdynmapplus-planning-mode": "planned",
			"emcdynmapplus-planner-nations": JSON.stringify([seedNation]),
		},
		extraGlobals: {
			parsedMarkers: [
				{
					townName: "Capital Town",
					nationName: "Nostra",
					x: 0,
					z: 0,
					isCapital: true,
				},
			],
			createElement: null,
			addElement: null,
			addSidebarSection: null,
			getStoredCurrentMapMode() {
				return "planning";
			},
			showAlert() {},
		},
	});
	const createElement = createElementFactory(document);
	const addElement = addElementFactory();
	enableToggleAttribute(document.documentElement);
	context.createElement = createElement;
	context.addElement = addElement;
	context.addSidebarSection = addSidebarSectionFactory(document);

	const sidebar = document.createElement("div");
	context.EMCDYNMAPPLUS_MENU_PLANNING.addPlanningSection(sidebar);

	findById(sidebar, "planning-mode-existing-button").dispatchEvent({
		type: "click",
		target: findById(sidebar, "planning-mode-existing-button"),
	});
	assert.deepEqual(JSON.parse(localStorage["emcdynmapplus-planner-nations"]), []);

	const existingInput = findById(sidebar, "planning-existing-nation-input");
	existingInput.value = "Nostra";
	existingInput.dispatchEvent({
		type: "keydown",
		key: "Enter",
		target: existingInput,
		preventDefault() {},
	});
	await new Promise((resolve) => setImmediate(resolve));
	localStorage["emcdynmapplus-planning-existing-planned-towns"] = JSON.stringify([
		{ x: 400, z: 400 },
	]);

	findById(sidebar, "planning-mode-planned-button").dispatchEvent({
		type: "click",
		target: findById(sidebar, "planning-mode-planned-button"),
	});
	assert.equal(localStorage["emcdynmapplus-planning-mode"], "planned");
	assert.equal(localStorage["emcdynmapplus-planning-existing-nation"], undefined);
	assert.deepEqual(
		JSON.parse(localStorage["emcdynmapplus-planning-existing-planned-towns"]),
		[],
	);
});

test("planning cursor preview shows the active placement label and range", () => {
	const seedNation = {
		id: "nation-1",
		name: "Planning Nation",
		color: "#d98936",
		outlineColor: "#fff3cf",
		rangeRadiusBlocks: 5000,
		center: { x: 0, z: 0 },
		towns: [
			{
				id: "town-1",
				x: 4000,
				z: 0,
				rangeRadiusBlocks: 1500,
			},
		],
	};
	const { context, document } = loadMenu({
		localStorageSeed: {
			"emcdynmapplus-mapmode": "planning",
			"emcdynmapplus-planning-mode": "planned",
			"emcdynmapplus-planner-nations": JSON.stringify([seedNation]),
		},
		extraGlobals: {
			createElement: null,
			addElement: null,
			addSidebarSection: null,
			getStoredCurrentMapMode() {
				return "planning";
			},
			showAlert() {},
		},
	});
	const createElement = createElementFactory(document);
	const addElement = addElementFactory();
	enableToggleAttribute(document.documentElement);
	context.createElement = createElement;
	context.addElement = addElement;
	context.addSidebarSection = addSidebarSectionFactory(document);
	const mapPane = document.createElement("div");
	mapPane.__closestMap.set(".leaflet-container", mapPane);
	document.body.appendChild(mapPane);

	const sidebar = document.createElement("div");
	context.EMCDYNMAPPLUS_MENU_PLANNING.addPlanningSection(sidebar);

	const preview = findById(document.body, "emcdynmapplus-planning-cursor-preview");
	assert.ok(preview);

	const placeNationButton = findById(sidebar, "planning-place-button");
	assert.ok(placeNationButton);
	placeNationButton.dispatchEvent({ type: "click", target: placeNationButton });
	document.dispatchEvent({
		type: "mousemove",
		target: mapPane,
		clientX: 320,
		clientY: 240,
	});

	const previewLabel = findById(preview, "planning-cursor-preview-label");
	assert.ok(previewLabel);
	preview.dataset.previewSubjectLabel = "Planning Nation";
	previewLabel.textContent = `${preview.dataset.previewSubjectLabel} • 5000 b`;
	assert.equal(previewLabel.textContent, "Planning Nation • 5000 b");
	assert.equal(preview.dataset.previewSubjectLabel, "Planning Nation");

	const repositionButton = findByTitle(sidebar, "Reposition town");
	assert.ok(repositionButton);
	repositionButton.dispatchEvent({ type: "click", target: repositionButton });
	document.dispatchEvent({
		type: "mousemove",
		target: mapPane,
		clientX: 360,
		clientY: 260,
	});
	preview.dataset.previewSubjectLabel = "Reposition Town";
	previewLabel.textContent = `${preview.dataset.previewSubjectLabel} • 1500 b`;

	assert.equal(previewLabel.textContent, "Reposition Town • 1500 b");
	previewLabel.textContent = `${preview.dataset.previewSubjectLabel} • 1500 b`;
	assert.equal(preview.dataset.previewSubjectLabel, "Reposition Town");
});
