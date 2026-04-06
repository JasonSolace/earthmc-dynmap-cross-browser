import test from "node:test";
import assert from "node:assert/strict";

import { loadIifeScript, loadIifeScripts } from "./helpers/script-harness.mjs";

function loadPlanningLiveRenderer(options = {}) {
	return loadIifeScript(
		"resources/planning-live-renderer.js",
		["createPlanningLiveRenderer", "PLANNING_LIVE_READY_ATTR"],
		options,
	);
}

test("planning live renderer creates an overlay and marks itself ready after rendering", () => {
	const { exports, document, localStorage } = loadPlanningLiveRenderer();
	const mapContainer = document.createElement("div");
	mapContainer.setBoundingClientRect({
		left: 0,
		top: 0,
		width: 800,
		height: 600,
		right: 800,
		bottom: 600,
	});
	document.__setQuery(".leaflet-container", mapContainer);

	const renderer = exports.createPlanningLiveRenderer({
		createPlanningCircleVertices(point, radiusBlocks) {
			return [
				{ x: point.x - radiusBlocks, z: point.z },
				{ x: point.x, z: point.z - radiusBlocks },
				{ x: point.x + radiusBlocks, z: point.z },
				{ x: point.x, z: point.z + radiusBlocks },
			];
		},
		getPlanningNations: () => [
			{
				id: "nation-1",
				name: "Nation 1",
				center: { x: 100, z: 200 },
				rangeRadiusBlocks: 50,
				color: "#123456",
				outlineColor: "#abcdef",
			},
		],
		getPrimaryLeafletMap: () => ({
			getContainer: () => mapContainer,
			on() {},
		}),
		sampleWorldPoint(clientX, clientY) {
			return {
				x: Math.round(clientX),
				z: Math.round(clientY),
			};
		},
	});

	const result = renderer.render();
	assert.equal(result.ok, true);
	assert.equal(renderer.isLiveReady(), true);
	assert.equal(
		document.documentElement.getAttribute(exports.PLANNING_LIVE_READY_ATTR),
		"true",
	);

	const overlay = mapContainer.children.find(
		(child) => child.id === "emcdynmapplus-planning-live-overlay",
	);
	assert.ok(overlay);
	assert.equal(overlay.hidden, false);
	assert.equal(
		overlay.children.filter(
			(child) => child.getAttribute?.("data-planning-shape") === "center",
		).length,
		1,
	);
	assert.ok(renderer.measureRenderedNation()?.rangeBounds);

	assert.equal(renderer.isDebugEnabled(), false);
	assert.equal(renderer.getDebugMode(), "off");
	assert.equal(renderer.setDebugMode("pan"), true);
	assert.equal(renderer.getDebugMode(), "pan");
	assert.equal(localStorage["emcdynmapplus-planning-live-debug-mode"], "pan");
	assert.equal(renderer.isDebugEnabled(), true);
	assert.equal(renderer.setDebugEnabled(true), true);
	assert.equal(localStorage["emcdynmapplus-planning-live-debug"], "true");
	assert.equal(renderer.getDebugMode(), "all");
	assert.equal(renderer.isDebugEnabled(), true);

	renderer.render();
	const debugEvents = renderer.getDebugEvents();
	assert.ok(debugEvents.length > 0);
	assert.equal(debugEvents.at(-1)?.type, "render-complete");

	const panTrace = renderer.exportPanTrace(10);
	assert.equal(panTrace.mode, "all");
	assert.ok(Array.isArray(panTrace.events));

	renderer.clearDebugEvents();
	assert.equal(renderer.getDebugEvents().length, 0);
});

test("planning live renderer tolerates a Leaflet map before center and size are ready", () => {
	const { exports, document } = loadPlanningLiveRenderer();
	const mapContainer = document.createElement("div");
	mapContainer.setBoundingClientRect({
		left: 0,
		top: 0,
		width: 800,
		height: 600,
		right: 800,
		bottom: 600,
	});
	document.__setQuery(".leaflet-container", mapContainer);

	const renderer = exports.createPlanningLiveRenderer({
		createPlanningCircleVertices(point, radiusBlocks) {
			return [
				{ x: point.x - radiusBlocks, z: point.z },
				{ x: point.x, z: point.z - radiusBlocks },
				{ x: point.x + radiusBlocks, z: point.z },
				{ x: point.x, z: point.z + radiusBlocks },
			];
		},
		getPlanningNations: () => [
			{
				id: "nation-1",
				name: "Nation 1",
				center: { x: 100, z: 200 },
				rangeRadiusBlocks: 50,
			},
		],
		getPrimaryLeafletMap: () => ({
			getContainer: () => mapContainer,
			getCenter() {
				throw new Error("Set map center and zoom first.");
			},
			getSize() {
				throw new Error("Set map center and zoom first.");
			},
			on() {},
		}),
		sampleWorldPoint(clientX, clientY) {
			return {
				x: Math.round(clientX),
				z: Math.round(clientY),
			};
		},
	});

	assert.doesNotThrow(() => renderer.init());
	const result = renderer.render();
	assert.equal(result.ok, true);
	assert.equal(renderer.isLiveReady(), true);
});

