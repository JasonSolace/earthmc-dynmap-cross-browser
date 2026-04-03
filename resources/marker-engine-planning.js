(() => {
const PLANNING_HELPERS_KEY = "__EMCDYNMAPPLUS_MARKER_ENGINE_PLANNING__";
if (globalThis[PLANNING_HELPERS_KEY]) return;

function createMarkerEnginePlanning({
	plannerStorageKey = "emcdynmapplus-planner-nations",
	planningLayerPrefix = "emcdynmapplus[planning-layer]",
	defaultPlanningRange = 5000,
	planningCenterRadius = 48,
	pageMapZoomAttr = "data-emcdynmapplus-leaflet-zoom",
	pageMapContainerAttr = "data-emcdynmapplus-leaflet-map-container",
	pageTileZoomAttr = "data-emcdynmapplus-tile-zoom",
	pageTileUrlAttr = "data-emcdynmapplus-tile-url",
	pageTileDominantZoomAttr = "data-emcdynmapplus-tile-dominant-zoom",
	pageTileSummaryAttr = "data-emcdynmapplus-tile-zoom-summary",
	appendDynmapPlusManagedLayer,
	planningLayerDefinition,
	debugInfo = () => {},
} = {}) {
	if (typeof appendDynmapPlusManagedLayer !== "function") {
		throw new Error("marker-engine planning helpers require appendDynmapPlusManagedLayer");
	}
	if (!planningLayerDefinition) {
		throw new Error("marker-engine planning helpers require a planning layer definition");
	}
	const planningRuntimeFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_RUNTIME__?.createPlanningRuntime;
	if (typeof planningRuntimeFactory !== "function") {
		throw new Error("marker-engine planning helpers require planning runtime helpers");
	}
	const planningProjectionFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_PROJECTION__?.createPlanningProjectionAdapter;
	if (typeof planningProjectionFactory !== "function") {
		throw new Error("marker-engine planning helpers require planning projection helpers");
	}
	const planningStateFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_STATE__?.createPlanningState;
	if (typeof planningStateFactory !== "function") {
		throw new Error("marker-engine planning helpers require planning state helpers");
	}
	const planningState = planningStateFactory({
		plannerStorageKey,
		defaultPlanningNationRange: defaultPlanningRange,
	});
	const planningRuntime = planningRuntimeFactory({
		planningRuntimePrefix: planningLayerPrefix,
		loadPlanningNations: () => planningState.loadPlanningNations(),
		debugInfo,
	});
	const planningProjection = planningProjectionFactory({
		pageMapZoomAttr,
		pageMapContainerAttr,
		pageTileZoomAttr,
		pageTileUrlAttr,
		pageTileDominantZoomAttr,
		pageTileSummaryAttr,
		locationHref: () => globalThis.location.href,
	});
	planningRuntime.init();
	globalThis.EMCDYNMAPPLUS_PAGE_PLANNING_RUNTIME = planningRuntime;

	function loadPlanningNations() {
		const planningNations = planningRuntime.getPlanningNations();
		debugInfo(`${planningLayerPrefix}: loaded planning nations from storage`, {
			nationCount: planningNations.length,
		});
		return planningNations;
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
			points: [[createPlanningCircleVertices(nation.center, planningCenterRadius)]],
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
				`Center marker radius: ${planningCenterRadius} blocks</div>`,
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

	const {
		readNumericRootAttribute,
		readJsonRootAttribute,
		parseZoomFromTileUrl,
		getTransformScale,
		roundDebugValue,
	} = planningProjection;

	function getPlanningProjectionSignals() {
		const {
			href,
			urlZoom,
			leafletZoom,
			publishedTileZoom,
			dominantTileZoom,
			tileImageZoom,
			publishedTileUrl,
			tileSrc,
			tileSummary,
			mapContainer,
			coordsText,
			tilePaneScale,
			tileLayerScale,
			mapPaneScale,
			overlayCanvasScale,
			effectiveZoomFromTilePaneScale,
			effectiveZoomFromTileLayerScale,
		} = planningProjection.readProjectionSignals({
			includeCoordsText: true,
		});

		return {
			href,
			urlZoom,
			leafletZoom,
			publishedTileZoom,
			dominantTileZoom,
			tileImageZoom,
			publishedTileUrl,
			tileSrc,
			tileSummary,
			mapContainer,
			coordsText,
			tilePaneScale,
			tileLayerScale,
			mapPaneScale,
			overlayCanvasScale,
			effectiveZoomFromTilePaneScale,
			effectiveZoomFromTileLayerScale,
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
		const tileZoomRaw = document.documentElement.getAttribute(pageTileZoomAttr);
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
		globalThis.EMCDYNMAPPLUS_PAGE_PLANNING_DEBUG = {
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
					rangeRadiusBlocks: Number.isFinite(rangeRadiusBlocks) ? Math.max(0, Math.round(rangeRadiusBlocks)) : defaultPlanningRange,
				};
			})
			.filter((nation) => nation != null);
		if (planningNations.length === 0) {
			debugInfo(`${planningLayerPrefix}: no planning nations found for overlay injection`);
			return data;
		}

		const nextData = appendDynmapPlusManagedLayer(data, planningLayerDefinition, {
			order: 1001,
			hide: false,
			control: true,
			markers: planningNations.flatMap(createPlanningNationMarkers),
		});

		debugInfo(`${planningLayerPrefix}: appended planning layer`, {
			nationCount: planningNations.length,
			nations: planningNations.map((nation) => ({
				name: nation.name,
				center: nation.center,
				rangeRadiusBlocks: nation.rangeRadiusBlocks,
			})),
		});
		return nextData;
	}

	return {
		loadPlanningNations,
		createPlanningCircleVertices,
		createPlanningNationMarkers,
		hexToRgb,
		measureCanvasColorBounds,
		getPlanningCursorPreviewMetrics,
		readNumericRootAttribute,
		readJsonRootAttribute,
		parseZoomFromTileUrl,
		getTransformScale,
		roundDebugValue,
		getPlanningProjectionSignals,
		getPlanningRenderMeasurements,
		exposePlanningDebugHelpers,
		addPlanningLayer,
	};
}

globalThis[PLANNING_HELPERS_KEY] = Object.freeze({
	createMarkerEnginePlanning,
});
})();
