import test from "node:test";
import assert from "node:assert/strict";

import { evaluate, loadIifeScripts } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

function loadMarkerEngine(options = {}) {
	return loadIifeScripts(
		[
			"resources/marker-engine-geometry.js",
			"resources/marker-engine-httputil.js",
			"resources/marker-engine-data.js",
			"resources/marker-engine-transform.js",
			"resources/marker-engine-page-map.js",
			"resources/marker-engine-planning.js",
			"resources/marker-engine.js",
		],
		[
			"borderEntryToPolylines",
			"calcMarkerArea",
			"calcPolygonArea",
			"addPlanningLayer",
			"modifyDescription",
			"loadArchiveForDate",
			"convertOldMarkersStructure",
			"parseColours",
			"getAlliances",
			"checkOverclaimed",
			"checkOverclaimedNationless",
			"patchLeafletLayerControls",
			"getPlanningProjectionSignals",
			"modifyMarkersInPage",
		],
		{
			extraGlobals: {
				EMCDYNMAPPLUS_MAP: {
					getBorderResourcePaths: () => ({
						country: "resources/borders.aurora.json",
					}),
					getBorderResourcePath: () => "resources/borders.aurora.json",
					getCurrentMapType: () => "aurora",
					getChunkBounds: () => ({
						L: -32,
						R: 32,
						U: -32,
						D: 32,
					}),
					shouldInjectDynmapPlusChunksLayer: () => true,
					getMapApiUrl: (baseUrl, resourcePath = "") =>
						`${String(baseUrl).replace(/\/+$/, "")}/aurora${
							resourcePath ? `/${String(resourcePath).replace(/^\/+/, "")}` : ""
						}`,
					getArchiveMarkersSourceUrl: (date) =>
						date < 20240701
							? "https://earthmc.net/map/aurora/tiles/_markers_/marker_earth.json"
							: "https://map.earthmc.net/tiles/minecraft_overworld/markers.json",
					getNationClaimBonus: (numNationResidents) =>
						numNationResidents >= 20 ? 10 : 0,
				},
			},
			...options,
		},
	);
}

test("marker engine splits border lines at null and NaN separators", () => {
	const { exports } = loadMarkerEngine();

	assert.deepEqual(
		normalize(
			exports.borderEntryToPolylines({
			x: [0, 16, null, 32, 48, Number.NaN, 64, 80],
			z: [0, 16, null, 32, 48, 64, 64, 80],
			}),
		),
		[
			[
				{ x: 0, z: 0 },
				{ x: 16, z: 16 },
			],
			[
				{ x: 32, z: 32 },
				{ x: 48, z: 48 },
			],
			[
				{ x: 64, z: 64 },
				{ x: 80, z: 80 },
			],
		],
	);
});

test("marker engine computes polygon areas and subtracts holes", () => {
	const { exports } = loadMarkerEngine();
	const outer = [
		{ x: 0, z: 0 },
		{ x: 32, z: 0 },
		{ x: 32, z: 32 },
		{ x: 0, z: 32 },
	];
	const hole = [
		{ x: 8, z: 8 },
		{ x: 24, z: 8 },
		{ x: 24, z: 24 },
		{ x: 8, z: 24 },
	];

	assert.equal(exports.calcPolygonArea(outer), 4);
	assert.equal(
		exports.calcMarkerArea({
			type: "polygon",
			points: [[outer, hole, [{ x: "bad", z: 0 }]]],
		}),
		3,
	);
});

test("marker engine converts old dynmap marker payloads and removes shop areas", () => {
	const { exports } = loadMarkerEngine();

	assert.deepEqual(
		normalize(
			exports.convertOldMarkersStructure({
			areas: {
				Town: {
					fillcolor: "#112233",
					color: "#445566",
					desc: "<div>Town popup</div>",
					weight: 2,
					opacity: 0.8,
					x: [0, 16, 16, 0],
					z: [0, 0, 16, 16],
				},
				Town_Shop: {
					fillcolor: "#000000",
					color: "#000000",
					label: "Shop",
					weight: 1,
					opacity: 0.5,
					x: [1],
					z: [1],
				},
			},
			}),
		),
		[
			{
				fillColor: "#112233",
				color: "#445566",
				popup: "<div>Town popup</div>",
				weight: 2,
				opacity: 0.8,
				type: "polygon",
				points: [
					{ x: 0, z: 0 },
					{ x: 16, z: 0 },
					{ x: 16, z: 16 },
					{ x: 0, z: 16 },
				],
			},
		],
	);
});

