import test from "node:test";
import assert from "node:assert/strict";

import { loadPlainScript } from "./helpers/script-harness.mjs";

const normalize = (value) => JSON.parse(JSON.stringify(value));

function loadHttpUtil(options = {}) {
	return loadPlainScript(
		"src/httputil.js",
		["TokenBucket", "chunkArr", "queryConcurrent"],
		options,
	);
}

test("httputil splits OAPI requests into fixed-size batches", () => {
	const { exports } = loadHttpUtil();
	assert.deepEqual(normalize(exports.chunkArr([1, 2, 3, 4, 5], 2)), [
		[1, 2],
		[3, 4],
		[5],
	]);
});

test("httputil token buckets restore and refill from cached state", () => {
	const { exports, context } = loadHttpUtil({
		localStorageSeed: {
			testBucket: JSON.stringify({
				tokens: 0.5,
				lastRefill: 5_000,
			}),
		},
		now: 10_000,
	});

	const bucket = new exports.TokenBucket({
		capacity: 2,
		refillRate: 1,
		storageKey: "testBucket",
	});
	assert.equal(bucket.tokens, 2);

	context.Date.__now = 11_500;
	bucket.tokens = 0;
	bucket.lastRefill = 10_000;
	bucket.refill();
	assert.equal(bucket.tokens, 1.5);
});

test("httputil batches concurrent UUID lookups and flattens responses", async () => {
	const calls = [];
	const { exports } = loadHttpUtil({
		fetchImpl: async (url, options = {}) => {
			calls.push({
				url: String(url),
				body: options.body,
			});
			return {
				ok: true,
				status: 200,
				url: String(url),
				clone() {
					return this;
				},
				async json() {
					const body = JSON.parse(options.body);
					return body.query.map((uuid) => ({ uuid }));
				},
			};
		},
	});

	const input = Array.from({ length: 205 }, (_, index) => ({
		uuid: `uuid-${index}`,
	}));
	const result = await exports.queryConcurrent(
		"https://api.earthmc.net/v4/aurora/nations",
		input,
	);

	assert.equal(calls.length, 3);
	assert.equal(result.length, 205);
	assert.deepEqual(result[0], { uuid: "uuid-0" });
	assert.deepEqual(result.at(-1), { uuid: "uuid-204" });
});
