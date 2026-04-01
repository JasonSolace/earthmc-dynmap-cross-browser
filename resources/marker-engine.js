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
	label: "Border",
	opacity: 0.5,
	weight: 3,
	color: "#000000",
	markup: false,
};

const getCurrentBorderResourcePaths = () =>
	EARTHMC_MAP?.getBorderResourcePaths?.() ?? {
		country: "resources/borders.aurora.json",
	};
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

function getUserscriptBorders(resourcePath) {
	const filename = String(resourcePath || "").split("/").pop() || "";

	if (typeof BORDERS_BY_RESOURCE !== "undefined") {
		return BORDERS_BY_RESOURCE[filename] ?? null;
	}

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
const cachedStyledBorders = new Map();
const pendingBordersLoads = new Map();

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
	countryBorders: Object.freeze({
		id: "countryBorders",
		name: "Country Borders",
		owner: DYNMAP_PLUS_LAYER_OWNER,
		section: DYNMAP_PLUS_LAYER_SECTION,
	}),
	stateBorders: Object.freeze({
		id: "stateBorders",
		name: "State Borders",
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

function parseStoredJson(storageKey, fallbackValue, opts = {}) {
	try {
		const rawValue = localStorage[storageKey];
		if (!rawValue) return fallbackValue;

		return JSON.parse(rawValue);
	} catch (err) {
		console.warn(`${MARKER_ENGINE_PREFIX}: failed to parse localStorage key "${storageKey}", using fallback`, err);
		if (opts.clearInvalid !== false) {
			try {
				delete localStorage[storageKey];
			} catch {}
		}

		return fallbackValue;
	}
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

const markerEngineGeometryFactory =
	globalThis.__EMCDYNMAPPLUS_MARKER_ENGINE_GEOMETRY__?.createMarkerEngineGeometry;
if (typeof markerEngineGeometryFactory !== "function") {
	throw new Error("emcdynmapplus: marker engine geometry helpers were not loaded before marker-engine.js");
}

const {
	borderEntryToPolylines,
	hashCode,
	calcPolygonArea,
	pointInPolygon,
	calcMarkerArea,
	midrange,
	makePolyline,
	convertOldMarkersStructure,
	checkOverclaimedNationless,
	checkOverclaimed,
	parseColours,
} = markerEngineGeometryFactory({
	getNationClaimBonus,
	chunksPerRes: CHUNKS_PER_RES,
	defaultAllianceColours: DEFAULT_ALLIANCE_COLOURS,
});

const markerEngineHttpFactory =
	globalThis.__EMCDYNMAPPLUS_MARKER_ENGINE_HTTP__?.createMarkerEngineHttp;
if (typeof markerEngineHttpFactory !== "function") {
	throw new Error("emcdynmapplus: marker engine http helpers were not loaded before marker-engine.js");
}

const {
	fetchJSON,
	postJSON,
	queryConcurrent,
} = markerEngineHttpFactory({
	parseStoredJson,
	oapiBase: OAPI_BASE,
	oapiReqPerMin: OAPI_REQ_PER_MIN,
	oapiItemsPerReq: OAPI_ITEMS_PER_REQ,
	logPrefix: MARKER_ENGINE_PREFIX,
});

const markerEngineDataFactory =
	globalThis.__EMCDYNMAPPLUS_MARKER_ENGINE_DATA__?.createMarkerEngineData;
if (typeof markerEngineDataFactory !== "function") {
	throw new Error("emcdynmapplus: marker engine data helpers were not loaded before marker-engine.js");
}

const currentMapMode = () => localStorage["emcdynmapplus-mapmode"] ?? "default";
const archiveDate = () => parseInt(localStorage["emcdynmapplus-archive-date"]);
const nationClaimsInfo = () => {
	const parsed = parseStoredJson("emcdynmapplus-nation-claims-info", []);
	return Array.isArray(parsed) ? parsed : [];
};

const {
	getNationAlliances,
	getArchiveURL,
	getAlliances: getAlliancesData,
	loadArchiveForDate: loadArchiveForDateData,
	getArchive: getArchiveData,
} = markerEngineDataFactory({
	fetchJSON,
	getCurrentCapiUrl,
	getArchiveMarkersSourceUrl,
	parseStoredJson,
	parseColours,
	showPageAlert,
	updateArchiveModeLabel,
	exitArchiveModeAfterFailure,
	cloneSerializable,
	archiveDate,
	getCachedAlliances: () => cachedAlliances,
	debugInfo: pageMarkersDebugInfo,
	proxyUrl: PROXY_URL,
	logPrefix: MARKER_ENGINE_PREFIX,
	cachedArchives,
	pendingArchiveLoads,
});

const getAlliances = () => getAlliancesData();
const loadArchiveForDate = (date, data) =>
	loadArchiveForDateData(date, data, { convertOldMarkersStructure });
const getArchive = (data) =>
	getArchiveData(data, { convertOldMarkersStructure });

const markerEngineTransformFactory =
	globalThis.__EMCDYNMAPPLUS_MARKER_ENGINE_TRANSFORM__?.createMarkerEngineTransform;
if (typeof markerEngineTransformFactory !== "function") {
	throw new Error("emcdynmapplus: marker engine transform helpers were not loaded before marker-engine.js");
}

const {
	modifyDescription,
	modifyDynmapDescription,
	colorTown,
	colorTownNationClaims,
} = markerEngineTransformFactory({
	html: MARKER_ENGINE_HTML,
	calcMarkerArea,
	calcPolygonArea,
	midrange,
	hashCode,
	checkOverclaimed,
	checkOverclaimedNationless,
	getNationAlliances,
	getCachedApiNations: () => cachedApiNations,
	defaultBlue: DEFAULT_BLUE,
	defaultGreen: DEFAULT_GREEN,
});

const markerEnginePageMapFactory =
	globalThis.__EMCDYNMAPPLUS_MARKER_ENGINE_PAGE_MAP__?.createMarkerEnginePageMap;
if (typeof markerEnginePageMapFactory !== "function") {
	throw new Error("emcdynmapplus: marker engine page-map helpers were not loaded before marker-engine.js");
}

const {
	stripDynmapPlusManagedLayers,
	appendDynmapPlusManagedLayer,
	patchLeafletLayerControls,
	initLeafletMapDiagnostics,
} = markerEnginePageMapFactory({
	pageMapPrefix: PAGE_MAP_PREFIX,
	debugInfo: pageMarkersDebugInfo,
	pageMapsKey: PAGE_MAPS_KEY,
	pageMapPatchedKey: PAGE_MAP_PATCHED_KEY,
	pageLayerControlPatchedKey: PAGE_LAYER_CONTROL_PATCHED_KEY,
	pageMapListenersKey: PAGE_MAP_LISTENERS_KEY,
	pageMapZoomAttr: PAGE_MAP_ZOOM_ATTR,
	pageMapContainerAttr: PAGE_MAP_CONTAINER_ATTR,
	dynmapPlusLayerOwner: DYNMAP_PLUS_LAYER_OWNER,
	dynmapPlusLayerSection: DYNMAP_PLUS_LAYER_SECTION,
	layerDefinitionById: DYNMAP_PLUS_LAYER_DEFINITION_BY_ID,
	layerDefinitionByName: DYNMAP_PLUS_LAYER_DEFINITION_BY_NAME,
});

const markerEnginePlanningFactory =
	globalThis.__EMCDYNMAPPLUS_MARKER_ENGINE_PLANNING__?.createMarkerEnginePlanning;
if (typeof markerEnginePlanningFactory !== "function") {
	throw new Error("emcdynmapplus: marker engine planning helpers were not loaded before marker-engine.js");
}

const {
	addPlanningLayer,
	exposePlanningDebugHelpers,
	getPlanningProjectionSignals,
} = markerEnginePlanningFactory({
	plannerStorageKey: PLANNER_STORAGE_KEY,
	planningLayerPrefix: PLANNING_LAYER_PREFIX,
	defaultPlanningRange: DEFAULT_PLANNING_RANGE,
	planningCenterRadius: PLANNING_CENTER_RADIUS,
	pageMapZoomAttr: PAGE_MAP_ZOOM_ATTR,
	pageMapContainerAttr: PAGE_MAP_CONTAINER_ATTR,
	pageTileZoomAttr: PAGE_TILE_ZOOM_ATTR,
	pageTileUrlAttr: PAGE_TILE_URL_ATTR,
	pageTileDominantZoomAttr: PAGE_TILE_DOMINANT_ZOOM_ATTR,
	pageTileSummaryAttr: PAGE_TILE_SUMMARY_ATTR,
	appendDynmapPlusManagedLayer,
	planningLayerDefinition: DYNMAP_PLUS_LAYER_DEFINITIONS.planningNations,
	debugInfo: pageMarkersDebugInfo,
});

async function getStyledBorders(resourcePath) {
	if (!resourcePath) return null;
	if (cachedStyledBorders.has(resourcePath)) return cachedStyledBorders.get(resourcePath);

	const userscriptBorders = getUserscriptBorders(resourcePath);
	if (userscriptBorders) {
		const styledUserscriptBorders = Object.fromEntries(
			Object.entries(userscriptBorders).map(([key, border]) => [key, { ...border, ...EXTRA_BORDER_OPTS }]),
		);
		cachedStyledBorders.set(resourcePath, styledUserscriptBorders);
		return styledUserscriptBorders;
	}

	if (!pendingBordersLoads.has(resourcePath)) {
		const borderFilename = resourcePath.split("/").pop() || "borders.aurora.json";
		const loadBordersFromResponse = async (response) => {
			if (!resourcePath.endsWith(".gz")) return response.json();

			const compressed = await response.arrayBuffer();
			const testDecompressor = globalThis.__EMCDYNMAPPLUS_DECOMPRESS_GZIP__;
			if (typeof testDecompressor === "function") {
				return JSON.parse(await testDecompressor(compressed));
			}

			if (typeof DecompressionStream !== "function") {
				throw new Error("This browser cannot read packaged gzip border resources.");
			}

			const compressedBody = new Response(compressed).body;
			if (!compressedBody) {
				throw new Error("Could not read the packaged gzip border resource body.");
			}

			const decompressed = compressedBody.pipeThrough(new DecompressionStream("gzip"));
			return JSON.parse(await new Response(decompressed).text());
		};

		pendingBordersLoads.set(
			resourcePath,
			fetch(getResourceUrl(borderFilename))
				.then(async (response) => {
					if (!response.ok) return null;

					const borders = await loadBordersFromResponse(response);
					return Object.fromEntries(
						Object.entries(borders).map(([key, border]) => [key, { ...border, ...EXTRA_BORDER_OPTS }]),
					);
				})
				.catch((err) => {
					console.error(`${MARKER_ENGINE_PREFIX}: failed to load borders resource`, {
						resourcePath,
						error: err,
					});
					return null;
				})
				.finally(() => {
					pendingBordersLoads.delete(resourcePath);
				}),
		);
	}

	const styledBorders = await pendingBordersLoads.get(resourcePath);
	cachedStyledBorders.set(resourcePath, styledBorders);
	return styledBorders;
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

function addBorderLayer(data, definition, borders, failureLabel) {
	try {
		const points = Object.values(borders).flatMap((line) => borderEntryToPolylines(line));

		return appendDynmapPlusManagedLayer(data, definition, {
			order: 999,
			hide: true,
			control: true,
			markers: [makePolyline(points)],
		});
	} catch (err) {
		showPageAlert(`Could not set up a layer of ${failureLabel}. You may need to clear this website's data. If problem persists, contact the developer.`);
		console.error(err);
		return null;
	}
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

	const borderResources = getCurrentBorderResourcePaths();
	const countryBorders = await getStyledBorders(borderResources.country);
	if (!countryBorders) {
		showPageAlert("An unexpected error occurred fetching the country borders resource file.");
	} else {
		result =
			addBorderLayer(
				result,
				DYNMAP_PLUS_LAYER_DEFINITIONS.countryBorders,
				countryBorders,
				"country borders",
			) || result;
	}

	if (borderResources.state) {
		const stateBorders = await getStyledBorders(borderResources.state);
		if (!stateBorders) {
			showPageAlert("An unexpected error occurred fetching the state borders resource file.");
		} else {
			result =
				addBorderLayer(
					result,
					DYNMAP_PLUS_LAYER_DEFINITIONS.stateBorders,
					stateBorders,
					"state borders",
				) || result;
		}
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