test("marker engine appends a sanitized planning layer from stored nations", () => {
	const { exports } = loadMarkerEngine({
		localStorageSeed: {
			"emcdynmapplus-planner-nations": JSON.stringify([
				{
					name: "Test Nation",
					center: { x: 12.7, z: -8.2 },
					color: "#123456",
					outlineColor: "#abcdef",
					rangeRadiusBlocks: "4096.8",
				},
				{
					name: "Invalid Nation",
					center: { x: "bad", z: 0 },
				},
			]),
		},
	});

	const result = exports.addPlanningLayer([
		{
			id: "towny",
			name: "Towns",
			markers: [],
		},
		{
			id: "planning-nations",
			name: "Planning Nations",
			markers: [{ stale: true }],
		},
	]);

	assert.equal(result.length, 2);
	const planningLayer = result.find((layer) => layer.id === "planning-nations");
	assert.ok(planningLayer);
	assert.equal(planningLayer.markers.length, 2);
	assert.match(planningLayer.markers[0].popup, /X: 13/);
	assert.match(planningLayer.markers[0].popup, /Z: -8/);
	assert.match(planningLayer.markers[0].popup, /Range: 4097 blocks/);
});

test("marker engine appends separate country and state border layers", async () => {
	const { exports } = loadMarkerEngine({
		extraGlobals: {
			EMCDYNMAPPLUS_MAP: {
				getBorderResourcePaths: () => ({
					country: "resources/borders.nostra.countries.json",
					state: "resources/borders.nostra.states-and-countries.json",
				}),
				getBorderResourcePath: () => "resources/borders.nostra.countries.json",
				getCurrentMapType: () => "nostra",
				getChunkBounds: () => ({
					L: -32,
					R: 32,
					U: -32,
					D: 32,
				}),
				shouldInjectDynmapPlusChunksLayer: () => false,
				getMapApiUrl: (baseUrl, resourcePath = "") =>
					`${String(baseUrl).replace(/\/+$/, "")}/nostra${
						resourcePath ? `/${String(resourcePath).replace(/^\/+/, "")}` : ""
					}`,
				getArchiveMarkersSourceUrl: (date) =>
					date < 20240701
						? "https://earthmc.net/map/aurora/tiles/_markers_/marker_earth.json"
						: "https://map.earthmc.net/tiles/minecraft_overworld/markers.json",
				getNationClaimBonus: (numNationResidents) =>
					numNationResidents >= 20 ? 10 : 0,
			},
		},
		fetchImpl: async (url) => ({
			ok: true,
			status: 200,
			url: String(url),
			clone() {
				return this;
			},
			async json() {
				if (String(url).includes("borders.nostra.countries.json")) {
					return {
						country_line: {
							x: [0, 16],
							z: [0, 16],
						},
					};
				}

				if (String(url).includes("borders.nostra.states-and-countries.json")) {
					return {
						state_line: {
							x: [32, 48],
							z: [32, 48],
						},
					};
				}

				return {};
			},
		}),
	});

	const result = await exports.modifyMarkersInPage([
		{
			id: "towny",
			name: "Towns",
			markers: [
				{
					type: "polygon",
					tooltip:
						'<div><span style="font-size:120%;"><b>Test Town</b></span> (Nationless)\n    <i>/town set board [msg]</i></div>',
					popup:
						'<div><span style="font-size:120%;"><b>Test Town</b></span><br>\nMayor: <b>MayorOne</b>\n\t<br>\nCouncillors: <b>None</b>\n\t<br>\n<details><summary>Residents</summary>\n    \tMayorOne\n   \t</details>\n   \t<br>\n<i>/town set board [msg]</i> \n    <br>\nFlags: <b>true</b> <b>false</b></div>',
					points: [[[
						{ x: 0, z: 0 },
						{ x: 16, z: 0 },
						{ x: 16, z: 16 },
						{ x: 0, z: 16 },
					]]],
				},
			],
		},
	]);

	assert.ok(result.find((layer) => layer.id === "countryBorders"));
	assert.ok(result.find((layer) => layer.id === "stateBorders"));
	assert.equal(result.find((layer) => layer.id === "countryBorders").markers.length, 1);
	assert.equal(result.find((layer) => layer.id === "stateBorders").markers.length, 1);
});

