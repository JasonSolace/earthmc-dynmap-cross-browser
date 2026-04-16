import test from "node:test";
import assert from "node:assert/strict";

import { loadIifeScript } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

function loadInterceptor(options = {}) {
	return loadIifeScript(
		"resources/interceptor.js",
		["getRequestUrl", "getResponseUrl", "parseTileRequestInfo"],
		options,
	);
}

test("interceptor resolves relative request and response urls against the current origin", () => {
	const { exports } = loadInterceptor({
		locationHref: "https://map.earthmc.net/map",
	});

	assert.equal(
		exports.getRequestUrl("tiles/minecraft_overworld/2/0_-9.png"),
		"https://map.earthmc.net/tiles/minecraft_overworld/2/0_-9.png",
	);
	assert.equal(
		exports.getResponseUrl(
			{ url: "tiles/minecraft_overworld/2/0_-9.png" },
			"",
		),
		"https://map.earthmc.net/tiles/minecraft_overworld/2/0_-9.png",
	);
});

test("interceptor parses both relative and absolute tile urls", () => {
	const { exports } = loadInterceptor({
		locationHref: "https://map.earthmc.net/map",
	});

	assert.deepEqual(
		normalize(exports.parseTileRequestInfo("tiles/minecraft_overworld/2/-1_-10.png")),
		{
			world: "minecraft_overworld",
			zoom: 2,
			tileX: -1,
			tileY: -10,
			url: "tiles/minecraft_overworld/2/-1_-10.png",
		},
	);
	assert.deepEqual(
		normalize(exports.parseTileRequestInfo(
			"https://map.earthmc.net/tiles/minecraft_overworld/2/2_-9.png",
		)),
		{
			world: "minecraft_overworld",
			zoom: 2,
			tileX: 2,
			tileY: -9,
			url: "https://map.earthmc.net/tiles/minecraft_overworld/2/2_-9.png",
		},
	);
});

test("interceptor returns the first response without refetching when post-fetch processing fails", async () => {
	const response = {
		ok: true,
		status: 200,
		url: "tiles/minecraft_overworld/2/0_-9.png",
	};
	let fetchCalls = 0;

	const { context, document } = loadInterceptor({
		locationHref: "https://map.earthmc.net/map",
		fetchImpl: async () => {
			fetchCalls += 1;
			return response;
		},
	});

	document.documentElement.setAttribute = () => {
		throw new TypeError("setAttribute failed");
	};

	const result = await context.fetch("tiles/minecraft_overworld/2/0_-9.png");
	assert.equal(result, response);
	assert.equal(fetchCalls, 1);
});
