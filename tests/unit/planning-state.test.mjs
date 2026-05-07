import test from "node:test";
import assert from "node:assert/strict";

import { loadIifeScripts } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

function loadPlanningState(options = {}) {
	return loadIifeScripts(
		["resources/planning-state.js"],
		["createPlanningState"],
		options,
	);
}

test("planning state forces saved nations and towns to fixed Nostra planning ranges", () => {
	const { exports } = loadPlanningState({
		localStorageSeed: {
			"emcdynmapplus-planning-default-range": "4200",
			"emcdynmapplus-planner-nations": JSON.stringify([
				{
					name: "Legacy Plan",
					center: { x: 10.2, z: -20.7 },
					rangeRadiusBlocks: 9000,
					towns: [
						{
							name: "Legacy Town",
							x: 5000,
							z: 0,
							rangeRadiusBlocks: 2400,
						},
					],
				},
			]),
		},
	});
	const planningState = exports.createPlanningState();

	assert.deepEqual(normalize(planningState.loadPlanningNations()), [
		{
			id: "hardcoded-demo-nation",
			name: "Legacy Plan",
			color: "#d98936",
			outlineColor: "#fff3cf",
			rangeRadiusBlocks: 5000,
			center: { x: 10, z: -21 },
			towns: [
				{
					id: "hardcoded-demo-town-1",
					name: "Legacy Town",
					x: 5000,
					z: 0,
					rangeRadiusBlocks: 1500,
				},
			],
		},
	]);
	assert.equal(planningState.getPlanningDefaultRange(), 5000);
	assert.equal(planningState.setPlanningDefaultRange(8000), 5000);
});

test("planning state builds an existing nation from parsed map markers", () => {
	const { exports } = loadPlanningState();
	const planningState = exports.createPlanningState();
	const parsedMarkers = [
		{
			townName: "Member Town",
			nationName: "Nostra",
			x: 6200,
			z: 0,
			isCapital: false,
		},
		{
			townName: "Capital Town",
			nationName: "Nostra",
			x: 1000,
			z: -2000,
			isCapital: true,
		},
		{
			townName: "Other Capital",
			nationName: "Other",
			x: 0,
			z: 0,
			isCapital: true,
		},
	];

	const nation = planningState.buildExistingPlanningNation(
		parsedMarkers,
		"Nostra",
		{
			plannedTowns: [
				{
					id: "planned-town-1",
					name: "Planned Town",
					x: 7600,
					z: 0,
					rangeRadiusBlocks: 3000,
				},
			],
		},
	);

	assert.deepEqual(normalize(nation), {
		id: "existing-nation:Nostra",
		name: "Nostra",
		color: "#d98936",
		outlineColor: "#fff3cf",
		rangeRadiusBlocks: 5000,
		center: { x: 1000, z: -2000 },
		source: "existing",
		existingNationName: "Nostra",
		towns: [
			{
				id: "existing-town:Nostra:Member Town",
				name: "Member Town",
				x: 6200,
				z: 0,
				rangeRadiusBlocks: 1500,
				source: "existing",
			},
			{
				id: "existing-town:Nostra:Capital Town",
				name: "Capital Town",
				x: 1000,
				z: -2000,
				rangeRadiusBlocks: 1500,
				source: "existing",
				isCapital: true,
			},
			{
				id: "planned-town-1",
				name: "Planned Town",
				x: 7600,
				z: 0,
				rangeRadiusBlocks: 1500,
				source: "planned",
			},
		],
	});
});

test("planning state prefers cached official town coordinates for existing nations", () => {
	const { exports } = loadPlanningState({
		localStorageSeed: {
			"emcdynmapplus-planning-existing-town-coordinates-v2": JSON.stringify({
				"nostra:capital town": { x: 111, z: 222 },
				"nostra:member town": { x: 333, z: 444 },
			}),
		},
	});
	const planningState = exports.createPlanningState();

	const nation = planningState.buildExistingPlanningNation(
		[
			{
				townName: "Capital Town",
				nationName: "Nostra",
				x: 0,
				z: 0,
				isCapital: true,
			},
			{
				townName: "Member Town",
				nationName: "Nostra",
				x: 5000,
				z: 0,
				isCapital: false,
			},
		],
		"Nostra",
	);

	assert.deepEqual(normalize(nation.center), { x: 111, z: 222 });
	assert.deepEqual(
		normalize(
		nation.towns.map((town) => ({ name: town.name, x: town.x, z: town.z })),
		),
		[
			{ name: "Capital Town", x: 111, z: 222 },
			{ name: "Member Town", x: 333, z: 444 },
		],
	);
});

test("planning state ignores legacy existing-town coordinate cache entries", () => {
	const { exports } = loadPlanningState({
		localStorageSeed: {
			"emcdynmapplus-planning-existing-town-coordinates": JSON.stringify({
				"narmada:sita": { x: 27967, z: -312 },
			}),
		},
	});
	const planningState = exports.createPlanningState();

	const nation = planningState.buildExistingPlanningNation(
		[
			{
				townName: "Sita",
				nationName: "Narmada",
				x: 27960,
				z: -312,
				isCapital: true,
			},
		],
		"Narmada",
	);

	assert.deepEqual(normalize(nation.center), { x: 27960, z: -312 });
});

test("planning state can cache home-block centered town coordinates", () => {
	const { exports } = loadPlanningState();
	const planningState = exports.createPlanningState();

	assert.deepEqual(
		normalize(
			planningState.saveExistingTownCoordinates({
				"narmada:sita": {
					x: 1747 * 16 + 8,
					z: -20 * 16 + 8,
				},
			}),
		),
		{
			"narmada:sita": {
				x: 27960,
				z: -312,
			},
		},
	);
});

test("planning state clears incompatible session data when switching source modes", () => {
	const { exports, localStorage } = loadPlanningState({
		localStorageSeed: {
			"emcdynmapplus-planning-mode": "planned",
			"emcdynmapplus-planner-nations": JSON.stringify([
				{
					center: { x: 0, z: 0 },
					towns: [{ x: 100, z: 100 }],
				},
			]),
		},
	});
	const planningState = exports.createPlanningState();

	assert.equal(planningState.setSelectedExistingNationName("Nostra"), "Nostra");
	assert.equal(planningState.getPlanningMode(), "existing");
	assert.deepEqual(JSON.parse(localStorage["emcdynmapplus-planner-nations"]), []);
	assert.deepEqual(
		JSON.parse(localStorage["emcdynmapplus-planning-existing-planned-towns"]),
		[],
	);

	planningState.saveExistingPlanningTowns([{ x: 10, z: 20 }]);
	assert.equal(planningState.setPlanningMode("planned"), "planned");
	assert.equal(localStorage["emcdynmapplus-planning-existing-nation"], undefined);
	assert.deepEqual(
		JSON.parse(localStorage["emcdynmapplus-planning-existing-planned-towns"]),
		[],
	);
});
