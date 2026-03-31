(() => {
const MARKER_ENGINE_GUARD = "__EMCDYNMAPPLUS_MARKER_ENGINE_INITIALIZED__";
if (window[MARKER_ENGINE_GUARD]) {
	try {
		if (localStorage["emcdynmapplus-debug"] === "true") {
			console.info("emcdynmapplus[page-markers]: marker engine already initialized, skipping duplicate injection");
		}
	} catch {}
	return;
}
window[MARKER_ENGINE_GUARD] = true;

const MARKER_ENGINE_PREFIX = "emcdynmapplus[page-markers]";
const PAGE_MAP_PREFIX = "emcdynmapplus[page-map]";
const MARKER_ENGINE_EVENT_PARSED = "EMCDYNMAPPLUS_SYNC_PARSED_MARKERS";
const MARKER_ENGINE_EVENT_ALERT = "EMCDYNMAPPLUS_SHOW_ALERT";
const MARKER_ENGINE_EVENT_ARCHIVE_LABEL = "EMCDYNMAPPLUS_UPDATE_ARCHIVE_LABEL";

const MARKER_ENGINE_HTML = {
	residentClickable: '<span class="resident-clickable">{player}</span>',
	residentList: '<span class="resident-list">\t{list}</span>',
	scrollableResidentList: '<div class="resident-list" id="scrollable-list">\t{list}</div>',
	partOfLabel: '<span id="part-of-label">Part of <b>{allianceList}</b></span>',
};

const MARKER_ENGINE_RESOURCE_BASE = (() => {
	try {
		const src = document.currentScript?.src;
		return src ? new URL(".", src).toString() : "";
	} catch {
		return "";
	}
})();

const PROXY_URL = "https://api.codetabs.com/v1/proxy/?quest=";
const EARTHMC_MAP = globalThis.EMCDYNMAPPLUS_MAP ?? null;
const EMC_DOMAIN = "earthmc.net";
const CAPI_BASE = "https://emcstats.bot.nu";
const OAPI_BASE = `https://api.${EMC_DOMAIN}/v3`;
const OAPI_REQ_PER_MIN = 180;
const OAPI_ITEMS_PER_REQ = 100;

const EXTRA_BORDER_OPTS = {
	label: "Country Border",
	opacity: 0.5,
	weight: 3,
	color: "#000000",
	markup: false,
};

const getCurrentBordersResourcePath = () =>
	EARTHMC_MAP?.getBorderResourcePath?.() ?? "resources/borders.aurora.json";
const getCurrentMapType = () => EARTHMC_MAP?.getCurrentMapType?.() ?? "aurora";
const getCurrentChunkBounds = () =>
	EARTHMC_MAP?.getChunkBounds?.(getCurrentMapType()) ?? {
		L: -33280, R: 33088,
		U: -16640, D: 16512,
	};
const shouldInjectDynmapPlusChunksLayer = () =>
	EARTHMC_MAP?.shouldInjectDynmapPlusChunksLayer?.(getCurrentMapType()) ?? true;
const getCurrentOapiUrl = (resourcePath = "") =>
	EARTHMC_MAP?.getMapApiUrl?.(OAPI_BASE, resourcePath)
		?? `${OAPI_BASE}/aurora${resourcePath ? `/${String(resourcePath).replace(/^\/+/, "")}` : ""}`;
const getCurrentCapiUrl = (resourcePath = "") =>
	EARTHMC_MAP?.getMapApiUrl?.(CAPI_BASE, resourcePath)
		?? `${CAPI_BASE}/aurora${resourcePath ? `/${String(resourcePath).replace(/^\/+/, "")}` : ""}`;
const getArchiveMarkersSourceUrl = (date) =>
	EARTHMC_MAP?.getArchiveMarkersSourceUrl?.(date)
		?? (
			date < 20230212 ? "https://earthmc.net/map/aurora/tiles/_markers_/marker_earth.json" :
			date < 20240701 ? "https://earthmc.net/map/aurora/standalone/MySQL_markers.php?marker=_markers_/marker_earth.json" :
			"https://map.earthmc.net/tiles/minecraft_overworld/markers.json"
		);
const getNationClaimBonus = (numNationResidents) =>
	EARTHMC_MAP?.getNationClaimBonus?.(numNationResidents, getCurrentMapType()) ?? 0;

function getUserscriptBorders() {
	if (typeof BORDERS_BY_MAP !== "undefined") {
		return BORDERS_BY_MAP[getCurrentMapType()] ?? BORDERS_BY_MAP.aurora ?? null;
	}

	if (typeof BORDERS !== "undefined") return BORDERS;
	return null;
}

const DEFAULT_ALLIANCE_COLOURS = { fill: "#000000", outline: "#000000" };
const DEFAULT_BLUE = "#3fb4ff";
const DEFAULT_GREEN = "#89c500";
const CHUNKS_PER_RES = 12;
const PLANNER_STORAGE_KEY = "emcdynmapplus-planner-nations";
const PLANNING_LAYER_ID = "planning-nations";
const PLANNING_LAYER_PREFIX = "emcdynmapplus[planning-layer]";
const DEFAULT_PLANNING_RANGE = 5000;
const PLANNING_CENTER_RADIUS = 48;

let parsedMarkers = [];
let cachedAlliances = null;
let cachedApiNations = null;
let cachedStyledBorders = null;
let pendingBordersLoad = null;

const cachedArchives = new Map();
const pendingArchiveLoads = new Map();
const PAGE_MAPS_KEY = "__EMCDYNMAPPLUS_LEAFLET_MAPS__";
const PAGE_MAP_PATCHED_KEY = "__EMCDYNMAPPLUS_LEAFLET_MAP_PATCHED__";
const PAGE_LAYER_CONTROL_PATCHED_KEY = "__EMCDYNMAPPLUS_PAGE_LAYER_CONTROL_PATCHED__";
const PAGE_MAP_LISTENERS_KEY = "__EMCDYNMAPPLUS_PAGE_MAP_STATE_LISTENERS__";
const PAGE_MAP_ZOOM_ATTR = "data-emcdynmapplus-leaflet-zoom";
const PAGE_MAP_CONTAINER_ATTR = "data-emcdynmapplus-leaflet-map-container";
const PAGE_TILE_ZOOM_ATTR = "data-emcdynmapplus-tile-zoom";
const PAGE_TILE_URL_ATTR = "data-emcdynmapplus-tile-url";
const PAGE_TILE_DOMINANT_ZOOM_ATTR = "data-emcdynmapplus-tile-dominant-zoom";
const PAGE_TILE_SUMMARY_ATTR = "data-emcdynmapplus-tile-zoom-summary";
const PENDING_UI_ALERT_KEY = "emcdynmapplus-pending-ui-alert";
const LAST_LIVE_MAP_MODE_KEY = "emcdynmapplus-last-live-mapmode";
const DYNMAP_PLUS_LAYER_OWNER = "dynmapplus";
const DYNMAP_PLUS_LAYER_SECTION = "dynmapplus";
const DYNMAP_PLUS_LAYER_DEFINITIONS = Object.freeze({
	chunks: Object.freeze({
		id: "chunks",
		name: "Chunks",
		owner: DYNMAP_PLUS_LAYER_OWNER,
		section: DYNMAP_PLUS_LAYER_SECTION,
	}),
	borders: Object.freeze({
		id: "borders",
		name: "Country Borders",
		owner: DYNMAP_PLUS_LAYER_OWNER,
		section: DYNMAP_PLUS_LAYER_SECTION,
	}),
	planningNations: Object.freeze({
		id: PLANNING_LAYER_ID,
		name: "Planning Nations",
		owner: DYNMAP_PLUS_LAYER_OWNER,
		section: DYNMAP_PLUS_LAYER_SECTION,
	}),
});
const DYNMAP_PLUS_LAYER_DEFINITION_BY_ID = new Map(
	Object.values(DYNMAP_PLUS_LAYER_DEFINITIONS).map((definition) => [definition.id, definition]),
);
const DYNMAP_PLUS_LAYER_DEFINITION_BY_NAME = new Map(
	Object.values(DYNMAP_PLUS_LAYER_DEFINITIONS).map((definition) => [definition.name, definition]),
);
const dynmapPlusLayerMetaByLayer = new WeakMap();

function pageMarkersDebugEnabled() {
	try {
		return localStorage["emcdynmapplus-debug"] === "true";
	} catch {
		return false;
	}
}

const pageMarkersDebugInfo = (...args) => {
	if (pageMarkersDebugEnabled()) console.info(...args);
};

function getKnownLeafletMaps() {
	const knownMaps = window[PAGE_MAPS_KEY];
	return Array.isArray(knownMaps) ? knownMaps : [];
}

function ensureKnownLeafletMaps() {
	if (!Array.isArray(window[PAGE_MAPS_KEY])) window[PAGE_MAPS_KEY] = [];
	return window[PAGE_MAPS_KEY];
}

function describeLeafletMap(map, index = null, source = null) {
	if (!map) return null;

	let container = null;
	try {
		container = typeof map.getContainer === "function" ? map.getContainer() : map._container ?? null;
	} catch {}

	let center = null;
	try {
		const currentCenter = typeof map.getCenter === "function" ? map.getCenter() : null;
		if (currentCenter) {
			center = {
				lat: Number(currentCenter.lat?.toFixed?.(3) ?? currentCenter.lat ?? 0),
				lng: Number(currentCenter.lng?.toFixed?.(3) ?? currentCenter.lng ?? 0),
			};
		}
	} catch {}

	let size = null;
	try {
		const currentSize = typeof map.getSize === "function" ? map.getSize() : null;
		if (currentSize) {
			size = {
				x: currentSize.x,
				y: currentSize.y,
			};
		}
	} catch {}

	let layerCount = null;
	try {
		layerCount = map._layers ? Object.keys(map._layers).length : null;
	} catch {}

	return {
		index,
		source,
		zoom: typeof map.getZoom === "function" ? map.getZoom() : null,
		center,
		size,
		layerCount,
		hasOverlayPane: !!map.getPane?.("overlayPane"),
		hasMarkerPane: !!map.getPane?.("markerPane"),
		containerClassName: container?.className || null,
		containerId: container?.id || null,
		containerTagName: container?.tagName || null,
	};
}

function getPrimaryLeafletMap() {
	const knownMaps = getKnownLeafletMaps();
	return knownMaps.find((map) => map?.getContainer?.() instanceof HTMLElement)
		|| knownMaps[0]
		|| null;
}

function publishLeafletMapState(map = null) {
	const targetMap = map || getPrimaryLeafletMap();
	if (!targetMap) return;

	const root = document.documentElement;
	if (!root) return;

	try {
		root.setAttribute(PAGE_MAP_ZOOM_ATTR, String(targetMap.getZoom?.() ?? ""));
		const container = targetMap.getContainer?.();
		const containerInfo = [
			container?.id || null,
			container?.className || null,
		]
			.filter(Boolean)
			.join(" | ");
		root.setAttribute(PAGE_MAP_CONTAINER_ATTR, containerInfo);
	} catch (err) {
		console.warn(`${PAGE_MAP_PREFIX}: failed to publish Leaflet map state`, err);
	}
}

function attachLeafletMapStateListeners(map) {
	if (!map?.on) return;
	if (map[PAGE_MAP_LISTENERS_KEY]) return;

	map.on("zoomend moveend resize load", () => publishLeafletMapState(map));
	map[PAGE_MAP_LISTENERS_KEY] = true;
}

function recordLeafletMap(map, source) {
	if (!map) return map;

	const knownMaps = ensureKnownLeafletMaps();
	if (!knownMaps.includes(map)) {
		knownMaps.push(map);
		attachLeafletMapStateListeners(map);
		publishLeafletMapState(map);
		pageMarkersDebugInfo(`${PAGE_MAP_PREFIX}: registered Leaflet map`, describeLeafletMap(map, knownMaps.length - 1, source));
	}

	return map;
}

function exposeLeafletMapDiagnostics() {
	window.EMCDYNMAPPLUS_PAGE_MAP_DEBUG = {
		getKnownMaps: () => getKnownLeafletMaps().map((map, index) => describeLeafletMap(map, index, "known-map")),
		logKnownMaps: () => {
			const details = getKnownLeafletMaps().map((map, index) => describeLeafletMap(map, index, "known-map"));
			console.info(`${PAGE_MAP_PREFIX}: known map diagnostics`, details);
			return details;
		},
	};
}

function patchLeafletMapCreation() {
	if (window[PAGE_MAP_PATCHED_KEY]) return true;
	if (!window.L?.Map || typeof window.L.map !== "function") return false;

	window[PAGE_MAP_PATCHED_KEY] = true;

	try {
		window.L.Map.addInitHook(function addDynmapPlusInitHook() {
			recordLeafletMap(this, "map-init-hook");
		});
	} catch (err) {
		console.warn(`${PAGE_MAP_PREFIX}: failed to add Leaflet init hook`, err);
	}

	const originalLeafletMapFactory = window.L.map;
	window.L.map = function patchedLeafletMapFactory(...args) {
		const createdMap = originalLeafletMapFactory.apply(this, args);
		recordLeafletMap(createdMap, "L.map-factory");
		return createdMap;
	};

	pageMarkersDebugInfo(`${PAGE_MAP_PREFIX}: patched Leaflet map creation hooks`);
	return true;
}

function tryScanWindowForLeafletMaps() {
	if (!window.L?.Map) return [];

	const foundMaps = [];
	for (const [key, value] of Object.entries(window)) {
		try {
			if (!(value instanceof window.L.Map)) continue;
			recordLeafletMap(value, `window.${key}`);
			foundMaps.push(key);
		} catch {}
	}

	if (foundMaps.length > 0) {
		pageMarkersDebugInfo(`${PAGE_MAP_PREFIX}: found Leaflet maps on window`, { keys: foundMaps });
	}

	return foundMaps;
}

function initLeafletMapDiagnostics() {
	exposeLeafletMapDiagnostics();

	let attempts = 0;
	const maxAttempts = 80;
	const poll = () => {
		attempts += 1;
		const mapPatched = patchLeafletMapCreation();
		const layerControlPatched = patchLeafletLayerControls();
		if (mapPatched && layerControlPatched) {
			tryScanWindowForLeafletMaps();
			pageMarkersDebugInfo(`${PAGE_MAP_PREFIX}: diagnostics ready`, {
				attempts,
				knownMaps: getKnownLeafletMaps().map((map, index) => describeLeafletMap(map, index, "ready")),
			});
			return;
		}

		if (attempts >= maxAttempts) {
			pageMarkersDebugInfo(`${PAGE_MAP_PREFIX}: Leaflet diagnostics timed out waiting for Leaflet map/control constructors`);
			return;
		}

		setTimeout(poll, 250);
	};

	poll();
}

function getDynmapPlusLayerMeta(definition) {
	if (!definition) return null;

	return {
		owner: definition.owner,
		section: definition.section,
		layerId: definition.id,
		layerName: definition.name,
	};
}

function createDynmapPlusManagedLayer(definition, layerEntry) {
	return {
		...layerEntry,
		id: definition.id,
		name: definition.name,
		emcdynmapplusMeta: getDynmapPlusLayerMeta(definition),
	};
}

function normalizeDynmapPlusLayerMeta(meta) {
	if (!meta || meta.owner !== DYNMAP_PLUS_LAYER_OWNER || typeof meta.layerId !== "string") return null;

	const definition = DYNMAP_PLUS_LAYER_DEFINITION_BY_ID.get(meta.layerId) || DYNMAP_PLUS_LAYER_DEFINITION_BY_NAME.get(meta.layerName);
	const normalized = definition ? getDynmapPlusLayerMeta(definition) : {
		owner: DYNMAP_PLUS_LAYER_OWNER,
		section: meta.section || DYNMAP_PLUS_LAYER_SECTION,
		layerId: meta.layerId,
		layerName: meta.layerName || meta.layerId,
	};
	return normalized;
}

function resolveDynmapPlusLayerMeta(name, layer) {
	const explicitMeta = normalizeDynmapPlusLayerMeta(layer?.options?.emcdynmapplusMeta || layer?.emcdynmapplusMeta);
	if (explicitMeta) return explicitMeta;

	const definition =
		DYNMAP_PLUS_LAYER_DEFINITION_BY_NAME.get(name)
		|| DYNMAP_PLUS_LAYER_DEFINITION_BY_ID.get(layer?.options?.id)
		|| DYNMAP_PLUS_LAYER_DEFINITION_BY_ID.get(layer?.id);
	return definition ? getDynmapPlusLayerMeta(definition) : null;
}

function applyDynmapPlusLayerMetaToControlLabel(label, meta) {
	if (!(label instanceof HTMLElement) || !meta) return;

	label.classList.add("emcdynmapplus-layer-option");
	label.dataset.emcdynmapplusLayerOwner = meta.owner;
	label.dataset.emcdynmapplusLayerSection = meta.section;
	label.dataset.emcdynmapplusLayerId = meta.layerId;
	if (meta.layerName) label.dataset.emcdynmapplusLayerName = meta.layerName;

	const input = label.querySelector("input.leaflet-control-layers-selector");
	if (input instanceof HTMLElement) {
		input.dataset.emcdynmapplusLayerOwner = meta.owner;
		input.dataset.emcdynmapplusLayerSection = meta.section;
		input.dataset.emcdynmapplusLayerId = meta.layerId;
		if (meta.layerName) input.dataset.emcdynmapplusLayerName = meta.layerName;
	}
}

function isDynmapPlusManagedLayerDataEntry(entry) {
	if (!entry || typeof entry !== "object") return false;

	const explicitMeta = normalizeDynmapPlusLayerMeta(entry.emcdynmapplusMeta);
	if (explicitMeta) return true;

	const definition =
		DYNMAP_PLUS_LAYER_DEFINITION_BY_ID.get(entry.id)
		|| DYNMAP_PLUS_LAYER_DEFINITION_BY_NAME.get(entry.name);
	return !!definition;
}

function stripDynmapPlusManagedLayers(data) {
	return data.filter((entry) => !isDynmapPlusManagedLayerDataEntry(entry));
}

function appendDynmapPlusManagedLayer(data, definition, layerEntry) {
	const nextData = data.filter((entry) => {
		const explicitMeta = normalizeDynmapPlusLayerMeta(entry?.emcdynmapplusMeta);
		if (explicitMeta) return explicitMeta.layerId !== definition.id;

		return entry?.id !== definition.id && entry?.name !== definition.name;
	});
	nextData.push(createDynmapPlusManagedLayer(definition, layerEntry));
	return nextData;
}

function removeExistingDynmapPlusLayerRegistration(control, meta) {
	if (!control || !meta?.layerId) return;

	if (Array.isArray(control._layers)) {
		control._layers = control._layers.filter((entry) => {
			const entryMeta = dynmapPlusLayerMetaByLayer.get(entry?.layer) || resolveDynmapPlusLayerMeta(entry?.name, entry?.layer);
			return !entryMeta || entryMeta.owner !== meta.owner || entryMeta.layerId !== meta.layerId;
		});
	}

	const container = control._container;
	if (!(container instanceof HTMLElement)) return;

	const existingLabels = container.querySelectorAll(
		`label[data-emcdynmapplus-layer-owner="${meta.owner}"][data-emcdynmapplus-layer-id="${meta.layerId}"]`,
	);
	for (const label of existingLabels) {
		label.remove();
	}
}

function normalizeDynmapPlusLayerRegistrations(control) {
	if (!control || !Array.isArray(control._layers)) return;

	const seenLayerKeys = new Set();
	control._layers = control._layers.filter((entry) => {
		const entryMeta = dynmapPlusLayerMetaByLayer.get(entry?.layer) || resolveDynmapPlusLayerMeta(entry?.name, entry?.layer);
		if (!entryMeta) return true;

		const key = `${entryMeta.owner}:${entryMeta.layerId}`;
		if (seenLayerKeys.has(key)) return false;
		seenLayerKeys.add(key);
		return true;
	});
}

function patchLeafletLayerControls() {
	if (window[PAGE_LAYER_CONTROL_PATCHED_KEY]) return true;
	if (!window.L?.Control?.Layers?.prototype) return false;

	window[PAGE_LAYER_CONTROL_PATCHED_KEY] = true;
	const originalAddLayer = window.L.Control.Layers.prototype._addLayer;
	const originalAddItem = window.L.Control.Layers.prototype._addItem;
	const originalUpdate = window.L.Control.Layers.prototype._update;

	window.L.Control.Layers.prototype._addLayer = function patchedDynmapPlusLayerAdd(layer, name, overlay) {
		const meta = overlay && layer && typeof layer === "object"
			? resolveDynmapPlusLayerMeta(name, layer)
			: null;
		if (meta) {
			removeExistingDynmapPlusLayerRegistration(this, meta);
		}

		const result = originalAddLayer.call(this, layer, name, overlay);
		if (!overlay || !layer || typeof layer !== "object") return result;

		if (meta) {
			dynmapPlusLayerMetaByLayer.set(layer, meta);
			layer.emcdynmapplusMeta = meta;
		}
		return result;
	};

	window.L.Control.Layers.prototype._addItem = function patchedDynmapPlusLayerItem(obj) {
		const label = originalAddItem.call(this, obj);
		const meta = dynmapPlusLayerMetaByLayer.get(obj?.layer) || resolveDynmapPlusLayerMeta(obj?.name, obj?.layer);
		if (meta) applyDynmapPlusLayerMetaToControlLabel(label, meta);
		return label;
	};

	window.L.Control.Layers.prototype._update = function patchedDynmapPlusLayerUpdate(...args) {
		normalizeDynmapPlusLayerRegistrations(this);
		return originalUpdate.call(this, ...args);
	};

	pageMarkersDebugInfo(`${PAGE_MAP_PREFIX}: patched Leaflet layer controls`);
	return true;
}

function dispatchPageMarkersEvent(name, detail) {
	document.dispatchEvent(new CustomEvent(name, {
		detail: JSON.stringify(detail),
	}));
}

function syncParsedMarkers() {
	dispatchPageMarkersEvent(MARKER_ENGINE_EVENT_PARSED, { parsedMarkers });
}

function showPageAlert(message, timeout = null) {
	dispatchPageMarkersEvent(MARKER_ENGINE_EVENT_ALERT, { message, timeout });
}

function updateArchiveModeLabel(actualArchiveDate) {
	dispatchPageMarkersEvent(MARKER_ENGINE_EVENT_ARCHIVE_LABEL, { actualArchiveDate });
}

function exitArchiveModeAfterFailure(message, timeout = 8) {
	try {
		localStorage["emcdynmapplus-mapmode"] = localStorage[LAST_LIVE_MAP_MODE_KEY] || "default";
		localStorage[PENDING_UI_ALERT_KEY] = JSON.stringify({
			message,
			timeout,
		});
	} catch {}

	window.location.reload();
}

function cloneSerializable(value) {
	if (typeof value === "undefined") return undefined;

	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		try {
			if (typeof structuredClone === "function") return structuredClone(value);
		} catch {}

		return null;
	}
}

function getResourceUrl(name) {
	if (!MARKER_ENGINE_RESOURCE_BASE) return name;
	return new URL(name, MARKER_ENGINE_RESOURCE_BASE).toString();
}

class TokenBucket {
	constructor(opts) {
		this.capacity = opts.capacity;
		this.refillRate = opts.refillRate;
		this.storageKey = opts.storageKey;

		const cachedBucket = localStorage[this.storageKey];
		if (cachedBucket) {
			const bucketData = JSON.parse(cachedBucket);
			const elapsed = (Date.now() - bucketData.lastRefill) / 1000;
			const added = elapsed * opts.refillRate;
			this.tokens = Math.min(opts.capacity, bucketData.tokens + added);
		} else {
			this.tokens = opts.capacity;
		}

		this.lastRefill = Date.now();
	}

	save() {
		localStorage[this.storageKey] = JSON.stringify({
			tokens: this.tokens,
			lastRefill: this.lastRefill,
		});
	}

	refill() {
		const now = Date.now();
		const elapsed = (now - this.lastRefill) / 1000;
		if (elapsed <= 0) return;

		const added = elapsed * this.refillRate;
		this.tokens = Math.min(this.capacity, this.tokens + added);
		this.lastRefill = now;
		this.save();
	}

	take = async () => new Promise((resolve) => {
		const attempt = () => {
			this.refill();
			if (this.tokens >= 1) {
				this.tokens -= 1;
				this.save();
				resolve();
			} else {
				const msUntilNext = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
				setTimeout(attempt, msUntilNext);
			}
		};

		attempt();
	});
}

const oapiBucket = new TokenBucket({
	capacity: OAPI_REQ_PER_MIN,
	refillRate: OAPI_REQ_PER_MIN / 60,
	storageKey: "emcdynmapplus-oapi-bucket",
});

async function fetchJSON(url, options = null) {
	if (url.includes(OAPI_BASE)) await oapiBucket.take();

	const response = await fetch(url, options);
	if (!response.ok && response.status !== 304) return null;

	return response.json();
}

const postJSON = (url, body) =>
	fetchJSON(url, { body: JSON.stringify(body), method: "POST" });

function chunkArr(arr, chunkSize) {
	const chunks = [];
	for (let i = 0; i < arr.length; i += chunkSize) {
		chunks.push(arr.slice(i, i + chunkSize));
	}

	return chunks;
}

async function sendBatch(url, chunk) {
	return postJSON(url, { query: chunk.map((entry) => entry.uuid) }).catch((err) => {
		console.error(`${MARKER_ENGINE_PREFIX}: error sending request`, err);
		return [];
	});
}

async function queryConcurrent(url, arr) {
	const chunks = chunkArr(arr, OAPI_ITEMS_PER_REQ);
	const promises = chunks.map(async (chunk) => {
		await oapiBucket.take();
		return sendBatch(url, chunk);
	});

	const batchResults = await Promise.all(promises);
	return batchResults.flat();
}

const currentMapMode = () => localStorage["emcdynmapplus-mapmode"] ?? "meganations";
const archiveDate = () => parseInt(localStorage["emcdynmapplus-archive-date"]);
const nationClaimsInfo = () => JSON.parse(localStorage["emcdynmapplus-nation-claims-info"] || "[]");

const isNumeric = (str) => Number.isFinite(+str);
const roundTo16 = (num) => Math.round(num / 16) * 16;
const roundToNearest16 = (num) => Math.round(num / 16) * 16;

function borderEntryToPolylines(line) {
	const segments = [];
	let current = [];
	const length = Math.max(line?.x?.length ?? 0, line?.z?.length ?? 0);

	for (let i = 0; i < length; i++) {
		const rawX = line?.x?.[i];
		const rawZ = line?.z?.[i];
		if (rawX == null || rawZ == null) {
			if (current.length > 1) segments.push(current);
			current = [];
			continue;
		}

		const x = Number(rawX);
		const z = Number(rawZ);
		if (!Number.isFinite(x) || !Number.isFinite(z)) {
			if (current.length > 1) segments.push(current);
			current = [];
			continue;
		}

		current.push({ x, z });
	}

	if (current.length > 1) segments.push(current);
	return segments;
}

function hashCode(str) {
	let hexValue = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hexValue ^= str.charCodeAt(i);
		hexValue += (hexValue << 1) + (hexValue << 4) + (hexValue << 7) + (hexValue << 8) + (hexValue << 24);
	}

	return `#${((hexValue >>> 0) % 16777216).toString(16).padStart(6, "0")}`;
}

