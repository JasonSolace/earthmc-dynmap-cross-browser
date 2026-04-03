(() => {
const PLANNING_PROJECTION_KEY = "__EMCDYNMAPPLUS_PLANNING_PROJECTION__";
if (globalThis[PLANNING_PROJECTION_KEY]) return;

function createPlanningProjectionAdapter({
	pageMapZoomAttr = "data-emcdynmapplus-leaflet-zoom",
	pageMapContainerAttr = "data-emcdynmapplus-leaflet-map-container",
	pageTileZoomAttr = "data-emcdynmapplus-tile-zoom",
	pageTileUrlAttr = "data-emcdynmapplus-tile-url",
	pageTileDominantZoomAttr = "data-emcdynmapplus-tile-dominant-zoom",
	pageTileSummaryAttr = "data-emcdynmapplus-tile-zoom-summary",
	locationHref = () => globalThis.location?.href ?? "",
	coordsSelector = ".leaflet-control-layers.coordinates",
} = {}) {
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
			return Number.isFinite(averageScale) && averageScale > 0
				? averageScale
				: 1;
		} catch {
			return null;
		}
	}

	function roundDebugValue(value, digits = 4) {
		return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
	}

	function readUrlZoom() {
		const href = locationHref();
		const rawValue = new URL(href).searchParams.get("zoom");
		if (rawValue == null || rawValue === "") return null;
		const parsedValue = Number(rawValue);
		return Number.isFinite(parsedValue) ? parsedValue : null;
	}

	function readProjectionSignals({
		runtimeZoom = null,
		runtimeZoomSource = null,
		includeCoordsText = false,
		includeResolvedZoom = false,
	} = {}) {
		const urlZoom = readUrlZoom();
		const leafletZoom = readNumericRootAttribute(pageMapZoomAttr);
		const publishedTileZoom = readNumericRootAttribute(pageTileZoomAttr);
		const dominantTileZoom = readNumericRootAttribute(pageTileDominantZoomAttr);
		const tileSummary = readJsonRootAttribute(pageTileSummaryAttr);
		const publishedTileUrl =
			document.documentElement.getAttribute(pageTileUrlAttr) || null;
		const mapContainer =
			document.documentElement.getAttribute(pageMapContainerAttr) || null;
		const activeTile = document.querySelector(
			".leaflet-tile-pane img.leaflet-tile[src]",
		);
		const tileSrc =
			activeTile instanceof HTMLImageElement
				? activeTile.currentSrc || activeTile.src || ""
				: "";
		const tileImageZoom = parseZoomFromTileUrl(tileSrc);
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
			document.querySelector(".leaflet-overlay-pane canvas.leaflet-zoom-animated"),
		);

		const effectiveZoomFromTilePaneScale =
			dominantTileZoom == null || tilePaneScale == null || tilePaneScale <= 0
				? null
				: dominantTileZoom + Math.log2(tilePaneScale);
		const effectiveZoomFromTileLayerScale =
			dominantTileZoom == null || tileLayerScale == null || tileLayerScale <= 0
				? null
				: dominantTileZoom + Math.log2(tileLayerScale);

		const result = {
			href: locationHref(),
			urlZoom,
			leafletZoom,
			runtimeZoom,
			runtimeZoomSource,
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

		if (includeCoordsText) {
			result.coordsText =
				document.querySelector(coordsSelector)?.textContent?.trim?.() || null;
		}

		if (includeResolvedZoom) {
			const zoomCandidates = [
				{ source: "leaflet", value: leafletZoom },
				{
					source: runtimeZoomSource ?? "runtime",
					value: runtimeZoom,
				},
				{ source: "url", value: urlZoom },
				{ source: "tile-dominant", value: dominantTileZoom },
				{ source: "tile-request", value: publishedTileZoom },
				{ source: "tile-image", value: tileImageZoom },
			];
			const activeZoomCandidate =
				zoomCandidates.find((candidate) => candidate.value != null) ?? null;

			result.zoomLevel = activeZoomCandidate?.value ?? null;
			result.zoomSource = activeZoomCandidate?.source ?? "fallback";
		}

		return result;
	}

	return {
		readNumericRootAttribute,
		readJsonRootAttribute,
		parseZoomFromTileUrl,
		getTransformScale,
		roundDebugValue,
		readProjectionSignals,
	};
}

globalThis[PLANNING_PROJECTION_KEY] = Object.freeze({
	createPlanningProjectionAdapter,
});
})();
