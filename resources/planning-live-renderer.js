(() => {
const PLANNING_LIVE_RENDERER_KEY = "__EMCDYNMAPPLUS_PLANNING_LIVE_RENDERER__";
if (globalThis[PLANNING_LIVE_RENDERER_KEY]) return;

const PLANNING_LIVE_READY_ATTR = "data-emcdynmapplus-planning-live-ready";
const PLANNING_LIVE_BLOCKS_PER_PIXEL_ATTR =
	"data-emcdynmapplus-planning-live-blocks-per-pixel";
const PLANNING_LIVE_TOWN_BLOCKS_PER_PIXEL_ATTR =
	"data-emcdynmapplus-planning-live-town-blocks-per-pixel";
const PLANNING_LIVE_MAP_BLOCKS_PER_PIXEL_ATTR =
	"data-emcdynmapplus-planning-live-map-blocks-per-pixel";
const PLANNING_PREVIEW_ACTIVE_ATTR =
	"data-emcdynmapplus-planning-preview-active";
const PLANNING_PREVIEW_KIND_ATTR =
	"data-emcdynmapplus-planning-preview-kind";
const PLANNING_PREVIEW_RANGE_BLOCKS_ATTR =
	"data-emcdynmapplus-planning-preview-range-blocks";
const PLANNING_PREVIEW_CLIENT_X_ATTR =
	"data-emcdynmapplus-planning-preview-client-x";
const PLANNING_PREVIEW_CLIENT_Y_ATTR =
	"data-emcdynmapplus-planning-preview-client-y";
const PLANNING_PREVIEW_EXACT_KIND_ATTR =
	"data-emcdynmapplus-planning-preview-exact-kind";
const PLANNING_PREVIEW_EXACT_RANGE_BLOCKS_ATTR =
	"data-emcdynmapplus-planning-preview-exact-range-blocks";
const PLANNING_PREVIEW_EXACT_DIAMETER_ATTR =
	"data-emcdynmapplus-planning-preview-exact-diameter-px";
const PLANNING_PREVIEW_EXACT_MODE_ATTR =
	"data-emcdynmapplus-planning-preview-exact-mode";
const PLANNING_LIVE_OVERLAY_ID = "emcdynmapplus-planning-live-overlay";
const DEFAULT_COORDS_SELECTOR = ".leaflet-control-layers.coordinates";
const PLANNING_STATE_UPDATED_EVENT = "EMCDYNMAPPLUS_PLANNING_STATE_UPDATED";
const PLANNING_TOWN_HOVER_EVENT = "EMCDYNMAPPLUS_PLANNING_TOWN_HOVER";
const DEFAULT_PAGE_MAP_ZOOM_ATTR = "data-emcdynmapplus-leaflet-zoom";
const PLANNING_LIVE_DEBUG_STORAGE_KEY = "emcdynmapplus-planning-live-debug";
const PLANNING_LIVE_DEBUG_MODE_STORAGE_KEY = "emcdynmapplus-planning-live-debug-mode";
const GLOBAL_DEBUG_STORAGE_KEY = "emcdynmapplus-debug";
const MAX_DEBUG_EVENTS = 200;
const MARKER_ZOOM_MIN = -2;
const MARKER_ZOOM_MAX = 5;
const DEFAULT_TOWN_RANGE_BLOCKS = 1500;
const DISCONNECTED_RANGE_FILL = "#c44f45";
const DISCONNECTED_RANGE_STROKE = "#ffd2cd";
const CONNECTED_TOWN_FILL = "#c9782c";
const CONNECTED_TOWN_STROKE = "#ffe0b4";
const DISCONNECTED_TOWN_FILL = "#b53f34";
const DISCONNECTED_TOWN_STROKE = "#ffd2cd";
const CONNECTED_TOWN_RANGE_HOVER_FILL = "#e3a24b";
const CONNECTED_TOWN_RANGE_HOVER_STROKE = "#fff3cf";
const DISCONNECTED_TOWN_RANGE_HOVER_FILL = "#d45d52";
const DISCONNECTED_TOWN_RANGE_HOVER_STROKE = "#ffe3df";
const NATION_CENTER_FILL = "#d98936";
const NATION_CENTER_STROKE = "#fff3cf";
const TOWN_LABEL_FONT_SIZE_PX = 11;
const TOWN_LABEL_HEIGHT_PX = 18;
const TOWN_LABEL_HORIZONTAL_PADDING_PX = 6;
const TOWN_LABEL_VERTICAL_OFFSET_PX = 8;
const TOWN_LABEL_MIN_WIDTH_PX = 22;
const TOWN_LABEL_BG_FILL = "#1f1b15";
const TOWN_LABEL_BG_STROKE = "#fff3cf";
const TOWN_LABEL_TEXT_FILL = "#fff3cf";

function createPlanningLiveRenderer({
	planningLayerPrefix = "emcdynmapplus[planning-layer]",
	liveReadyAttr = PLANNING_LIVE_READY_ATTR,
	liveOverlayId = PLANNING_LIVE_OVERLAY_ID,
	coordsSelector = DEFAULT_COORDS_SELECTOR,
	pageMapZoomAttr = DEFAULT_PAGE_MAP_ZOOM_ATTR,
	createPlanningCircleVertices,
	createPlanningRangeMultiPolygon = null,
	planningLeafletAdapter = null,
	getPlanningNations = () => [],
	getPrimaryLeafletMap = () => null,
	isPlanningModeActive = () => true,
	debugInfo = () => {},
	sampleWorldPoint = null,
} = {}) {
	if (typeof createPlanningCircleVertices !== "function") {
		throw new Error("planning live renderer requires createPlanningCircleVertices");
	}
	const planningGeometryFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_GEOMETRY__?.createPlanningGeometry;
	if (typeof planningGeometryFactory !== "function") {
		throw new Error("planning live renderer requires planning geometry helpers");
	}
	const planningGeometry = planningGeometryFactory({
		createPlanningCircleVertices,
	});

	let renderFrame = 0;
	let panCaptureFrame = 0;
	let attachedMap = null;
	let listenersAttached = false;
	let rootObserver = null;
	let debugSequence = 0;
	let debugEvents = [];
	let lastRenderTrigger = "init";
	let lastPanSnapshot = null;
	let lastInteractionDefer = null;
	let listenerStats = {
		attachedAt: null,
		attachCount: 0,
		attachedMapDescriptor: null,
		zoomstart: 0,
		zoomanim: 0,
		zoom: 0,
		zoomend: 0,
		movestart: 0,
		move: 0,
		moveend: 0,
	};
	let panCaptureActive = false;
	let panCaptureSampleCount = 0;
	let lastObservedRootZoomAttr = null;
	let lastStableRenderZoom = null;
	let zoomAnimationState = null;
	const delayedRenderTimers = new Set();
	let lastRenderState = {
		ok: false,
		reason: "uninitialized",
		projectionMode: null,
		nations: [],
	};
	let pollTimer = 0;
	let hoveredTownId = null;
	const planningStateFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_STATE__?.createPlanningState;
	const planningState =
		typeof planningStateFactory === "function" ? planningStateFactory() : null;

	function setLiveReady(ready) {
		const root = document.documentElement;
		if (!(root instanceof HTMLElement)) return;

		if (ready) root.setAttribute(liveReadyAttr, "true");
		else root.removeAttribute(liveReadyAttr);
	}

	function setLiveBlocksPerPixel(blocksPerPixel = null) {
		const root = document.documentElement;
		if (!(root instanceof HTMLElement)) return;

		const numericValue = Number(blocksPerPixel);
		if (Number.isFinite(numericValue) && numericValue > 0) {
			root.setAttribute(
				PLANNING_LIVE_BLOCKS_PER_PIXEL_ATTR,
				String(Number(numericValue.toFixed(6))),
			);
		} else {
			root.removeAttribute(PLANNING_LIVE_BLOCKS_PER_PIXEL_ATTR);
		}
	}

	function setLiveTownBlocksPerPixel(blocksPerPixel = null) {
		const root = document.documentElement;
		if (!(root instanceof HTMLElement)) return;

		const numericValue = Number(blocksPerPixel);
		if (Number.isFinite(numericValue) && numericValue > 0) {
			root.setAttribute(
				PLANNING_LIVE_TOWN_BLOCKS_PER_PIXEL_ATTR,
				String(Number(numericValue.toFixed(6))),
			);
		} else {
			root.removeAttribute(PLANNING_LIVE_TOWN_BLOCKS_PER_PIXEL_ATTR);
		}
	}

	function setLiveMapBlocksPerPixel(blocksPerPixel = null) {
		const root = document.documentElement;
		if (!(root instanceof HTMLElement)) return;

		const numericValue = Number(blocksPerPixel);
		if (Number.isFinite(numericValue) && numericValue > 0) {
			root.setAttribute(
				PLANNING_LIVE_MAP_BLOCKS_PER_PIXEL_ATTR,
				String(Number(numericValue.toFixed(6))),
			);
		} else {
			root.removeAttribute(PLANNING_LIVE_MAP_BLOCKS_PER_PIXEL_ATTR);
		}
	}

	function clearExactPreviewMetrics() {
		const root = document.documentElement;
		if (!(root instanceof HTMLElement)) return;
		root.removeAttribute(PLANNING_PREVIEW_EXACT_KIND_ATTR);
		root.removeAttribute(PLANNING_PREVIEW_EXACT_RANGE_BLOCKS_ATTR);
		root.removeAttribute(PLANNING_PREVIEW_EXACT_DIAMETER_ATTR);
		root.removeAttribute(PLANNING_PREVIEW_EXACT_MODE_ATTR);
	}

	function setExactPreviewMetrics({
		kind = null,
		rangeRadiusBlocks = null,
		diameterPx = null,
		mode = "exact-projected",
	} = {}) {
		const root = document.documentElement;
		if (!(root instanceof HTMLElement)) return;

		const diameter = Number(diameterPx);
		const range = Number(rangeRadiusBlocks);
		if (!Number.isFinite(diameter) || diameter <= 0) {
			clearExactPreviewMetrics();
			return;
		}

		if (typeof kind === "string" && kind) {
			root.setAttribute(PLANNING_PREVIEW_EXACT_KIND_ATTR, kind);
		} else {
			root.removeAttribute(PLANNING_PREVIEW_EXACT_KIND_ATTR);
		}
		if (Number.isFinite(range) && range >= 0) {
			root.setAttribute(
				PLANNING_PREVIEW_EXACT_RANGE_BLOCKS_ATTR,
				String(Math.round(range)),
			);
		} else {
			root.removeAttribute(PLANNING_PREVIEW_EXACT_RANGE_BLOCKS_ATTR);
		}
		root.setAttribute(
			PLANNING_PREVIEW_EXACT_DIAMETER_ATTR,
			String(Math.round(diameter)),
		);
		root.setAttribute(PLANNING_PREVIEW_EXACT_MODE_ATTR, String(mode || ""));
	}

	function readActivePreviewRequest() {
		const root = document.documentElement;
		if (!(root instanceof HTMLElement)) return null;
		if (root.getAttribute(PLANNING_PREVIEW_ACTIVE_ATTR) !== "true") return null;

		const kind = root.getAttribute(PLANNING_PREVIEW_KIND_ATTR) || null;
		const rangeRadiusBlocks = Number(
			root.getAttribute(PLANNING_PREVIEW_RANGE_BLOCKS_ATTR),
		);
		const clientX = Number(root.getAttribute(PLANNING_PREVIEW_CLIENT_X_ATTR));
		const clientY = Number(root.getAttribute(PLANNING_PREVIEW_CLIENT_Y_ATTR));
		if (
			(kind !== "nation" && kind !== "town") ||
			!Number.isFinite(rangeRadiusBlocks) ||
			rangeRadiusBlocks < 0 ||
			!Number.isFinite(clientX) ||
			!Number.isFinite(clientY)
		) {
			return null;
		}

		return {
			kind,
			rangeRadiusBlocks,
			clientX,
			clientY,
		};
	}

	function computeBlocksPerPixelFromScreenPerWorld(screenPerWorld = null) {
		const xx = Number(screenPerWorld?.xx);
		const xz = Number(screenPerWorld?.xz);
		const yx = Number(screenPerWorld?.yx);
		const yz = Number(screenPerWorld?.yz);
		const horizontalPxPerBlock = Math.hypot(xx, xz);
		const verticalPxPerBlock = Math.hypot(yx, yz);
		const pxPerBlock = Math.max(horizontalPxPerBlock, verticalPxPerBlock);
		return Number.isFinite(pxPerBlock) && pxPerBlock > 0
			? 1 / pxPerBlock
			: null;
	}

	function computeLeafletNativeBlocksPerPixel(map = null) {
		if (!planningLeafletAdapter?.canProjectWithMap?.(map)) return null;
		if (typeof planningLeafletAdapter.latLngToWorld !== "function") return null;

		const centerLatLng = safeMapCall(map, "getCenter");
		const centerWorld = planningLeafletAdapter.latLngToWorld(centerLatLng);
		if (!centerWorld) return null;

		const centerPoint = projectWorldPointViaLeaflet(centerWorld, map);
		const xPoint = projectWorldPointViaLeaflet(
			{ x: centerWorld.x + 1, z: centerWorld.z },
			map,
		);
		const zPoint = projectWorldPointViaLeaflet(
			{ x: centerWorld.x, z: centerWorld.z + 1 },
			map,
		);
		if (!centerPoint || !xPoint || !zPoint) return null;

		return computeBlocksPerPixelFromScreenPerWorld({
			xx: xPoint.x - centerPoint.x,
			xz: zPoint.x - centerPoint.x,
			yx: xPoint.y - centerPoint.y,
			yz: zPoint.y - centerPoint.y,
		});
	}

	function getPreviewCenterWorldPoint(previewRequest, map = null) {
		if (!previewRequest) {
			return null;
		}
		if (map && typeof map.containerPointToLatLng === "function") {
			const container = map.getContainer?.();
			if (container instanceof HTMLElement) {
				const rect = container.getBoundingClientRect();
				const containerPoint = {
					x: previewRequest.clientX - rect.left,
					y: previewRequest.clientY - rect.top,
				};
				let latLng = null;
				try {
					latLng = map.containerPointToLatLng(containerPoint) ?? null;
				} catch {
					latLng = null;
				}
				const worldPoint = planningLeafletAdapter?.latLngToWorld?.(latLng) ?? null;
				if (worldPoint) return worldPoint;
			}
		}

		const mapContainer = getMapContainer();
		if (!(mapContainer instanceof HTMLElement)) return null;
		return getSampleWorldPoint()?.(
			previewRequest.clientX,
			previewRequest.clientY,
			mapContainer,
		) ?? null;
	}

	function getProjectedPreviewDiameter({
		previewRequest = null,
		map = null,
		transform = null,
		nativeProjectionAvailable = false,
	} = {}) {
		if (!previewRequest) return null;
		const centerWorld = getPreviewCenterWorldPoint(previewRequest, map);
		if (!centerWorld) return null;

		const projectWorldPoint = nativeProjectionAvailable
			? (point) => projectWorldPointViaLeaflet(point, map)
			: (point) => projectWorldPointToOverlay(point, transform, map);
		const bounds = planningGeometry.getProjectedCircleBounds({
			center: centerWorld,
			rangeRadiusBlocks: previewRequest.rangeRadiusBlocks,
			projector: projectWorldPoint,
		});
		if (!bounds) return null;

		return {
			centerWorld,
			bounds,
			diameterPx: Math.max(bounds.width, bounds.height),
		};
	}

	function isLiveReady() {
		return document.documentElement?.getAttribute?.(liveReadyAttr) === "true";
	}

	function canUseStorage() {
		try {
			return !!globalThis.localStorage;
		} catch {
			return false;
		}
	}

	function isDebugEnabled() {
		return getDebugMode() !== "off";
	}

	function normalizeDebugMode(mode) {
		if (mode === "pan" || mode === "all") return mode;
		return "off";
	}

	function getStoredDebugMode() {
		if (!canUseStorage()) return "off";
		try {
			const explicitMode = normalizeDebugMode(
				localStorage[PLANNING_LIVE_DEBUG_MODE_STORAGE_KEY],
			);
			if (explicitMode !== "off") return explicitMode;
			if (localStorage[PLANNING_LIVE_DEBUG_STORAGE_KEY] === "true") return "all";
			if (localStorage[GLOBAL_DEBUG_STORAGE_KEY] === "true") return "all";
			return "off";
		} catch {
			return "off";
		}
	}

	function setDebugEnabled(enabled) {
		return setDebugMode(enabled ? "all" : "off");
	}

	function getDebugMode() {
		return getStoredDebugMode();
	}

	function setDebugMode(mode) {
		const nextMode = normalizeDebugMode(mode);
		if (!canUseStorage()) return false;
		try {
			if (nextMode === "off") {
				localStorage[PLANNING_LIVE_DEBUG_STORAGE_KEY] = "false";
				delete localStorage[PLANNING_LIVE_DEBUG_MODE_STORAGE_KEY];
			} else {
				localStorage[PLANNING_LIVE_DEBUG_STORAGE_KEY] = "true";
				localStorage[PLANNING_LIVE_DEBUG_MODE_STORAGE_KEY] = nextMode;
			}
			recordDebug("debug-toggle", {
				enabled: nextMode !== "off",
				mode: nextMode,
			});
			return true;
		} catch {
			return false;
		}
	}

	function clearDebugEvents() {
		debugEvents = [];
		debugSequence = 0;
	}

	function safeNumber(value, digits = 3) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return null;
		return Number(numeric.toFixed(digits));
	}

	function clamp(value, min, max) {
		return Math.min(Math.max(value, min), max);
	}

	function lerp(start, end, factor) {
		return start + (end - start) * factor;
	}

	function getZoomAwareMarkerMetrics(effectiveZoom = null) {
		const numericZoom = Number(effectiveZoom);
		const clampedZoom = Number.isFinite(numericZoom)
			? clamp(numericZoom, MARKER_ZOOM_MIN, MARKER_ZOOM_MAX)
			: 1;
		const zoomFactor =
			(clampedZoom - MARKER_ZOOM_MIN) /
			(MARKER_ZOOM_MAX - MARKER_ZOOM_MIN);

		return {
			zoom: clampedZoom,
			zoomFactor,
			nationRadiusPx: lerp(4.75, 9.25, zoomFactor),
			nationStrokePx: lerp(1.5, 2.5, zoomFactor),
			townRadiusPx: lerp(2.5, 5.5, zoomFactor),
			townStrokePx: lerp(1, 1.75, zoomFactor),
		};
	}

	function summarizeRect(rect) {
		if (!rect) return null;
		return {
			left: safeNumber(rect.left, 2),
			top: safeNumber(rect.top, 2),
			right: safeNumber(rect.right, 2),
			bottom: safeNumber(rect.bottom, 2),
			width: safeNumber(rect.width, 2),
			height: safeNumber(rect.height, 2),
		};
	}

	function safeMapCall(map = null, methodName, ...args) {
		if (!map || typeof map !== "object") return null;
		const method = map?.[methodName];
		if (typeof method !== "function") return null;
		try {
			return method.call(map, ...args);
		} catch {
			return null;
		}
	}

	function summarizeMap(map = null) {
		if (!map || typeof map !== "object") return null;
		const container = safeMapCall(map, "getContainer");
		const center = safeMapCall(map, "getCenter");
		const size = safeMapCall(map, "getSize");
		return {
			hasMap: true,
			zoom: safeNumber(safeMapCall(map, "getZoom"), 3),
			center: center
				? {
					lat: safeNumber(center.lat, 5),
					lng: safeNumber(center.lng, 5),
				}
				: null,
			size: size
				? {
					x: safeNumber(size.x, 2),
					y: safeNumber(size.y, 2),
				}
				: null,
			containerClassName: container?.className || null,
			hasContainerPointToLayerPoint: typeof map.containerPointToLayerPoint === "function",
			hasContainerPointToLatLng: typeof map.containerPointToLatLng === "function",
			hasLatLngToLayerPoint: typeof map.latLngToLayerPoint === "function",
			hasOverlayPane: !!map.getPane?.("overlayPane"),
		};
	}

	function summarizeElementBox(element) {
		if (!(element instanceof Element)) return null;
		const computedStyle = getComputedStyle?.(element) ?? null;
		return {
			tagName: element.tagName || null,
			id: element.id || null,
			className: typeof element.className === "string" ? element.className : null,
			hidden: element.hidden === true,
			styleLeft: element.style?.left || null,
			styleTop: element.style?.top || null,
			styleWidth: element.style?.width || null,
			styleHeight: element.style?.height || null,
			attrWidth: element.getAttribute?.("width") || null,
			attrHeight: element.getAttribute?.("height") || null,
			viewBox: element.getAttribute?.("viewBox") || null,
			transform: computedStyle?.transform || null,
			transformOrigin: computedStyle?.transformOrigin || null,
			willChange: computedStyle?.willChange || null,
			rect: summarizeRect(element.getBoundingClientRect?.()),
		};
	}

	function describeAttachedMap(map = null) {
		if (!map || typeof map !== "object") return null;
		const container = safeMapCall(map, "getContainer");
		return {
			zoom: safeNumber(safeMapCall(map, "getZoom"), 3),
			containerId: container?.id || null,
			containerClassName: container?.className || null,
			hasOn: typeof map.on === "function",
			hasLatLngToLayerPoint: typeof map.latLngToLayerPoint === "function",
			hasContainerPointToLatLng: typeof map.containerPointToLatLng === "function",
		};
	}

	function readEffectiveZoom(map = null) {
		const mapZoom = Number(safeMapCall(map, "getZoom"));
		if (Number.isFinite(mapZoom)) return mapZoom;

		const rootZoomRaw = document.documentElement?.getAttribute?.(pageMapZoomAttr);
		const rootZoom = Number(rootZoomRaw);
		return Number.isFinite(rootZoom) ? rootZoom : null;
	}

	function recordDebug(type, details = {}) {
		const mode = getDebugMode();
		if (mode === "off") return null;
		if (!shouldRecordDebug(type, details, mode)) return null;

		const entry = {
			seq: ++debugSequence,
			at: Date.now(),
			type,
			details,
		};
		debugEvents.push(entry);
		if (debugEvents.length > MAX_DEBUG_EVENTS) {
			debugEvents = debugEvents.slice(-MAX_DEBUG_EVENTS);
		}

		try {
			console.info(`${planningLayerPrefix}:live-debug:${type}`, details);
		} catch {}
		return entry;
	}

	function shouldRecordDebug(type, details = {}, mode = getDebugMode()) {
		if (mode === "all") return true;
		if (mode !== "pan") return false;

		if (type === "debug-toggle") return true;
		if (type === "pan-event") return true;
		if (type === "pan-frame") return true;
		if (type === "pan-capture-start") return true;
		if (type === "pan-capture-stop") return true;
		if (type === "render-failed") return true;
		if (type === "pan-trace-export") return true;
		if (type === "pan-capture") return true;
		if (type === "interaction-defer") return true;
		if (type === "listener-attach") return true;
		if (type === "listener-attach-skip") return true;
		if (type === "listener-event") return true;

		if (type === "render-complete" || type === "render-start") {
			const trigger = String(details?.trigger ?? "");
			return trigger.includes("map-event") || trigger.includes("move") || trigger.includes("window-resize");
		}

		return false;
	}

	function getMapPane(mapContainer = null) {
		if (!(mapContainer instanceof HTMLElement)) return null;
		const pane = mapContainer.querySelector?.(".leaflet-map-pane");
		return pane instanceof HTMLElement ? pane : null;
	}

	function getTilePane(mapContainer = null) {
		if (!(mapContainer instanceof HTMLElement)) return null;
		const pane = mapContainer.querySelector?.(".leaflet-tile-pane");
		return pane instanceof HTMLElement ? pane : null;
	}

	function getMarkerPane(mapContainer = null) {
		if (!(mapContainer instanceof HTMLElement)) return null;
		const pane = mapContainer.querySelector?.(".leaflet-marker-pane");
		return pane instanceof HTMLElement ? pane : null;
	}

	function findDescendantElementById(root, id) {
		if (!(root instanceof Element) || typeof id !== "string" || !id) return null;
		if (root.getAttribute?.("id") === id || root.id === id) return root;
		for (const child of root.children ?? []) {
			const found = findDescendantElementById(child, id);
			if (found) return found;
		}
		return null;
	}

	function getOverlayElement(mapContainer = null) {
		const overlay = document.getElementById?.(liveOverlayId)
			|| mapContainer?.querySelector?.(`#${liveOverlayId}`)
			|| findDescendantElementById(mapContainer, liveOverlayId)
			|| null;
		return overlay instanceof Element ? overlay : null;
	}

	function getPanDiagnostics(label = "snapshot", { record = true } = {}) {
		const map = getPrimaryLeafletMap();
		const mapContainer = getMapContainer();
		const overlayHost = getOverlayHost(mapContainer);
		const overlay = getOverlayElement(mapContainer);
		const mapPane = getMapPane(mapContainer);
		const tilePane = getTilePane(mapContainer);
		const markerPane = getMarkerPane(mapContainer);
		const rootZoomAttr = document.documentElement?.getAttribute?.(pageMapZoomAttr) ?? null;

		const snapshot = {
			label,
			at: Date.now(),
			liveReady: isLiveReady(),
			rootZoomAttr,
			map: summarizeMap(map),
			mapContainer: summarizeElementBox(mapContainer),
			mapPane: summarizeElementBox(mapPane),
			tilePane: summarizeElementBox(tilePane),
			overlayHost: summarizeElementBox(overlayHost),
			markerPane: summarizeElementBox(markerPane),
			overlay: summarizeElementBox(overlay),
			lastRenderTrigger,
			lastRenderState: {
				ok: lastRenderState.ok,
				reason: lastRenderState.reason ?? null,
				projectionMode: lastRenderState.projectionMode ?? null,
				nationCount: Array.isArray(lastRenderState.nations) ? lastRenderState.nations.length : 0,
				firstNation: lastRenderState.nations?.[0] ?? null,
			},
			lastInteractionDefer,
		};
		lastPanSnapshot = snapshot;
		if (record) {
			recordDebug("pan-capture", {
				label,
				snapshot,
			});
		}
		return snapshot;
	}

	function getPanTrace(limit = 40) {
		const maxItems = Math.max(1, Math.min(200, Math.round(Number(limit) || 40)));
		return debugEvents
			.filter((entry) =>
				entry.type === "pan-event"
				|| entry.type === "pan-frame"
				|| entry.type === "pan-capture"
				|| entry.type === "pan-capture-start"
				|| entry.type === "pan-capture-stop",
			)
			.slice(-maxItems);
	}

	function exportPanTrace(limit = 40) {
		const payload = {
			exportedAt: Date.now(),
			mode: getDebugMode(),
			lastPanSnapshot,
			events: getPanTrace(limit),
		};
		recordDebug("pan-trace-export", {
			limit: Math.max(1, Math.min(200, Math.round(Number(limit) || 40))),
			eventCount: payload.events.length,
		});
		return payload;
	}

	function parseCoordsText(text) {
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

	function defaultSampleWorldPoint(clientX, clientY, mapContainer) {
		if (!(mapContainer instanceof HTMLElement)) return null;

		const coordsElement = document.querySelector(coordsSelector);
		const previousText =
			coordsElement instanceof HTMLElement ? coordsElement.textContent : null;
		const mapPane =
			mapContainer.querySelector?.(".leaflet-map-pane") ||
			document.querySelector(".leaflet-map-pane") ||
			mapContainer;

		const event =
			typeof globalThis.MouseEvent === "function"
				? new globalThis.MouseEvent("mousemove", {
					bubbles: true,
					cancelable: true,
					clientX,
					clientY,
					view: globalThis,
				})
				: {
					type: "mousemove",
					bubbles: true,
					cancelable: true,
					clientX,
					clientY,
					view: globalThis,
				};

		mapPane.dispatchEvent(event);
		const nextText =
			coordsElement instanceof HTMLElement ? coordsElement.textContent ?? "" : "";
		if (coordsElement instanceof HTMLElement && previousText != null) {
			coordsElement.textContent = previousText;
		}
		return parseCoordsText(nextText);
	}

	function getSampleWorldPoint() {
		return typeof sampleWorldPoint === "function"
			? sampleWorldPoint
			: defaultSampleWorldPoint;
	}

	function getMapContainer() {
		const primaryMap = getPrimaryLeafletMap();
		const primaryContainer = primaryMap?.getContainer?.();
		if (primaryContainer instanceof HTMLElement) return primaryContainer;

		const fallbackContainer = document.querySelector(".leaflet-container");
		return fallbackContainer instanceof HTMLElement ? fallbackContainer : null;
	}

	function getOverlayHost(mapContainer) {
		const primaryMap = getPrimaryLeafletMap();
		const primaryOverlayPane = primaryMap?.getPane?.("overlayPane");
		if (primaryOverlayPane instanceof HTMLElement) return primaryOverlayPane;

		const fallbackOverlayPane = document.querySelector(".leaflet-overlay-pane");
		if (fallbackOverlayPane instanceof HTMLElement) return fallbackOverlayPane;

		return mapContainer instanceof HTMLElement ? mapContainer : null;
	}

	function ensureOverlay(overlayHost) {
		if (!(overlayHost instanceof HTMLElement)) return null;

		let overlay = overlayHost.querySelector(`#${liveOverlayId}`);
		if (overlay instanceof Element) return overlay;

		const nextOverlay = document.createElementNS
			? document.createElementNS("http://www.w3.org/2000/svg", "svg")
			: document.createElement("svg");
		nextOverlay.setAttribute("id", liveOverlayId);
		nextOverlay.setAttribute("aria-hidden", "true");
		nextOverlay.style.position = "absolute";
		nextOverlay.style.inset = "auto";
		nextOverlay.style.left = "0";
		nextOverlay.style.top = "0";
		nextOverlay.style.width = "0";
		nextOverlay.style.height = "0";
		nextOverlay.style.pointerEvents = "none";
		nextOverlay.style.zIndex = "450";
		nextOverlay.style.overflow = "visible";
		nextOverlay.hidden = true;

		const computedPosition = getComputedStyle(overlayHost).position;
		if (!computedPosition || computedPosition === "static") {
			overlayHost.style.position = "relative";
		}

		overlayHost.appendChild(nextOverlay);
		return nextOverlay;
	}

	function clearOverlayTransform(overlay = null) {
		if (!(overlay instanceof Element)) return;
		overlay.style.transform = "none";
		overlay.style.transformOrigin = "";
	}

	function getRenderedNationAnchor(nation = null) {
		if (!nation?.center) return null;
		const anchorX = Number(nation?.centerLayerPoint?.x);
		const anchorY = Number(nation?.centerLayerPoint?.y);
		if (Number.isFinite(anchorX) && Number.isFinite(anchorY)) {
			return {
				worldCenter: nation.center,
				layerPoint: {
					x: anchorX,
					y: anchorY,
				},
			};
		}

		if (!nation?.rangeBounds) return null;
		const left = Number(nation.rangeBounds.left);
		const right = Number(nation.rangeBounds.right);
		const top = Number(nation.rangeBounds.top);
		const bottom = Number(nation.rangeBounds.bottom);
		if (![left, right, top, bottom].every(Number.isFinite)) return null;

		return {
			worldCenter: nation.center,
			layerPoint: {
				x: (left + right) / 2,
				y: (top + bottom) / 2,
			},
		};
	}

	function getNewLayerPointDuringZoom(map, latLng, targetZoom, targetCenter) {
		if (!map || !latLng) return null;
		try {
			if (typeof map._latLngToNewLayerPoint === "function") {
				const point = map._latLngToNewLayerPoint(latLng, targetZoom, targetCenter);
				const x = Number(point?.x);
				const y = Number(point?.y);
				if (Number.isFinite(x) && Number.isFinite(y)) {
					return { x, y };
				}
			}
		} catch {}

		try {
			if (
				typeof map.project === "function"
				&& typeof map._getNewPixelOrigin === "function"
			) {
				const projected = map.project(latLng, targetZoom);
				const pixelOrigin = map._getNewPixelOrigin(targetCenter, targetZoom);
				const x = Number(projected?.x) - Number(pixelOrigin?.x);
				const y = Number(projected?.y) - Number(pixelOrigin?.y);
				if (Number.isFinite(x) && Number.isFinite(y)) {
					return { x, y };
				}
			}
		} catch {}

		return null;
	}

	function clearZoomAnimationSync(overlay = null) {
		zoomAnimationState = null;
		clearOverlayTransform(overlay);
	}

	function applyZoomAnimationSync(map, overlay, event = null) {
		if (!(overlay instanceof Element)) return false;
		if (!planningLeafletAdapter?.canProjectWithMap?.(map)) return false;
		const referenceNation = lastRenderState.nations?.[0] ?? null;
		const anchor = getRenderedNationAnchor(referenceNation);
		if (!anchor?.worldCenter || !anchor?.layerPoint) return false;

		const targetZoom = Number(event?.zoom);
		const targetCenter = event?.center ?? map?.getCenter?.() ?? null;
		const baseZoom = Number(zoomAnimationState?.baseZoom);
		if (!Number.isFinite(targetZoom) || !targetCenter || !Number.isFinite(baseZoom)) {
			return false;
		}

		const anchorLatLng = planningLeafletAdapter.worldToLatLng(anchor.worldCenter);
		const nextAnchorPoint = getNewLayerPointDuringZoom(
			map,
			anchorLatLng,
			targetZoom,
			targetCenter,
		);
		if (!anchorLatLng || !nextAnchorPoint) return false;

		const scale = typeof map.getZoomScale === "function"
			? Number(map.getZoomScale(targetZoom, baseZoom))
			: 2 ** (targetZoom - baseZoom);
		if (!Number.isFinite(scale) || scale <= 0) return false;

		const globalTranslation = {
			x: nextAnchorPoint.x - anchor.layerPoint.x * scale,
			y: nextAnchorPoint.y - anchor.layerPoint.y * scale,
		};
		const overlayLeft = parseCssPixelValue(overlay.style.left) ?? 0;
		const overlayTop = parseCssPixelValue(overlay.style.top) ?? 0;
		const localTranslation = {
			x: globalTranslation.x + (scale - 1) * overlayLeft,
			y: globalTranslation.y + (scale - 1) * overlayTop,
		};

		overlay.style.transformOrigin = "0 0";
		overlay.style.transform =
			`translate(${localTranslation.x}px, ${localTranslation.y}px) scale(${scale})`;
		recordDebug("map-event", {
			type: "zoom-sync-apply",
			baseZoom: safeNumber(baseZoom, 3),
			targetZoom: safeNumber(targetZoom, 3),
			scale: safeNumber(scale, 4),
			translation: {
				x: safeNumber(localTranslation.x, 2),
				y: safeNumber(localTranslation.y, 2),
			},
		});
		return true;
	}

	function parseCssPixelValue(value) {
		const numeric = Number.parseFloat(String(value ?? ""));
		return Number.isFinite(numeric) ? numeric : null;
	}

	function clearOverlay(overlay) {
		if (!(overlay instanceof Element)) return;
		overlay.replaceChildren();
		overlay.hidden = true;
	}

	function updateHoveredTownVisual() {
		const overlay = getOverlayElement(getMapContainer());
		if (!(overlay instanceof Element)) return;
		for (const child of overlay.children ?? []) {
			const shape = child?.getAttribute?.("data-planning-shape");
			if (shape !== "town" && shape !== "town-range-highlight") continue;
			const townId = child.getAttribute("data-planning-town-id");
			const isHovered =
				typeof townId === "string" && townId && townId === hoveredTownId;
			if (shape === "town") {
				const baseRadius = Number(child.getAttribute("data-base-radius"));
				const baseStrokeWidth = Number(child.getAttribute("data-base-stroke-width"));
				if (isHovered) {
					child.setAttribute("r", String((baseRadius + 1.35).toFixed(2)));
					child.setAttribute(
						"stroke-width",
						String((baseStrokeWidth + 0.85).toFixed(2)),
					);
					child.setAttribute("fill-opacity", "1");
					child.setAttribute("data-hovered", "true");
				} else {
					if (Number.isFinite(baseRadius)) {
						child.setAttribute("r", String(baseRadius.toFixed(2)));
					}
					if (Number.isFinite(baseStrokeWidth)) {
						child.setAttribute(
							"stroke-width",
							String(baseStrokeWidth.toFixed(2)),
						);
					}
					child.setAttribute("fill-opacity", "0.96");
					child.removeAttribute("data-hovered");
				}
				continue;
			}

			const isDisconnected =
				child.getAttribute("data-planning-state") === "disconnected";
			if (isHovered) {
				child.setAttribute(
					"fill",
					isDisconnected
						? DISCONNECTED_TOWN_RANGE_HOVER_FILL
						: CONNECTED_TOWN_RANGE_HOVER_FILL,
				);
				child.setAttribute(
					"stroke",
					isDisconnected
						? DISCONNECTED_TOWN_RANGE_HOVER_STROKE
						: CONNECTED_TOWN_RANGE_HOVER_STROKE,
				);
				child.setAttribute("fill-opacity", isDisconnected ? "0.28" : "0.24");
				child.setAttribute("stroke-opacity", "1");
				child.setAttribute("stroke-width", "3.25");
				child.setAttribute("data-hovered", "true");
			} else {
				child.setAttribute("fill-opacity", "0");
				child.setAttribute("stroke-opacity", "0");
				child.setAttribute("stroke-width", "0");
				child.removeAttribute("data-hovered");
			}
		}
	}

	function createSvgChild(tagName, attrs = {}) {
		const element = document.createElementNS
			? document.createElementNS("http://www.w3.org/2000/svg", tagName)
			: document.createElement(tagName);
		for (const [name, value] of Object.entries(attrs)) {
			if (value == null) continue;
			element.setAttribute(name, String(value));
		}
		return element;
	}

	function computeBounds(points) {
		return planningGeometry.computeBounds(points);
	}

	function normalizeNation(nation, index = 0) {
		if (planningState?.normalizePlanningNation) {
			const normalizedNation = planningState.normalizePlanningNation(nation);
			if (!normalizedNation) return null;
			return {
				...normalizedNation,
				id: normalizedNation.id || `planning-nation-${index + 1}`,
				name: normalizedNation.name || `Planning Nation ${index + 1}`,
			};
		}

		const x = Number(nation?.center?.x);
		const z = Number(nation?.center?.z);
		const rangeRadiusBlocks = Number(nation?.rangeRadiusBlocks);
		if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

		return {
			id:
				typeof nation?.id === "string" && nation.id
					? nation.id
					: `planning-nation-${index + 1}`,
			name:
				typeof nation?.name === "string" && nation.name.trim()
					? nation.name
					: `Planning Nation ${index + 1}`,
			color:
				typeof nation?.color === "string" && nation.color
					? nation.color
					: "#d98936",
			outlineColor:
				typeof nation?.outlineColor === "string" && nation.outlineColor
					? nation.outlineColor
					: "#fff3cf",
			rangeRadiusBlocks: Number.isFinite(rangeRadiusBlocks)
				? Math.max(0, Math.round(rangeRadiusBlocks))
				: 0,
			center: {
				x: Math.round(x),
				z: Math.round(z),
			},
			towns: Array.isArray(nation?.towns)
				? nation.towns
					.map((town, townIndex) => {
						const townX = Number(town?.x);
						const townZ = Number(town?.z);
						const townRangeRadiusBlocks = Number(town?.rangeRadiusBlocks);
						if (!Number.isFinite(townX) || !Number.isFinite(townZ)) return null;
						return {
							id:
								typeof town?.id === "string" && town.id
									? town.id
									: `planning-town-${index + 1}-${townIndex + 1}`,
							name:
								typeof town?.name === "string" && town.name.trim()
									? town.name
									: `Town ${townIndex + 1}`,
							x: Math.round(townX),
							z: Math.round(townZ),
							rangeRadiusBlocks: Number.isFinite(townRangeRadiusBlocks)
								? Math.max(0, Math.round(townRangeRadiusBlocks))
								: DEFAULT_TOWN_RANGE_BLOCKS,
						};
					})
					.filter((town) => town != null)
				: [],
		};
	}

	function getPlanningDistanceSquared(start, end) {
		const startX = Number(start?.x);
		const startZ = Number(start?.z);
		const endX = Number(end?.x);
		const endZ = Number(end?.z);
		if (
			!Number.isFinite(startX) ||
			!Number.isFinite(startZ) ||
			!Number.isFinite(endX) ||
			!Number.isFinite(endZ)
		) {
			return null;
		}

		const deltaX = endX - startX;
		const deltaZ = endZ - startZ;
		return deltaX * deltaX + deltaZ * deltaZ;
	}

	function isPlanningPointWithinRange(point, anchor) {
		const rangeRadiusBlocks = Number(anchor?.rangeRadiusBlocks);
		if (!Number.isFinite(rangeRadiusBlocks)) return false;

		const distanceSquared = getPlanningDistanceSquared(anchor, point);
		if (distanceSquared == null) return false;

		return distanceSquared <= rangeRadiusBlocks * rangeRadiusBlocks;
	}

	function getPlanningTownConnectivity(nation) {
		if (planningState?.getPlanningTownConnectivity) {
			return planningState.getPlanningTownConnectivity(nation);
		}

		const normalizedNation = normalizeNation(nation);
		if (!normalizedNation) {
			return {
				nation: null,
				connectedAnchors: [],
				connectedTowns: [],
				disconnectedTowns: [],
				connectedTownIds: new Set(),
				disconnectedTownIds: new Set(),
			};
		}

		const connectedAnchors = [{
			id: normalizedNation.id,
			x: normalizedNation.center.x,
			z: normalizedNation.center.z,
			rangeRadiusBlocks: normalizedNation.rangeRadiusBlocks,
			type: "nation",
		}];
		const connectedTownIds = new Set();
		const remainingTowns = [...normalizedNation.towns];
		let didConnectTown = true;

		while (didConnectTown && remainingTowns.length > 0) {
			didConnectTown = false;
			for (let index = remainingTowns.length - 1; index >= 0; index -= 1) {
				const town = remainingTowns[index];
				const canConnect = connectedAnchors.some((anchor) =>
					isPlanningPointWithinRange(town, anchor),
				);
				if (!canConnect) continue;

				connectedTownIds.add(town.id);
				connectedAnchors.push({
					...town,
					type: "town",
				});
				remainingTowns.splice(index, 1);
				didConnectTown = true;
			}
		}

		const connectedTowns = normalizedNation.towns.filter((town) =>
			connectedTownIds.has(town.id),
		);
		const disconnectedTowns = normalizedNation.towns.filter(
			(town) => !connectedTownIds.has(town.id),
		);
		return {
			nation: normalizedNation,
			connectedAnchors,
			connectedTowns,
			disconnectedTowns,
			connectedTownIds,
			disconnectedTownIds: new Set(disconnectedTowns.map((town) => town.id)),
		};
	}

	function computeProjectionTransform(mapContainer) {
		if (!(mapContainer instanceof HTMLElement)) {
			return { ok: false, reason: "missing-map-container" };
		}

		const rect = mapContainer.getBoundingClientRect();
		if (
			!Number.isFinite(rect.width) ||
			!Number.isFinite(rect.height) ||
			rect.width <= 0 ||
			rect.height <= 0
		) {
			return { ok: false, reason: "invalid-map-rect" };
		}

		const sampleDistance = Math.max(
			32,
			Math.min(96, Math.floor(rect.width / 4), Math.floor(rect.height / 4)),
		);
		const centerClient = {
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
		};

		const sample = getSampleWorldPoint();
		const centerWorld = sample(centerClient.x, centerClient.y, mapContainer);
		const rightWorld = sample(
			centerClient.x + sampleDistance,
			centerClient.y,
			mapContainer,
		);
		const downWorld = sample(
			centerClient.x,
			centerClient.y + sampleDistance,
			mapContainer,
		);
		if (!centerWorld || !rightWorld || !downWorld) {
			return { ok: false, reason: "sample-failed" };
		}

		const worldDxRight = (rightWorld.x - centerWorld.x) / sampleDistance;
		const worldDxDown = (downWorld.x - centerWorld.x) / sampleDistance;
		const worldDzRight = (rightWorld.z - centerWorld.z) / sampleDistance;
		const worldDzDown = (downWorld.z - centerWorld.z) / sampleDistance;
		const determinant = worldDxRight * worldDzDown - worldDxDown * worldDzRight;
		if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-6) {
			return { ok: false, reason: "singular-transform" };
		}

		return {
			ok: true,
			rect,
			centerWorld,
			centerLocal: {
				x: centerClient.x - rect.left,
				y: centerClient.y - rect.top,
			},
			screenPerWorld: {
				xx: worldDzDown / determinant,
				xz: -worldDxDown / determinant,
				yx: -worldDzRight / determinant,
				yz: worldDxRight / determinant,
			},
		};
	}

	function toLeafletPoint(point) {
		if (!point) return null;
		if (typeof globalThis.L?.point === "function") {
			return globalThis.L.point(point.x, point.y);
		}
		return point;
	}

	function projectWorldPointToOverlay(worldPoint, transform, map = null) {
		const containerPoint = projectWorldPoint(worldPoint, transform);
		if (!containerPoint) return null;

		if (map && typeof map.containerPointToLayerPoint === "function") {
			try {
				const layerPoint = map.containerPointToLayerPoint(
					toLeafletPoint(containerPoint),
				);
				const x = Number(layerPoint?.x);
				const y = Number(layerPoint?.y);
				if (Number.isFinite(x) && Number.isFinite(y)) {
					return { x, y };
				}
			} catch {}
		}

		return containerPoint;
	}

	function projectWorldPointViaLeaflet(worldPoint, map = null) {
		if (!planningLeafletAdapter?.canProjectWithMap?.(map)) return null;
		return planningLeafletAdapter.projectWorldToLayerPoint(worldPoint, map);
	}

	function projectWorldPoint(worldPoint, transform) {
		const dx = Number(worldPoint?.x) - transform.centerWorld.x;
		const dz = Number(worldPoint?.z) - transform.centerWorld.z;
		if (!Number.isFinite(dx) || !Number.isFinite(dz)) return null;

		return {
			x:
				transform.centerLocal.x +
				transform.screenPerWorld.xx * dx +
				transform.screenPerWorld.xz * dz,
			y:
				transform.centerLocal.y +
				transform.screenPerWorld.yx * dx +
				transform.screenPerWorld.yz * dz,
		};
	}

	function buildPath(points) {
		const pathPoints = points.filter((point) =>
			Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.y)),
		);
		if (pathPoints.length === 0) return "";

		return (
			pathPoints
				.map((point, index) =>
					`${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
				)
				.join(" ") + " Z"
		);
	}

	function buildMultiPath(polygons) {
		if (!Array.isArray(polygons)) return "";
		return polygons
			.flatMap((polygon) =>
				Array.isArray(polygon) ? polygon.map((ring) => buildPath(ring)) : [],
			)
			.filter(Boolean)
			.join(" ");
	}

	function normalizePointsForBounds(points, origin) {
		if (!Array.isArray(points) || !origin) return [];
		return points.map((point) => ({
			x: point.x - origin.x,
			y: point.y - origin.y,
		}));
	}

	function normalizePolygonsForBounds(polygons, origin) {
		if (!Array.isArray(polygons) || !origin) return [];
		return polygons
			.map((polygon) =>
				Array.isArray(polygon)
					? polygon
						.map((ring) => normalizePointsForBounds(ring, origin))
						.filter((ring) => ring.length > 0)
					: [],
			)
			.filter((polygon) => polygon.length > 0);
	}

	function flattenPolygons(polygons) {
		return planningGeometry.flattenPolygons(polygons);
	}

	function createBoundsPointsForCircle(centerPoint, radiusPx) {
		const x = Number(centerPoint?.x);
		const y = Number(centerPoint?.y);
		const radius = Number(radiusPx);
		if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius)) {
			return [];
		}

		return [
			{ x: x - radius, y },
			{ x: x + radius, y },
			{ x, y: y - radius },
			{ x, y: y + radius },
		];
	}

	function createBoundsPointsForRect(bounds) {
		const left = Number(bounds?.left);
		const top = Number(bounds?.top);
		const width = Number(bounds?.width);
		const height = Number(bounds?.height);
		if (
			!Number.isFinite(left) ||
			!Number.isFinite(top) ||
			!Number.isFinite(width) ||
			!Number.isFinite(height)
		) {
			return [];
		}

		return [
			{ x: left, y: top },
			{ x: left + width, y: top },
			{ x: left, y: top + height },
			{ x: left + width, y: top + height },
		];
	}

	function createTownLabelMetrics(labelText) {
		const text =
			typeof labelText === "string" && labelText.trim()
				? labelText.trim()
				: "T?";
		return {
			text,
			widthPx: Math.max(
				TOWN_LABEL_MIN_WIDTH_PX,
				text.length * 7 + TOWN_LABEL_HORIZONTAL_PADDING_PX * 2,
			),
			heightPx: TOWN_LABEL_HEIGHT_PX,
		};
	}

	function getTownLabelBox(centerPoint, radiusPx, labelMetrics) {
		const x = Number(centerPoint?.x);
		const y = Number(centerPoint?.y);
		const radius = Number(radiusPx);
		const width = Number(labelMetrics?.widthPx);
		const height = Number(labelMetrics?.heightPx);
		if (
			!Number.isFinite(x) ||
			!Number.isFinite(y) ||
			!Number.isFinite(radius) ||
			!Number.isFinite(width) ||
			!Number.isFinite(height)
		) {
			return null;
		}

		const left = x - width / 2;
		const top = y - radius - height - TOWN_LABEL_VERTICAL_OFFSET_PX;
		return {
			left,
			top,
			width,
			height,
			centerX: x,
			centerY: top + height / 2,
		};
	}

	function projectWorldRing(points, projector) {
		return planningGeometry.projectWorldRing(points, projector);
	}

	function projectWorldMultiPolygon(polygons, projector) {
		return planningGeometry.projectWorldMultiPolygon(polygons, projector);
	}

	function scheduleRender(reason = "unspecified") {
		lastRenderTrigger = reason;
		recordDebug("schedule-render", {
			reason,
			framePending: renderFrame !== 0,
		});
		if (renderFrame) return;
		renderFrame = requestAnimationFrame(() => {
			renderFrame = 0;
			render();
		});
	}

	function scheduleRenderAfter(delayMs = 0, reason = "delayed") {
		const normalizedDelay = Math.max(0, Math.round(Number(delayMs) || 0));
		const timerId = setTimeout(() => {
			delayedRenderTimers.delete(timerId);
			scheduleRender(reason);
		}, normalizedDelay);
		delayedRenderTimers.add(timerId);
		timerId?.unref?.();
	}

	function clearDelayedRenders() {
		for (const timerId of delayedRenderTimers) {
			clearTimeout(timerId);
		}
		delayedRenderTimers.clear();
	}

	function scheduleZoomResync(reasonPrefix = "zoom", delays = [0, 80]) {
		const normalizedDelays = Array.isArray(delays) ? delays : [0, 80];
		let first = true;
		for (const delay of normalizedDelays) {
			const numericDelay = Math.max(0, Math.round(Number(delay) || 0));
			if (first && numericDelay === 0) {
				scheduleRender(reasonPrefix);
				first = false;
				continue;
			}
			const suffix = numericDelay === 0 ? "" : `+${numericDelay}ms`;
			scheduleRenderAfter(numericDelay, `${reasonPrefix}${suffix}`);
			first = false;
		}
	}

	function hasAttachedMapListeners() {
		return !!(attachedMap && listenerStats.attachCount > 0);
	}

	function getProjectionSamplingStability(map = null, mapContainer = null) {
		const container = mapContainer instanceof HTMLElement ? mapContainer : null;
		const className = container?.className || "";
		const reasons = {
			containerZoomAnim: /\bleaflet-zoom-anim\b/.test(className),
			containerPanAnim: /\bleaflet-pan-anim\b/.test(className),
			mapAnimatingZoom: map?._animatingZoom === true,
			mapPanAnimInProgress: map?._panAnim?._inProgress === true,
			mapDragMoving: map?.dragging?._draggable?._moving === true,
		};
		const blockingReasons = {
			containerZoomAnim: reasons.containerZoomAnim,
			containerPanAnim: reasons.containerPanAnim,
			mapAnimatingZoom: reasons.mapAnimatingZoom,
			mapPanAnimInProgress: reasons.mapPanAnimInProgress,
		};
		return {
			stable: !Object.values(blockingReasons).some(Boolean),
			reasons,
			blockingReasons,
		};
	}

	function capturePanFrame(label = "pan-frame") {
		panCaptureSampleCount += 1;
		const shouldRecord = label !== "dragging" || panCaptureSampleCount % 12 === 1;
		const snapshot = getPanDiagnostics(label, { record: shouldRecord });
		if (!shouldRecord) return snapshot;
		recordDebug("pan-frame", {
			sample: panCaptureSampleCount,
			snapshot,
		});
		return snapshot;
	}

	function stopPanCapture(reason = "pointerup") {
		if (!panCaptureActive) return;
		panCaptureActive = false;
		if (panCaptureFrame) {
			cancelAnimationFrame(panCaptureFrame);
			panCaptureFrame = 0;
		}
		recordDebug("pan-capture-stop", {
			reason,
			samples: panCaptureSampleCount,
		});
		capturePanFrame(`stop:${reason}`);
	}

	function startPanCapture(reason = "pointerdown") {
		if (panCaptureActive) return;
		clearDelayedRenders();
		panCaptureActive = true;
		panCaptureSampleCount = 0;
		recordDebug("pan-capture-start", {
			reason,
		});
		capturePanFrame(`start:${reason}`);

		const tick = () => {
			if (!panCaptureActive) return;
			capturePanFrame("dragging");
			panCaptureFrame = requestAnimationFrame(tick);
		};
		panCaptureFrame = requestAnimationFrame(tick);
	}

	function ensurePointerCaptureListeners(mapContainer = null) {
		if (!(mapContainer instanceof HTMLElement)) return;
		if (mapContainer.dataset?.emcdynmapplusPanCaptureBound === "true") return;

		mapContainer.addEventListener("pointerdown", () => startPanCapture("pointerdown"));
		mapContainer.addEventListener("mousedown", () => startPanCapture("mousedown"));
		mapContainer.addEventListener("touchstart", () => startPanCapture("touchstart"), {
			passive: true,
		});
		window.addEventListener?.("pointerup", () => stopPanCapture("pointerup"));
		window.addEventListener?.("mouseup", () => stopPanCapture("mouseup"));
		window.addEventListener?.("touchend", () => stopPanCapture("touchend"), {
			passive: true,
		});
		window.addEventListener?.("blur", () => stopPanCapture("window-blur"));
		mapContainer.dataset.emcdynmapplusPanCaptureBound = "true";
	}

	function ensureMapListeners() {
		const map = getPrimaryLeafletMap();
		if (!map || typeof map.on !== "function") return;
		if (map === attachedMap) {
			recordDebug("listener-attach-skip", {
				reason: "already-attached",
				map: describeAttachedMap(map),
				listenerStats,
			});
			return;
		}

		attachedMap = map;
		listenerStats = {
			attachedAt: Date.now(),
			attachCount: listenerStats.attachCount + 1,
			attachedMapDescriptor: describeAttachedMap(map),
			zoomstart: 0,
			zoomanim: 0,
			zoom: 0,
			zoomend: 0,
			movestart: 0,
			move: 0,
			moveend: 0,
		};
		recordDebug("listener-attach", {
			map: listenerStats.attachedMapDescriptor,
			listenerStats,
		});
		let moveSampleCounter = 0;
		map.on("movestart", () => {
			listenerStats.movestart += 1;
			recordDebug("listener-event", {
				name: "movestart",
				count: listenerStats.movestart,
				map: listenerStats.attachedMapDescriptor,
			});
			startPanCapture("movestart");
			const snapshot = getPanDiagnostics("movestart");
			recordDebug("pan-event", {
				phase: "movestart",
				snapshot,
			});
		});
		map.on("move", () => {
			listenerStats.move += 1;
			moveSampleCounter += 1;
			if (moveSampleCounter % 6 !== 1) return;
			recordDebug("listener-event", {
				name: "move",
				count: listenerStats.move,
				map: listenerStats.attachedMapDescriptor,
			});
			const snapshot = getPanDiagnostics("move");
			recordDebug("pan-event", {
				phase: "move",
				sample: moveSampleCounter,
				snapshot,
			});
		});
		map.on("moveend", () => {
			listenerStats.moveend += 1;
			recordDebug("listener-event", {
				name: "moveend",
				count: listenerStats.moveend,
				map: listenerStats.attachedMapDescriptor,
			});
			moveSampleCounter = 0;
			const snapshot = getPanDiagnostics("moveend");
			recordDebug("pan-event", {
				phase: "moveend",
				snapshot,
			});
			stopPanCapture("moveend");
		});
		map.on("zoomstart", () => {
			listenerStats.zoomstart += 1;
			recordDebug("listener-event", {
				name: "zoomstart",
				count: listenerStats.zoomstart,
				map: listenerStats.attachedMapDescriptor,
			});
			clearDelayedRenders();
			zoomAnimationState = {
				baseZoom: Number(map.getZoom?.()),
			};
			const overlay = getOverlayElement(getMapContainer());
			clearOverlayTransform(overlay);
			const snapshot = getPanDiagnostics("zoomstart");
			recordDebug("pan-event", {
				phase: "zoomstart",
				snapshot,
			});
		});
		map.on("zoomanim", (event) => {
			listenerStats.zoomanim += 1;
			const overlay = getOverlayElement(getMapContainer());
			const applied = applyZoomAnimationSync(map, overlay, event);
			recordDebug("listener-event", {
				name: "zoomanim",
				count: listenerStats.zoomanim,
				applied,
				eventZoom: safeNumber(event?.zoom, 3),
				map: listenerStats.attachedMapDescriptor,
			});
			recordDebug("map-event", {
				type: "zoomanim",
				zoom: safeNumber(event?.zoom, 3),
			});
		});
		map.on("zoomend", () => {
			listenerStats.zoomend += 1;
			recordDebug("listener-event", {
				name: "zoomend",
				count: listenerStats.zoomend,
				map: listenerStats.attachedMapDescriptor,
			});
			const overlay = getOverlayElement(getMapContainer());
			clearZoomAnimationSync(overlay);
			const snapshot = getPanDiagnostics("zoomend");
			recordDebug("pan-event", {
				phase: "zoomend",
				snapshot,
			});
			scheduleZoomResync("map-zoomend", [0]);
		});
		map.on("moveend", () => {
			const eventZoom = safeNumber(map.getZoom?.(), 3);
			recordDebug("map-event", {
				type: "moveend",
				zoom: eventZoom,
			});
			scheduleRender("map-moveend");
		});
		map.on("zoom", () => {
			listenerStats.zoom += 1;
			const eventZoom = safeNumber(map.getZoom?.(), 3);
			recordDebug("listener-event", {
				name: "zoom",
				count: listenerStats.zoom,
				zoom: eventZoom,
				map: listenerStats.attachedMapDescriptor,
			});
			recordDebug("map-event", {
				type: "zoom",
				zoom: eventZoom,
			});
		});
		map.on("resize load", () => {
			const eventZoom = safeNumber(map.getZoom?.(), 3);
			recordDebug("map-event", {
				type: "resize-load",
				zoom: eventZoom,
			});
			scheduleZoomResync("map-resize-load");
		});
	}

	function ensureRootObserver() {
		if (rootObserver || typeof MutationObserver !== "function") return;
		const root = document.documentElement;
		if (!(root instanceof HTMLElement)) return;

		rootObserver = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type !== "attributes") continue;

				if (mutation.attributeName === pageMapZoomAttr) {
					const nextZoomAttr =
						document.documentElement?.getAttribute?.(pageMapZoomAttr) ?? null;
					if (nextZoomAttr === lastObservedRootZoomAttr) {
						recordDebug("map-event", {
							type: "root-zoom-attr-ignored",
							zoom: nextZoomAttr,
						});
						continue;
					}
					lastObservedRootZoomAttr = nextZoomAttr;
					recordDebug("root-zoom-attr", {
						zoomAttr: nextZoomAttr,
					});
					ensureMapListeners();
					if (!hasAttachedMapListeners()) {
						scheduleZoomResync("root-zoom-attr", [0, 80]);
					}
					break;
				}

				if (
					mutation.attributeName === PLANNING_PREVIEW_ACTIVE_ATTR ||
					mutation.attributeName === PLANNING_PREVIEW_KIND_ATTR ||
					mutation.attributeName === PLANNING_PREVIEW_RANGE_BLOCKS_ATTR ||
					mutation.attributeName === PLANNING_PREVIEW_CLIENT_X_ATTR ||
					mutation.attributeName === PLANNING_PREVIEW_CLIENT_Y_ATTR
				) {
					scheduleRender("preview-request-updated");
					break;
				}
			}
		});
		rootObserver.observe(root, {
			attributes: true,
			attributeFilter: [
				pageMapZoomAttr,
				PLANNING_PREVIEW_ACTIVE_ATTR,
				PLANNING_PREVIEW_KIND_ATTR,
				PLANNING_PREVIEW_RANGE_BLOCKS_ATTR,
				PLANNING_PREVIEW_CLIENT_X_ATTR,
				PLANNING_PREVIEW_CLIENT_Y_ATTR,
			],
		});
		lastObservedRootZoomAttr = root.getAttribute(pageMapZoomAttr);
	}

	function ensurePolling() {
		if (pollTimer) return;

		const poll = () => {
			pollTimer = 0;
			const mapContainer = getMapContainer();
			if (!(mapContainer instanceof HTMLElement)) {
				pollTimer = setTimeout(poll, 250);
				pollTimer?.unref?.();
				return;
			}

			ensureMapListeners();
			ensurePointerCaptureListeners(mapContainer);
			scheduleRender("poll");
		};

		pollTimer = setTimeout(poll, 0);
		pollTimer?.unref?.();
	}

	function render() {
		const map = getPrimaryLeafletMap();
		ensureMapListeners();
		const mapContainer = getMapContainer();
		ensurePointerCaptureListeners(mapContainer);
		recordDebug("render-start", {
			trigger: lastRenderTrigger,
			liveReady: isLiveReady(),
			rootZoomAttr: document.documentElement?.getAttribute?.(pageMapZoomAttr) ?? null,
			map: summarizeMap(map),
			mapContainer: summarizeElementBox(mapContainer),
		});
		const overlayHost = getOverlayHost(mapContainer);
		const overlay = ensureOverlay(overlayHost);
		const effectiveZoom = readEffectiveZoom(map);
		const nativeProjectionAvailable = !!planningLeafletAdapter?.canProjectWithMap?.(map);
		const projectionMode = nativeProjectionAvailable ? "leaflet-native" : "sampled-transform";
		const stability = getProjectionSamplingStability(map, mapContainer);
		if (!nativeProjectionAvailable && !stability.stable) {
			clearOverlayTransform(overlay);
			lastInteractionDefer = {
				trigger: lastRenderTrigger,
				reason: "unstable-projection-state",
				projectionMode,
				effectiveZoom: safeNumber(effectiveZoom, 3),
				lastStableRenderZoom: safeNumber(lastStableRenderZoom, 3),
				stability,
			};
			recordDebug("interaction-defer", {
				trigger: lastRenderTrigger,
				reason: "unstable-projection-state",
				projectionMode,
				effectiveZoom: lastInteractionDefer.effectiveZoom,
				lastStableRenderZoom: lastInteractionDefer.lastStableRenderZoom,
				stability,
			});
			scheduleRenderAfter(50, `${lastRenderTrigger}+stable-wait`);
			return lastRenderState;
		}
		lastInteractionDefer = null;
		if (!(mapContainer instanceof HTMLElement)) {
			lastRenderState = { ok: false, reason: "missing-map-container", projectionMode, nations: [] };
			setLiveReady(false);
			setLiveBlocksPerPixel(null);
			setLiveTownBlocksPerPixel(null);
			setLiveMapBlocksPerPixel(null);
			clearExactPreviewMetrics();
			recordDebug("render-failed", {
				trigger: lastRenderTrigger,
				reason: lastRenderState.reason,
			});
			ensurePolling();
			return lastRenderState;
		}

		if (!(overlayHost instanceof HTMLElement)) {
			lastRenderState = { ok: false, reason: "missing-overlay-host", projectionMode, nations: [] };
			setLiveReady(false);
			setLiveBlocksPerPixel(null);
			setLiveTownBlocksPerPixel(null);
			setLiveMapBlocksPerPixel(null);
			clearExactPreviewMetrics();
			recordDebug("render-failed", {
				trigger: lastRenderTrigger,
				reason: lastRenderState.reason,
				mapContainer: summarizeElementBox(mapContainer),
			});
			return lastRenderState;
		}

		if (!(overlay instanceof Element)) {
			lastRenderState = { ok: false, reason: "missing-overlay", projectionMode, nations: [] };
			setLiveReady(false);
			setLiveBlocksPerPixel(null);
			setLiveTownBlocksPerPixel(null);
			setLiveMapBlocksPerPixel(null);
			clearExactPreviewMetrics();
			recordDebug("render-failed", {
				trigger: lastRenderTrigger,
				reason: lastRenderState.reason,
				overlayHost: summarizeElementBox(overlayHost),
			});
			return lastRenderState;
		}

		if (!isPlanningModeActive()) {
			clearOverlay(overlay);
			clearZoomAnimationSync(overlay);
			setLiveBlocksPerPixel(null);
			setLiveTownBlocksPerPixel(null);
			setLiveMapBlocksPerPixel(null);
			clearExactPreviewMetrics();
			lastRenderState = { ok: true, reason: "inactive-map-mode", projectionMode, nations: [] };
			recordDebug("render-skipped", {
				trigger: lastRenderTrigger,
				reason: lastRenderState.reason,
			});
			return lastRenderState;
		}

		let transform = null;
		if (!nativeProjectionAvailable) {
			transform = computeProjectionTransform(mapContainer);
		}
		if (!nativeProjectionAvailable && !transform.ok) {
			clearOverlay(overlay);
			clearZoomAnimationSync(overlay);
			lastRenderState = { ok: false, reason: transform.reason, projectionMode, nations: [] };
			setLiveReady(false);
			setLiveBlocksPerPixel(null);
			setLiveTownBlocksPerPixel(null);
			setLiveMapBlocksPerPixel(null);
			clearExactPreviewMetrics();
			recordDebug("render-failed", {
				trigger: lastRenderTrigger,
				reason: lastRenderState.reason,
				map: summarizeMap(map),
				mapContainer: summarizeElementBox(mapContainer),
				overlayHost: summarizeElementBox(overlayHost),
			});
			ensurePolling();
			return lastRenderState;
		}

		const nations = getPlanningNations()
			.map((nation, index) => normalizeNation(nation, index))
			.filter((nation) => nation != null);
		const liveMapBlocksPerPixel = nativeProjectionAvailable
			? computeLeafletNativeBlocksPerPixel(map)
			: computeBlocksPerPixelFromScreenPerWorld(transform?.screenPerWorld);
		setLiveMapBlocksPerPixel(liveMapBlocksPerPixel);
		const previewRequest = readActivePreviewRequest();
		const projectedPreview = getProjectedPreviewDiameter({
			previewRequest,
			map,
			transform,
			nativeProjectionAvailable,
		});
		if (projectedPreview?.diameterPx > 0) {
			setExactPreviewMetrics({
				kind: previewRequest?.kind ?? null,
				rangeRadiusBlocks: previewRequest?.rangeRadiusBlocks ?? null,
				diameterPx: projectedPreview.diameterPx,
				mode: "exact-projected",
			});
		} else {
			clearExactPreviewMetrics();
		}

		if (nations.length === 0) {
			clearOverlay(overlay);
			clearZoomAnimationSync(overlay);
			lastRenderState = { ok: true, reason: "no-nations", projectionMode, nations: [] };
			setLiveReady(true);
			setLiveBlocksPerPixel(null);
			setLiveTownBlocksPerPixel(null);
			recordDebug("render-complete", {
				trigger: lastRenderTrigger,
				reason: lastRenderState.reason,
				overlayHost: summarizeElementBox(overlayHost),
				overlay: summarizeElementBox(overlay),
			});
			return lastRenderState;
		}

		const nextChildren = [];
		const measurements = [];
		const townMeasurements = [];
		const projectedShapes = [];
		const markerMetrics = getZoomAwareMarkerMetrics(effectiveZoom);
		const projectWorldPoint = (point) =>
			nativeProjectionAvailable
				? projectWorldPointViaLeaflet(point, map)
				: projectWorldPointToOverlay(point, transform, map);

		for (const nation of nations) {
			const connectivity = getPlanningTownConnectivity(nation);
			const connectedNation = connectivity.nation ?? nation;
			const baseRangePolygon = [[createPlanningCircleVertices(
				connectedNation.center,
				connectedNation.rangeRadiusBlocks,
			)]];
			const rangePolygon = typeof createPlanningRangeMultiPolygon === "function"
				? createPlanningRangeMultiPolygon(connectedNation)
				: baseRangePolygon;
			const projectedBaseRangePolygon = projectWorldMultiPolygon(
				baseRangePolygon,
				projectWorldPoint,
			);
			const projectedRangePolygon = projectWorldMultiPolygon(
				rangePolygon,
				projectWorldPoint,
			);
			const disconnectedRangePolygons = connectivity.disconnectedTowns
				.map((town) =>
					projectWorldMultiPolygon(
						[[createPlanningCircleVertices(town, town.rangeRadiusBlocks)]],
						projectWorldPoint,
					),
				)
				.map((polygon) => polygon?.[0]?.[0] ?? [])
				.filter((polygon) => polygon.length >= 3);
			const centerPoint = projectWorldPoint(connectedNation.center);
			const projectedTownMarkers = (connectedNation.towns ?? [])
				.map((town, townIndex) => ({
					town,
					centerPoint: projectWorldPoint(town),
					radiusPx: markerMetrics.townRadiusPx,
					isDisconnected: connectivity.disconnectedTownIds.has(town.id),
					labelMetrics: createTownLabelMetrics(`T${townIndex + 1}`),
				}))
				.filter((townMarker) => townMarker.centerPoint != null);
			const projectedTownRangeHighlights = (connectedNation.towns ?? [])
				.map((town) => ({
					town,
					isDisconnected: connectivity.disconnectedTownIds.has(town.id),
					polygons: projectWorldMultiPolygon(
						[[createPlanningCircleVertices(town, town.rangeRadiusBlocks)]],
						projectWorldPoint,
					),
				}))
				.filter((townRange) => flattenPolygons(townRange.polygons).length >= 3);
			const rangePoints = [
				...flattenPolygons(projectedRangePolygon),
				...disconnectedRangePolygons.flatMap((polygon) => flattenPolygons([polygon])),
			];

			measurements.push({
				id: connectedNation.id,
				name: connectedNation.name,
				center: connectedNation.center,
				centerLayerPoint: centerPoint,
				rangeRadiusBlocks: connectedNation.rangeRadiusBlocks,
				townCount: connectedNation.towns.length,
				disconnectedTownCount: connectivity.disconnectedTowns.length,
				previewRangeBounds: computeBounds(
					flattenPolygons(projectedBaseRangePolygon),
				),
				rangeBounds: computeBounds(rangePoints),
			});
			townMeasurements.push(
				...projectedTownRangeHighlights.map((townRange) => ({
					id: townRange.town.id,
					nationId: connectedNation.id,
					rangeRadiusBlocks: townRange.town.rangeRadiusBlocks,
					isDisconnected: townRange.isDisconnected,
					rangeBounds: computeBounds(flattenPolygons(townRange.polygons)),
				})),
			);
			projectedShapes.push({
				nation: connectedNation,
				rangePolygon: projectedRangePolygon,
				disconnectedRangePolygons,
				centerMarker: centerPoint == null
					? null
					: {
						centerPoint,
						radiusPx: markerMetrics.nationRadiusPx,
						strokePx: markerMetrics.nationStrokePx,
					},
				townMarkers: projectedTownMarkers,
				townRangeHighlights: projectedTownRangeHighlights,
			});
		}

		const allPoints = projectedShapes.flatMap((shape) => [
			...flattenPolygons(shape.rangePolygon),
			...shape.disconnectedRangePolygons.flatMap((polygon) =>
				flattenPolygons([polygon]),
			),
			...createBoundsPointsForCircle(
				shape.centerMarker?.centerPoint,
				shape.centerMarker?.radiusPx,
			),
			...shape.townMarkers.flatMap((townMarker) =>
				createBoundsPointsForCircle(townMarker.centerPoint, townMarker.radiusPx),
			),
			...shape.townMarkers.flatMap((townMarker) =>
				createBoundsPointsForRect(
					getTownLabelBox(
						townMarker.centerPoint,
						townMarker.radiusPx,
						townMarker.labelMetrics,
					),
				),
			),
		]);
		const overallBounds = computeBounds(allPoints);
		if (!overallBounds) {
			clearOverlay(overlay);
			clearZoomAnimationSync(overlay);
			lastRenderState = { ok: false, reason: "invalid-projected-bounds", projectionMode, nations: [] };
			setLiveReady(false);
			setLiveBlocksPerPixel(null);
			setLiveTownBlocksPerPixel(null);
			setLiveMapBlocksPerPixel(null);
			clearExactPreviewMetrics();
			recordDebug("render-failed", {
				trigger: lastRenderTrigger,
				reason: lastRenderState.reason,
				projectionMode,
				measurements,
			});
			return lastRenderState;
		}

		const origin = {
			x: Math.floor(overallBounds.left - 8),
			y: Math.floor(overallBounds.top - 8),
		};
		const width = Math.max(1, Math.ceil(overallBounds.width + 16));
		const height = Math.max(1, Math.ceil(overallBounds.height + 16));
		overlay.style.left = `${origin.x}px`;
		overlay.style.top = `${origin.y}px`;
		overlay.style.width = `${width}px`;
		overlay.style.height = `${height}px`;
		overlay.setAttribute("width", String(width));
		overlay.setAttribute("height", String(height));
		overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);

		for (const shape of projectedShapes) {
			const rangePath = buildMultiPath(
				normalizePolygonsForBounds(shape.rangePolygon, origin),
			);
			const disconnectedRangePaths = shape.disconnectedRangePolygons
				.map((polygon) =>
					buildPath(normalizePointsForBounds(polygon, origin)),
				)
				.filter(Boolean);

			if (rangePath) {
				nextChildren.push(
					createSvgChild("path", {
						d: rangePath,
						fill: shape.nation.color,
						"fill-opacity": "0.18",
						"fill-rule": "evenodd",
						stroke: shape.nation.outlineColor,
						"stroke-linejoin": "round",
						"stroke-width": "2.75",
						"vector-effect": "non-scaling-stroke",
						"data-planning-nation-id": shape.nation.id,
						"data-planning-shape": "range",
					}),
				);
			}
			for (const disconnectedRangePath of disconnectedRangePaths) {
				nextChildren.push(
					createSvgChild("path", {
						d: disconnectedRangePath,
						fill: DISCONNECTED_RANGE_FILL,
						"fill-opacity": "0.22",
						stroke: DISCONNECTED_RANGE_STROKE,
						"stroke-linejoin": "round",
						"stroke-width": "2.75",
						"vector-effect": "non-scaling-stroke",
						"data-planning-nation-id": shape.nation.id,
						"data-planning-shape": "disconnected-range",
					}),
				);
			}
			if (shape.centerMarker?.centerPoint) {
				const localCenter = normalizePointsForBounds(
					[shape.centerMarker.centerPoint],
					origin,
				)[0];
				nextChildren.push(
					createSvgChild("circle", {
						cx: localCenter.x.toFixed(2),
						cy: localCenter.y.toFixed(2),
						r: shape.centerMarker.radiusPx.toFixed(2),
						fill: NATION_CENTER_FILL,
						"fill-opacity": "0.98",
						stroke: NATION_CENTER_STROKE,
						"stroke-width": shape.centerMarker.strokePx.toFixed(2),
						"vector-effect": "non-scaling-stroke",
						"data-planning-nation-id": shape.nation.id,
						"data-planning-shape": "center",
					}),
				);
			}
			for (const townRange of shape.townRangeHighlights ?? []) {
				const townRangePath = buildMultiPath(
					normalizePolygonsForBounds(townRange.polygons, origin),
				);
				if (!townRangePath) continue;
				nextChildren.push(
					createSvgChild("path", {
						d: townRangePath,
						fill: townRange.isDisconnected
							? DISCONNECTED_TOWN_RANGE_HOVER_FILL
							: CONNECTED_TOWN_RANGE_HOVER_FILL,
						"fill-opacity": "0",
						"fill-rule": "evenodd",
						stroke: townRange.isDisconnected
							? DISCONNECTED_TOWN_RANGE_HOVER_STROKE
							: CONNECTED_TOWN_RANGE_HOVER_STROKE,
						"stroke-opacity": "0",
						"stroke-linejoin": "round",
						"stroke-width": "0",
						"vector-effect": "non-scaling-stroke",
						"pointer-events": "none",
						"data-planning-nation-id": shape.nation.id,
						"data-planning-town-id": townRange.town.id,
						"data-planning-shape": "town-range-highlight",
						"data-planning-state": townRange.isDisconnected
							? "disconnected"
							: "connected",
					}),
				);
			}
			for (const townMarker of shape.townMarkers) {
				const localTownCenter = normalizePointsForBounds(
					[townMarker.centerPoint],
					origin,
				)[0];
				if (!localTownCenter) continue;
				nextChildren.push(
					createSvgChild("circle", {
						cx: localTownCenter.x.toFixed(2),
						cy: localTownCenter.y.toFixed(2),
						r: townMarker.radiusPx.toFixed(2),
						fill: townMarker.isDisconnected
							? DISCONNECTED_TOWN_FILL
							: CONNECTED_TOWN_FILL,
						"fill-opacity": "0.96",
						stroke: townMarker.isDisconnected
							? DISCONNECTED_TOWN_STROKE
							: CONNECTED_TOWN_STROKE,
						"stroke-width": markerMetrics.townStrokePx.toFixed(2),
						"data-base-radius": townMarker.radiusPx.toFixed(2),
						"data-base-stroke-width": markerMetrics.townStrokePx.toFixed(2),
						"vector-effect": "non-scaling-stroke",
						"data-planning-nation-id": shape.nation.id,
						"data-planning-town-id": townMarker.town.id,
						"data-planning-shape": "town",
						"data-planning-state": townMarker.isDisconnected
							? "disconnected"
							: "connected",
					}),
				);
			}
			for (const townMarker of shape.townMarkers) {
				const labelBox = getTownLabelBox(
					townMarker.centerPoint,
					townMarker.radiusPx,
					townMarker.labelMetrics,
				);
				if (!labelBox || !townMarker.labelMetrics?.text) continue;
				const localLabelLeft = labelBox.left - origin.x;
				const localLabelTop = labelBox.top - origin.y;
				const localLabelCenterX = labelBox.centerX - origin.x;
				const localLabelCenterY = labelBox.centerY - origin.y;
				nextChildren.push(
					createSvgChild("rect", {
						x: localLabelLeft.toFixed(2),
						y: localLabelTop.toFixed(2),
						width: labelBox.width.toFixed(2),
						height: labelBox.height.toFixed(2),
						rx: "7",
						ry: "7",
						fill: TOWN_LABEL_BG_FILL,
						"fill-opacity": "0.9",
						stroke: TOWN_LABEL_BG_STROKE,
						"stroke-opacity": "0.22",
						"stroke-width": "1",
						"vector-effect": "non-scaling-stroke",
						"pointer-events": "none",
						"data-planning-nation-id": shape.nation.id,
						"data-planning-town-id": townMarker.town.id,
						"data-planning-shape": "town-label-bg",
					}),
				);
				const townLabel = createSvgChild("text", {
					x: localLabelCenterX.toFixed(2),
					y: localLabelCenterY.toFixed(2),
					fill: TOWN_LABEL_TEXT_FILL,
					"font-family": "\"Space Grotesk\", \"Segoe UI\", sans-serif",
					"font-size": String(TOWN_LABEL_FONT_SIZE_PX),
					"font-weight": "800",
					"text-anchor": "middle",
					"dominant-baseline": "middle",
					"pointer-events": "none",
					"data-planning-nation-id": shape.nation.id,
					"data-planning-town-id": townMarker.town.id,
					"data-planning-shape": "town-label",
				});
				townLabel.textContent = townMarker.labelMetrics.text;
				nextChildren.push(townLabel);
			}
		}

		overlay.replaceChildren(...nextChildren);
		updateHoveredTownVisual();
		overlay.hidden = false;
		clearZoomAnimationSync(overlay);
		const primaryMeasurement = measurements.find((measurement) => {
			const renderedDiameter = Math.max(
				Number(measurement?.previewRangeBounds?.width),
				Number(measurement?.previewRangeBounds?.height),
				Number(measurement?.rangeBounds?.width),
				Number(measurement?.rangeBounds?.height),
			);
			const rangeRadiusBlocks = Number(measurement?.rangeRadiusBlocks);
			return Number.isFinite(renderedDiameter)
				&& renderedDiameter > 0
				&& Number.isFinite(rangeRadiusBlocks)
				&& rangeRadiusBlocks > 0;
		});
		const liveBlocksPerPixel = primaryMeasurement
			? (() => {
				const previewDiameter = Math.max(
					Number(primaryMeasurement.previewRangeBounds?.width) || 0,
					Number(primaryMeasurement.previewRangeBounds?.height) || 0,
				);
				const mergedDiameter = Math.max(
					Number(primaryMeasurement.rangeBounds?.width) || 0,
					Number(primaryMeasurement.rangeBounds?.height) || 0,
				);
				const renderedDiameter = previewDiameter > 0
					? previewDiameter
					: Math.max(mergedDiameter, 1);
				return (primaryMeasurement.rangeRadiusBlocks * 2) / renderedDiameter;
			})()
			: null;
		const primaryTownMeasurement = townMeasurements.find((measurement) => {
			const renderedDiameter = Math.max(
				Number(measurement?.rangeBounds?.width),
				Number(measurement?.rangeBounds?.height),
			);
			const rangeRadiusBlocks = Number(measurement?.rangeRadiusBlocks);
			return Number.isFinite(renderedDiameter)
				&& renderedDiameter > 0
				&& Number.isFinite(rangeRadiusBlocks)
				&& rangeRadiusBlocks > 0;
		});
		const liveTownBlocksPerPixel = primaryTownMeasurement
			? (primaryTownMeasurement.rangeRadiusBlocks * 2)
				/ Math.max(
					primaryTownMeasurement.rangeBounds.width,
					primaryTownMeasurement.rangeBounds.height,
					1,
				)
			: null;
		setLiveBlocksPerPixel(liveBlocksPerPixel);
		setLiveTownBlocksPerPixel(liveTownBlocksPerPixel);
		lastRenderState = {
			ok: true,
			reason: null,
			projectionMode,
			nations: measurements,
		};
		lastStableRenderZoom = effectiveZoom;
		setLiveReady(true);
		recordDebug("render-complete", {
			trigger: lastRenderTrigger,
			reason: null,
			map: summarizeMap(map),
			mapContainer: summarizeElementBox(mapContainer),
			overlayHost: summarizeElementBox(overlayHost),
			overlay: summarizeElementBox(overlay),
			projectionMode,
			transform: nativeProjectionAvailable
				? {
					adapterModel: planningLeafletAdapter?.getModel?.() ?? null,
				}
				: {
					centerWorld: transform.centerWorld,
					centerLocal: {
						x: safeNumber(transform.centerLocal?.x, 2),
						y: safeNumber(transform.centerLocal?.y, 2),
					},
					screenPerWorld: {
						xx: safeNumber(transform.screenPerWorld?.xx, 6),
						xz: safeNumber(transform.screenPerWorld?.xz, 6),
						yx: safeNumber(transform.screenPerWorld?.yx, 6),
						yz: safeNumber(transform.screenPerWorld?.yz, 6),
					},
				},
			overallBounds,
			markerMetrics: {
				nationRadiusPx: safeNumber(markerMetrics.nationRadiusPx, 2),
				nationStrokePx: safeNumber(markerMetrics.nationStrokePx, 2),
				townRadiusPx: safeNumber(markerMetrics.townRadiusPx, 2),
				townStrokePx: safeNumber(markerMetrics.townStrokePx, 2),
				zoom: safeNumber(markerMetrics.zoom, 2),
			},
			nations: measurements,
		});
		debugInfo(`${planningLayerPrefix}: rendered live planning overlay`, {
			nationCount: measurements.length,
		});
		return lastRenderState;
	}

	function measureRenderedNation(options = {}) {
		const nationIndex = Number.isFinite(Number(options.nationIndex))
			? Number(options.nationIndex)
			: 0;
		return lastRenderState.nations?.[nationIndex] ?? null;
	}

	function init() {
		if (!listenersAttached) {
			document.addEventListener(PLANNING_STATE_UPDATED_EVENT, () => scheduleRender("planning-state-updated"));
			document.addEventListener(PLANNING_TOWN_HOVER_EVENT, (event) => {
				try {
					const detail =
						typeof event?.detail === "string"
							? JSON.parse(event.detail)
							: event?.detail ?? {};
					hoveredTownId =
						typeof detail?.townId === "string" && detail.townId
							? detail.townId
							: null;
				} catch {
					hoveredTownId = null;
				}
				updateHoveredTownVisual();
			});
			window.addEventListener?.("resize", () => scheduleRender("window-resize"));
			ensureRootObserver();
			listenersAttached = true;
		}

		ensureMapListeners();
		ensurePolling();
		scheduleRender();
		return { ok: true };
	}

		return {
			PLANNING_LIVE_BLOCKS_PER_PIXEL_ATTR,
			PLANNING_LIVE_READY_ATTR: liveReadyAttr,
			init,
			render,
			scheduleRender,
			isLiveReady,
			isDebugEnabled,
			getDebugMode,
			setDebugEnabled,
			setDebugMode,
			clearDebugEvents,
			getDebugEvents: () => [...debugEvents],
			getPanDiagnostics: (label = "manual") => getPanDiagnostics(label),
			getLastPanSnapshot: () => lastPanSnapshot,
			getPanTrace,
			exportPanTrace,
			getLastRenderState: () => lastRenderState,
			getLastInteractionDefer: () => lastInteractionDefer,
			getProjectionSamplingStability: () =>
				getProjectionSamplingStability(getPrimaryLeafletMap(), getMapContainer()),
			getProjectionMode: () => lastRenderState.projectionMode ?? null,
			getListenerStats: () => ({ ...listenerStats }),
			measureRenderedNation,
		};
}

globalThis[PLANNING_LIVE_RENDERER_KEY] = Object.freeze({
	PLANNING_LIVE_READY_ATTR,
	createPlanningLiveRenderer,
});
})();