function calcPolygonArea(vertices) {
	let area = 0;
	for (let i = 0; i < vertices.length; i++) {
		const j = (i + 1) % vertices.length;
		area += roundTo16(vertices[i].x) * roundTo16(vertices[j].z);
		area -= roundTo16(vertices[j].x) * roundTo16(vertices[i].z);
	}

	return (Math.abs(area) / 2) / (16 * 16);
}

function pointInPolygon(vertex, polygon) {
	const { x, z } = vertex;
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const xi = polygon[i].x;
		const xj = polygon[j].x;
		const zi = polygon[i].z;
		const zj = polygon[j].z;

		const intersect = ((zi > z) !== (zj > z))
			&& (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
		if (intersect) inside = !inside;
	}

	return inside;
}

function calcMarkerArea(marker) {
	if (marker.type !== "polygon") return 0;

	let area = 0;
	const processed = [];
	for (const multiPolygon of marker.points || []) {
		for (let polygon of multiPolygon) {
			if (!polygon || polygon.length < 3) continue;

			polygon = polygon
				.map((vertex) => ({ x: Number(vertex.x), z: Number(vertex.z) }))
				.filter((vertex) => Number.isFinite(vertex.x) && Number.isFinite(vertex.z));
			if (polygon.length < 3) continue;

			const isHole = processed.some((prev) => polygon.every((vertex) => pointInPolygon(vertex, prev)));
			area += isHole ? -calcPolygonArea(polygon) : calcPolygonArea(polygon);
			processed.push(polygon);
		}
	}

	return area;
}

