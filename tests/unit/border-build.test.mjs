import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("border build script does not target legacy aurora borders output", () => {
	const source = readFileSync("scripts/build-border-resources.mjs", "utf8");

	assert.match(source, /LEGACY_AURORA_BORDERS_OUTPUT = "resources\/borders\.aurora\.json"/);
	assert.doesNotMatch(source, /output:\s*"resources\/borders\.aurora\.json"/);
});
