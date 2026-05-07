(() => {
const PLANNING_HELPERS_KEY = "__EMCDYNMAPPLUS_MARKER_ENGINE_PLANNING__";
if (globalThis[PLANNING_HELPERS_KEY]) return;

function createMarkerEnginePlanning({
	plannerStorageKey = "emcdynmapplus-planner-nations",
	planningLayerPrefix = "emcdynmapplus[planning-layer]",
	defaultPlanningRange = 5000,
	planningCenterRadius = 48,
	planningTownMarkerRadius = 28,
	planningPlacementArmedKey = "emcdynmapplus-planning-placement-armed",
	planningPlaceEvent = "EMCDYNMAPPLUS_PLACE_PLANNING_NATION",
	planningNativePlacementReadyAttr = "data-emcdynmapplus-planning-native-placement-ready",
	pageMapZoomAttr = "data-emcdynmapplus-leaflet-zoom",
	pageMapContainerAttr = "data-emcdynmapplus-leaflet-map-container",
	pageTileZoomAttr = "data-emcdynmapplus-tile-zoom",
	pageTileUrlAttr = "data-emcdynmapplus-tile-url",
	pageTileDominantZoomAttr = "data-emcdynmapplus-tile-dominant-zoom",
	pageTileSummaryAttr = "data-emcdynmapplus-tile-zoom-summary",
	appendDynmapPlusManagedLayer,
	planningLayerDefinition,
	getParsedMarkers = () => [],
	fetchExistingTownCoordinates = async () => null,
	getPrimaryLeafletMap = () => null,
	isPlanningModeActive = () => true,
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
	const planningGeometryFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_GEOMETRY__?.createPlanningGeometry;
	if (typeof planningGeometryFactory !== "function") {
		throw new Error("marker-engine planning helpers require planning geometry helpers");
	}
	const planningLeafletAdapterFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_LEAFLET_ADAPTER__?.createPlanningLeafletAdapter;
	if (typeof planningLeafletAdapterFactory !== "function") {
		throw new Error("marker-engine planning helpers require planning Leaflet adapter helpers");
	}
	const planningLiveRendererFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_LIVE_RENDERER__?.createPlanningLiveRenderer;
	if (typeof planningLiveRendererFactory !== "function") {
		throw new Error("marker-engine planning helpers require planning live renderer helpers");
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
	const polygonClipping = globalThis.polygonClipping ?? null;
	const planningRuntime = planningRuntimeFactory({
		planningRuntimePrefix: planningLayerPrefix,
		loadPlanningNations: () =>
			planningState.loadRenderablePlanningNations({
				parsedMarkers: getParsedMarkers(),
			}),
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
	const currentMapType = globalThis.EMCDYNMAPPLUS_MAP?.getCurrentMapType?.() ?? "aurora";
	const planningLeafletProjection =
		globalThis.EMCDYNMAPPLUS_MAP?.getPlanningLeafletProjection?.(currentMapType) ?? null;
	const planningLeafletAdapter = planningLeafletAdapterFactory({
		mapType: currentMapType,
		projectionModel: planningLeafletProjection,
	});
	const planningGeometry = planningGeometryFactory();
	planningRuntime.init();
	globalThis.EMCDYNMAPPLUS_PAGE_PLANNING_RUNTIME = planningRuntime;
	const planningLiveRenderer = planningLiveRendererFactory({
		planningLayerPrefix,
		planningCenterRadius,
		planningTownMarkerRadius,
		createPlanningCircleVertices,
		createPlanningRangeMultiPolygon:
			polygonClipping?.union ? createPlanningRangeMultiPolygon : null,
		planningLeafletAdapter,
		getPlanningNations: () => planningRuntime.getPlanningNations(),
		getPrimaryLeafletMap,
		isPlanningModeActive,
		debugInfo,
	});
	planningLiveRenderer.init();
	globalThis.EMCDYNMAPPLUS_PAGE_PLANNING_LIVE_RENDERER = planningLiveRenderer;
	initPlanningNativePlacementBridge();
	const disconnectedPlanningFillColor = "#c44f45";
	const disconnectedPlanningOutlineColor = "#ffd2cd";
	const connectedPlanningTownFillColor = "#c9782c";
	const connectedPlanningTownOutlineColor = "#ffe0b4";
	const disconnectedPlanningTownFillColor = "#b53f34";
	const disconnectedPlanningTownOutlineMarkerColor = "#ffd2cd";
	const planningCenterFillColor = "#d98936";
	const planningCenterOutlineColor = "#fff3cf";

	function setPlanningNativePlacementReady(ready) {
		const root = document.documentElement;
		if (!(root instanceof HTMLElement)) return;
		if (ready) root.setAttribute(planningNativePlacementReadyAttr, "true");
		else root.removeAttribute(planningNativePlacementReadyAttr);
	}

	function isPlanningPlacementArmed() {
		try {
			return globalThis.localStorage?.[planningPlacementArmedKey] === "true";
		} catch {
			return false;
		}
	}

	function canUseNativePlanningPlacement() {
		const map = getPrimaryLeafletMap();
		return !!(
			map
			&& planningLeafletAdapter.canProjectWithMap?.(map)
			&& typeof map.containerPointToLatLng === "function"
		);
	}

	function dispatchNativePlanningPlacement(center, source = "native-map-click") {
		if (!center) return false;
		try {
			document.dispatchEvent(
				new CustomEvent(planningPlaceEvent, {
					detail: JSON.stringify({
						source,
						center,
					}),
				}),
			);
			return true;
		} catch (err) {
			debugInfo(`${planningLayerPrefix}: failed to dispatch native planning placement`, {
				error: String(err),
				center,
				source,
			});
			return false;
		}
	}

	function initPlanningNativePlacementBridge() {
		let listenerAttached = false;
		let pollTimer = 0;

		function scheduleReadyStatePoll() {
			pollTimer = globalThis.setTimeout(updateReadyState, 250);
			pollTimer?.unref?.();
		}

		const updateReadyState = () => {
			const ready = canUseNativePlanningPlacement();
			setPlanningNativePlacementReady(ready);
			if (ready) return true;

			scheduleReadyStatePoll();
			return false;
		};

		const handleNativePlacementClick = (event) => {
			if (!isPlanningModeActive()) return;
			if (!isPlanningPlacementArmed()) return;

			const target = event.target;
			if (!(target instanceof HTMLElement)) return;
			if (!target.closest(".leaflet-container")) return;
			if (target.closest(".leaflet-control-container")) return;

			const map = getPrimaryLeafletMap();
			if (!canUseNativePlanningPlacement()) {
				setPlanningNativePlacementReady(false);
				updateReadyState();
				return;
			}

			const container = map.getContainer?.();
			if (!(container instanceof HTMLElement)) return;
			const rect = container.getBoundingClientRect();
			const containerPoint = {
				x: event.clientX - rect.left,
				y: event.clientY - rect.top,
			};

			let latLng = null;
			try {
				latLng = map.containerPointToLatLng?.(containerPoint) ?? null;
			} catch {
				latLng = null;
			}
			if (!latLng) return;

			const center = planningLeafletAdapter.latLngToWorld?.(latLng, {
				round: true,
			});
			if (!center) return;

			dispatchNativePlanningPlacement(center);
		};

		if (!listenerAttached) {
			document.addEventListener("click", handleNativePlacementClick, true);
			listenerAttached = true;
		}

		if (pollTimer) globalThis.clearTimeout(pollTimer);
		updateReadyState();
	}

	function loadPlanningNations() {
		const planningNations = planningRuntime.getPlanningNations();
		debugInfo(`${planningLayerPrefix}: loaded planning nations from storage`, {
			nationCount: planningNations.length,
		});
		return planningNations;
	}

	async function refreshExistingTownCoordinates(source = "existing-town-coordinate-refresh") {
		if (planningState.getPlanningMode?.() !== "existing") return false;
		const selectedNationName = planningState.getSelectedExistingNationName?.();
		if (!selectedNationName) return false;

		const parsedMarkers = Array.isArray(getParsedMarkers()) ? getParsedMarkers() : [];
		const townNames = [
			...new Set(
				parsedMarkers
					.filter(
						(marker) =>
							typeof marker?.nationName === "string" &&
							marker.nationName.toLowerCase() === selectedNationName.toLowerCase() &&
							typeof marker?.townName === "string" &&
							marker.townName.trim(),
					)
					.map((marker) => marker.townName.trim()),
			),
		];
		if (townNames.length === 0) return false;

		let fetchedCoordinates = null;
		try {
			fetchedCoordinates = await fetchExistingTownCoordinates(
				selectedNationName,
				townNames,
			);
		} catch (err) {
			debugInfo(`${planningLayerPrefix}: failed to refresh existing town coordinates`, {
				selectedNationName,
				error: String(err),
			});
			return false;
		}
		if (!fetchedCoordinates || typeof fetchedCoordinates !== "object") {
			return false;
		}

		const mergedCoordinates = planningState.loadExistingTownCoordinates?.() ?? {};
		for (const [townName, coords] of Object.entries(fetchedCoordinates)) {
			const key = planningState.normalizeExistingTownCoordinateKey?.(
				selectedNationName,
				townName,
			);
			if (!key) continue;
			const x = Number(coords?.x);
			const z = Number(coords?.z);
			if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
			mergedCoordinates[key] = {
				x: Math.round(x),
				z: Math.round(z),
			};
		}
		planningState.saveExistingTownCoordinates?.(mergedCoordinates);

		try {
			document.dispatchEvent(
				new CustomEvent("EMCDYNMAPPLUS_PLANNING_STATE_UPDATED", {
					detail: JSON.stringify({ source }),
				}),
			);
		} catch {}
		return true;
	}

	function createPlanningCircleVertices(point, radiusBlocks, segments = 96) {
		return planningGeometry.createPlanningCircleVertices(
			point,
			radiusBlocks,
			segments,
		);
	}

	function createPlanningCircleRing(point, radiusBlocks, segments = 128) {
		const vertices = createPlanningCircleVertices(point, radiusBlocks, segments)
			.map((vertex) => [vertex.x, vertex.z]);
		if (vertices.length === 0) return [];
		return [...vertices, vertices[0]];
	}

	function createPlanningCirclePolygon(point, radiusBlocks, segments = 128) {
		return [[createPlanningCircleRing(point, radiusBlocks, segments)]];
	}

	function convertPlanningMultiPolygonToMarkerPoints(multiPolygon) {
		if (!Array.isArray(multiPolygon)) return [];
		return multiPolygon
			.map((polygon) =>
				Array.isArray(polygon)
					? polygon
						.map((ring) =>
							Array.isArray(ring)
								? ring
									.map((point) => {
										const x = Number(point?.[0]);
										const z = Number(point?.[1]);
										if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
										return {
											x,
											z,
										};
									})
									.filter((point) => point != null)
								: []
						)
						.filter((ring) => ring.length >= 3)
					: []
			)
			.filter((polygon) => polygon.length > 0);
	}

	function createPlanningRangeMultiPolygonFromPoints(variableRanges) {
		if (!Array.isArray(variableRanges) || variableRanges.length === 0) return [];
		if (!polygonClipping?.union) {
			return variableRanges.map((point) => [
				createPlanningCircleVertices(point, point.rangeRadiusBlocks, 128),
			]);
		}

		const shapes = variableRanges.map((point) =>
			createPlanningCirclePolygon(point, point.rangeRadiusBlocks, 128),
		);
		const [firstShape, ...otherShapes] = shapes;
		const merged = otherShapes.reduce(
			(current, shape) => polygonClipping.union(current, shape),
			firstShape,
		);
		return convertPlanningMultiPolygonToMarkerPoints(merged);
	}

	function createPlanningRangeMultiPolygon(nation) {
		const connectivity = planningState.getPlanningTownConnectivity(nation);
		if (!connectivity.nation) return [];

		return createPlanningRangeMultiPolygonFromPoints([
			{
				x: connectivity.nation.center.x,
				z: connectivity.nation.center.z,
				rangeRadiusBlocks: connectivity.nation.rangeRadiusBlocks,
			},
			...connectivity.connectedTowns.map((town) => ({
				x: town.x,
				z: town.z,
				rangeRadiusBlocks: town.rangeRadiusBlocks,
			})),
		]);
	}

	function createPlanningNationMarkers(nation) {
		const connectivity = planningState.getPlanningTownConnectivity(nation);
		if (!connectivity.nation) return [];

		const normalizedNation = connectivity.nation;
		const mergedRangePoints = createPlanningRangeMultiPolygon(normalizedNation);
		const disconnectedRangePoints = createPlanningRangeMultiPolygonFromPoints(
			connectivity.disconnectedTowns.map((town) => ({
				x: town.x,
				z: town.z,
				rangeRadiusBlocks: town.rangeRadiusBlocks,
			})),
		);
		const townMarkers = normalizedNation.towns.map((town) => {
			const isDisconnected = connectivity.disconnectedTownIds.has(town.id);
			return {
				type: "polygon",
				points: [[createPlanningCircleVertices(town, planningTownMarkerRadius)]],
				weight: 2,
				color: isDisconnected
					? disconnectedPlanningTownOutlineMarkerColor
					: connectedPlanningTownOutlineColor,
				opacity: 1,
				fillColor: isDisconnected
					? disconnectedPlanningTownFillColor
					: connectedPlanningTownFillColor,
				fillOpacity: 0.94,
				tooltip: `<div><b>${isDisconnected ? "Disconnected Town" : "Town"}</b></div>`,
				popup: [
					`<div><span style="font-size:120%;"><b>${
						isDisconnected ? "Disconnected Town" : "Town"
					}</b></span><br>`,
					`${normalizedNation.name}<br>`,
					`Status: ${isDisconnected ? "Disconnected" : "Connected"}<br>`,
					`X: ${town.x}<br>`,
					`Z: ${town.z}<br>`,
					`Range: ${town.rangeRadiusBlocks} blocks</div>`,
				].join(""),
			};
		});
		const markers = [{
			type: "polygon",
			points:
				mergedRangePoints.length > 0
					? mergedRangePoints
					: [[
						createPlanningCircleVertices(
							normalizedNation.center,
							normalizedNation.rangeRadiusBlocks,
						),
					]],
			weight: 3,
			color: normalizedNation.outlineColor,
			opacity: 1,
			fillColor: normalizedNation.color,
			fillOpacity: 0.2,
			tooltip: `<div><b>${normalizedNation.name}</b></div>`,
			popup: [
				`<div><span style="font-size:120%;"><b>${normalizedNation.name}</b></span><br>`,
				`Planning overlay<br>`,
				`X: ${normalizedNation.center.x}<br>`,
				`Z: ${normalizedNation.center.z}<br>`,
				`Range: ${normalizedNation.rangeRadiusBlocks} blocks<br>`,
				`Connected towns: ${connectivity.connectedTowns.length}<br>`,
				`Disconnected towns: ${connectivity.disconnectedTowns.length}</div>`,
			].join(""),
		}, {
			type: "polygon",
			points: [[createPlanningCircleVertices(normalizedNation.center, planningCenterRadius)]],
			weight: 3,
			color: planningCenterOutlineColor,
			opacity: 1,
			fillColor: planningCenterFillColor,
			fillOpacity: 0.98,
			tooltip: `<div><b>${normalizedNation.name} Center</b></div>`,
			popup: [
				`<div><span style="font-size:120%;"><b>${normalizedNation.name} Center</b></span><br>`,
				`X: ${normalizedNation.center.x}<br>`,
				`Z: ${normalizedNation.center.z}<br>`,
				`Center marker radius: ${planningCenterRadius} blocks</div>`,
			].join(""),
		}];
		if (disconnectedRangePoints.length > 0) {
			markers.push({
				type: "polygon",
				points: disconnectedRangePoints,
				weight: 3,
				color: disconnectedPlanningOutlineColor,
				opacity: 1,
				fillColor: disconnectedPlanningFillColor,
				fillOpacity: 0.22,
				tooltip: "<div><b>Disconnected Town Coverage</b></div>",
				popup: [
					"<div><span style=\"font-size:120%;\"><b>Disconnected Town Coverage</b></span><br>",
					`${normalizedNation.name}<br>`,
					`Disconnected towns: ${connectivity.disconnectedTowns.length}</div>`,
				].join(""),
			});
		}
		return [...markers, ...townMarkers];
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
		const liveMeasurement = planningLiveRenderer.measureRenderedNation(options);
		if (liveMeasurement?.rangeBounds) {
			const measurementBounds =
				liveMeasurement.previewRangeBounds ?? liveMeasurement.rangeBounds;
			const tileZoom = readNumericRootAttribute(pageTileZoomAttr);
			return {
				ok: true,
				reason: null,
				zoomLevel: Number.isFinite(tileZoom) ? tileZoom : null,
				nation: {
					id: liveMeasurement.id || null,
					name: liveMeasurement.name || null,
					center: liveMeasurement.center || null,
					rangeRadiusBlocks: liveMeasurement.rangeRadiusBlocks,
					outlineColor: null,
				},
				rangeMeasurement: {
					ok: true,
					cssBounds: {
						left: Number(measurementBounds.left.toFixed(2)),
						top: Number(measurementBounds.top.toFixed(2)),
						right: Number(measurementBounds.right.toFixed(2)),
						bottom: Number(measurementBounds.bottom.toFixed(2)),
						width: Number(measurementBounds.width.toFixed(2)),
						height: Number(measurementBounds.height.toFixed(2)),
					},
				},
				renderedDiameterPx: Number(
					Math.max(
						measurementBounds.width,
						measurementBounds.height,
					).toFixed(2),
				),
				blocksPerPixel: Number(
					(
						(liveMeasurement.rangeRadiusBlocks * 2) /
						Math.max(
							measurementBounds.width,
							measurementBounds.height,
							1,
						)
					).toFixed(6),
				),
				cursorPreview: getPlanningCursorPreviewMetrics(),
			};
		}

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
			getLiveRendererState: () => planningLiveRenderer.getLastRenderState?.() ?? null,
			getLiveRendererInteractionDefer: () =>
				planningLiveRenderer.getLastInteractionDefer?.() ?? null,
			getLiveRendererProjectionStability: () =>
				planningLiveRenderer.getProjectionSamplingStability?.() ?? null,
			getLiveRendererProjectionMode: () =>
				planningLiveRenderer.getProjectionMode?.() ?? null,
			getLiveRendererListenerStats: () =>
				planningLiveRenderer.getListenerStats?.() ?? null,
			getLiveRendererDebugEvents: () => planningLiveRenderer.getDebugEvents?.() ?? [],
			getLiveRendererDebugMode: () => planningLiveRenderer.getDebugMode?.() ?? "off",
			getLiveRendererPanDiagnostics: (label = "manual") =>
				planningLiveRenderer.getPanDiagnostics?.(label) ?? null,
			getLastLiveRendererPanSnapshot: () =>
				planningLiveRenderer.getLastPanSnapshot?.() ?? null,
			getLiveRendererPanTrace: (limit = 40) =>
				planningLiveRenderer.getPanTrace?.(limit) ?? [],
			exportLiveRendererPanTrace: (limit = 40) =>
				planningLiveRenderer.exportPanTrace?.(limit) ?? null,
			isLiveRendererDebugEnabled: () => planningLiveRenderer.isDebugEnabled?.() ?? false,
			setLiveRendererDebugEnabled: (enabled) =>
				planningLiveRenderer.setDebugEnabled?.(enabled) ?? false,
			setLiveRendererDebugMode: (mode) =>
				planningLiveRenderer.setDebugMode?.(mode) ?? false,
			clearLiveRendererDebugEvents: () =>
				planningLiveRenderer.clearDebugEvents?.() ?? undefined,
		};
	}

	function addPlanningLayer(data) {
		const planningNations = planningState.loadRenderablePlanningNations({
			parsedMarkers: getParsedMarkers(),
		})
			.map((nation) => planningState.normalizePlanningNation(nation))
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
				townCount: nation.towns?.length ?? 0,
			})),
		});
		return nextData;
	}

	return {
		loadPlanningNations,
		createPlanningCircleVertices,
		createPlanningRangeMultiPolygon,
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
		refreshExistingTownCoordinates,
		isLivePlanningRendererSupported: () => true,
	};
}

globalThis[PLANNING_HELPERS_KEY] = Object.freeze({
	createMarkerEnginePlanning,
});
})();