function midrange(vertices) {
	let minX = Infinity;
	let maxX = -Infinity;
	let minZ = Infinity;
	let maxZ = -Infinity;

	for (const vertex of vertices) {
		if (vertex.x < minX) minX = vertex.x;
		if (vertex.x > maxX) maxX = vertex.x;
		if (vertex.z < minZ) minZ = vertex.z;
		if (vertex.z > maxZ) maxZ = vertex.z;
	}

	return {
		x: roundToNearest16((minX + maxX) / 2),
		z: roundToNearest16((minZ + maxZ) / 2),
	};
}

const makePolyline = (linePoints, weight = 1, colour = "#ffffff") => ({
	type: "polyline",
	points: linePoints,
	weight,
	color: colour,
});

function loadPlanningNations() {
	try {
		const stored = localStorage[PLANNER_STORAGE_KEY];
		if (!stored) return [];

		const parsed = JSON.parse(stored);
		const planningNations = Array.isArray(parsed) ? parsed : [];
		pageMarkersDebugInfo(`${PLANNING_LAYER_PREFIX}: loaded planning nations from storage`, {
			nationCount: planningNations.length,
		});
		return planningNations;
	} catch {
		pageMarkersDebugInfo(`${PLANNING_LAYER_PREFIX}: failed to parse planning storage, using empty list`);
		return [];
	}
}

