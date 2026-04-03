import test from "node:test";
import assert from "node:assert/strict";

import { loadIifeScripts } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

function loadPlanningRuntime(options = {}) {
	return loadIifeScripts(
		[
			"resources/planning-state.js",
			"resources/planning-runtime.js",
		],
		[
			"createPlanningRuntime",
			"dispatchPlanningStateUpdated",
			"PLANNING_STATE_UPDATED_EVENT",
		],
		options,
	);
}

test("planning runtime syncs initial storage state and refreshes on update events", () => {
	const { context, exports, localStorage } = loadPlanningRuntime({
		localStorageSeed: {
			"emcdynmapplus-planner-nations": JSON.stringify([
				{
					name: "First Nation",
					center: { x: 10, z: -20 },
					rangeRadiusBlocks: 5000,
				},
			]),
		},
	});

	const planningState =
		context.__EMCDYNMAPPLUS_PLANNING_STATE__?.createPlanningState?.();
	const runtime = exports.createPlanningRuntime({
		loadPlanningNations: () => planningState.loadPlanningNations(),
	});

	const initialSnapshot = runtime.init();
	assert.deepEqual(normalize(initialSnapshot), {
		nations: [
			{
				name: "First Nation",
				center: { x: 10, z: -20 },
				rangeRadiusBlocks: 5000,
			},
		],
		source: "planning-runtime-init",
		detail: null,
	});

	localStorage["emcdynmapplus-planner-nations"] = JSON.stringify([
		{
			name: "Second Nation",
			center: { x: 33, z: 44 },
			rangeRadiusBlocks: 3200,
		},
	]);
	assert.equal(
		exports.dispatchPlanningStateUpdated({
			source: "unit-test",
			reason: "changed-storage",
		}),
		true,
	);

	assert.deepEqual(normalize(runtime.getSnapshot()), {
		nations: [
			{
				name: "Second Nation",
				center: { x: 33, z: 44 },
				rangeRadiusBlocks: 3200,
			},
		],
		source: "unit-test",
		detail: {
			source: "unit-test",
			reason: "changed-storage",
		},
	});
});

test("planning runtime exports the shared update event constant", () => {
	const { exports } = loadPlanningRuntime();

	assert.equal(
		exports.PLANNING_STATE_UPDATED_EVENT,
		"EMCDYNMAPPLUS_PLANNING_STATE_UPDATED",
	);
});