test("marker engine keeps Aurora on country borders only", async () => {
	const { exports } = loadMarkerEngine({
		fetchImpl: async (url) => ({
			ok: true,
			status: 200,
			url: String(url),
			clone() {
				return this;
			},
			async json() {
				if (String(url).includes("borders.aurora.json")) {
					return {
						country_line: {
							x: [0, 16],
							z: [0, 16],
						},
					};
				}

				return {};
			},
		}),
	});

	const result = await exports.modifyMarkersInPage([
		{
			id: "towny",
			name: "Towns",
			markers: [
				{
					type: "polygon",
					tooltip:
						'<div><span style="font-size:120%;"><b>Test Town</b></span> (Nationless)\n    <i>/town set board [msg]</i></div>',
					popup:
						'<div><span style="font-size:120%;"><b>Test Town</b></span><br>\nMayor: <b>MayorOne</b>\n\t<br>\nCouncillors: <b>None</b>\n\t<br>\n<details><summary>Residents</summary>\n    \tMayorOne\n   \t</details>\n   \t<br>\n<i>/town set board [msg]</i> \n    <br>\nFlags: <b>true</b> <b>false</b></div>',
					points: [[[
						{ x: 0, z: 0 },
						{ x: 16, z: 0 },
						{ x: 16, z: 16 },
						{ x: 0, z: 16 },
					]]],
				},
			],
		},
	]);

	assert.ok(result.find((layer) => layer.id === "countryBorders"));
	assert.equal(result.find((layer) => layer.id === "stateBorders"), undefined);
});

test("marker engine loads gzipped packaged border resources", async () => {
	const { exports } = loadMarkerEngine({
		extraGlobals: {
			EMCDYNMAPPLUS_MAP: {
				getBorderResourcePaths: () => ({
					country: "resources/borders.nostra.states-and-countries.json.gz",
				}),
				getBorderResourcePath: () => "resources/borders.nostra.states-and-countries.json.gz",
				getCurrentMapType: () => "nostra",
				getChunkBounds: () => ({
					L: -32,
					R: 32,
					U: -32,
					D: 32,
				}),
				shouldInjectDynmapPlusChunksLayer: () => false,
				getMapApiUrl: (baseUrl, resourcePath = "") =>
					`${String(baseUrl).replace(/\/+$/, "")}/nostra${
						resourcePath ? `/${String(resourcePath).replace(/^\/+/, "")}` : ""
					}`,
				getArchiveMarkersSourceUrl: () =>
					"https://map.earthmc.net/tiles/minecraft_overworld/markers.json",
				getNationClaimBonus: (numNationResidents) =>
					numNationResidents >= 20 ? 10 : 0,
			},
			__EMCDYNMAPPLUS_DECOMPRESS_GZIP__: async () =>
				JSON.stringify({
					gz_country_line: {
						x: [0, 16],
						z: [0, 16],
					},
				}),
		},
		fetchImpl: async () => ({
			ok: true,
			status: 200,
			async arrayBuffer() {
				return new Uint8Array([0x1f, 0x8b, 0x08]).buffer;
			},
		}),
	});

	const result = await exports.modifyMarkersInPage([
		{
			id: "towny",
			name: "Towns",
			markers: [
				{
					type: "polygon",
					tooltip:
						'<div><span style="font-size:120%;"><b>Test Town</b></span> (Nationless)\n    <i>/town set board [msg]</i></div>',
					popup:
						'<div><span style="font-size:120%;"><b>Test Town</b></span><br>\nMayor: <b>MayorOne</b>\n\t<br>\nCouncillors: <b>None</b>\n\t<br>\n<details><summary>Residents</summary>\n    \tMayorOne\n   \t</details>\n   \t<br>\n<i>/town set board [msg]</i> \n    <br>\nFlags: <b>true</b> <b>false</b></div>',
					points: [[[
						{ x: 0, z: 0 },
						{ x: 16, z: 0 },
						{ x: 16, z: 16 },
						{ x: 0, z: 16 },
					]]],
				},
			],
		},
	]);

	assert.ok(result.find((layer) => layer.id === "countryBorders"));
	assert.equal(result.find((layer) => layer.id === "countryBorders").markers.length, 1);
});