function createPlanningCircleVertices(point, radiusBlocks, segments = 96) {
	const polygon = [];
	for (let i = 0; i < segments; i++) {
		const angle = (Math.PI * 2 * i) / segments;
		polygon.push({
			x: point.x + Math.cos(angle) * radiusBlocks,
			z: point.z + Math.sin(angle) * radiusBlocks,
		});
	}

	return polygon;
}

function createPlanningNationMarkers(nation) {
	return [{
		type: "polygon",
		points: [[createPlanningCircleVertices(nation.center, nation.rangeRadiusBlocks)]],
		weight: 3,
		color: nation.outlineColor,
		opacity: 1,
		fillColor: nation.color,
		fillOpacity: 0.2,
		tooltip: `<div><b>${nation.name}</b></div>`,
		popup: [
			`<div><span style="font-size:120%;"><b>${nation.name}</b></span><br>`,
			`Planning overlay<br>`,
			`X: ${nation.center.x}<br>`,
			`Z: ${nation.center.z}<br>`,
			`Range: ${nation.rangeRadiusBlocks} blocks</div>`,
		].join(""),
	}, {
		type: "polygon",
		points: [[createPlanningCircleVertices(nation.center, PLANNING_CENTER_RADIUS)]],
		weight: 3,
		color: "#1f1200",
		opacity: 1,
		fillColor: "#fff3cf",
		fillOpacity: 0.22,
		tooltip: `<div><b>${nation.name} Center</b></div>`,
		popup: [
			`<div><span style="font-size:120%;"><b>${nation.name} Center</b></span><br>`,
			`X: ${nation.center.x}<br>`,
			`Z: ${nation.center.z}<br>`,
			`Center marker radius: ${PLANNING_CENTER_RADIUS} blocks</div>`,
		].join(""),
	}];
}

function hexToRgb(hex) {
	if (typeof hex !== "string") return null;

	let normalized = hex.trim();
	if (!normalized) return null;
	if (normalized.startsWith("#")) normalized = normalized.slice(1);

	if (normalized.length === 3) {
		normalized = normalized
			.split("")
			.map((char) => char + char)
			.join("");
	}

	if (!/^[\da-fA-F]{6}$/.test(normalized)) return null;

	return {
		r: Number.parseInt(normalized.slice(0, 2), 16),
		g: Number.parseInt(normalized.slice(2, 4), 16),
		b: Number.parseInt(normalized.slice(4, 6), 16),
	};
}

