import test from "node:test";
import assert from "node:assert/strict";

import { loadIifeScript } from "./helpers/script-harness.mjs";

function loadPageMapHelper() {
	return loadIifeScript(
		"resources/marker-engine-page-map.js",
		["createMarkerEnginePageMap"],
	);
}

test("page-map helper underzooms tile layers by pinning native min zoom at zero", () => {
	const { exports } = loadPageMapHelper();
	const helper = exports.createMarkerEnginePageMap({
		syntheticUnderzoomConfig: {
			enabled: true,
			minZoom: -2,
			minNativeZoom: 0,
		},
	});

	let redrawCalls = 0;
	const layer = {
		options: {
			minZoom: 0,
		},
		getTileUrl() {
			return "https://map.earthmc.net/tiles/minecraft_overworld/0/0_0.png";
		},
		redraw() {
			redrawCalls += 1;
		},
	};

	assert.equal(helper.applySyntheticUnderzoomToLayer(layer), true);
	assert.equal(layer.options.minNativeZoom, 0);
	assert.equal(layer.options.minZoom, -2);
	assert.equal(redrawCalls, 1);
});

test("page-map helper updates map min zoom, existing layers, and future layeradd events", () => {
	const { exports } = loadPageMapHelper();
	const helper = exports.createMarkerEnginePageMap({
		syntheticUnderzoomConfig: {
			enabled: true,
			minZoom: -2,
			minNativeZoom: 0,
		},
	});

	const listeners = new Map();
	const existingLayer = {
		options: {
			minZoom: 0,
		},
		createTile() {},
	};
	const futureLayer = {
		options: {
			minZoom: 0,
		},
		getTileUrl() {
			return "tile";
		},
	};
	let updateZoomLevelsCalls = 0;
	let zoomlevelschangeCalls = 0;
	const map = {
		options: {
			minZoom: 0,
		},
		_layers: {
			base: existingLayer,
		},
		on(type, listener) {
			listeners.set(type, listener);
		},
		fire(type) {
			if (type === "zoomlevelschange") zoomlevelschangeCalls += 1;
		},
		_updateZoomLevels() {
			updateZoomLevelsCalls += 1;
		},
		getZoom() {
			return 0;
		},
	};

	assert.equal(helper.applySyntheticUnderzoomToMap(map), true);
	assert.equal(map.options.minZoom, -2);
	assert.equal(existingLayer.options.minNativeZoom, 0);
	assert.equal(existingLayer.options.minZoom, -2);
	assert.equal(typeof listeners.get("layeradd"), "function");
	assert.equal(updateZoomLevelsCalls, 1);
	assert.equal(zoomlevelschangeCalls, 1);

	listeners.get("layeradd")({ layer: futureLayer });
	assert.equal(futureLayer.options.minNativeZoom, 0);
	assert.equal(futureLayer.options.minZoom, -2);
});

test("page-map helper patches Leaflet zoom floor so scroll and controls can go below zero", () => {
	const { exports, context } = loadPageMapHelper();
	const helper = exports.createMarkerEnginePageMap({
		syntheticUnderzoomConfig: {
			enabled: true,
			minZoom: -2,
			minNativeZoom: 0,
		},
	});

	context.L.Map.prototype.getMinZoom = function getMinZoom() {
		return 0;
	};
	context.L.Map.prototype._limitZoom = function limitZoom(zoom) {
		return Math.max(0, Number(zoom));
	};

	assert.equal(helper.patchLeafletZoomBounds(), true);

	const fakeMap = new context.L.Map();
	assert.equal(fakeMap.getMinZoom(), -2);
	assert.equal(fakeMap._limitZoom(-1), -1);
	assert.equal(fakeMap._limitZoom(-3), -2);
	assert.equal(fakeMap._limitZoom(1), 1);
});

test("page-map helper patches grid-layer clamp so negative zooms reuse native zoom-zero tiles", () => {
	const { exports, context } = loadPageMapHelper();
	context.L.GridLayer = {
		prototype: {},
	};

	const helper = exports.createMarkerEnginePageMap({
		syntheticUnderzoomConfig: {
			enabled: true,
			minZoom: -2,
			minNativeZoom: 0,
		},
	});

	context.L.GridLayer.prototype._clampZoom = function clampZoom(zoom) {
		return Number(zoom);
	};

	assert.equal(helper.patchLeafletGridLayerUnderzoom(), true);

	const fakeGridLayer = {
		options: {
			minZoom: -2,
			minNativeZoom: 0,
		},
	};
	assert.equal(
		context.L.GridLayer.prototype._clampZoom.call(fakeGridLayer, -1),
		0,
	);
	assert.equal(
		context.L.GridLayer.prototype._clampZoom.call(fakeGridLayer, -2),
		0,
	);
	assert.equal(
		context.L.GridLayer.prototype._clampZoom.call(fakeGridLayer, 1),
		1,
	);
});

test("page-map helper patches runtime map registration for maps created before the factory hook", () => {
	const { exports, context } = loadPageMapHelper();
	const helper = exports.createMarkerEnginePageMap();

	let getContainerCalls = 0;
	context.L.Map.prototype.setZoom = function setZoom() {
		return this;
	};

	assert.equal(helper.patchLeafletMapRuntimeRegistration(), true);

	const fakeContainer = context.document.createElement("div");
	const fakeMap = new context.L.Map();
	fakeMap.getContainer = () => {
		getContainerCalls += 1;
		return fakeContainer;
	};
	fakeMap.getZoom = () => 0;
	fakeMap.on = () => {};
	fakeMap.getPane = () => context.document.createElement("div");

	context.L.Map.prototype.setZoom.call(fakeMap, -1);

	const knownMaps = helper.getKnownLeafletMaps();
	assert.equal(knownMaps.length, 1);
	assert.equal(knownMaps[0], fakeMap);
	assert.ok(getContainerCalls >= 1);
});
