import test from "node:test";
import assert from "node:assert/strict";

import { loadIifeScript } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

function loadPlanningProjection(options = {}) {
	return loadIifeScript(
		"resources/planning-projection.js",
		["createPlanningProjectionAdapter"],
		options,
	);
}

test("planning projection adapter resolves zoom priority from leaflet, runtime, url, and tile signals", () => {
	const { exports, document } = loadPlanningProjection({
		locationHref: "https://map.earthmc.net/?zoom=5",
	});
	const adapter = exports.createPlanningProjectionAdapter();
	const root = document.documentElement;
	root.setAttribute("data-emcdynmapplus-leaflet-zoom", "4");
	root.setAttribute("data-emcdynmapplus-tile-zoom", "3");
	root.setAttribute(
		"data-emcdynmapplus-tile-dominant-zoom",
		"2",
	);

	assert.deepEqual(
		normalize(adapter.readProjectionSignals({ includeResolvedZoom: true })),
		{
			href: "https://map.earthmc.net/?zoom=5",
			urlZoom: 5,
			leafletZoom: 4,
			runtimeZoom: null,
			runtimeZoomSource: null,
			publishedTileZoom: 3,
			dominantTileZoom: 2,
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
			zoomLevel: 4,
			zoomSource: "leaflet",
		},
	);
});

test("planning projection adapter parses tile transforms and optional coordinate text", () => {
	const { exports, document } = loadPlanningProjection({
		locationHref: "https://map.earthmc.net/?zoom=1",
	});
	const adapter = exports.createPlanningProjectionAdapter();
	const root = document.documentElement;
	root.setAttribute("data-emcdynmapplus-tile-dominant-zoom", "3");
	root.setAttribute(
		"data-emcdynmapplus-tile-url",
		"https://map.earthmc.net/tiles/minecraft_overworld/3/0_0.png",
	);
	root.setAttribute(
		"data-emcdynmapplus-leaflet-map-container",
		"dynmap-map | leaflet-container",
	);

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
	document.__setQuery(
		".leaflet-overlay-pane canvas.leaflet-zoom-animated",
		overlayCanvas,
	);

	const coords = document.createElement("div");
	coords.textContent = "X: 10 Z: 20";
	document.__setQuery(".leaflet-control-layers.coordinates", coords);

	assert.deepEqual(
		normalize(
			adapter.readProjectionSignals({
				includeCoordsText: true,
				includeResolvedZoom: true,
			}),
		),
		{
			href: "https://map.earthmc.net/?zoom=1",
			urlZoom: 1,
			leafletZoom: null,
			runtimeZoom: null,
			runtimeZoomSource: null,
			publishedTileZoom: null,
			dominantTileZoom: 3,
			tileImageZoom: 3,
			publishedTileUrl: "https://map.earthmc.net/tiles/minecraft_overworld/3/0_0.png",
			tileSrc: "https://map.earthmc.net/tiles/minecraft_overworld/3/1_1.png",
			tileSummary: null,
			mapContainer: "dynmap-map | leaflet-container",
			coordsText: "X: 10 Z: 20",
			tilePaneScale: 2,
			tileLayerScale: 1,
			mapPaneScale: 1,
			overlayCanvasScale: 0.5,
			effectiveZoomFromTilePaneScale: 4,
			effectiveZoomFromTileLayerScale: 3,
			zoomLevel: 1,
			zoomSource: "url",
		},
	);
});