function measureCanvasColorBounds(canvas, { color, tolerance = 18, minAlpha = 96 } = {}) {
	if (!(canvas instanceof HTMLCanvasElement)) {
		return { ok: false, reason: "missing-canvas" };
	}

	const target = typeof color === "string" ? hexToRgb(color) : color;
	if (!target) {
		return { ok: false, reason: "invalid-color" };
	}

	let imageData = null;
	try {
		const ctx = canvas.getContext("2d", { willReadFrequently: true }) || canvas.getContext("2d");
		imageData = ctx?.getImageData?.(0, 0, canvas.width, canvas.height) ?? null;
	} catch (err) {
		return {
			ok: false,
			reason: "image-data-read-failed",
			error: String(err),
		};
	}

	if (!imageData?.data?.length) {
		return { ok: false, reason: "missing-image-data" };
	}

	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	let matchCount = 0;

	const { data, width, height } = imageData;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const index = (y * width + x) * 4;
			const alpha = data[index + 3];
			if (alpha < minAlpha) continue;

			const red = data[index];
			const green = data[index + 1];
			const blue = data[index + 2];
			if (
				Math.abs(red - target.r) > tolerance
				|| Math.abs(green - target.g) > tolerance
				|| Math.abs(blue - target.b) > tolerance
			) {
				continue;
			}

			matchCount += 1;
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}
	}

	if (matchCount === 0) {
		return {
			ok: false,
			reason: "no-matching-pixels",
			matchCount,
			target,
			tolerance,
			minAlpha,
		};
	}

	const canvasBounds = {
		left: minX,
		top: minY,
		right: maxX,
		bottom: maxY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
	};
	const rect = canvas.getBoundingClientRect();
	const scaleX = rect.width > 0 ? rect.width / canvas.width : 1;
	const scaleY = rect.height > 0 ? rect.height / canvas.height : 1;

	return {
		ok: true,
		target,
		matchCount,
		tolerance,
		minAlpha,
		canvasBounds,
		cssBounds: {
			left: Number((canvasBounds.left * scaleX + rect.left).toFixed(2)),
			top: Number((canvasBounds.top * scaleY + rect.top).toFixed(2)),
			right: Number((canvasBounds.right * scaleX + rect.left).toFixed(2)),
			bottom: Number((canvasBounds.bottom * scaleY + rect.top).toFixed(2)),
			width: Number((canvasBounds.width * scaleX).toFixed(2)),
			height: Number((canvasBounds.height * scaleY).toFixed(2)),
		},
		canvasSize: {
			width: canvas.width,
			height: canvas.height,
		},
		canvasRect: {
			left: Number(rect.left.toFixed(2)),
			top: Number(rect.top.toFixed(2)),
			width: Number(rect.width.toFixed(2)),
			height: Number(rect.height.toFixed(2)),
		},
	};
}

function getPlanningCursorPreviewMetrics() {
	const preview = document.querySelector("#emcdynmapplus-planning-cursor-preview");
	if (!(preview instanceof HTMLElement) || preview.hidden) {
		return {
			ok: false,
			reason: "missing-preview",
		};
	}

	const previewRect = preview.getBoundingClientRect();
	const ring = preview.querySelector(".planning-cursor-preview-ring");
	const center = preview.querySelector(".planning-cursor-preview-center");
	const label = preview.querySelector(".planning-cursor-preview-label");
	const ringRect = ring instanceof HTMLElement ? ring.getBoundingClientRect() : previewRect;
	const centerRect = center instanceof HTMLElement ? center.getBoundingClientRect() : null;

	return {
		ok: true,
		zoomLevel: preview.dataset.previewZoomLevel ? Number(preview.dataset.previewZoomLevel) : null,
		zoomSource: preview.dataset.previewZoomSource || null,
		rawDiameterPx: preview.dataset.previewRawDiameter ? Number(preview.dataset.previewRawDiameter) : null,
		diameterPx: preview.dataset.previewDiameter ? Number(preview.dataset.previewDiameter) : null,
		diameterWasClamped: preview.dataset.previewDiameterWasClamped === "true",
		rawCenterDiameterPx: preview.dataset.previewRawCenterDiameter ? Number(preview.dataset.previewRawCenterDiameter) : null,
		centerDiameterPx: preview.dataset.previewCenterDiameter ? Number(preview.dataset.previewCenterDiameter) : null,
		previewBounds: {
			left: Number(previewRect.left.toFixed(2)),
			top: Number(previewRect.top.toFixed(2)),
			width: Number(previewRect.width.toFixed(2)),
			height: Number(previewRect.height.toFixed(2)),
		},
		ringBounds: {
			left: Number(ringRect.left.toFixed(2)),
			top: Number(ringRect.top.toFixed(2)),
			width: Number(ringRect.width.toFixed(2)),
			height: Number(ringRect.height.toFixed(2)),
		},
		centerBounds: centerRect ? {
			left: Number(centerRect.left.toFixed(2)),
			top: Number(centerRect.top.toFixed(2)),
			width: Number(centerRect.width.toFixed(2)),
			height: Number(centerRect.height.toFixed(2)),
		} : null,
		label: label?.textContent?.trim?.() || null,
	};
}

function readNumericRootAttribute(name) {
	const rawValue = document.documentElement.getAttribute(name);
	if (rawValue == null || rawValue === "") return null;

	const parsedValue = Number(rawValue);
	return Number.isFinite(parsedValue) ? parsedValue : null;
}

function readJsonRootAttribute(name) {
	const rawValue = document.documentElement.getAttribute(name);
	if (rawValue == null || rawValue === "") return null;

	try {
		return JSON.parse(rawValue);
	} catch {
		return null;
	}
}