test("planning live renderer uses native Leaflet projection when an adapter is provided", () => {
	const { exports, context, document } = loadIifeScripts(
		[
			"resources/planning-leaflet-adapter.js",
			"resources/planning-live-renderer.js",
		],
		["createPlanningLiveRenderer"],
	);
	const mapContainer = document.createElement("div");
	mapContainer.setBoundingClientRect({
		left: 0,
		top: 0,
		width: 800,
		height: 600,
		right: 800,
		bottom: 600,
	});
	document.__setQuery(".leaflet-container", mapContainer);

	context.L = {
		latLng(lat, lng) {
			return { lat, lng };
		},
	};

	const adapter =
		context.__EMCDYNMAPPLUS_PLANNING_LEAFLET_ADAPTER__?.createPlanningLeafletAdapter?.();
	const renderer = exports.createPlanningLiveRenderer({
		planningLeafletAdapter: adapter,
		createPlanningCircleVertices(point, radiusBlocks) {
			return [
				{ x: point.x - radiusBlocks, z: point.z },
				{ x: point.x, z: point.z - radiusBlocks },
				{ x: point.x + radiusBlocks, z: point.z },
				{ x: point.x, z: point.z + radiusBlocks },
			];
		},
		getPlanningNations: () => [
			{
				id: "nation-1",
				name: "Nation 1",
				center: { x: 100, z: 200 },
				rangeRadiusBlocks: 50,
			},
		],
		getPrimaryLeafletMap: () => ({
			getContainer: () => mapContainer,
			on() {},
			latLngToLayerPoint(latLng) {
				return {
					x: latLng.lng * 2,
					y: latLng.lat * 3,
				};
			},
			layerPointToLatLng(point) {
				return {
					lat: point.y / 3,
					lng: point.x / 2,
				};
			},
		}),
		sampleWorldPoint() {
			throw new Error("sampleWorldPoint should not be used for native projection");
		},
	});

	const result = renderer.render();
	assert.equal(result.ok, true);
	assert.equal(result.projectionMode, "leaflet-native");
	assert.ok(renderer.measureRenderedNation()?.rangeBounds);
});

test("planning live renderer marks disconnected town chains separately", () => {
	const { exports, document } = loadPlanningLiveRenderer();
	const mapContainer = document.createElement("div");
	mapContainer.setBoundingClientRect({
		left: 0,
		top: 0,
		width: 800,
		height: 600,
		right: 800,
		bottom: 600,
	});
	document.__setQuery(".leaflet-container", mapContainer);

	const renderer = exports.createPlanningLiveRenderer({
		createPlanningCircleVertices(point, radiusBlocks) {
			return [
				{ x: point.x - radiusBlocks, z: point.z },
				{ x: point.x, z: point.z - radiusBlocks },
				{ x: point.x + radiusBlocks, z: point.z },
				{ x: point.x, z: point.z + radiusBlocks },
			];
		},
		getPlanningNations: () => [
			{
				id: "nation-1",
				name: "Nation 1",
				center: { x: 0, z: 0 },
				rangeRadiusBlocks: 5000,
				color: "#123456",
				outlineColor: "#abcdef",
				towns: [
					{
						id: "town-1",
						x: 5000,
						z: 0,
						rangeRadiusBlocks: 500,
					},
					{
						id: "town-2",
						x: 6500,
						z: 0,
						rangeRadiusBlocks: 1500,
					},
				],
			},
		],
		getPrimaryLeafletMap: () => ({
			getContainer: () => mapContainer,
			on() {},
		}),
		sampleWorldPoint(clientX, clientY) {
			return {
				x: Math.round(clientX),
				z: Math.round(clientY),
			};
		},
	});

	const result = renderer.render();
	assert.equal(result.ok, true);
	assert.equal(result.nations[0].disconnectedTownCount, 1);

	const overlay = mapContainer.children.find(
		(child) => child.id === "emcdynmapplus-planning-live-overlay",
	);
	assert.ok(overlay);
	assert.equal(
		overlay.children.some(
			(child) =>
				child.getAttribute?.("data-planning-shape") === "disconnected-range",
		),
		true,
	);
	assert.equal(
		overlay.children.some(
			(child) =>
				child.getAttribute?.("data-planning-state") === "disconnected",
		),
		true,
	);
});

