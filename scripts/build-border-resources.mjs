import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const LEGACY_AURORA_BORDERS_OUTPUT = "resources/borders.aurora.json";

const SOURCE_INPUTS = Object.freeze({
	countries: "sources/geojson/countries.geojson",
	statesAndCountries: "sources/geojson/states-and-countries.geojson",
});

const TARGETS = Object.freeze([
	Object.freeze({
		name: "nostra-country",
		output: "resources/borders.nostra.countries.json",
		inputs: [SOURCE_INPUTS.countries],
		projection: {
			xMin: -64512,
			xMax: 64512,
			zMin: -32256,
			zMax: 32256,
		},
	}),
	Object.freeze({
		name: "nostra-state",
		output: "resources/borders.nostra.states-and-countries.json",
		inputs: [SOURCE_INPUTS.statesAndCountries],
		projection: {
			xMin: -64512,
			xMax: 64512,
			zMin: -32256,
			zMax: 32256,
		},
	}),
]);

function buildTargetArgs(target) {
	const args = [
		"scripts/build-deduped-borders-geojson.mjs",
		target.output,
	];

	for (const inputPath of target.inputs) {
		args.push("--input", inputPath);
	}

	args.push(
		"--x-min", String(target.projection.xMin),
		"--x-max", String(target.projection.xMax),
		"--z-min", String(target.projection.zMin),
		"--z-max", String(target.projection.zMax),
	);

	return args;
}

function ensureTargetInputsExist(target) {
	const missingInputs = target.inputs.filter((inputPath) => !existsSync(inputPath));
	if (missingInputs.length === 0) return;

	console.error(`Missing GeoJSON inputs for ${target.name}:`);
	for (const inputPath of missingInputs) {
		console.error(`  - ${inputPath}`);
	}
	process.exit(1);
}

function ensureTargetOutputIsNotLegacyAurora(target) {
	if (target.output !== LEGACY_AURORA_BORDERS_OUTPUT) return;

	console.error(
		`Refusing to build legacy Aurora borders output: ${LEGACY_AURORA_BORDERS_OUTPUT}`,
	);
	process.exit(1);
}

for (const target of TARGETS) {
	ensureTargetInputsExist(target);
	ensureTargetOutputIsNotLegacyAurora(target);
	console.log(`Building ${target.name} -> ${target.output}`);

	const result = spawnSync(process.execPath, buildTargetArgs(target), {
		stdio: "inherit",
	});

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