test("marker engine rewrites squaremap town descriptions and alliance labels", () => {
	const { exports, context } = loadMarkerEngine();
	evaluate(
		context,
		`cachedAlliances = [{
			name: "Mega Coalition",
			modeType: "meganations",
			ownNations: ["Nation<Two>"],
			puppetNations: [],
			colours: { fill: "#111111", outline: "#222222" }
		}]`,
	);

	const marker = {
		type: "polygon",
		tooltip:
			'<div><span style="font-size:120%;"><b>Town<One></b></span> (Capital of Nation<Two>)\n    <i>/town set board [msg]</i></div>',
		popup:
			'<div><span style="font-size:120%;"><b>Town<One></b></span><br>\nMayor: <b>MayorOne</b>\n\t<br>\nCouncillors: <b>Alice, None</b>\n\t<br>\n<details><summary>Residents</summary>\n    \tMayorOne, Alice, Bob\n   \t</details>\n   \t<br>\n<i>/town set board [msg]</i> \n    <br>\nFlags: <b>true</b> <b>false</b></div>',
		points: [[[
			{ x: 0, z: 0 },
			{ x: 32, z: 0 },
			{ x: 32, z: 32 },
			{ x: 0, z: 32 },
		]]],
	};

	const parsed = exports.modifyDescription(marker, "meganations");
	assert.deepEqual(normalize(parsed), {
		townName: "Town&lt;One&gt;",
		nationName: "Nation&lt;Two&gt;",
		residentNum: 3,
		residentList: ["MayorOne", "Alice", "Bob"],
		isCapital: true,
		mayor: "MayorOne",
		area: 4,
		x: 16,
		z: 16,
	});
	assert.match(marker.popup, /Size: <b>4 chunks<\/b>/);
	assert.match(marker.popup, /resident-clickable">MayorOne/);
	assert.match(marker.popup, /&#9733;/);
	assert.match(marker.popup, /Town&lt;One&gt;/);
});

test("marker engine normalizes legacy archive responses before July 2024", async () => {
	const archivePayload = {
		sets: {
			"townyPlugin.markerset": {
				areas: {
					LegacyTown: {
						fillcolor: "#111111",
						color: "#222222",
						desc: "<div>LegacyTown</div>",
						weight: 1,
						opacity: 0.8,
						x: [0, 16, 16, 0],
						z: [0, 0, 16, 16],
					},
				},
			},
		},
		timestamp: "1711886400000",
	};
	const { exports } = loadMarkerEngine({
		fetchImpl: async (url) => ({
			ok: true,
			status: 200,
			url: String(url),
			clone() {
				return this;
			},
			async json() {
				return archivePayload;
			},
		}),
	});

	const result = await exports.loadArchiveForDate(20240331, [{ markers: [] }]);
	assert.equal(result.actualArchiveDate, "2024-03-31");
	assert.equal(result.data[0].markers.length, 1);
	assert.equal(result.data[0].markers[0].type, "polygon");
});

test("marker engine accepts modern archive payloads after July 2024", async () => {
	const archivePayload = [
		{
		timestamp: "1719835200000",
			markers: [{ id: "modern" }],
		},
	];
	const { exports } = loadMarkerEngine({
		fetchImpl: async (url) => ({
			ok: true,
			status: 200,
			url: String(url),
			clone() {
				return this;
			},
			async json() {
				return archivePayload;
			},
		}),
	});

	const result = await exports.loadArchiveForDate(20240702, [{ markers: [] }]);
	assert.equal(result.actualArchiveDate, "2024-07-01");
	assert.deepEqual(result.data, archivePayload);
});

test("marker engine builds alliance cache entries and preserves fallback colours", async () => {
	const alliancePayload = [
		{
			identifier: "parent",
			label: "Parent",
			type: "MEGA",
			parentAlliance: null,
			ownNations: ["Alpha"],
			optional: {
				colours: {
					fill: "123456",
					outline: "#abcdef",
				},
			},
		},
		{
			identifier: "child",
			label: "Child",
			type: "alliance",
			parentAlliance: "parent",
			ownNations: ["Beta"],
			optional: {
				colours: null,
			},
		},
	];
	const { exports, localStorage } = loadMarkerEngine({
		fetchImpl: async () => ({
			ok: true,
			status: 200,
			url: "https://emcstats.bot.nu/aurora/alliances",
			clone() {
				return this;
			},
			async json() {
				return alliancePayload;
			},
		}),
	});

	assert.deepEqual(normalize(exports.parseColours(null)), {
		fill: "#000000",
		outline: "#000000",
	});
	const alliances = await exports.getAlliances();
	assert.equal(alliances.length, 2);
	assert.deepEqual(normalize(alliances[0]), {
		name: "Parent",
		modeType: "meganations",
		ownNations: ["Alpha"],
		puppetNations: ["Beta"],
		colours: {
			fill: "#123456",
			outline: "#abcdef",
		},
	});
	assert.ok(localStorage["emcdynmapplus-alliances"]);
	assert.deepEqual(normalize(exports.checkOverclaimedNationless(40, 3)), {
		isOverclaimed: true,
		chunksOverclaimed: 4,
		resLimit: 36,
	});
	assert.deepEqual(normalize(exports.checkOverclaimed(40, 3, 20)), {
		isOverclaimed: false,
		chunksOverclaimed: 0,
		nationBonus: 10,
		resLimit: 36,
		totalClaimLimit: 46,
	});
});

test("marker engine patches leaflet layer controls with dynmap metadata and dedupes registrations", () => {
	const { exports, context } = loadMarkerEngine();

	assert.equal(exports.patchLeafletLayerControls(), true);

	const control = {
		_layers: [],
		_container: context.document.createElement("div"),
	};
	const firstLayer = { options: { id: "chunks" } };
	const secondLayer = { options: { id: "chunks" } };

	context.L.Control.Layers.prototype._addLayer.call(control, firstLayer, "Chunks", true);
	context.L.Control.Layers.prototype._addLayer.call(control, secondLayer, "Chunks", true);
	assert.equal(control._layers.length, 1);

	const label = context.L.Control.Layers.prototype._addItem.call(control, control._layers[0]);
	assert.equal(label.dataset.emcdynmapplusLayerOwner, "dynmapplus");
	assert.equal(label.dataset.emcdynmapplusLayerId, "chunks");

	const input = label.querySelector("input.leaflet-control-layers-selector");
	assert.equal(input.dataset.emcdynmapplusLayerId, "chunks");
});

test("marker engine reports planning projection signals from published attrs, tiles, and transforms", () => {
	const { exports, document } = loadMarkerEngine({
		locationHref: "https://map.earthmc.net/?zoom=5",
	});
	const root = document.documentElement;
	root.setAttribute("data-emcdynmapplus-leaflet-zoom", "4");
	root.setAttribute("data-emcdynmapplus-tile-zoom", "3");
	root.setAttribute("data-emcdynmapplus-tile-dominant-zoom", "3");
	root.setAttribute("data-emcdynmapplus-tile-url", "https://map.earthmc.net/tiles/minecraft_overworld/3/0_0.png");
	root.setAttribute("data-emcdynmapplus-tile-zoom-summary", JSON.stringify({ 3: 8 }));
	root.setAttribute("data-emcdynmapplus-leaflet-map-container", "dynmap-map | leaflet-container");

	const tile = document.createElement("img");
	tile.src = "https://map.earthmc.net/tiles/minecraft_overworld/3/1_1.png";
	tile.currentSrc = tile.src;
	document.__setQuery(".leaflet-tile-pane img.leaflet-tile[src]", tile);

	const tilePane = document.createElement("div");
	tilePane.style.transform = "matrix(2, 0, 0, 2, 0, 0)";
	document.__setQuery(".leaflet-tile-pane", tilePane);

	const tileLayer = document.createElement("div");
	tileLayer.style.transform = "matrix(1, 0, 0, 1, 0, 0)";
	document.__setQuery(".leaflet-tile-pane .leaflet-layer", tileLayer);

	const mapPane = document.createElement("div");
	mapPane.style.transform = "matrix(1, 0, 0, 1, 0, 0)";
	document.__setQuery(".leaflet-map-pane", mapPane);

	const overlayCanvas = document.createElement("canvas");
	overlayCanvas.style.transform = "matrix(0.5, 0, 0, 0.5, 0, 0)";
	document.__setQuery(".leaflet-overlay-pane canvas.leaflet-zoom-animated", overlayCanvas);

	const coords = document.createElement("div");
	coords.textContent = "X: 10 Z: 20";
	document.__setQuery(".leaflet-control-layers.coordinates", coords);

	assert.deepEqual(normalize(exports.getPlanningProjectionSignals()), {
		href: "https://map.earthmc.net/?zoom=5",
		urlZoom: 5,
		leafletZoom: 4,
		publishedTileZoom: 3,
		dominantTileZoom: 3,
		tileImageZoom: 3,
		publishedTileUrl: "https://map.earthmc.net/tiles/minecraft_overworld/3/0_0.png",
		tileSrc: "https://map.earthmc.net/tiles/minecraft_overworld/3/1_1.png",
		tileSummary: { 3: 8 },
		mapContainer: "dynmap-map | leaflet-container",
		coordsText: "X: 10 Z: 20",
		tilePaneScale: 2,
		tileLayerScale: 1,
		mapPaneScale: 1,
		overlayCanvasScale: 0.5,
		effectiveZoomFromTilePaneScale: 4,
		effectiveZoomFromTileLayerScale: 3,
	});
});
