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

test("editUILayout keeps zoom near the top-left layer controls while grouping link and coordinates at bottom-left", async () => {
	const env = loadPlainScript("src/dom.js", ["editUILayout"], {});

	const topLeft = env.document.createElement("div");
	const bottomLeft = env.document.createElement("div");
	const sidebar = env.document.createElement("details");
	sidebar.id = "sidebar";
	const layerToggle = env.document.createElement("div");
	layerToggle.className = "leaflet-control-layers";
	const zoomControl = env.document.createElement("div");
	zoomControl.className = "leaflet-control-zoom leaflet-bar";
	const coordinates = env.document.createElement("div");
	coordinates.className = "leaflet-control-layers coordinates";
	const link = env.document.createElement("div");
	link.className = "leaflet-control-layers link leaflet-control";
	const anchor = env.document.createElement("a");
	anchor.href = "https://map.earthmc.net/?zoom=1";
	link.__queryMap.set("a", anchor);
	const nameplatePane = env.document.createElement("div");

	topLeft.appendChild(sidebar);
	topLeft.appendChild(layerToggle);

	env.document.__setQuery(".leaflet-top.leaflet-left", topLeft);
	env.document.__setQuery(".leaflet-bottom.leaflet-left", bottomLeft);
	env.document.__setQuery(".leaflet-control-layers.coordinates", coordinates);
	env.document.__setQuery(".leaflet-control-layers.link", link);
	env.document.__setQuery(".leaflet-control-zoom", zoomControl);
	env.document.__setQuery(".leaflet-nameplate-pane", nameplatePane);

	await env.exports.editUILayout();

	assert.equal(topLeft.children.length, 3);
	assert.equal(topLeft.children[0], sidebar);
	assert.equal(topLeft.children[1], layerToggle);
	assert.equal(topLeft.children[2], zoomControl);

	assert.equal(bottomLeft.children.length, 1);
	assert.equal(bottomLeft.children[0]?.id, "coords-container");
	assert.equal(bottomLeft.children[0]?.children[0], link);
	assert.equal(bottomLeft.children[0]?.children[1], coordinates);
});
