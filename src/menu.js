/** ANY CODE RELATING TO THE MAIN ONSCREEN EXTENSION MENU GOES HERE */
//console.log('emcdynmapplus: loaded menu')

// TODO: Use Custom Element Registry and convert the main menu into one.

const MAP_MODE_METADATA = [
	{
		value: "default",
		label: "Live Map",
		description: "Use the base map styling with only the shared enhancements.",
	},
	{
		value: "meganations",
		label: "Mega Nations",
		description: "Show mega-alliance colors directly on town claims.",
	},
	{
		value: "alliances",
		label: "Alliances",
		description: "Color towns by alliance ownership with clean borders.",
	},
	{
		value: "nationclaims",
		label: "Nation Claims",
		description: "Load the nation-claims customizer for manual color maps.",
	},
	{
		value: "overclaim",
		label: "Overclaim",
		description: "Highlight towns that exceed their current claim limits.",
	},
	{
		value: "planning",
		label: "Planning",
		description: "Draw simple custom nation circles directly on the live map.",
	},
	{
		value: "archive",
		label: "Archive",
		description:
			"Load the nearest historical snapshot from the Wayback archive.",
	},
];

const DEFAULT_MAP_MODE = "meganations";
const LIVE_MAP_MODE_METADATA = MAP_MODE_METADATA.filter(
	(option) => option.value !== "archive",
);
const LIVE_MAP_MODE_VALUES = new Set(
	LIVE_MAP_MODE_METADATA.map((option) => option.value),
);
const getMapModeMeta = (mode) =>
	MAP_MODE_METADATA.find((option) => option.value === mode) ||
	MAP_MODE_METADATA[0];
const LAST_LIVE_MAP_MODE_KEY = "emcdynmapplus-last-live-mapmode";
const SIDEBAR_EXPANDED_KEY = "emcdynmapplus-sidebar-expanded";
const PLANNER_STORAGE_KEY = "emcdynmapplus-planner-nations";
const PLANNING_PLACEMENT_ARMED_KEY = "emcdynmapplus-planning-placement-armed";
const PLANNING_DEFAULT_RANGE_KEY = "emcdynmapplus-planning-default-range";
const PLANNING_DEBUG_STATE_KEY = "emcdynmapplus-planning-debug-state";
const PLANNING_UI_PREFIX = "emcdynmapplus[planning-ui]";
const PLANNING_PLACE_EVENT = "EMCDYNMAPPLUS_PLACE_PLANNING_NATION";
const PLANNING_CURSOR_PREVIEW_ID = "emcdynmapplus-planning-cursor-preview";
const PLANNING_CENTER_RADIUS_BLOCKS = 1;
const PLANNING_PREVIEW_CENTER_DIAMETER_PX = 8;
const PLANNING_PREVIEW_BLOCKS_PER_PIXEL_BY_ZOOM = {
	0: 7.874016,
	1: 3.968254,
	2: 1.994018,
	3: 0.997009,
	4: 0.498505,
	5: 0.249253,
};
const PLANNING_PREVIEW_ZOOM_LEVELS = Object.keys(
	PLANNING_PREVIEW_BLOCKS_PER_PIXEL_BY_ZOOM,
)
	.map((value) => Number(value))
	.filter(Number.isFinite);
const PLANNING_PREVIEW_MIN_ZOOM = Math.min(...PLANNING_PREVIEW_ZOOM_LEVELS);
const PLANNING_PREVIEW_MAX_ZOOM = Math.max(...PLANNING_PREVIEW_ZOOM_LEVELS);
const PLANNING_PREVIEW_FALLBACK_BLOCKS_PER_PIXEL =
	PLANNING_PREVIEW_BLOCKS_PER_PIXEL_BY_ZOOM[1];
const PLANNING_PREVIEW_FALLBACK_ZOOM = 1;
const PLANNING_LEAFLET_ZOOM_ATTR = "data-emcdynmapplus-leaflet-zoom";
const PLANNING_LEAFLET_MAP_CONTAINER_ATTR =
	"data-emcdynmapplus-leaflet-map-container";
const PLANNING_TILE_ZOOM_ATTR = "data-emcdynmapplus-tile-zoom";
const PLANNING_TILE_URL_ATTR = "data-emcdynmapplus-tile-url";
const PLANNING_TILE_DOMINANT_ZOOM_ATTR =
	"data-emcdynmapplus-tile-dominant-zoom";
const PLANNING_TILE_SUMMARY_ATTR = "data-emcdynmapplus-tile-zoom-summary";
const DYNMAP_PLUS_LAYER_OWNER = "dynmapplus";
const DYNMAP_PLUS_LAYER_SECTION = "dynmapplus";
const DEFAULT_PLANNING_NATION_RANGE = 5000;
const DEFAULT_PLANNING_NATION = {
	id: "hardcoded-demo-nation",
	name: "Planning Nation",
	color: "#d98936",
	outlineColor: "#fff3cf",
	rangeRadiusBlocks: DEFAULT_PLANNING_NATION_RANGE,
};
let planningPlacementClickInitialized = false;
let planningCursorPreviewInitialized = false;
let planningCursorPreviewRefreshFrame = 0;
let planningCursorPreviewInteractionInitialized = false;
let planningCursorPreviewRuntimeZoom = null;
let planningCursorPreviewRuntimeZoomSource = null;
let planningCursorPreviewLastWheelAt = 0;
let planningCursorPreviewLastLogSignature = null;

const isLiveMapMode = (mode) => LIVE_MAP_MODE_VALUES.has(mode);

function formatStoredArchiveDate(rawDate) {
	return typeof rawDate === "string" && /^\d{8}$/.test(rawDate)
		? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
		: "";
}

function getStoredArchiveDateLabel() {
	return formatStoredArchiveDate(localStorage["emcdynmapplus-archive-date"]);
}

function getStoredCurrentMapMode() {
	return localStorage["emcdynmapplus-mapmode"] ?? DEFAULT_MAP_MODE;
}

function getPreferredLiveMapMode(fallbackMode = null) {
	const resolvedFallbackMode = fallbackMode ?? getStoredCurrentMapMode();
	const storedMode = localStorage[LAST_LIVE_MAP_MODE_KEY];
	if (isLiveMapMode(storedMode)) return storedMode;
	if (isLiveMapMode(resolvedFallbackMode)) return resolvedFallbackMode;
	return DEFAULT_MAP_MODE;
}

function rememberPreferredLiveMapMode(mode) {
	if (!isLiveMapMode(mode)) return;
	localStorage[LAST_LIVE_MAP_MODE_KEY] = mode;
}

function getSidebarModeLabel(mode) {
	if (mode === "archive") return "Archive Snapshot";
	return getMapModeMeta(mode).label;
}

function formatMapModeLabel(
	mode,
	archiveDateLabel = getStoredArchiveDateLabel(),
) {
	if (mode === "archive")
		return archiveDateLabel
			? `Archive Snapshot: ${archiveDateLabel}`
			: "Archive Snapshot";
	return `View: ${getMapModeMeta(mode).label}`;
}

function isPlanningDebugLoggingEnabled() {
	try {
		return localStorage["emcdynmapplus-debug"] === "true";
	} catch {
		return false;
	}
}

const planningDebugInfo = (...args) => {
	if (isPlanningDebugLoggingEnabled()) console.info(...args);
};

function setPlanningDebugState(action, details = {}) {
	try {
		localStorage[PLANNING_DEBUG_STATE_KEY] = JSON.stringify({
			action,
			details,
			at: new Date().toISOString(),
		});
	} catch {}

	planningDebugInfo(`${PLANNING_UI_PREFIX}: ${action}`, details);
}

function getPlanningCursorPreview() {
	return document.querySelector(`#${PLANNING_CURSOR_PREVIEW_ID}`);
}