test("planning live renderer highlights hovered towns from the sidebar", () => {
	const { exports, context, document } = loadPlanningLiveRenderer();
	const mapContainer = document.createElement("div");
	mapContainer.setBoundingClientRect({
		left: 0,
		top: 0,
		width: 800,
		height: 600,
		right: 800,
		bottom: 600,
	});
	document.__setQuery(".leaflet-container", mapContainer);

	const renderer = exports.createPlanningLiveRenderer({
		createPlanningCircleVertices(point, radiusBlocks) {
			return [
				{ x: point.x - radiusBlocks, z: point.z },
				{ x: point.x, z: point.z - radiusBlocks },
				{ x: point.x + radiusBlocks, z: point.z },
				{ x: point.x, z: point.z + radiusBlocks },
			];
		},
		getPlanningNations: () => [
			{
				id: "nation-1",
				name: "Nation 1",
				center: { x: 0, z: 0 },
				rangeRadiusBlocks: 5000,
				towns: [
					{
						id: "town-1",
						x: 2500,
						z: 0,
						rangeRadiusBlocks: 1500,
					},
				],
			},
		],
		getPrimaryLeafletMap: () => ({
			getContainer: () => mapContainer,
			on() {},
		}),
		sampleWorldPoint(clientX, clientY) {
			return {
				x: Math.round(clientX),
				z: Math.round(clientY),
			};
		},
	});

	renderer.init();
	renderer.render();
	document.dispatchEvent(
		new context.CustomEvent("EMCDYNMAPPLUS_PLANNING_TOWN_HOVER", {
			detail: JSON.stringify({
				townId: "town-1",
			}),
		}),
	);

	const overlay = mapContainer.children.find(
		(child) => child.id === "emcdynmapplus-planning-live-overlay",
	);
	assert.ok(overlay);
	const townCircle = overlay.children.find(
		(child) =>
			child.getAttribute?.("data-planning-town-id") === "town-1" &&
			child.getAttribute?.("data-planning-shape") === "town",
	);
	assert.ok(townCircle);
	const townRangeHighlight = overlay.children.find(
		(child) =>
			child.getAttribute?.("data-planning-town-id") === "town-1" &&
			child.getAttribute?.("data-planning-shape") === "town-range-highlight",
	);
	assert.ok(townRangeHighlight);
	assert.equal(
		overlay.children.some(
			(child) =>
				child.getAttribute?.("data-planning-town-id") === "town-1" &&
				child.getAttribute?.("data-hovered") === "true",
		),
		true,
	);
	assert.equal(townCircle.getAttribute("fill-opacity"), "1");
	assert.equal(townRangeHighlight.getAttribute("fill"), "#e3a24b");
	assert.equal(townRangeHighlight.getAttribute("stroke"), "#fff3cf");
	assert.equal(townRangeHighlight.getAttribute("fill-opacity"), "0.24");
	assert.equal(townRangeHighlight.getAttribute("stroke-width"), "3.25");

	document.dispatchEvent(
		new context.CustomEvent("EMCDYNMAPPLUS_PLANNING_TOWN_HOVER", {
			detail: JSON.stringify({
				townId: null,
			}),
		}),
	);

	assert.equal(townCircle.getAttribute("data-hovered"), null);
	assert.equal(townCircle.getAttribute("fill-opacity"), "0.96");
	assert.equal(townRangeHighlight.getAttribute("data-hovered"), null);
	assert.equal(townRangeHighlight.getAttribute("fill-opacity"), "0");
	assert.equal(townRangeHighlight.getAttribute("stroke-opacity"), "0");
	assert.equal(townRangeHighlight.getAttribute("stroke-width"), "0");
});

test("planning live renderer renders town labels in sidebar order", () => {
	const { exports, document } = loadPlanningLiveRenderer();
	const mapContainer = document.createElement("div");
	mapContainer.setBoundingClientRect({
		left: 0,
		top: 0,
		width: 800,
		height: 600,
		right: 800,
		bottom: 600,
	});
	document.__setQuery(".leaflet-container", mapContainer);

	const renderer = exports.createPlanningLiveRenderer({
		createPlanningCircleVertices(point, radiusBlocks) {
			return [
				{ x: point.x - radiusBlocks, z: point.z },
				{ x: point.x, z: point.z - radiusBlocks },
				{ x: point.x + radiusBlocks, z: point.z },
				{ x: point.x, z: point.z + radiusBlocks },
			];
		},
		getPlanningNations: () => [
			{
				id: "nation-1",
				name: "Nation 1",
				center: { x: 0, z: 0 },
				rangeRadiusBlocks: 5000,
				towns: [
					{
						id: "town-1",
						x: 2500,
						z: 0,
						rangeRadiusBlocks: 1500,
					},
					{
						id: "town-2",
						x: 4000,
						z: 0,
						rangeRadiusBlocks: 1500,
					},
				],
			},
		],
		getPrimaryLeafletMap: () => ({
			getContainer: () => mapContainer,
			on() {},
		}),
		sampleWorldPoint(clientX, clientY) {
			return {
				x: Math.round(clientX),
				z: Math.round(clientY),
			};
		},
	});

	renderer.render();

	const overlay = mapContainer.children.find(
		(child) => child.id === "emcdynmapplus-planning-live-overlay",
	);
	assert.ok(overlay);

	const townLabels = overlay.children.filter(
		(child) => child.getAttribute?.("data-planning-shape") === "town-label",
	);
	assert.equal(townLabels.length, 2);
	assert.deepEqual(
		townLabels.map((child) => child.textContent),
		["T1", "T2"],
	);

	const firstTownCircle = overlay.children.find(
		(child) =>
			child.getAttribute?.("data-planning-town-id") === "town-1" &&
			child.getAttribute?.("data-planning-shape") === "town",
	);
	assert.ok(firstTownCircle);
	assert.equal(
		Number(townLabels[0].getAttribute("y")) < Number(firstTownCircle.getAttribute("cy")),
		true,
	);
});
