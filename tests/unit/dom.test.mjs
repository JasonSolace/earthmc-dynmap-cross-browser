import test from "node:test";
import assert from "node:assert/strict";

import { loadPlainScript } from "./helpers/script-harness.mjs";

test("insertSidebarMenu keeps the toolkit box ahead of Leaflet's layer toggle", async () => {
	const env = loadPlainScript("src/dom.js", ["insertSidebarMenu"], {
		extraGlobals: {
			addMainMenu(parent) {
				const sidebar = env.document.createElement("details");
				sidebar.id = "sidebar";
				return sidebar;
			},
		},
	});

	const host = env.document.createElement("div");
	const layerToggle = env.document.createElement("div");
	layerToggle.className = "leaflet-control-layers";
	host.appendChild(layerToggle);

	Object.defineProperty(host, "firstChild", {
		get() {
			return this.children[0] ?? null;
		},
	});

	env.document.__setQuery(".leaflet-top.leaflet-left", host);

	const sidebar = await env.exports.insertSidebarMenu();

	assert.equal(sidebar?.id, "sidebar");
	assert.equal(host.children.length, 2);
	assert.equal(host.children[0], sidebar);
	assert.equal(host.children[1], layerToggle);
});