function ensurePlanningCursorPreviewElement() {
	let preview = getPlanningCursorPreview();
	if (preview) return preview;

	preview = addElement(
		document.body,
		createElement(
			"div",
			{
				id: PLANNING_CURSOR_PREVIEW_ID,
				className: "planning-cursor-preview",
				attrs: {
					"aria-hidden": "true",
				},
			},
			[
				createElement("div", { className: "planning-cursor-preview-ring" }),
				createElement("div", { className: "planning-cursor-preview-center" }),
				createElement("div", {
					className: "planning-cursor-preview-label",
					id: "planning-cursor-preview-label",
				}),
			],
		),
	);
	return preview;
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

function clampPlanningPreviewZoom(value) {
	const numericValue = Number(value);
	if (!Number.isFinite(numericValue)) return null;
	return Math.min(
		PLANNING_PREVIEW_MAX_ZOOM,
		Math.max(PLANNING_PREVIEW_MIN_ZOOM, Math.round(numericValue)),
	);
}

function setPlanningCursorPreviewRuntimeZoom(value, source = "runtime") {
	const nextZoom = clampPlanningPreviewZoom(value);
	if (nextZoom == null) return null;
	planningCursorPreviewRuntimeZoom = nextZoom;
	planningCursorPreviewRuntimeZoomSource = source;
	planningDebugInfo(`${PLANNING_UI_PREFIX}: preview runtime zoom updated`, {
		zoomLevel: nextZoom,
		source,
	});
	return nextZoom;
}

function getPlanningPreviewInteractionBaseZoom() {
	const leafletZoom = readNumericRootAttribute(PLANNING_LEAFLET_ZOOM_ATTR);
	if (leafletZoom != null) return clampPlanningPreviewZoom(leafletZoom);

	if (planningCursorPreviewRuntimeZoom != null)
		return clampPlanningPreviewZoom(planningCursorPreviewRuntimeZoom);

	const urlZoom = (() => {
		const rawValue = new URL(window.location.href).searchParams.get("zoom");
		if (rawValue == null || rawValue === "") return null;
		const parsedValue = Number(rawValue);
		return Number.isFinite(parsedValue) ? parsedValue : null;
	})();
	if (urlZoom != null) return clampPlanningPreviewZoom(urlZoom);

	const dominantTileZoom = readNumericRootAttribute(
		PLANNING_TILE_DOMINANT_ZOOM_ATTR,
	);
	if (dominantTileZoom != null)
		return clampPlanningPreviewZoom(dominantTileZoom);

	const publishedTileZoom = readNumericRootAttribute(PLANNING_TILE_ZOOM_ATTR);
	if (publishedTileZoom != null)
		return clampPlanningPreviewZoom(publishedTileZoom);

	const activeTile = document.querySelector(
		".leaflet-tile-pane img.leaflet-tile[src]",
	);
	const tileSrc =
		activeTile instanceof HTMLImageElement
			? activeTile.currentSrc || activeTile.src || ""
			: "";
	return clampPlanningPreviewZoom(parseZoomFromTileUrl(tileSrc));
}

function stepPlanningCursorPreviewRuntimeZoom(delta, source) {
	const baseZoom =
		getPlanningPreviewInteractionBaseZoom() ?? PLANNING_PREVIEW_FALLBACK_ZOOM;
	return setPlanningCursorPreviewRuntimeZoom(baseZoom + delta, source);
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

function getPlanningProjectionProbe() {
	const urlZoom = (() => {
		const rawValue = new URL(window.location.href).searchParams.get("zoom");
		if (rawValue == null || rawValue === "") return null;
		const parsedValue = Number(rawValue);
		return Number.isFinite(parsedValue) ? parsedValue : null;
	})();
	const leafletZoom = readNumericRootAttribute(PLANNING_LEAFLET_ZOOM_ATTR);
	const publishedTileZoom = readNumericRootAttribute(PLANNING_TILE_ZOOM_ATTR);
	const dominantTileZoom = readNumericRootAttribute(
		PLANNING_TILE_DOMINANT_ZOOM_ATTR,
	);
	const publishedTileUrl =
		document.documentElement.getAttribute(PLANNING_TILE_URL_ATTR) || null;
	const tileSummary = readJsonRootAttribute(PLANNING_TILE_SUMMARY_ATTR);
	const activeTile = document.querySelector(
		".leaflet-tile-pane img.leaflet-tile[src]",
	);
	const tileSrc =
		activeTile instanceof HTMLImageElement
			? activeTile.currentSrc || activeTile.src || ""
			: "";
	const tileImageZoom = parseZoomFromTileUrl(tileSrc);
	const mapContainer =
		document.documentElement.getAttribute(
			PLANNING_LEAFLET_MAP_CONTAINER_ATTR,
		) || null;
	const tilePaneScale = getTransformScale(
		document.querySelector(".leaflet-tile-pane"),
	);
	const tileLayerScale = getTransformScale(
		document.querySelector(".leaflet-tile-pane .leaflet-layer"),
	);
	const mapPaneScale = getTransformScale(
		document.querySelector(".leaflet-map-pane"),
	);
	const overlayCanvasScale = getTransformScale(
		document.querySelector(
			".leaflet-overlay-pane canvas.leaflet-zoom-animated",
		),
	);

	const effectiveZoomFromTilePaneScale =
		dominantTileZoom == null || tilePaneScale == null || tilePaneScale <= 0
			? null
			: dominantTileZoom + Math.log2(tilePaneScale);
	const effectiveZoomFromTileLayerScale =
		dominantTileZoom == null || tileLayerScale == null || tileLayerScale <= 0
			? null
			: dominantTileZoom + Math.log2(tileLayerScale);

	const zoomCandidates = [
		{ source: "leaflet", value: leafletZoom },
		{
			source: planningCursorPreviewRuntimeZoomSource ?? "runtime",
			value: planningCursorPreviewRuntimeZoom,
		},
		{ source: "url", value: urlZoom },
		{ source: "tile-dominant", value: dominantTileZoom },
		{ source: "tile-request", value: publishedTileZoom },
		{ source: "tile-image", value: tileImageZoom },
	];
	const activeZoomCandidate =
		zoomCandidates.find((candidate) => candidate.value != null) ?? null;

	return {
		zoomLevel: activeZoomCandidate?.value ?? null,
		zoomSource: activeZoomCandidate?.source ?? "fallback",
		urlZoom,
		leafletZoom,
		runtimeZoom: planningCursorPreviewRuntimeZoom,
		runtimeZoomSource: planningCursorPreviewRuntimeZoomSource,
		publishedTileZoom,
		dominantTileZoom,
		tileImageZoom,
		publishedTileUrl,
		tileSrc: tileSrc || null,
		tileSummary,
		mapContainer,
		tilePaneScale: roundDebugValue(tilePaneScale),
		tileLayerScale: roundDebugValue(tileLayerScale),
		mapPaneScale: roundDebugValue(mapPaneScale),
		overlayCanvasScale: roundDebugValue(overlayCanvasScale),
		effectiveZoomFromTilePaneScale: roundDebugValue(
			effectiveZoomFromTilePaneScale,
		),
		effectiveZoomFromTileLayerScale: roundDebugValue(
			effectiveZoomFromTileLayerScale,
		),
	};
}

function getPlanningPreviewScaleInfo() {
	const zoomInfo = getPlanningProjectionProbe();
	const zoomLevel = Number.isFinite(zoomInfo.zoomLevel)
		? zoomInfo.zoomLevel
		: null;
	const knownBlocksPerPixel =
		zoomLevel != null
			? (PLANNING_PREVIEW_BLOCKS_PER_PIXEL_BY_ZOOM[zoomLevel] ?? null)
			: null;
	const zoomStepDelta =
		zoomLevel == null ? 0 : zoomLevel - PLANNING_PREVIEW_FALLBACK_ZOOM;
	const fallbackBlocksPerPixel = Math.max(
		0.01,
		PLANNING_PREVIEW_FALLBACK_BLOCKS_PER_PIXEL / 2 ** zoomStepDelta,
	);
	const blocksPerPixel = Math.max(
		0.01,
		knownBlocksPerPixel ?? fallbackBlocksPerPixel,
	);

	return {
		...zoomInfo,
		blocksPerPixel,
		calibrationMode:
			knownBlocksPerPixel != null
				? "measured-table"
				: zoomLevel == null
					? "zoom-fallback"
					: "derived-fallback",
	};
}

function getPlanningPreviewMaxDiameter() {
	return Math.max(240, 32767);
}

function getScaledPreviewDiameterMetrics(rangeBlocks) {
	const normalizedRange =
		normalizePlanningRange(rangeBlocks) ?? DEFAULT_PLANNING_NATION_RANGE;
	const { blocksPerPixel } = getPlanningPreviewScaleInfo();
	const rawDiameter = Math.round(
		(normalizedRange * 2) / Math.max(0.01, blocksPerPixel),
	);
	const previewDiameterPx = Math.max(
		36,
		Math.min(getPlanningPreviewMaxDiameter(), rawDiameter),
	);
	return {
		rawDiameterPx: rawDiameter,
		previewDiameterPx,
		wasClamped: previewDiameterPx !== rawDiameter,
	};
}

function logPlanningCursorPreviewScaleInfo(details) {
	if (!isPlanningDebugLoggingEnabled()) return;

	const signature = JSON.stringify({
		zoomLevel: details.zoomLevel,
		zoomSource: details.zoomSource,
		runtimeZoom: details.runtimeZoom,
		runtimeZoomSource: details.runtimeZoomSource,
		publishedTileZoom: details.publishedTileZoom,
		dominantTileZoom: details.dominantTileZoom,
		urlZoom: details.urlZoom,
		diameter: details.previewDiameterPx,
		centerDiameter: details.centerDiameterPx,
		calibrationMode: details.calibrationMode,
	});
	if (signature === planningCursorPreviewLastLogSignature) return;
	planningCursorPreviewLastLogSignature = signature;

	planningDebugInfo(`${PLANNING_UI_PREFIX}: cursor preview sizing`, details);
}

function updatePlanningCursorPreviewVisual() {
	const preview = ensurePlanningCursorPreviewElement();
	const range =
		getHardcodedPlanningNation()?.rangeRadiusBlocks ??
		getPlanningDefaultRange();
	const scaleInfo = getPlanningPreviewScaleInfo();
	const diameterMetrics = getScaledPreviewDiameterMetrics(range);
	const diameter = diameterMetrics.previewDiameterPx;
	const rawCenterDiameter = Math.round(
		(PLANNING_CENTER_RADIUS_BLOCKS * 2) /
			Math.max(0.01, scaleInfo.blocksPerPixel),
	);
	const centerDiameter = Math.max(
		6,
		Math.max(rawCenterDiameter, PLANNING_PREVIEW_CENTER_DIAMETER_PX),
	);
	preview.style.setProperty("--planning-preview-size", `${diameter}px`);
	preview.style.setProperty(
		"--planning-preview-center-size",
		`${centerDiameter}px`,
	);
	preview.dataset.previewZoomLevel =
		scaleInfo.zoomLevel == null ? "" : String(scaleInfo.zoomLevel);
	preview.dataset.previewZoomSource = scaleInfo.zoomSource ?? "";
	preview.dataset.previewRawDiameter = String(diameterMetrics.rawDiameterPx);
	preview.dataset.previewDiameter = String(diameter);
	preview.dataset.previewDiameterWasClamped = String(
		diameterMetrics.wasClamped,
	);
	preview.dataset.previewRawCenterDiameter = String(rawCenterDiameter);
	preview.dataset.previewCenterDiameter = String(centerDiameter);
	preview.querySelector("#planning-cursor-preview-label").textContent =
		`${range} b`;
	logPlanningCursorPreviewScaleInfo({
		rangeRadiusBlocks: range,
		rawPreviewDiameterPx: diameterMetrics.rawDiameterPx,
		previewDiameterPx: diameter,
		previewDiameterWasClamped: diameterMetrics.wasClamped,
		rawCenterDiameterPx: rawCenterDiameter,
		centerDiameterPx: centerDiameter,
		blocksPerPixel: roundDebugValue(scaleInfo.blocksPerPixel, 6),
		calibrationMode: scaleInfo.calibrationMode,
		zoomLevel: scaleInfo.zoomLevel,
		zoomSource: scaleInfo.zoomSource,
		runtimeZoom: scaleInfo.runtimeZoom,
		runtimeZoomSource: scaleInfo.runtimeZoomSource,
		urlZoom: scaleInfo.urlZoom,
		leafletZoom: scaleInfo.leafletZoom,
		publishedTileZoom: scaleInfo.publishedTileZoom,
		dominantTileZoom: scaleInfo.dominantTileZoom,
		tileImageZoom: scaleInfo.tileImageZoom,
		effectiveZoomFromTilePaneScale: scaleInfo.effectiveZoomFromTilePaneScale,
		effectiveZoomFromTileLayerScale: scaleInfo.effectiveZoomFromTileLayerScale,
	});
}

function hidePlanningCursorPreview() {
	const preview = getPlanningCursorPreview();
	if (!(preview instanceof HTMLElement)) return;
	preview.hidden = true;
}

function handlePlanningCursorPreviewZoomControlClick(event) {
	const target = event.target;
	if (!(target instanceof HTMLElement)) return;

	const zoomInControl = target.closest(".leaflet-control-zoom-in");
	if (
		zoomInControl instanceof HTMLElement &&
		!zoomInControl.classList.contains("leaflet-disabled")
	) {
		stepPlanningCursorPreviewRuntimeZoom(1, "zoom-control");
		return;
	}

	const zoomOutControl = target.closest(".leaflet-control-zoom-out");
	if (
		zoomOutControl instanceof HTMLElement &&
		!zoomOutControl.classList.contains("leaflet-disabled")
	) {
		stepPlanningCursorPreviewRuntimeZoom(-1, "zoom-control");
	}
}

function handlePlanningCursorPreviewWheel(event) {
	if (!isPlanningPlacementArmed()) return;
	if (getStoredCurrentMapMode() !== "planning") return;

	const target = event.target;
	if (!(target instanceof HTMLElement)) return;
	if (!target.closest(".leaflet-container")) return;
	if (target.closest(".leaflet-control-container")) return;

	const now = Date.now();
	if (now - planningCursorPreviewLastWheelAt < 180) return;
	if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return;

	planningCursorPreviewLastWheelAt = now;
	stepPlanningCursorPreviewRuntimeZoom(event.deltaY < 0 ? 1 : -1, "wheel");
}

function stopPlanningCursorPreviewRefreshLoop() {
	if (!planningCursorPreviewRefreshFrame) return;
	cancelAnimationFrame(planningCursorPreviewRefreshFrame);
	planningCursorPreviewRefreshFrame = 0;
}

function refreshPlanningCursorPreviewLoop() {
	if (!isPlanningPlacementArmed() || getStoredCurrentMapMode() !== "planning") {
		planningCursorPreviewRefreshFrame = 0;
		return;
	}

	const preview = getPlanningCursorPreview();
	if (preview instanceof HTMLElement && !preview.hidden) {
		updatePlanningCursorPreviewVisual();
	}

	planningCursorPreviewRefreshFrame = requestAnimationFrame(
		refreshPlanningCursorPreviewLoop,
	);
}

function ensurePlanningCursorPreviewRefreshLoop() {
	if (planningCursorPreviewRefreshFrame) return;
	planningCursorPreviewRefreshFrame = requestAnimationFrame(
		refreshPlanningCursorPreviewLoop,
	);
}

function updatePlanningCursorPreviewState() {
	const isArmed =
		getStoredCurrentMapMode() === "planning" && isPlanningPlacementArmed();
	document.documentElement.toggleAttribute(
		"data-emcdynmapplus-planning-armed",
		isArmed,
	);
	const preview = ensurePlanningCursorPreviewElement();
	if (!isArmed) {
		stopPlanningCursorPreviewRefreshLoop();
		planningCursorPreviewLastLogSignature = null;
		preview.hidden = true;
		return;
	}

	updatePlanningCursorPreviewVisual();
	ensurePlanningCursorPreviewRefreshLoop();
}

function handlePlanningCursorPreviewMove(event) {
	if (!isPlanningPlacementArmed()) return hidePlanningCursorPreview();
	if (getStoredCurrentMapMode() !== "planning")
		return hidePlanningCursorPreview();

	const target = event.target;
	if (!(target instanceof HTMLElement)) return hidePlanningCursorPreview();
	if (!target.closest(".leaflet-container")) return hidePlanningCursorPreview();
	if (target.closest(".leaflet-control-container"))
		return hidePlanningCursorPreview();

	const preview = ensurePlanningCursorPreviewElement();
	updatePlanningCursorPreviewVisual();
	preview.hidden = false;
	preview.style.left = `${event.clientX}px`;
	preview.style.top = `${event.clientY}px`;
	ensurePlanningCursorPreviewRefreshLoop();
}

function ensurePlanningCursorPreview() {
	if (planningCursorPreviewInitialized) return;

	ensurePlanningCursorPreviewElement();
	document.addEventListener("mousemove", handlePlanningCursorPreviewMove, true);
	document.addEventListener("mouseleave", hidePlanningCursorPreview, true);
	planningCursorPreviewInitialized = true;

	if (planningCursorPreviewInteractionInitialized) return;
	planningCursorPreviewRuntimeZoom = getPlanningPreviewInteractionBaseZoom();
	planningCursorPreviewRuntimeZoomSource =
		planningCursorPreviewRuntimeZoom != null ? "initial" : null;
	document.addEventListener(
		"click",
		handlePlanningCursorPreviewZoomControlClick,
		true,
	);
	document.addEventListener("wheel", handlePlanningCursorPreviewWheel, true);
	planningCursorPreviewInteractionInitialized = true;
}

function updateSidebarContentPosition(sidebarSummary, sidebarContent) {
	if (
		!(sidebarSummary instanceof HTMLElement) ||
		!(sidebarContent instanceof HTMLElement)
	)
		return;

	const summaryRect = sidebarSummary.getBoundingClientRect();
	const viewportPadding = 12;
	const verticalGap = 8;
	const bottomControls = document.querySelector(".leaflet-bottom.leaflet-left");
	const bottomControlsRect =
		bottomControls instanceof HTMLElement
			? bottomControls.getBoundingClientRect()
			: null;
	const defaultBottomClearance = 112;
	const fallbackWidth = 292;
	const measuredWidth = sidebarContent.offsetWidth || fallbackWidth;
	const maxLeft = Math.max(
		viewportPadding,
		window.innerWidth - measuredWidth - viewportPadding,
	);
	const left = Math.min(
		Math.max(viewportPadding, Math.round(summaryRect.left)),
		maxLeft,
	);
	const top = Math.max(
		viewportPadding,
		Math.round(summaryRect.bottom + verticalGap),
	);
	const fallbackSafeBottom = window.innerHeight - defaultBottomClearance;
	const safeBottom =
		bottomControlsRect?.top && Number.isFinite(bottomControlsRect.top)
			? Math.min(
					fallbackSafeBottom,
					Math.round(bottomControlsRect.top - viewportPadding),
				)
			: fallbackSafeBottom;
	const maxHeight = Math.max(120, safeBottom - top);

	sidebarContent.style.left = `${left}px`;
	sidebarContent.style.top = `${top}px`;
	sidebarContent.style.maxHeight = `${maxHeight}px`;

	planningDebugInfo(
		"emcdynmapplus[sidebar-ui]: updated floating sidebar position",
		{
			left,
			top,
			maxHeight,
			safeBottom,
			summaryRect: {
				left: Math.round(summaryRect.left),
				top: Math.round(summaryRect.top),
				bottom: Math.round(summaryRect.bottom),
			},
		},
	);
}

/** @param {HTMLElement} parent - The "leaflet-top leaflet-left" element. */
function addMainMenu(parent) {
	const existingSidebar = parent.querySelector("#sidebar");
	if (existingSidebar) return existingSidebar;

	const curMapMode = getStoredCurrentMapMode();
	const isExpanded = localStorage[SIDEBAR_EXPANDED_KEY] == "true";
	const sidebar = addElement(
		parent,
		createElement("details", {
			id: "sidebar",
			className: "leaflet-control-layers leaflet-control",
			attrs: {
				"data-active-mode": curMapMode,
				...(isExpanded ? { open: "" } : {}),
			},
		}),
	);
	sidebar.addEventListener("toggle", () => {
		localStorage[SIDEBAR_EXPANDED_KEY] = String(sidebar.open);
		if (sidebar.open)
			requestAnimationFrame(() =>
				updateSidebarContentPosition(sidebarSummary, sidebarContent),
			);
	});
	const sidebarSummary = addSidebarSummary(sidebar, curMapMode);
	const toggleSidebar = (event) => {
		event.preventDefault();
		event.stopPropagation();
		sidebar.open = !sidebar.open;
		localStorage[SIDEBAR_EXPANDED_KEY] = String(sidebar.open);
		if (sidebar.open)
			requestAnimationFrame(() =>
				updateSidebarContentPosition(sidebarSummary, sidebarContent),
			);
	};
	sidebarSummary.addEventListener("click", toggleSidebar);
	sidebarSummary.addEventListener("keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		toggleSidebar(event);
	});

	const sidebarContent = addElement(
		sidebar,
		createElement("div", { id: "sidebar-content" }),
	);
	addSidebarHeader(sidebarContent, curMapMode);
	addLocateMenu(sidebarContent); // Locator button and input box
	addMapModeSection(sidebarContent, curMapMode);
	if (curMapMode == "planning") addPlanningSection(sidebarContent);

	window.addEventListener("resize", () =>
		updateSidebarContentPosition(sidebarSummary, sidebarContent),
	);
	window.addEventListener(
		"scroll",
		() => updateSidebarContentPosition(sidebarSummary, sidebarContent),
		true,
	);
	requestAnimationFrame(() =>
		updateSidebarContentPosition(sidebarSummary, sidebarContent),
	);

	return sidebar;
}

/**
 * @param {HTMLElement} sidebar
 * @param {MapMode | "archive"} curMapMode
 */
function addSidebarSummary(sidebar, curMapMode) {
	return addElement(
		sidebar,
		createElement(
			"summary",
			{
				id: "sidebar-toggle",
			},
			[
				createElement("span", { className: "sidebar-summary-copy" }, [
					createElement("span", {
						className: "sidebar-summary-eyebrow",
						text: "Dynmap+",
					}),
					createElement("strong", {
						className: "sidebar-summary-title",
						text: "Map Toolkit",
					}),
					createElement("span", {
						id: "sidebar-summary-mode",
						className: "sidebar-summary-mode",
						text: getSidebarModeLabel(curMapMode),
					}),
				]),
				createElement("span", {
					className: "sidebar-summary-indicator",
					text: "v",
				}),
			],
		),
	);
}

/**
 * @param {HTMLElement} sidebar
 * @param {MapMode | "archive"} curMapMode
 */
function addSidebarHeader(sidebar, curMapMode) {
	const header = addElement(
		sidebar,
		createElement("div", { className: "sidebar-header" }),
	);
	addElement(
		header,
		createElement("div", {
			className: "sidebar-eyebrow",
			text: "EarthMC Dynmap+",
		}),
	);
	addElement(
		header,
		createElement("h2", {
			className: "sidebar-title",
			text: "Map Toolkit",
		}),
	);

	const status = addElement(
		header,
		createElement("div", { className: "sidebar-status-row" }),
	);
	addElement(
		status,
		createElement("div", {
			id: "current-map-mode-label",
			className: "sidebar-mode-pill",
			text: formatMapModeLabel(curMapMode),
		}),
	);
}

/**
 * @param {HTMLElement} parent
 * @param {string} title
 * @param {string} description
 */
function addSidebarSection(parent, title, description) {
	const section = addElement(
		parent,
		createElement("section", { className: "sidebar-section" }),
	);
	const header = addElement(
		section,
		createElement("div", { className: "sidebar-section-header" }),
	);
	addElement(
		header,
		createElement("h3", {
			className: "sidebar-section-title",
			text: title,
		}),
	);
	addElement(
		header,
		createElement("p", {
			className: "sidebar-section-copy",
			text: description,
		}),
	);
	return section;
}

/**
 * @param {HTMLElement} sidebar
 * @param {MapMode | "archive"} curMapMode
 */
function addMapModeSection(sidebar, curMapMode) {
	const section = addSidebarSection(
		sidebar,
		"Map View",
		"Choose a live overlay or jump to a historical snapshot.",
	);
	section.id = "map-mode-section";
	section.setAttribute("data-archive-active", String(curMapMode === "archive"));

	addElement(
		section,
		createElement("label", {
			className: "sidebar-field-label",
			htmlFor: "map-mode-select",
			text: "View mode",
		}),
	);
	const modeSelect = addElement(
		section,
		createElement(
			"select",
			{
				id: "map-mode-select",
				className: "sidebar-input sidebar-select",
			},
			LIVE_MAP_MODE_METADATA.map((mode) =>
				createElement("option", {
					value: mode.value,
					text: mode.label,
				}),
			),
		),
	);
	modeSelect.value =
		curMapMode === "archive" ? "default" : getPreferredLiveMapMode(curMapMode);

	const modeDescription = addElement(
		section,
		createElement("p", {
			id: "map-mode-description",
			className: "sidebar-help",
			text: getMapModeMeta(modeSelect.value).description,
		}),
	);

	const archiveField = addElement(
		section,
		createElement("div", {
			id: "archive-date-group",
			className: "sidebar-field-group sidebar-archive-panel",
		}),
	);
	const archiveStatus = addElement(
		archiveField,
		createElement("div", {
			id: "archive-status",
			className: "sidebar-archive-status",
		}),
	);
	addElement(
		archiveStatus,
		createElement("span", {
			id: "archive-status-eyebrow",
			className: "sidebar-field-label",
			text: curMapMode === "archive" ? "Archive Active" : "Archive Access",
		}),
	);
	addElement(
		archiveStatus,
		createElement("strong", {
			id: "archive-status-title",
			className: "sidebar-archive-title",
			text:
				curMapMode === "archive"
					? getStoredArchiveDateLabel() || "Loading Snapshot"
					: "Open A Historical Snapshot",
		}),
	);
	addElement(
		archiveStatus,
		createElement("p", {
			id: "archive-status-copy",
			className: "sidebar-help",
			text:
				curMapMode === "archive"
					? "You are viewing a historical snapshot. Choose another date below or return to the live map."
					: "Open a past map snapshot without changing your preferred live overlay.",
		}),
	);
	addElement(
		archiveField,
		createElement("label", {
			className: "sidebar-field-label",
			htmlFor: "archive-input",
			text: "Archive date",
		}),
	);
	const archiveInput = addElement(
		archiveField,
		createElement("input", {
			id: "archive-input",
			className: "sidebar-input",
			type: "date",
			attrs: {
				min: ARCHIVE_DATE.MIN,
				max: ARCHIVE_DATE.MAX,
			},
		}),
	);
	const archiveHelp = addElement(
		archiveField,
		createElement("p", {
			className: "sidebar-help",
			text:
				curMapMode === "archive"
					? "Jump to another archive date from here."
					: "Use this only when you want to leave the live map and browse a snapshot.",
		}),
	);

	const viewActions = addElement(
		section,
		createElement("div", { className: "sidebar-action-row" }),
	);
	const switchMapModeButton = addElement(
		viewActions,
		createElement("button", {
			id: "switch-map-mode",
			className: "sidebar-button sidebar-button-primary",
			text: "Apply Selected View",
		}),
	);
	const archiveActions = addElement(
		archiveField,
		createElement("div", {
			className: "sidebar-action-row sidebar-archive-actions",
		}),
	);
	const archiveButton = addElement(
		archiveActions,
		createElement("button", {
			id: "archive-button",
			className: "sidebar-button sidebar-button-primary",
			text: "Open Archive",
		}),
	);

	const syncModeUI = () => {
		const selectedMode = modeSelect.value;
		const selectedMeta = getMapModeMeta(selectedMode);
		const isArchiveActive = curMapMode === "archive";
		const isArchiveAvailable =
			selectedMode === "default" &&
			(curMapMode === "default" || curMapMode === "archive");
		modeDescription.textContent = selectedMeta.description;
		switchMapModeButton.textContent = isArchiveActive
			? selectedMode === "default"
				? "Return To Live Map"
				: "Return To Selected View"
			: "Apply Selected View";
		archiveField.hidden = !isArchiveAvailable;
		archiveButton.textContent = "Open Archive";
		archiveHelp.textContent = isArchiveActive
			? "Jump to another archive date from here."
			: "Use this only when you want to leave the live map and browse a snapshot.";
	};

	switchMapModeButton.addEventListener("click", () =>
		applyMapModeSelection(modeSelect.value),
	);
	archiveButton.addEventListener("click", () =>
		searchArchive(archiveInput.value, modeSelect.value),
	);
	modeSelect.addEventListener("change", syncModeUI);
	archiveInput.addEventListener("keyup", (e) => {
		if (e.key !== "Enter") return;
		searchArchive(archiveInput.value, modeSelect.value);
	});
	archiveInput.addEventListener("change", () => {
		if (!isValidArchiveDateInput(archiveInput.value)) return;
		localStorage["emcdynmapplus-archive-date"] = archiveInput.value.replaceAll(
			"-",
			"",
		);
	});

	syncModeUI();
}

/**
 * @param {MapMode} nextMode
 */
function applyMapModeSelection(nextMode) {
	rememberPreferredLiveMapMode(nextMode);
	if (nextMode !== "planning") setPlanningPlacementArmed(false);
	localStorage["emcdynmapplus-mapmode"] = nextMode;
	location.reload();
}

function loadPlanningNations() {
	try {
		const stored = localStorage[PLANNER_STORAGE_KEY];
		if (!stored) return [];

		const parsed = JSON.parse(stored);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}

function savePlanningNations(nations) {
	localStorage[PLANNER_STORAGE_KEY] = JSON.stringify(nations);
}

function normalizePlanningRange(value) {
	const numericValue = Number(value);
	if (!Number.isFinite(numericValue)) return null;
	return Math.max(0, Math.round(numericValue));
}

function getPlanningDefaultRange() {
	const savedRange = normalizePlanningRange(
		localStorage[PLANNING_DEFAULT_RANGE_KEY],
	);
	return savedRange ?? DEFAULT_PLANNING_NATION_RANGE;
}

function getPlanningMapWorld() {
	const world = new URL(window.location.href).searchParams.get("world");
	return world && world.trim().length > 0 ? world : "minecraft_overworld";
}

function reloadPlanningMapAt(coords, zoom = 0) {
	const x = Number(coords?.x);
	const z = Number(coords?.z);
	if (!Number.isFinite(x) || !Number.isFinite(z)) return location.reload();

	const nextUrl = new URL(window.location.href);
	nextUrl.searchParams.set("world", getPlanningMapWorld());
	nextUrl.searchParams.set("zoom", String(Math.max(0, Math.round(zoom))));
	nextUrl.searchParams.set("x", String(Math.round(x)));
	nextUrl.searchParams.set("z", String(Math.round(z)));
	location.href = nextUrl.toString();
}

function setPlanningDefaultRange(range, source = "unknown") {
	localStorage[PLANNING_DEFAULT_RANGE_KEY] = String(range);
	setPlanningDebugState("updated planning default range", {
		source,
		rangeRadiusBlocks: range,
	});
	updatePlanningCursorPreviewVisual();
}

function normalizePlanningNation(nation) {
	const x = Number(nation?.center?.x);
	const z = Number(nation?.center?.z);
	const rangeRadiusBlocks = Number(nation?.rangeRadiusBlocks);
	if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

	return {
		id:
			typeof nation?.id === "string" && nation.id
				? nation.id
				: DEFAULT_PLANNING_NATION.id,
		name:
			typeof nation?.name === "string" && nation.name.trim()
				? nation.name
				: DEFAULT_PLANNING_NATION.name,
		color:
			typeof nation?.color === "string" && nation.color
				? nation.color
				: DEFAULT_PLANNING_NATION.color,
		outlineColor:
			typeof nation?.outlineColor === "string" && nation.outlineColor
				? nation.outlineColor
				: DEFAULT_PLANNING_NATION.outlineColor,
		rangeRadiusBlocks: Number.isFinite(rangeRadiusBlocks)
			? Math.max(0, Math.round(rangeRadiusBlocks))
			: getPlanningDefaultRange(),
		center: {
			x: Math.round(x),
			z: Math.round(z),
		},
	};
}

function isPlanningPlacementArmed() {
	return localStorage[PLANNING_PLACEMENT_ARMED_KEY] === "true";
}

function setPlanningPlacementArmed(armed) {
	localStorage[PLANNING_PLACEMENT_ARMED_KEY] = String(armed);
	setPlanningDebugState("placement armed state updated", { armed });
	updatePlanningCursorPreviewState();
}

function getHardcodedPlanningNation() {
	return (
		loadPlanningNations()
			.map(normalizePlanningNation)
			.find((nation) => nation != null) ?? null
	);
}

function hasHardcodedPlanningNation() {
	return getHardcodedPlanningNation() != null;
}

function buildPlanningNation(center) {
	return {
		...DEFAULT_PLANNING_NATION,
		rangeRadiusBlocks: getPlanningDefaultRange(),
		center: {
			x: Math.round(center.x),
			z: Math.round(center.z),
		},
	};
}

function updatePlanningNationRange(range, source = "unknown") {
	const normalizedRange = normalizePlanningRange(range);
	if (normalizedRange == null) {
		showAlert("Enter a valid nation range in blocks.", 4);
		return false;
	}

	setPlanningDefaultRange(normalizedRange, source);
	const activeNation = getHardcodedPlanningNation();
	if (!activeNation) return true;

	savePlanningNations([
		{ ...activeNation, rangeRadiusBlocks: normalizedRange },
	]);
	setPlanningDebugState("updated placed planning range", {
		source,
		rangeRadiusBlocks: normalizedRange,
		center: activeNation.center,
	});
	reloadPlanningMapAt(activeNation.center);
	return true;
}

function removeHardcodedPlanningNation() {
	const activeNation = getHardcodedPlanningNation();
	setPlanningPlacementArmed(false);
	savePlanningNations([]);
	setPlanningDebugState("removed planning nation", {
		remainingNationCount: loadPlanningNations().length,
	});
	reloadPlanningMapAt(
		activeNation?.center ?? parsePlanningCoords(getPlanningCoordsText()),
	);
}

function parsePlanningCoords(text) {
	if (typeof text !== "string" || text.trim().length === 0) return null;

	const normalized = text.replaceAll(",", " ");
	const xMatch = normalized.match(/(?:^|\b)x\b[^-\d]*(-?\d+(?:\.\d+)?)/i);
	const zMatch = normalized.match(/(?:^|\b)z\b[^-\d]*(-?\d+(?:\.\d+)?)/i);
	if (xMatch?.[1] && zMatch?.[1]) {
		return {
			x: Math.round(Number(xMatch[1])),
			z: Math.round(Number(zMatch[1])),
		};
	}

	const numericMatches = [...normalized.matchAll(/-?\d+(?:\.\d+)?/g)]
		.map((match) => Number(match[0]))
		.filter((value) => Number.isFinite(value));
	if (numericMatches.length < 2) return null;

	return {
		x: Math.round(numericMatches[0]),
		z: Math.round(numericMatches[numericMatches.length - 1]),
	};
}

function getPlanningCoordsText() {
	return (
		document
			.querySelector(".leaflet-control-layers.coordinates")
			?.textContent?.trim() ?? ""
	);
}

function storePlanningNation(center, source = "unknown") {
	const nation = buildPlanningNation(center);
	savePlanningNations([nation]);
	setPlanningPlacementArmed(false);
	setPlanningDebugState("stored planning nation", {
		source,
		center: nation.center,
		rangeRadiusBlocks: nation.rangeRadiusBlocks,
	});
	return nation;
}

function placeHardcodedPlanningNation(center, source = "unknown") {
	const nation = storePlanningNation(center, source);
	reloadPlanningMapAt(nation.center);
}

function handlePlanningPlacementRequest(center, source = "unknown") {
	const x = Number(center?.x);
	const z = Number(center?.z);
	const coords =
		Number.isFinite(x) && Number.isFinite(z)
			? { x: Math.round(x), z: Math.round(z) }
			: null;

	if (getStoredCurrentMapMode() !== "planning") {
		setPlanningDebugState("ignored planning placement request", {
			reason: "wrong-map-mode",
			source,
			mapMode: getStoredCurrentMapMode(),
			coords,
		});
		return false;
	}

	if (!isPlanningPlacementArmed()) {
		setPlanningDebugState("ignored planning placement request", {
			reason: "not-armed",
			source,
			mapMode: getStoredCurrentMapMode(),
			coords,
		});
		return false;
	}

	if (!coords) {
		setPlanningDebugState("ignored planning placement request", {
			reason: "invalid-coords",
			source,
			center,
		});
		showAlert(
			"Could not read map coordinates for planning placement. Move the cursor over the map and try again.",
			5,
		);
		return false;
	}

	placeHardcodedPlanningNation(coords, source);
	return true;
}

function handlePlanningPlacementClick(event) {
	if (!isPlanningPlacementArmed()) return;
	if (getStoredCurrentMapMode() !== "planning") return;

	const target = event.target;
	if (!(target instanceof HTMLElement)) return;
	if (!target.closest(".leaflet-container")) return;
	if (target.closest(".leaflet-control-container")) return;

	const rawCoordinatesText = getPlanningCoordsText();
	const coords = parsePlanningCoords(rawCoordinatesText);
	setPlanningDebugState("captured map click while armed", {
		rawCoordinatesText,
		targetTag: target.tagName,
		targetClassName: target.className || null,
		coords,
	});
	handlePlanningPlacementRequest(coords, "map-click");
}

function handlePlanningPlacementEvent(event) {
	const center = event.detail?.center ?? null;
	const source =
		typeof event.detail?.source === "string"
			? event.detail.source
			: "custom-event";
	setPlanningDebugState("received planning placement event", {
		source,
		center,
	});
	handlePlanningPlacementRequest(center, source);
}

function ensurePlanningPlacementClickHandler() {
	if (planningPlacementClickInitialized) return;

	document.addEventListener("click", handlePlanningPlacementClick, true);
	document.addEventListener(PLANNING_PLACE_EVENT, handlePlanningPlacementEvent);
	planningPlacementClickInitialized = true;
	setPlanningDebugState("attached planning placement listeners", {
		clickListener: true,
		eventListener: PLANNING_PLACE_EVENT,
	});
}

function armPlanningPlacement() {
	setPlanningPlacementArmed(true);
	ensurePlanningPlacementClickHandler();
	showAlert(
		"Planning placement armed. Click on the live map to place the nation.",
		5,
	);
	setPlanningDebugState("placement armed", {
		existingNationCenter: getHardcodedPlanningNation()?.center ?? null,
	});
}

function addPlanningSection(sidebar) {
	const section = addSidebarSection(
		sidebar,
		"Planning",
		"Set the nation range, then place or move the center on the map.",
	);
	section.id = "planning-section";
	ensurePlanningPlacementClickHandler();
	ensurePlanningCursorPreview();

	const placedNation = getHardcodedPlanningNation();
	const placedCenter = placedNation?.center ?? null;
	const activeRange =
		placedNation?.rangeRadiusBlocks ?? getPlanningDefaultRange();

	const rangeField = addElement(
		section,
		createElement("div", {
			className: "sidebar-field-group planning-range-control",
		}),
	);
	addElement(
		rangeField,
		createElement("label", {
			className: "sidebar-field-label",
			htmlFor: "planning-range-input",
			text: "Nation range (blocks)",
		}),
	);
	const rangeControls = addElement(
		rangeField,
		createElement("div", {
			className: "planning-range-row",
		}),
	);
	const rangeInput = addElement(
		rangeControls,
		createElement("input", {
			id: "planning-range-input",
			className: "sidebar-input",
			type: "number",
			value: String(activeRange),
			attrs: {
				min: "0",
				step: "50",
				inputmode: "numeric",
			},
		}),
	);

	const centerField = addElement(
		section,
		createElement("div", {
			className: "sidebar-field-group",
		}),
	);
	addElement(
		centerField,
		createElement("span", {
			className: "sidebar-field-label",
			text: "Center",
		}),
	);
	addElement(
		centerField,
		createElement("div", {
			id: "planning-center-label",
			className: "planning-chip-value",
			text: placedCenter
				? `X ${placedCenter.x} Z ${placedCenter.z}`
				: "Not set",
		}),
	);

	const applyPlanningRangeFromInput = () => {
		if (!updatePlanningNationRange(rangeInput.value, "planning-range-input")) {
			rangeInput.value = String(
				getHardcodedPlanningNation()?.rangeRadiusBlocks ??
					getPlanningDefaultRange(),
			);
			return;
		}
		if (!getHardcodedPlanningNation()) {
			syncPlanningSectionState();
			showAlert("Saved range for the next nation placement.", 4);
		}
	};
	rangeInput.addEventListener("change", applyPlanningRangeFromInput);
	rangeInput.addEventListener("blur", applyPlanningRangeFromInput);
	rangeInput.addEventListener("keyup", (event) => {
		if (event.key !== "Enter") return;
		applyPlanningRangeFromInput();
	});

	const actionRow = addElement(
		section,
		createElement("div", { className: "planning-actions-grid" }),
	);
	const createNationButton = addElement(
		actionRow,
		createElement("button", {
			className: "sidebar-button sidebar-button-primary",
			id: "planning-place-button",
			text: isPlanningPlacementArmed()
				? "Click Map To Place"
				: placedNation
					? "Reposition Nation"
					: "Place Nation On Map",
			type: "button",
		}),
	);

	const removeNationButton = addElement(
		actionRow,
		createElement("button", {
			className:
				"sidebar-button sidebar-button-secondary sidebar-button-danger",
			id: "planning-remove-button",
			text:
				isPlanningPlacementArmed() && !placedNation
					? "Cancel Placement"
					: "Remove Nation",
			type: "button",
		}),
	);
	removeNationButton.disabled = !placedNation && !isPlanningPlacementArmed();
	removeNationButton.addEventListener("click", () => {
		if (isPlanningPlacementArmed() && !hasHardcodedPlanningNation()) {
			setPlanningPlacementArmed(false);
			syncPlanningSectionState();
			return;
		}

		removeHardcodedPlanningNation();
	});

	addElement(
		section,
		createElement("p", {
			className: "sidebar-help",
			text: "Click place, then click the live map to set the center.",
		}),
	);

	const syncPlanningSectionState = () => {
		const activeNation = getHardcodedPlanningNation();
		const isArmed = isPlanningPlacementArmed();
		const center = activeNation?.center ?? null;
		const currentRange =
			activeNation?.rangeRadiusBlocks ?? getPlanningDefaultRange();
		section.querySelector("#planning-center-label").textContent = center
			? `X ${center.x} Z ${center.z}`
			: "Not set";
		rangeInput.value = String(currentRange);
		createNationButton.textContent = isArmed
			? "Click Map To Place"
			: activeNation
				? "Reposition Nation"
				: "Place Nation On Map";
		removeNationButton.textContent =
			isArmed && !activeNation ? "Cancel Placement" : "Remove Nation";
		removeNationButton.disabled = !activeNation && !isArmed;
		updatePlanningCursorPreviewState();
	};

	createNationButton.addEventListener("click", () => {
		armPlanningPlacement();
		syncPlanningSectionState();
	});
	syncPlanningSectionState();

	return section;
}

/**
 * @param {HTMLElement} layersList
 * @param {MapMode} curMapMode
 */
function addOptions(layersList, curMapMode) {
	const existingOptions = layersList.querySelector(
		"#emcdynmapplus-layer-options",
	);
	if (existingOptions) return existingOptions;

	addElement(
		layersList,
		createElement("div", {
			className:
				"leaflet-control-layers-separator emcdynmapplus-layer-separator",
		}),
	);
	const section = addElement(
		layersList,
		createElement("div", {
			id: "emcdynmapplus-layer-options",
			className: "emcdynmapplus-layer-options",
		}),
	);
	addElement(
		section,
		createElement("div", {
			className: "emcdynmapplus-layer-title",
			text: "Dynmap+ Options",
		}),
	);
	const optionsMenu = addElement(
		section,
		createElement("div", { id: "options-menu" }),
	);
	syncDynmapPlusLayerOptions(layersList, optionsMenu);
	observeDynmapPlusLayerOptions(layersList, optionsMenu);

	const checkboxes = {
		normalizeScroll: addLayerCheckboxOption(
			optionsMenu,
			"toggle-normalize-scroll",
			"Normalize scroll inputs",
			"Smoother zoom input.",
			"normalize-scroll",
		),
		decreaseBrightness: addLayerCheckboxOption(
			optionsMenu,
			"toggle-darkened",
			"Reduce tile brightness",
			"Dims bright tiles.",
			"darkened",
		),
		darkMode: addLayerCheckboxOption(
			optionsMenu,
			"toggle-darkmode",
			"Use dark theme",
			"Darker panel theme.",
			"darkmode",
		),
		serverInfo: addLayerCheckboxOption(
			optionsMenu,
			"toggle-serverinfo",
			"Show server info",
			"Live stats panel.",
			"serverinfo",
		),
	};

	checkboxes.normalizeScroll.addEventListener("change", (e) =>
		toggleScrollNormalize(e.target.checked),
	);
	checkboxes.decreaseBrightness.addEventListener("change", (e) =>
		toggleDarkened(e.target.checked),
	);
	checkboxes.darkMode.addEventListener("change", (e) =>
		toggleDarkMode(e.target.checked),
	);
	checkboxes.serverInfo.addEventListener("change", (e) =>
		toggleServerInfo(e.target.checked),
	);

	if (curMapMode != "archive") {
		const showCapitalStars = addLayerCheckboxOption(
			optionsMenu,
			"toggle-capital-stars",
			"Show capital stars",
			"Keep capital markers visible.",
			"capital-stars",
		);
		showCapitalStars.addEventListener("change", (e) =>
			toggleShowCapitalStars(e.target.checked),
		);
	}

	return section;
}

/**
 * @param {HTMLElement} layersList
 * @param {HTMLElement} optionsMenu
 */
function syncDynmapPlusLayerOptions(layersList, optionsMenu) {
	const insertBefore = optionsMenu.querySelector(".emcdynmapplus-layer-option");
	const layerLabels = Array.from(layersList.querySelectorAll("label")).filter(
		(label) => isDynmapPlusLeafletLayerLabel(label, optionsMenu),
	);

	for (const label of layerLabels) {
		optionsMenu.insertBefore(label, insertBefore);
	}
}

/**
 * @param {HTMLElement} layersList
 * @param {HTMLElement} optionsMenu
 */
function observeDynmapPlusLayerOptions(layersList, optionsMenu) {
	if (layersList.dataset.emcdynmapplusLayerObserverAttached === "true") return;
	layersList.dataset.emcdynmapplusLayerObserverAttached = "true";

	const observer = new MutationObserver(() => {
		if (!optionsMenu.isConnected) return;
		syncDynmapPlusLayerOptions(layersList, optionsMenu);
	});
	observer.observe(layersList, {
		childList: true,
		subtree: true,
	});
}

/**
 * @param {Element} label
 * @param {HTMLElement} optionsMenu
 * @returns {label is HTMLLabelElement}
 */
function isDynmapPlusLeafletLayerLabel(label, optionsMenu) {
	if (!(label instanceof HTMLLabelElement)) return false;
	if (label.closest("#options-menu") === optionsMenu) return false;
	if (!label.querySelector("input.leaflet-control-layers-selector"))
		return false;

	return (
		label.dataset.emcdynmapplusLayerOwner === DYNMAP_PLUS_LAYER_OWNER &&
		label.dataset.emcdynmapplusLayerSection === DYNMAP_PLUS_LAYER_SECTION
	);
}

/**
 * Adds a option which displays a checkbox
 * @param {string} optionId - The unique string used to query this option
 * @param {string} optionText - The text to display next to the checkbox
 * @param {string} optionDescription - Supporting copy shown beneath the title
 * @param {string} variable - The variable name in storage used to keep the 'checked' state
 */
function addCheckboxOption(
	menu,
	optionId,
	optionText,
	optionDescription,
	variable,
) {
	const option = addElement(
		menu,
		createElement("label", {
			className: "option sidebar-setting",
			htmlFor: optionId,
		}),
	);
	const copy = addElement(
		option,
		createElement("span", { className: "sidebar-toggle-copy" }),
	);
	addElement(
		copy,
		createElement("span", {
			className: "sidebar-toggle-title",
			text: optionText,
		}),
	);
	addElement(
		copy,
		createElement("span", {
			className: "sidebar-toggle-description",
			text: optionDescription,
		}),
	);

	// Initialize checkbox state
	const checkbox = addElement(
		option,
		createElement("input", {
			id: optionId,
			className: "sidebar-switch-input",
			type: "checkbox",
			attrs: {
				role: "switch",
			},
		}),
	);
	checkbox.checked = localStorage["emcdynmapplus-" + variable] == "true";
	return checkbox;
}

/**
 * Adds an option to the Leaflet layer control using its native label structure.
 * @param {HTMLElement} menu
 * @param {string} optionId
 * @param {string} optionText
 * @param {string} optionDescription
 * @param {string} variable
 */
function addLayerCheckboxOption(
	menu,
	optionId,
	optionText,
	optionDescription,
	variable,
) {
	const label = addElement(
		menu,
		createElement("label", {
			className: "emcdynmapplus-layer-option",
			attrs: {
				title: optionDescription,
			},
		}),
	);
	const wrapper = addElement(label, createElement("span"));
	const checkbox = addElement(
		wrapper,
		createElement("input", {
			id: optionId,
			className: "leaflet-control-layers-selector emcdynmapplus-layer-checkbox",
			type: "checkbox",
			attrs: {
				role: "switch",
				"aria-label": optionText,
			},
		}),
	);
	addElement(
		wrapper,
		createElement("span", {
			text: ` ${optionText}`,
		}),
	);
	checkbox.checked = localStorage["emcdynmapplus-" + variable] == "true";
	return checkbox;
}

/** @param {HTMLElement} sidebar */
function addLocateMenu(sidebar) {
	const locateMenu = addSidebarSection(
		sidebar,
		"Locate",
		"Jump to a town, nation, or resident.",
	);
	locateMenu.id = "locate-menu";
	const locateSubmenu = addElement(
		locateMenu,
		createElement("div", { className: "sidebar-split" }),
	);
	const locateSelect = addElement(
		locateSubmenu,
		createElement(
			"select",
			{
				id: "locate-select",
				className: "sidebar-input sidebar-select",
			},
			[
				createElement("option", { text: "Town" }),
				createElement("option", { text: "Nation" }),
				createElement("option", { text: "Resident" }),
			],
		),
	);
	const locateInput = addElement(
		locateMenu,
		createElement("input", {
			id: "locate-input",
			className: "sidebar-input",
			type: "search",
			placeholder: "London",
		}),
	);
	const locateButton = addElement(
		locateMenu,
		createElement("button", {
			id: "locate-button",
			className: "sidebar-button sidebar-button-primary",
			text: "Locate On Map",
		}),
	);
	locateSelect.addEventListener("change", () => {
		switch (locateSelect.value) {
			case "Town":
				locateInput.placeholder = "London";
				break;
			case "Nation":
				locateInput.placeholder = "Germany";
				break;
			case "Resident":
				locateInput.placeholder = "Notch";
				break;
		}
	});
	locateInput.addEventListener("keyup", (event) => {
		if (event.key != "Enter") return;
		locate(locateSelect.value, locateInput.value);
	});
	locateButton.addEventListener("click", () => {
		locate(locateSelect.value, locateInput.value);
	});
}

/**  @param {boolean} boxTicked */
function toggleDarkened(boxTicked) {
	const element = document.querySelector(".leaflet-tile-pane");
	if (!element)
		return showAlert(
			"Failed to toggle brightness. Cannot apply filter to non-existent tile pane.",
			4,
		);

	localStorage["emcdynmapplus-darkened"] = boxTicked;

	// Firefox is noticeably slower when panning large filtered layers.
	// Use cheap compositing there and keep the original filter path elsewhere.
	if (isFirefoxBrowser()) {
		element.style.filter = "";
		return toggleFirefoxTileDarkener(boxTicked, element);
	}

	removeFirefoxTileDarkener();
	element.style.filter = boxTicked ? getTilePaneFilter() : "";
}

function getFirefoxTileDarkener() {
	return document.querySelector("#emcdynmapplus-tile-darkener");
}

function ensureFirefoxTileDarkener() {
	let darkener = getFirefoxTileDarkener();
	if (darkener) return darkener;

	const mapContainer = document.querySelector(".leaflet-container");
	if (!(mapContainer instanceof HTMLElement)) return null;

	darkener = document.createElement("div");
	darkener.id = "emcdynmapplus-tile-darkener";
	darkener.setAttribute("aria-hidden", "true");
	mapContainer.appendChild(darkener);
	return darkener;
}

function toggleFirefoxTileDarkener(boxTicked, tilePane) {
	const darkener = ensureFirefoxTileDarkener();
	if (!darkener)
		return showAlert(
			"Failed to toggle brightness overlay. Missing Leaflet container element.",
			4,
		);

	darkener.style.display = boxTicked ? "block" : "none";
	tilePane.style.opacity = boxTicked ? "0.72" : "";
}

function removeFirefoxTileDarkener() {
	getFirefoxTileDarkener()?.remove();
	const tilePane = document.querySelector(".leaflet-tile-pane");
	if (tilePane instanceof HTMLElement) tilePane.style.opacity = "";
}

/** @param {boolean} boxTicked */
function toggleServerInfo(boxTicked) {
	localStorage["emcdynmapplus-serverinfo"] = boxTicked;
	const serverInfoPanel = document.querySelector("#server-info");
	if (serverInfoPanel instanceof HTMLElement)
		serverInfoPanel.hidden = !boxTicked;

	if (!boxTicked) {
		if (serverInfoScheduler != null) clearTimeout(serverInfoScheduler); // stop future runs
		serverInfoScheduler = null;

		return;
	}

	if (serverInfoScheduler == null) updateServerInfo(serverInfoPanel); // immediate fetch without spam
}

/** @param {boolean} boxTicked */
function toggleShowCapitalStars(boxTicked) {
	localStorage["emcdynmapplus-capital-stars"] = boxTicked;
	const iconContainer = document.querySelector(
		".leaflet-pane.leaflet-marker-pane",
	);
	iconContainer.setAttribute(
		"style",
		`visibility: ${boxTicked ? "visible" : "hidden"}`,
	);
}

//#region Dark Mode
/** @param {boolean} boxTicked */
function toggleDarkMode(boxTicked) {
	localStorage["emcdynmapplus-darkmode"] = boxTicked;
	return boxTicked ? loadDarkMode() : unloadDarkMode();
}

function insertCustomStylesheets() {
	if (!document.head.querySelector("#emcdynmapplus-preconnect-fonts")) {
		addElement(
			document.head,
			createElement("link", {
				id: "emcdynmapplus-preconnect-fonts",
				rel: "preconnect",
				href: "https://fonts.googleapis.com",
			}),
		);
	}
	if (!document.head.querySelector("#emcdynmapplus-preconnect-fonts-static")) {
		addElement(
			document.head,
			createElement("link", {
				id: "emcdynmapplus-preconnect-fonts-static",
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				attrs: { crossorigin: "" },
			}),
		);
	}
	if (!document.head.querySelector("#emcdynmapplus-ui-fonts")) {
		addElement(
			document.head,
			createElement("link", {
				id: "emcdynmapplus-ui-fonts",
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap",
			}),
		);
	}
	// other stylesheet html links ...
}

function loadDarkMode() {
	// tell browser not to apply its auto dark mode.
	// this fixes some inverted elements when both are enabled.
	document.documentElement.style.colorScheme = "dark";
	document.documentElement.setAttribute("data-emcdynmapplus-theme", "dark");
	document.head.querySelector("#dark-mode")?.remove();
}

function unloadDarkMode() {
	document.documentElement.style.colorScheme = "light";
	document.documentElement.removeAttribute("data-emcdynmapplus-theme");
	document.head.querySelector("#dark-mode")?.remove();
	waitForElement(".leaflet-map-pane").then((el) => (el.style.filter = ""));
}
//#endregion

//#region Scroll normalization
let scrollListener = null;

/** @param {boolean} boxTicked */
function toggleScrollNormalize(boxTicked) {
	localStorage["emcdynmapplus-normalize-scroll"] = boxTicked;

	const el = window.document.querySelector("#map");
	return boxTicked ? addScrollNormalizer(el) : removeScrollNormalizer(el);
}

/** @param {HTMLElement} mapEl */
function addScrollNormalizer(mapEl) {
	scrollListener = (e) => {
		e.preventDefault(); // Prevent default scroll behavior (so Leaflet doesn't zoom immediately)
		triggerScrollEvent(e.deltaY);
	};

	mapEl.addEventListener("wheel", scrollListener, { passive: false });
}

/** @param {HTMLElement} mapEl */
function removeScrollNormalizer(mapEl) {
	mapEl.removeEventListener("wheel", scrollListener);

	document.dispatchEvent(
		new CustomEvent("EMCDYNMAPPLUS_ADJUST_SCROLL", { detail: 60 }),
	);
}
//#endregion

//#region Entity locator
/**
 * Runs appropriate locator func based on selectValue, passing inputValue as the argument.
 * @param {string} selectValue
 * @param {string} inputValue
 */
function locate(selectValue, inputValue) {
	const isArchiveMode = getStoredCurrentMapMode() == "archive";
	switch (selectValue) {
		case "Town":
			locateTown(inputValue, isArchiveMode);
			break;
		case "Nation":
			locateNation(inputValue, isArchiveMode);
			break;
		case "Resident":
			locateResident(inputValue, isArchiveMode);
			break;
	}
}

/**
 * @param {string} date
 * @param {MapMode | string | null} preferredMode
 */
function searchArchive(date, preferredMode = null) {
	if (!isValidArchiveDateInput(date)) {
		showAlert(
			`Choose a valid archive date between ${ARCHIVE_DATE.MIN} and ${ARCHIVE_DATE.MAX}.`,
			4,
		);
		return;
	}

	rememberPreferredLiveMapMode(preferredMode ?? getStoredCurrentMapMode());
	const URLDate = date.replaceAll("-", ""); // 2026-06-01 -> 20260601
	localStorage["emcdynmapplus-archive-date"] = URLDate; // In case 'change' event doesn't already update it
	localStorage["emcdynmapplus-mapmode"] = "archive";
	location.reload();
}

/** @param {string} date */
function isValidArchiveDateInput(date) {
	if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
	return date >= ARCHIVE_DATE.MIN && date <= ARCHIVE_DATE.MAX;
}

/**
 * @param {string} townName
 * @param {boolean} isArchiveMode
 */
async function locateTown(townName, isArchiveMode) {
	townName = townName.trim().toLowerCase();
	if (townName == "") return;

	let coords = null;
	if (!isArchiveMode) coords = await getTownSpawn(townName);
	if (!coords) coords = getTownMidpoint(townName);

	if (!coords)
		return showAlert(`Could not find town/capital with name '${townName}'.`, 5);
	updateUrlLocation(coords);
}

/**
 * @param {string} nationName
 * @param {boolean} isArchiveMode
 */
async function locateNation(nationName, isArchiveMode) {
	nationName = nationName.trim().toLowerCase();
	if (nationName == "") return;

	let capitalName = null;
	if (!isArchiveMode) {
		const queryBody = { query: [nationName], template: { capital: true } };
		const nations = await postJSON(getCurrentOapiUrl("nations"), queryBody);
		if (nations && nations.length > 0) capitalName = nations[0].capital?.name;
	}
	if (!capitalName) {
		const marker = parsedMarkers.find(
			(m) =>
				m.nationName && m.nationName.toLowerCase() == nationName && m.isCapital,
		);
		if (marker) capitalName = marker.townName;
	}

	if (!capitalName) return showAlert("Searched nation could not be found.", 3);
	await locateTown(capitalName, isArchiveMode);
}

/**
 * @param {string} residentName
 * @param {boolean} isArchiveMode
 */
async function locateResident(residentName, isArchiveMode) {
	residentName = residentName.trim().toLowerCase();
	if (residentName == "") return;

	let townName = null;
	if (!isArchiveMode) {
		const queryBody = { query: [residentName], template: { town: true } };
		const players = await postJSON(getCurrentOapiUrl("players"), queryBody);
		if (players && players.length > 0) townName = players[0].town?.name;
	}
	if (!townName) {
		const marker = parsedMarkers.find(
			(m) =>
				m.residentList &&
				m.residentList.some((r) => r.toLowerCase() == residentName),
		);
		if (marker) townName = marker.townName;
	}

	if (!townName) return showAlert("Searched resident could not be found.", 3);
	await locateTown(townName, isArchiveMode);
}

/** @param {string} townName */
async function getTownSpawn(townName) {
	const queryBody = { query: [townName], template: { coordinates: true } };
	const towns = await postJSON(getCurrentOapiUrl("towns"), queryBody);
	if (!towns || towns.length < 1) return null;

	const spawn = towns[0].coordinates.spawn;
	return { x: Math.round(spawn.x), z: Math.round(spawn.z) };
}

/** @param {string} townName */
function getTownMidpoint(townName) {
	const town = parsedMarkers.find(
		(m) => m.townName && m.townName.toLowerCase() == townName,
	);
	if (!town) return null;

	return { x: town.x, z: town.z };
}

/**
 * Updates the address bar / href with the specified coords and zoom.
 * @param {Vertex} coords
 * @param {number} zoom
 */
function updateUrlLocation(coords, zoom = 4) {
	location.href = `${MAPI_BASE}?zoom=${zoom}&x=${coords.x}&z=${coords.z}`;
}
//#endregion
