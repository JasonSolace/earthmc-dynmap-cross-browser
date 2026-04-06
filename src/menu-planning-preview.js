/** Planning preview and projection helpers used by the planning sidebar flow. */

(() => {
	const MENU_PLANNING_PREVIEW_KEY = "EMCDYNMAPPLUS_MENU_PLANNING_PREVIEW";
	if (globalThis[MENU_PLANNING_PREVIEW_KEY]) return;

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
	const planningProjectionFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_PROJECTION__?.createPlanningProjectionAdapter;
	if (typeof planningProjectionFactory !== "function") {
		throw new Error(
			"emcdynmapplus: planning projection helpers were not loaded before menu-planning-preview.js",
		);
	}

	function createMenuPlanningPreview({
		planningUiPrefix = "emcdynmapplus[planning-ui]",
		defaultPlanningNationRange = 5000,
		createElement,
		addElement,
		getStoredCurrentMapMode,
		isPlanningPlacementArmed,
		getHardcodedPlanningNation,
		getPlanningDefaultRange,
		getPlanningPreviewSubject = () => null,
		debugInfo = () => {},
		isDebugLoggingEnabled = () => false,
	} = {}) {
		if (typeof createElement !== "function") {
			throw new Error(
				"emcdynmapplus: planning preview helpers require createElement",
			);
		}
		if (typeof addElement !== "function") {
			throw new Error(
				"emcdynmapplus: planning preview helpers require addElement",
			);
		}
		if (typeof getStoredCurrentMapMode !== "function") {
			throw new Error(
				"emcdynmapplus: planning preview helpers require getStoredCurrentMapMode",
			);
		}
		if (typeof isPlanningPlacementArmed !== "function") {
			throw new Error(
				"emcdynmapplus: planning preview helpers require isPlanningPlacementArmed",
			);
		}
		if (typeof getHardcodedPlanningNation !== "function") {
			throw new Error(
				"emcdynmapplus: planning preview helpers require getHardcodedPlanningNation",
			);
		}
		if (typeof getPlanningDefaultRange !== "function") {
			throw new Error(
				"emcdynmapplus: planning preview helpers require getPlanningDefaultRange",
			);
		}

		let planningCursorPreviewInitialized = false;
		let planningCursorPreviewRefreshFrame = 0;
		let planningCursorPreviewInteractionInitialized = false;
		let planningCursorPreviewRuntimeZoom = null;
		let planningCursorPreviewRuntimeZoomSource = null;
		let planningCursorPreviewLastWheelAt = 0;
		let planningCursorPreviewLastLogSignature = null;
		const planningProjection = planningProjectionFactory({
			pageMapZoomAttr: PLANNING_LEAFLET_ZOOM_ATTR,
			pageMapContainerAttr: PLANNING_LEAFLET_MAP_CONTAINER_ATTR,
			pageTileZoomAttr: PLANNING_TILE_ZOOM_ATTR,
			pageTileUrlAttr: PLANNING_TILE_URL_ATTR,
			pageTileDominantZoomAttr: PLANNING_TILE_DOMINANT_ZOOM_ATTR,
			pageTileSummaryAttr: PLANNING_TILE_SUMMARY_ATTR,
			locationHref: () => window.location.href,
		});

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
						createElement("div", {
							className: "planning-cursor-preview-center",
						}),
						createElement("div", {
							className: "planning-cursor-preview-label",
							id: "planning-cursor-preview-label",
						}),
					],
				),
			);
			return preview;
		}

		const { parseZoomFromTileUrl } = planningProjection;

		function normalizePlanningRange(value) {
			const numericValue = Number(value);
			if (!Number.isFinite(numericValue)) return null;
			return Math.max(0, Math.round(numericValue));
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
			debugInfo(`${planningUiPrefix}: preview runtime zoom updated`, {
				zoomLevel: nextZoom,
				source,
			});
			return nextZoom;
		}

		function getPlanningPreviewInteractionBaseZoom() {
			const zoomInfo = planningProjection.readProjectionSignals({
				runtimeZoom: planningCursorPreviewRuntimeZoom,
				runtimeZoomSource: planningCursorPreviewRuntimeZoomSource,
				includeResolvedZoom: true,
			});
			return clampPlanningPreviewZoom(zoomInfo.zoomLevel);
		}

		function stepPlanningCursorPreviewRuntimeZoom(delta, source) {
			const baseZoom =
				getPlanningPreviewInteractionBaseZoom() ?? PLANNING_PREVIEW_FALLBACK_ZOOM;
			return setPlanningCursorPreviewRuntimeZoom(baseZoom + delta, source);
		}

		function getPlanningProjectionProbe() {
			const { href, ...projectionSignals } = planningProjection.readProjectionSignals({
				runtimeZoom: planningCursorPreviewRuntimeZoom,
				runtimeZoomSource: planningCursorPreviewRuntimeZoomSource,
				includeResolvedZoom: true,
			});
			return projectionSignals;
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
				normalizePlanningRange(rangeBlocks) ?? defaultPlanningNationRange;
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
			if (!isDebugLoggingEnabled()) return;

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

			debugInfo(`${planningUiPrefix}: cursor preview sizing`, details);
		}

		function updatePlanningCursorPreviewVisual() {
			const preview = ensurePlanningCursorPreviewElement();
			const previewSubject =
				getPlanningPreviewSubject() ?? getHardcodedPlanningNation();
			const range =
				normalizePlanningRange(previewSubject?.rangeRadiusBlocks) ??
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
				blocksPerPixel: planningProjection.roundDebugValue(
					scaleInfo.blocksPerPixel,
					6,
				),
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
				effectiveZoomFromTilePaneScale:
					scaleInfo.effectiveZoomFromTilePaneScale,
				effectiveZoomFromTileLayerScale:
					scaleInfo.effectiveZoomFromTileLayerScale,
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
			stepPlanningCursorPreviewRuntimeZoom(
				event.deltaY < 0 ? 1 : -1,
				"wheel",
			);
		}

		function stopPlanningCursorPreviewRefreshLoop() {
			if (!planningCursorPreviewRefreshFrame) return;
			cancelAnimationFrame(planningCursorPreviewRefreshFrame);
			planningCursorPreviewRefreshFrame = 0;
		}

		function refreshPlanningCursorPreviewLoop() {
			if (
				!isPlanningPlacementArmed() ||
				getStoredCurrentMapMode() !== "planning"
			) {
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
			if (getStoredCurrentMapMode() !== "planning") {
				return hidePlanningCursorPreview();
			}

			const target = event.target;
			if (!(target instanceof HTMLElement)) return hidePlanningCursorPreview();
			if (!target.closest(".leaflet-container")) return hidePlanningCursorPreview();
			if (target.closest(".leaflet-control-container")) {
				return hidePlanningCursorPreview();
			}

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
			planningCursorPreviewRuntimeZoom =
				getPlanningPreviewInteractionBaseZoom();
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

		return {
			PLANNING_LEAFLET_ZOOM_ATTR,
			parseZoomFromTileUrl,
			normalizePlanningRange,
			getPlanningPreviewScaleInfo,
			getScaledPreviewDiameterMetrics,
			ensurePlanningCursorPreview,
			updatePlanningCursorPreviewState,
			updatePlanningCursorPreviewVisual,
		};
	}

	globalThis[MENU_PLANNING_PREVIEW_KEY] = Object.freeze({
		createMenuPlanningPreview,
	});
})();