function parseZoomFromTileUrl(url) {
	if (typeof url !== "string" || url.length === 0) return null;

	const match = url.match(/\/tiles\/[^/]+\/(-?\d+)\//i);
	if (!match?.[1]) return null;

	const parsedValue = Number(match[1]);
	return Number.isFinite(parsedValue) ? parsedValue : null;
}

function getTransformScale(element) {
	if (!(element instanceof Element)) return null;

	const transform = getComputedStyle(element).transform;
	if (!transform || transform === "none") return 1;

	try {
		const matrix = new DOMMatrixReadOnly(transform);
		const scaleX = Math.hypot(matrix.a, matrix.b);
		const scaleY = Math.hypot(matrix.c, matrix.d);
		const averageScale = (scaleX + scaleY) / 2;
		return Number.isFinite(averageScale) && averageScale > 0 ? averageScale : 1;
	} catch {
		return null;
	}
}

function roundDebugValue(value, digits = 4) {
	return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function getPlanningProjectionSignals() {
	const urlZoom = (() => {
		const rawValue = new URL(window.location.href).searchParams.get("zoom");
		if (rawValue == null || rawValue === "") return null;
		const parsedValue = Number(rawValue);
		return Number.isFinite(parsedValue) ? parsedValue : null;
	})();
	const leafletZoom = readNumericRootAttribute(PAGE_MAP_ZOOM_ATTR);
	const publishedTileZoom = readNumericRootAttribute(PAGE_TILE_ZOOM_ATTR);
	const dominantTileZoom = readNumericRootAttribute(PAGE_TILE_DOMINANT_ZOOM_ATTR);
	const tileSummary = readJsonRootAttribute(PAGE_TILE_SUMMARY_ATTR);
	const publishedTileUrl = document.documentElement.getAttribute(PAGE_TILE_URL_ATTR) || null;
	const mapContainer = document.documentElement.getAttribute(PAGE_MAP_CONTAINER_ATTR) || null;
	const activeTile = document.querySelector(".leaflet-tile-pane img.leaflet-tile[src]");
	const tileSrc = activeTile instanceof HTMLImageElement ? activeTile.currentSrc || activeTile.src || "" : "";
	const tileImageZoom = parseZoomFromTileUrl(tileSrc);
	const tilePaneScale = getTransformScale(document.querySelector(".leaflet-tile-pane"));
	const tileLayerScale = getTransformScale(document.querySelector(".leaflet-tile-pane .leaflet-layer"));
	const mapPaneScale = getTransformScale(document.querySelector(".leaflet-map-pane"));
	const overlayCanvasScale = getTransformScale(document.querySelector(".leaflet-overlay-pane canvas.leaflet-zoom-animated"));
	const coordsText = document.querySelector(".leaflet-control-layers.coordinates")?.textContent?.trim?.() || null;

	const effectiveZoomFromTilePaneScale = dominantTileZoom == null || tilePaneScale == null || tilePaneScale <= 0
		? null
		: dominantTileZoom + Math.log2(tilePaneScale);
	const effectiveZoomFromTileLayerScale = dominantTileZoom == null || tileLayerScale == null || tileLayerScale <= 0
		? null
		: dominantTileZoom + Math.log2(tileLayerScale);

	return {
		href: window.location.href,
		urlZoom,
		leafletZoom,
		publishedTileZoom,
		dominantTileZoom,
		tileImageZoom,
		publishedTileUrl,
		tileSrc: tileSrc || null,
		tileSummary,
		mapContainer,
		coordsText,
		tilePaneScale: roundDebugValue(tilePaneScale),
		tileLayerScale: roundDebugValue(tileLayerScale),
		mapPaneScale: roundDebugValue(mapPaneScale),
		overlayCanvasScale: roundDebugValue(overlayCanvasScale),
		effectiveZoomFromTilePaneScale: roundDebugValue(effectiveZoomFromTilePaneScale),
		effectiveZoomFromTileLayerScale: roundDebugValue(effectiveZoomFromTileLayerScale),
	};
}

function getPlanningRenderMeasurements(options = {}) {
	const canvas = document.querySelector(".leaflet-overlay-pane canvas.leaflet-zoom-animated");
	if (!(canvas instanceof HTMLCanvasElement)) {
		return {
			ok: false,
			reason: "missing-overlay-canvas",
		};
	}

	const nations = loadPlanningNations();
	const nation = nations[0] ?? null;
	if (!nation) {
		return {
			ok: false,
			reason: "missing-planning-nation",
		};
	}

	const outlineColor = typeof options.outlineColor === "string" && options.outlineColor
		? options.outlineColor
		: nation.outlineColor || "#fff3cf";
	const tolerance = Number.isFinite(Number(options.tolerance)) ? Number(options.tolerance) : 18;
	const minAlpha = Number.isFinite(Number(options.minAlpha)) ? Number(options.minAlpha) : 96;
	const tileZoomRaw = document.documentElement.getAttribute(PAGE_TILE_ZOOM_ATTR);
	const tileZoom = tileZoomRaw == null || tileZoomRaw === "" ? null : Number(tileZoomRaw);
	const rangeMeasurement = measureCanvasColorBounds(canvas, {
		color: outlineColor,
		tolerance,
		minAlpha,
	});

	return {
		ok: rangeMeasurement.ok,
		reason: rangeMeasurement.reason ?? null,
		zoomLevel: Number.isFinite(tileZoom) ? tileZoom : null,
		nation: {
			id: nation.id || null,
			name: nation.name || null,
			center: nation.center || null,
			rangeRadiusBlocks: nation.rangeRadiusBlocks,
			outlineColor,
		},
		rangeMeasurement,
		renderedDiameterPx: rangeMeasurement.ok
			? Number(Math.max(rangeMeasurement.cssBounds.width, rangeMeasurement.cssBounds.height).toFixed(2))
			: null,
		blocksPerPixel: rangeMeasurement.ok
			? Number(((nation.rangeRadiusBlocks * 2) / Math.max(rangeMeasurement.cssBounds.width, rangeMeasurement.cssBounds.height)).toFixed(6))
			: null,
		cursorPreview: getPlanningCursorPreviewMetrics(),
	};
}

function exposePlanningDebugHelpers() {
	window.EMCDYNMAPPLUS_PAGE_PLANNING_DEBUG = {
		measureRenderedNation: (options = {}) => {
			return getPlanningRenderMeasurements(options);
		},
		getCursorPreviewMetrics: () => getPlanningCursorPreviewMetrics(),
		getProjectionSignals: () => getPlanningProjectionSignals(),
	};
}

function addPlanningLayer(data) {
	const planningNations = loadPlanningNations()
		.map((nation, index) => {
			const x = Number(nation?.center?.x);
			const z = Number(nation?.center?.z);
			const rangeRadiusBlocks = Number(nation?.rangeRadiusBlocks);
			if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

			return {
				name: typeof nation?.name === "string" && nation.name.trim() ? nation.name : `Nation ${index + 1}`,
				color: typeof nation?.color === "string" && nation.color ? nation.color : "#d98936",
				outlineColor: typeof nation?.outlineColor === "string" && nation.outlineColor ? nation.outlineColor : "#fff3cf",
				center: {
					x: Math.round(x),
					z: Math.round(z),
				},
				rangeRadiusBlocks: Number.isFinite(rangeRadiusBlocks) ? Math.max(0, Math.round(rangeRadiusBlocks)) : DEFAULT_PLANNING_RANGE,
			};
		})
		.filter((nation) => nation != null);
	if (planningNations.length === 0) {
		pageMarkersDebugInfo(`${PLANNING_LAYER_PREFIX}: no planning nations found for overlay injection`);
		return data;
	}

	const nextData = appendDynmapPlusManagedLayer(data, DYNMAP_PLUS_LAYER_DEFINITIONS.planningNations, {
		order: 1001,
		hide: false,
		control: true,
		markers: planningNations.flatMap(createPlanningNationMarkers),
	});

	pageMarkersDebugInfo(`${PLANNING_LAYER_PREFIX}: appended planning layer`, {
		nationCount: planningNations.length,
		nations: planningNations.map((nation) => ({
			name: nation.name,
			center: nation.center,
			rangeRadiusBlocks: nation.rangeRadiusBlocks,
		})),
	});
	return nextData;
}

async function getStyledBorders() {
	if (cachedStyledBorders != null) return cachedStyledBorders;

	const userscriptBorders = getUserscriptBorders();
	if (userscriptBorders) {
		cachedStyledBorders = Object.fromEntries(
			Object.entries(userscriptBorders).map(([key, border]) => [key, { ...border, ...EXTRA_BORDER_OPTS }]),
		);
		return cachedStyledBorders;
	}

	if (!pendingBordersLoad) {
		const borderFilename = getCurrentBordersResourcePath().split("/").pop() || "borders.aurora.json";
		pendingBordersLoad = fetch(getResourceUrl(borderFilename))
			.then(async (response) => {
				if (!response.ok) return null;

				const borders = await response.json();
				return Object.fromEntries(
					Object.entries(borders).map(([key, border]) => [key, { ...border, ...EXTRA_BORDER_OPTS }]),
				);
			})
			.catch((err) => {
				console.error(`${MARKER_ENGINE_PREFIX}: failed to load borders resource`, err);
				return null;
			})
			.finally(() => {
				pendingBordersLoad = null;
			});
	}

	cachedStyledBorders = await pendingBordersLoad;
	return cachedStyledBorders;
}

function addChunksLayer(data) {
	const { L, R, U, D } = getCurrentChunkBounds();
	const ver = (x) => [{ x, z: U }, { x, z: D }, { x, z: U }];
	const hor = (z) => [{ x: L, z }, { x: R, z }, { x: L, z }];

	const chunkLines = [];
	for (let x = L; x <= R; x += 16) chunkLines.push(ver(x));
	for (let z = U; z <= D; z += 16) chunkLines.push(hor(z));

	return appendDynmapPlusManagedLayer(data, DYNMAP_PLUS_LAYER_DEFINITIONS.chunks, {
		hide: true,
		control: true,
		markers: [makePolyline(chunkLines, 0.33, "#000000")],
	});
}

function addCountryBordersLayer(data, borders) {
	try {
		const points = Object.values(borders).flatMap((line) => borderEntryToPolylines(line));

		return appendDynmapPlusManagedLayer(data, DYNMAP_PLUS_LAYER_DEFINITIONS.borders, {
			order: 999,
			hide: true,
			control: true,
			markers: [makePolyline(points)],
		});
	} catch (err) {
		showPageAlert("Could not set up a layer of country borders. You may need to clear this website's data. If problem persists, contact the developer.");
		console.error(err);
		return null;
	}
}

function getNationAlliances(nationName, mapMode) {
	if (cachedAlliances == null) return [];

	const nationAlliances = [];
	for (const alliance of cachedAlliances) {
		if (alliance.modeType !== mapMode) continue;

		const nations = [...alliance.ownNations, ...alliance.puppetNations];
		if (!nations.includes(nationName)) continue;

		nationAlliances.push({ name: alliance.name, colours: alliance.colours });
	}

	return nationAlliances;
}

function modifyDescription(marker, mapMode) {
	const town = marker.tooltip.match(/<b>(.*)<\/b>/)[1];
	const nation = marker.tooltip.match(/\(\b(?:Member|Capital)\b of (.*)\)\n/)?.[1];
	const isCapital = marker.tooltip.match(/\(Capital of (.*)\)/) != null;
	const mayor = marker.popup.match(/Mayor: <b>(.*)<\/b>/)?.[1];

	const residents = marker.popup.match(/<\/summary>\n    \t(.*)\n   \t<\/details>/)?.[1];
	const residentListRaw = residents.split(", ");
	const residentNum = residentListRaw.length;

	const councillors = marker.popup.match(/Councillors: <b>(.*)<\/b>/)?.[1]
		.split(", ")
		.filter((councillor) => councillor !== "None");

	const fixedTownName = town.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	const fixedNationName = nation?.replaceAll("<", "&lt;").replaceAll(">", "&gt;") ?? nation;
	const area = calcMarkerArea(marker);

	let location = { x: 0, z: 0 };
	if (marker.points) location = midrange(marker.points.flat(2));

	const isArchiveMode = mapMode === "archive";
	const residentList = isArchiveMode ? residents :
		residentListRaw.map((resident) => MARKER_ENGINE_HTML.residentClickable.replaceAll("{player}", resident)).join(", ");
	const councillorList = isArchiveMode ? councillors :
		councillors.map((councillor) => MARKER_ENGINE_HTML.residentClickable.replaceAll("{player}", councillor)).join(", ");

	if (residentNum > 50) {
		marker.popup = marker.popup.replace(residents, MARKER_ENGINE_HTML.scrollableResidentList.replace("{list}", residentList));
	} else {
		marker.popup = marker.popup.replace(
			`${residents}\n`,
			`${MARKER_ENGINE_HTML.residentList.replace("{list}", residentList)}\n`,
		);
	}

	marker.popup = marker.popup
		.replace("</details>\n   \t<br>", "</details>")
		.replace("Councillors:", `Size: <b>${area} chunks</b><br/>Councillors:`)
		.replace("<i>/town set board [msg]</i>", "<i></i>")
		.replace("<i></i> \n    <br>\n", "")
		.replace("\n    <i>", '\n    <i style="overflow-wrap: break-word">')
		.replace("Councillors: <b>None</b>\n\t<br>", "")
		.replace("Size: <b>0 chunks</b><br/>", "")
		.replace(town, fixedTownName)
		.replace(nation, fixedNationName)
		.replaceAll("<b>false</b>", '<b><span style="color: red">No</span></b>')
		.replaceAll("<b>true</b>", '<b><span style="color: green">Yes</span></b>');

	if (!isArchiveMode) {
		marker.popup = marker.popup
			.replace(/Mayor: <b>(.*)<\/b>/, `Mayor: <b>${MARKER_ENGINE_HTML.residentClickable.replaceAll("{player}", mayor)}</b>`)
			.replace(/Councillors: <b>(.*)<\/b>/, `Councillors: <b>${councillorList}</b>`);
	}

	if (isCapital) {
		marker.popup = marker.popup.replace('<span style="font-size:120%;">', '<span style="font-size: 120%">&#9733; ');
	}

	marker.tooltip = marker.tooltip
		.replace("<i>/town set board [msg]</i>", "<i></i>")
		.replace("<br>\n    <i></i>", "")
		.replace("\n    <i>", '\n    <i id="clamped-board">')
		.replace(town, fixedTownName)
		.replace(nation, fixedNationName);

	if (mapMode === "alliances" || mapMode === "meganations") {
		const nationAlliances = getNationAlliances(nation, mapMode);
		if (nationAlliances.length > 0) {
			const allianceList = nationAlliances.map((alliance) => alliance.name).join(", ");
			const partOfLabel = MARKER_ENGINE_HTML.partOfLabel.replace("{allianceList}", allianceList);
			marker.popup = marker.popup.replace("</span>\n", `</span></br>${partOfLabel}`);
		}
	}

	return {
		townName: fixedTownName,
		nationName: fixedNationName,
		residentNum,
		residentList: residentListRaw,
		isCapital,
		mayor,
		area,
		...location,
	};
}

function modifyDynmapDescription(marker, curArchiveDate) {
	const residents = marker.popup.match(/Members <span style="font-weight:bold">(.*)<\/span><br \/>Flags/)?.[1];
	const residentList = residents?.split(", ") ?? [];
	const residentNum = residentList.length;
	const isCapital = marker.popup.match(/capital: true/) != null;
	const area = calcPolygonArea(marker.points);
	const location = midrange(marker.points.flat(2));

	if (isCapital) marker.popup = marker.popup.replace('120%">', '120%">&#9733; ');
	if (curArchiveDate < 20220906) {
		marker.popup = marker.popup.replace(/">hasUpkeep:.+?(?<=<br \/>)/, '; white-space:pre">');
	} else {
		marker.popup = marker.popup.replace('">pvp:', '; white-space:pre">pvp:');
	}

	marker.popup = marker.popup
		.replace("Mayor", "Mayor:")
		.replace("Flags<br />", "<br>Flags<br>")
		.replace(">pvp:", ">PVP allowed:")
		.replace(">mobs:", ">Mob spawning:")
		.replace(">public:", ">Public status:")
		.replace(">explosion:", ">Explosions:&#9;")
		.replace(">fire:", ">Fire spread:&#9;")
		.replace(/<br \/>capital:.*<\/span>/, "</span>")
		.replaceAll("true<", '&#9;<span style="color:green">Yes</span><')
		.replaceAll("false<", '&#9;<span style="color:red">No</span><')
		.replace(`Members <span`, `Members <b>[${residentNum}]</b> <span`);
	if (area > 0) {
		marker.popup = marker.popup
			.replace(`</span><br /> Members`, `</span><br>Size:<span style="font-weight:bold"> ${area} chunks</span><br> Members`);
	}
	if (residentNum > 50) {
		marker.popup = marker.popup
			.replace(`<b>[${residentNum}]</b> <span style="font-weight:bold">`, `<b>[${residentNum}]</b> <div id="scrollable-list"><span style="font-weight:bold">`)
			.replace("<br>Flags", "</div><br>Flags");
	}

	const clean = marker.popup.replace(/<[^>]+>/g, "").trim().replace(/^\u2605\s*/, "");
	const [, town, nation] = clean.match(/^(.+?)\s*\((.+?)\)/) || [];

	return {
		townName: town?.trim() || null,
		nationName: nation?.trim() || null,
		residentList,
		residentNum,
		isCapital,
		area,
		...location,
	};
}

const colorMarker = (marker, fill, outline, weight = null) => {
	marker.fillColor = fill;
	marker.color = outline;
	if (weight) marker.weight = weight;
};

function colorTown(rawMarker, parsedMarker, mapMode) {
	const mayor = rawMarker.popup.match(/Mayor: <b>(.*)<\/b>/)?.[1];
	const isRuin = !!mayor?.match(/NPC[0-9]+/);
	if (isRuin) return colorMarker(rawMarker, "#000000", "#000000");

	const { nationName } = parsedMarker;
	if (mapMode === "meganations") {
		const isDefaultCol = rawMarker.color === DEFAULT_BLUE && rawMarker.fillColor === DEFAULT_BLUE;
		rawMarker.color = isDefaultCol ? "#363636" : DEFAULT_GREEN;
		rawMarker.fillColor = isDefaultCol ? hashCode(nationName) : rawMarker.fillColor;
	} else if (mapMode === "overclaim") {
		const nation = nationName ? cachedApiNations.get(nationName.toLowerCase()) : null;
		const overclaimInfo = !nation
			? checkOverclaimedNationless(parsedMarker.area, parsedMarker.residentNum)
			: checkOverclaimed(parsedMarker.area, parsedMarker.residentNum, nation.stats.numResidents);

		const colour = overclaimInfo.isOverclaimed ? "#ff0000" : "#00ff00";
		colorMarker(rawMarker, colour, colour, overclaimInfo.isOverclaimed ? 2 : 0.5);
	} else {
		colorMarker(rawMarker, "#000000", "#000000", 1);
	}

	const nationAlliances = getNationAlliances(nationName, mapMode);
	if (nationAlliances.length === 0) return;

	const { colours } = nationAlliances[0];
	const newWeight = nationAlliances.length > 1 ? 1.5 : 0.75;
	return colorMarker(rawMarker, colours.fill, colours.outline, newWeight);
}

function colorTownNationClaims(marker, nationName, claimsCustomizerInfo, useOpaque, showExcluded) {
	const nationColorInput = claimsCustomizerInfo.get(nationName?.toLowerCase());
	if (!nationColorInput) {
		if (useOpaque) marker.fillOpacity = marker.opacity = 0.5;
		if (!showExcluded) marker.fillOpacity = marker.opacity = 0;
		return colorMarker(marker, "#000000", "#000000", 1);
	}

	if (useOpaque) marker.fillOpacity = marker.opacity = 1;
	return colorMarker(marker, nationColorInput, nationColorInput, 1.5);
}

function parseColours(colours) {
	if (!colours) return DEFAULT_ALLIANCE_COLOURS;
	colours.fill = `#${colours.fill.replaceAll("#", "")}`;
	colours.outline = `#${colours.outline.replaceAll("#", "")}`;
	return colours;
}

async function getAlliances() {
	const alliances = await fetchJSON(getCurrentCapiUrl("alliances"));
	if (!alliances) {
		const cache = JSON.parse(localStorage["emcdynmapplus-alliances"] || "null");
		if (cache == null) {
			showPageAlert("Service responsible for loading alliances will be available later.");
			return [];
		}

		showPageAlert("Service responsible for loading alliances is unavailable, falling back to locally cached data.", 5);
		return cache;
	}

	const childrenByParent = new Map();
	for (const alliance of alliances) {
		if (!alliance.parentAlliance) continue;
		const arr = childrenByParent.get(alliance.parentAlliance) || [];
		arr.push(alliance);
		childrenByParent.set(alliance.parentAlliance, arr);
	}

	const allianceData = [];
	for (const alliance of alliances) {
		const allianceType = alliance.type?.toLowerCase() || "mega";
		const children = childrenByParent.get(alliance.identifier) || [];
		allianceData.push({
			name: alliance.label || alliance.identifier,
			modeType: allianceType === "mega" ? "meganations" : "alliances",
			ownNations: alliance.ownNations || [],
			puppetNations: children.flatMap((entry) => entry.ownNations || []),
			colours: parseColours(alliance.optional.colours),
		});
	}

	localStorage["emcdynmapplus-alliances"] = JSON.stringify(allianceData);
	return allianceData;
}

const getArchiveURL = (date, markersURL) => `https://web.archive.org/web/${date}id_/${markersURL}`;

// Archive mode intentionally goes through the configured relay here. Direct
// Wayback fetches are not currently reliable enough in this runtime context,
// so preserve this behavior and keep it explicitly documented for maintainers.
async function loadArchiveForDate(date, data) {
	const markersURL = getArchiveMarkersSourceUrl(date);

	const archive = await fetchJSON(PROXY_URL + getArchiveURL(date, markersURL));
	if (!archive) {
		console.warn(`${MARKER_ENGINE_PREFIX}: archive fetch returned no data`, { requestedDate: date, markersURL });
		return null;
	}

	let normalizedData = cloneSerializable(data);
	let actualArchiveDate;
	if (date < 20240701) {
		if (!normalizedData?.[0]) return null;
		normalizedData[0].markers = convertOldMarkersStructure(archive.sets["townyPlugin.markerset"]);
		actualArchiveDate = archive.timestamp;
	} else {
		normalizedData = cloneSerializable(archive);
		actualArchiveDate = archive[0]?.timestamp;
	}

	if (!normalizedData || !actualArchiveDate) return null;

	const formattedArchiveDate = new Date(parseInt(actualArchiveDate)).toLocaleDateString("en-ca");
	return { data: normalizedData, actualArchiveDate: formattedArchiveDate };
}

async function getArchive(data) {
	const date = archiveDate();
	pageMarkersDebugInfo(`${MARKER_ENGINE_PREFIX}: getArchive started`, { requestedDate: date });

	let archiveResult = cachedArchives.get(date) ?? null;
	if (!archiveResult) {
		let pendingLoad = pendingArchiveLoads.get(date);
		if (!pendingLoad) {
			pendingLoad = loadArchiveForDate(date, data).finally(() => pendingArchiveLoads.delete(date));
			pendingArchiveLoads.set(date, pendingLoad);
		}

		archiveResult = await pendingLoad;
		if (archiveResult) cachedArchives.set(date, archiveResult);
	}

	if (!archiveResult) {
		const cachedArchive = cachedArchives.get(date);
		if (cachedArchive) {
			updateArchiveModeLabel(cachedArchive.actualArchiveDate);
			return cloneSerializable(cachedArchive.data) || data;
		}

		exitArchiveModeAfterFailure("Unable to communicate with the Wayback archive. Returned to the live map.");
		return data;
	}

	updateArchiveModeLabel(archiveResult.actualArchiveDate);
	if (archiveResult.actualArchiveDate.replaceAll("-", "") !== String(date)) {
		showPageAlert(`The closest archive to your prompt comes from ${archiveResult.actualArchiveDate}.`);
	}

	return cloneSerializable(archiveResult.data) || data;
}

function convertOldMarkersStructure(markerset) {
	return Object.entries(markerset.areas)
		.filter(([key]) => !key.includes("_Shop"))
		.map(([_, value]) => ({
			fillColor: value.fillcolor,
			color: value.color,
			popup: value.desc ?? `<div><b>${value.label}</b></div>`,
			weight: value.weight,
			opacity: value.opacity,
			type: "polygon",
			points: value.x.map((x, i) => ({ x, z: value.z[i] })),
		}));
}

function checkOverclaimedNationless(claimedChunks, numResidents) {
	const resLimit = numResidents * CHUNKS_PER_RES;
	const isOverclaimed = claimedChunks > resLimit;
	return {
		isOverclaimed,
		chunksOverclaimed: isOverclaimed ? claimedChunks - resLimit : 0,
		resLimit,
	};
}

function checkOverclaimed(claimedChunks, numResidents, numNationResidents) {
	const resLimit = numResidents * CHUNKS_PER_RES;
	const bonus = getNationClaimBonus(numNationResidents);
	const totalClaimLimit = resLimit + bonus;
	const isOverclaimed = claimedChunks > totalClaimLimit;
	return {
		isOverclaimed,
		chunksOverclaimed: isOverclaimed ? claimedChunks - totalClaimLimit : 0,
		nationBonus: bonus,
		resLimit,
		totalClaimLimit,
	};
}

async function modifyMarkersInPage(data) {
	let result = stripDynmapPlusManagedLayers(data);
	const mapMode = currentMapMode();

	pageMarkersDebugInfo(`${MARKER_ENGINE_PREFIX}: modifyMarkers started`, {
		mapMode,
		layerCount: Array.isArray(result) ? result.length : null,
		initialMarkerCount: Array.isArray(result?.[0]?.markers) ? result[0].markers.length : null,
	});

	if (mapMode === "archive") {
		result = await getArchive(result);
	}

	if (!result?.[0]?.markers?.length) {
		parsedMarkers = [];
		syncParsedMarkers();
		showPageAlert("Unexpected error occurred while loading the map, EarthMC may be down. Try again later.");
		return result;
	}

	const isAllianceMode = mapMode === "alliances" || mapMode === "meganations";
	if (isAllianceMode && cachedAlliances == null) {
		cachedAlliances = await getAlliances();
	}

	if (mapMode === "overclaim" && cachedApiNations == null) {
		const nationsUrl = getCurrentOapiUrl("nations");
		const nlist = await fetchJSON(nationsUrl);
		const apiNations = await queryConcurrent(nationsUrl, nlist);
		cachedApiNations = new Map(apiNations.map((nation) => [nation.name.toLowerCase(), nation]));
	}

	parsedMarkers = [];
	if (shouldInjectDynmapPlusChunksLayer()) {
		result = addChunksLayer(result);
	}

	const borders = await getStyledBorders();
	if (!borders) {
		showPageAlert("An unexpected error occurred fetching the borders resource file.");
	} else {
		result = addCountryBordersLayer(result, borders) || result;
	}
	if (mapMode === "planning") {
		result = addPlanningLayer(result);
	}

	const date = archiveDate();
	const isSquaremap = mapMode !== "archive" || date >= 20240701;
	const claimsCustomizerInfo = new Map(
		nationClaimsInfo()
			.filter((obj) => obj.input != null)
			.map((obj) => [obj.input?.toLowerCase(), obj.color]),
	);
	const useOpaque = localStorage["emcdynmapplus-nation-claims-opaque-colors"] === "true";
	const showExcluded = localStorage["emcdynmapplus-nation-claims-show-excluded"] === "true";

	for (const marker of result[0].markers) {
		if (marker.type !== "polygon" && marker.type !== "icon") continue;

		try {
			const parsedInfo = isSquaremap ? modifyDescription(marker, mapMode) : modifyDynmapDescription(marker, date);
			if (marker.type !== "polygon") continue;

			parsedMarkers.push(parsedInfo);
			marker.opacity = 1;
			marker.fillOpacity = 0.33;
			marker.weight = 1.5;

			if (mapMode === "default" || mapMode === "planning" || mapMode === "archive") continue;
			if (mapMode === "nationclaims") {
				colorTownNationClaims(marker, parsedInfo.nationName, claimsCustomizerInfo, useOpaque, showExcluded);
				continue;
			}

			colorTown(marker, parsedInfo, mapMode);
		} catch (err) {
			console.error(`${MARKER_ENGINE_PREFIX}: failed to process marker`, {
				type: marker?.type,
				tooltip: marker?.tooltip?.slice?.(0, 120) || null,
				error: err,
			});
		}
	}

	syncParsedMarkers();

	pageMarkersDebugInfo(`${MARKER_ENGINE_PREFIX}: modifyMarkers completed`, {
		mapMode,
		parsedMarkersCount: parsedMarkers.length,
		markerCount: Array.isArray(result?.[0]?.markers) ? result[0].markers.length : null,
	});

	return result;
}

window.EMCDYNMAPPLUS_PAGE_MARKERS = {
	modifyMarkers: modifyMarkersInPage,
};
exposePlanningDebugHelpers();
initLeafletMapDiagnostics();
})();
