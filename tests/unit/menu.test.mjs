import test from "node:test";
import assert from "node:assert/strict";

import { loadPlainScript, loadPlainScripts } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

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
			}),
		),
		{
			id: "hardcoded-demo-nation",
			name: "Planning Nation",
			color: "#d98936",
			outlineColor: "#fff3cf",
			rangeRadiusBlocks: 8192,
			center: { x: 11, z: -4 },
		},
	);
	localStorage["emcdynmapplus-planning-default-range"] = "3200";
	assert.equal(
		exports.normalizePlanningNation({
			center: { x: 1, z: 2 },
		}).rangeRadiusBlocks,
		3200,
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
