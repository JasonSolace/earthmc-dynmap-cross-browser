import test from "node:test";
import assert from "node:assert/strict";

import { loadPlainScript } from "./helpers/script-harness.mjs";

function appendChildren(parent, children) {
	if (Array.isArray(children)) {
		children.forEach((child) => appendChildren(parent, child));
		return parent;
	}

	if (children == null || children === false) return parent;
	parent.append(children);
	return parent;
}

function createDomHelpers(document) {
	function createElement(tagName, options = {}, children = []) {
		const element = document.createElement(tagName);
		if (options.id) element.id = options.id;
		if (options.className) element.className = options.className;
		if (options.text != null) element.textContent = String(options.text);
		if (options.type) element.type = options.type;
		if (options.src) element.src = options.src;
		if (options.href) element.href = options.href;
		if (options.target) element.target = options.target;
		if (options.rel) element.rel = options.rel;
		if (options.placeholder) element.placeholder = options.placeholder;
		if (options.style) Object.assign(element.style, options.style);
		for (const [name, value] of Object.entries(options.attrs ?? {})) {
			element.setAttribute(name, value);
		}

		appendChildren(element, children);
		return element;
	}

	function addElement(parent, child) {
		parent.appendChild(child);
		return child;
	}

	return { createElement, addElement };
}

function loadMain({
	now = Date.UTC(2026, 2, 31),
	playerResponse = [],
	fetchJSON = async () => ({}),
	showAlert = () => {},
} = {}) {
	const env = loadPlainScript("src/main.js", [
		"lookupPlayer",
		"timeAgo",
		"getEventElement",
		"getNameplatePlayerName",
		"getSquaremapPlayerListLink",
		"resolveSquaremapPlayerName",
	], {
		now,
		fetchImpl: async (url, options = {}) => ({
			ok: true,
			status: 200,
			url: String(url),
			clone() {
				return this;
			},
			async json() {
				if (String(url).includes("example.test/players")) return playerResponse;
				return {};
			},
		}),
		extraGlobals: {
			waitForElement() {
				return new Promise(() => {});
			},
			fetchJSON,
			postJSON: async () => playerResponse,
			getCurrentOapiUrl(resource) {
				return `https://example.test/${resource}`;
			},
			showAlert,
		},
	});

	Object.assign(env.context, createDomHelpers(env.document));
	return env;
}

test("main formats relative dates for day, month, and year ranges", () => {
	const now = Date.UTC(2026, 2, 31);
	const { exports } = loadMain({ now });

	assert.equal(exports.timeAgo(now - 3 * 86400000), "3 days ago");
	assert.equal(exports.timeAgo(now - 45 * 86400000), "1 month ago");
	assert.equal(exports.timeAgo(now - 800 * 86400000), "2 years ago");
	assert.equal(exports.timeAgo(now - 1000), "Today");
});

test("main renders player lookup safely for townless and offline players", async () => {
	const alerts = [];
	const registered = Date.UTC(2026, 0, 1);
	const lastOnline = Date.UTC(2026, 2, 30);
	const playerResponse = [
		{
			name: "SoloPlayer",
			uuid: "12345678-1234-1234-1234-123456789012",
			about: "/res set about [msg]",
			status: {
				hasTown: false,
				isOnline: false,
				isMayor: false,
				isKing: false,
			},
			stats: {
				balance: 42,
			},
			ranks: {
				townRanks: [],
				nationRanks: [],
			},
			timestamps: {
				registered,
				lastOnline,
			},
			town: null,
			nation: null,
		},
	];
	const env = loadMain({
		now: Date.UTC(2026, 2, 31),
		playerResponse,
		showAlert(message) {
			alerts.push(message);
		},
	});

	const leafletTopLeft = env.document.createElement("div");
	env.document.__setQuery(".leaflet-top.leaflet-left", leafletTopLeft);

	await env.exports.lookupPlayer("SoloPlayer");

	assert.deepEqual(alerts, []);
	assert.equal(leafletTopLeft.children.length, 0);

	const lookupHost = env.document.body.children.find(
		(child) => child.id === "emcdynmapplus-player-lookup-host",
	);
	assert.ok(lookupHost);
	assert.equal(lookupHost.children.length, 1);

	const lookup = lookupHost.children[0];
	assert.equal(lookup.id, "player-lookup");
	assert.equal(
		lookup.children[1].children[1].children[0].textContent,
		"SoloPlayer",
	);

	const stats = lookup.children[2];
	const statPairs = stats.children.map((row) => [
		row.children[0].textContent,
		row.children[1].textContent,
	]);
	assert.deepEqual(statPairs, [
		["Rank", "Townless"],
		["Balance", "42 gold"],
	]);

	const meta = lookup.children[3];
	assert.equal(meta.children.length, 2);
	assert.equal(meta.children[0].children[0].textContent, "Registered");
	assert.equal(meta.children[1].children[0].textContent, "Last online");
	assert.equal(meta.children[1].children[2].textContent, "1 day ago");
});

test("main resolves Squaremap player-list clicks to the underlying player name", async () => {
	const fetchUrls = [];
	const env = loadMain({
		fetchJSON: async (url) => {
			fetchUrls.push(url);
			return {
				players: [
					{
						uuid: "da756925413f495490639e19d1be9017",
						name: "Deflects",
					},
				],
			};
		},
	});

	const link = env.document.createElement("a");
	link.id = "da756925413f495490639e19d1be9017";
	const span = env.document.createElement("span");
	span.textContent = "DecoratedDisplayName";
	link.__queryMap.set("span", span);

	const target = env.document.createElement("span");
	target.__closestMap.set("#players a[id]", link);

	assert.equal(env.exports.getSquaremapPlayerListLink(target), link);
	assert.equal(await env.exports.resolveSquaremapPlayerName(link), "Deflects");
	assert.deepEqual(fetchUrls, [
		"https://map.earthmc.net/tiles/players.json",
	]);
});

test("main extracts player names from Squaremap nameplate tooltips", () => {
	const env = loadMain();
	const tooltip = env.document.createElement("div");
	tooltip.textContent = "Deflects";

	const target = env.document.createElement("img");
	target.__closestMap.set(".leaflet-nameplate-pane .leaflet-tooltip", tooltip);

	assert.equal(env.exports.getNameplatePlayerName(target), "Deflects");
});

test("main normalizes text-node event targets to their parent element", () => {
	const env = loadMain();
	const parent = env.document.createElement("span");
	const textNode = {
		parentElement: parent,
	};

	assert.equal(env.exports.getEventElement(textNode), parent);
});
