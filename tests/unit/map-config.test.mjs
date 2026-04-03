import test from "node:test";
import assert from "node:assert/strict";

import { loadIifeScript } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

test("map-config detects map type and defaults unknown hosts to aurora", () => {
	const { context } = loadIifeScript("resources/map-config.js", [], {
		locationHref: "https://map.earthmc.net/",
	});
	const mapConfig = context.EMCDYNMAPPLUS_MAP;

	assert.equal(mapConfig.detectMapTypeFromHostname("map.earthmc.net"), "aurora");
	assert.equal(
		mapConfig.detectMapTypeFromHostname("nostra.earthmc.net"),
		"nostra",
	);
	assert.equal(mapConfig.detectMapTypeFromHostname("example.com"), null);
	assert.equal(mapConfig.getCurrentMapType("example.com"), "aurora");
});

test("map-config builds map API URLs with normalized slashes", () => {
	const { context } = loadIifeScript("resources/map-config.js", [], {
		locationHref: "https://nostra.earthmc.net/",
	});
	const mapConfig = context.EMCDYNMAPPLUS_MAP;

	assert.equal(
		mapConfig.getMapApiUrl("https://api.earthmc.net/v3/", "/towns", "nostra"),
		"https://api.earthmc.net/v3/nostra/towns",
	);
	assert.equal(
		mapConfig.getMapApiUrl("https://emcstats.bot.nu", "", "aurora"),
		"https://emcstats.bot.nu/aurora",
	);
});

test("map-config exposes active border and chunk settings per map", () => {
	const { context } = loadIifeScript("resources/map-config.js", [], {
		locationHref: "https://nostra.earthmc.net/",
	});
	const mapConfig = context.EMCDYNMAPPLUS_MAP;

	assert.deepEqual(normalize(mapConfig.getBorderResourcePaths("aurora")), {
		country: "resources/borders.aurora.json",
	});
	assert.equal(
		mapConfig.getBorderResourcePath("aurora"),
		"resources/borders.aurora.json",
	);
	assert.equal(
		mapConfig.getBorderResourcePath("aurora", "state"),
		"resources/borders.aurora.json",
	);
	assert.equal(
		mapConfig.getBorderResourcePath("nostra"),
		"resources/borders.nostra.countries.json",
	);
	assert.equal(
		mapConfig.getBorderResourcePath("nostra", "state"),
		"resources/borders.nostra.states-and-countries.json",
	);
	assert.equal(mapConfig.shouldInjectDynmapPlusChunksLayer("aurora"), false);
	assert.equal(mapConfig.shouldInjectDynmapPlusChunksLayer("nostra"), false);
	assert.deepEqual(normalize(mapConfig.getChunkBounds("nostra")), {
		L: -64512,
		R: 64512,
		U: -32256,
		D: 32256,
	});
	assert.deepEqual(normalize(mapConfig.getPlanningLeafletProjection("aurora")), {
		xScale: 8,
		zScale: -8,
		zOffset: -4,
	});
	assert.deepEqual(normalize(mapConfig.getPlanningLeafletProjection("nostra")), {
		xScale: 32,
		zScale: -32,
		zOffset: -16,
	});
});

test("map-config preserves archive URL cutovers and nation bonus tiers", () => {
	const { context } = loadIifeScript("resources/map-config.js", [], {
		locationHref: "https://map.earthmc.net/",
	});
	const mapConfig = context.EMCDYNMAPPLUS_MAP;

	assert.equal(mapConfig.getNationClaimBonus(19, "aurora"), 0);
	assert.equal(mapConfig.getNationClaimBonus(20, "aurora"), 10);
	assert.equal(mapConfig.getNationClaimBonus(120, "nostra"), 80);
	assert.equal(
		mapConfig.getArchiveMarkersSourceUrl(20230211),
		"https://earthmc.net/map/aurora/tiles/_markers_/marker_earth.json",
	);
	assert.equal(
		mapConfig.getArchiveMarkersSourceUrl(20230212),
		"https://earthmc.net/map/aurora/standalone/MySQL_markers.php?marker=_markers_/marker_earth.json",
	);
	assert.equal(
		mapConfig.getArchiveMarkersSourceUrl(20240701),
		"https://map.earthmc.net/tiles/minecraft_overworld/markers.json",
	);
});
