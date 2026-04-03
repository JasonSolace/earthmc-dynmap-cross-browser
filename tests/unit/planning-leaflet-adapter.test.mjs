import test from "node:test";
import assert from "node:assert/strict";

import { loadIifeScript } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

test("planning leaflet adapter uses explicit projection models", () => {
	const { context } = loadIifeScript("resources/planning-leaflet-adapter.js", [], {
		extraGlobals: {
			L: {
				latLng(lat, lng) {
					return { lat, lng };
				},
			},
		},
	});

	const auroraAdapter =
		context.__EMCDYNMAPPLUS_PLANNING_LEAFLET_ADAPTER__.createPlanningLeafletAdapter({
			projectionModel: {
				xScale: 8,
				zScale: -8,
				zOffset: -4,
			},
		});
	assert.deepEqual(normalize(auroraAdapter.getModel()), {
		xScale: 8,
		zScale: -8,
		zOffset: -4,
	});
	assert.deepEqual(normalize(auroraAdapter.worldToLatLng({ x: 3688, z: -9632 })), {
		lat: 1203.5,
		lng: 461,
	});

	const nostraAdapter =
		context.__EMCDYNMAPPLUS_PLANNING_LEAFLET_ADAPTER__.createPlanningLeafletAdapter({
			projectionModel: {
				xScale: 32,
				zScale: -32,
				zOffset: -16,
			},
		});
	assert.deepEqual(normalize(nostraAdapter.getModel()), {
		xScale: 32,
		zScale: -32,
		zOffset: -16,
	});
	assert.deepEqual(normalize(nostraAdapter.worldToLatLng({ x: 3392, z: -8800 })), {
		lat: 274.5,
		lng: 106,
	});
});

test("planning leaflet adapter reads projection models from shared map config", () => {
	const { context } = loadIifeScript("resources/planning-leaflet-adapter.js", [], {
		extraGlobals: {
			L: {
				latLng(lat, lng) {
					return { lat, lng };
				},
			},
			EMCDYNMAPPLUS_MAP: {
				getCurrentMapType: () => "nostra",
				getPlanningLeafletProjection: (mapType) =>
					mapType === "nostra"
						? { xScale: 32, zScale: -32, zOffset: -16 }
						: { xScale: 8, zScale: -8, zOffset: -4 },
			},
		},
	});

	const adapter =
		context.__EMCDYNMAPPLUS_PLANNING_LEAFLET_ADAPTER__.createPlanningLeafletAdapter();
	assert.deepEqual(normalize(adapter.getModel()), {
		xScale: 32,
		zScale: -32,
		zOffset: -16,
	});
	assert.deepEqual(normalize(adapter.latLngToWorld({ lat: 274.5, lng: 106 })), {
		x: 3392,
		z: -8800,
	});
});
