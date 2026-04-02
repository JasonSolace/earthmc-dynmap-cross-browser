(() => {
const PAGE_MAP_HELPERS_KEY = "__EMCDYNMAPPLUS_MARKER_ENGINE_PAGE_MAP__";
if (globalThis[PAGE_MAP_HELPERS_KEY]) return;

function createMarkerEnginePageMap({
	pageMapPrefix = "emcdynmapplus[page-map]",
	debugInfo = () => {},
	pageMapsKey = "__EMCDYNMAPPLUS_LEAFLET_MAPS__",
	pageMapPatchedKey = "__EMCDYNMAPPLUS_LEAFLET_MAP_PATCHED__",
	pageMapRuntimeRegistrationPatchedKey = "__EMCDYNMAPPLUS_PAGE_MAP_RUNTIME_REGISTRATION_PATCHED__",
	pageLayerControlPatchedKey = "__EMCDYNMAPPLUS_PAGE_LAYER_CONTROL_PATCHED__",
	pageMapZoomBoundsPatchedKey = "__EMCDYNMAPPLUS_PAGE_MAP_ZOOM_BOUNDS_PATCHED__",
	pageMapGridLayerPatchedKey = "__EMCDYNMAPPLUS_PAGE_MAP_GRID_LAYER_PATCHED__",
	pageMapListenersKey = "__EMCDYNMAPPLUS_PAGE_MAP_STATE_LISTENERS__",
	pageMapSyntheticUnderzoomKey = "__EMCDYNMAPPLUS_PAGE_MAP_SYNTHETIC_UNDERZOOM__",
	pageMapZoomAttr = "data-emcdynmapplus-leaflet-zoom",
	pageMapContainerAttr = "data-emcdynmapplus-leaflet-map-container",
	dynmapPlusLayerOwner = "dynmapplus",
	dynmapPlusLayerSection = "dynmapplus",
	layerDefinitionById = new Map(),
	layerDefinitionByName = new Map(),
	syntheticUnderzoomConfig = null,
} = {}) {
	const dynmapPlusLayerMetaByLayer = new WeakMap();

	function normalizeSyntheticUnderzoomConfig(config) {
		if (!config || config.enabled === false) return null;

		const minZoom = Number(config.minZoom);
		const minNativeZoom = Number(config.minNativeZoom);
		return {
			enabled: true,
			minZoom: Number.isFinite(minZoom) ? Math.round(minZoom) : -2,
			minNativeZoom: Number.isFinite(minNativeZoom)
				? Math.round(minNativeZoom)
				: 0,
		};
	}

	const normalizedSyntheticUnderzoomConfig =
		normalizeSyntheticUnderzoomConfig(syntheticUnderzoomConfig);

	function getKnownLeafletMaps() {
		const knownMaps = globalThis[pageMapsKey];
		return Array.isArray(knownMaps) ? knownMaps : [];
	}

	function ensureKnownLeafletMaps() {
		if (!Array.isArray(globalThis[pageMapsKey])) globalThis[pageMapsKey] = [];
		return globalThis[pageMapsKey];
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

	function isLeafletGridLayerCandidate(layer) {
		if (!layer || typeof layer !== "object") return false;
		return typeof layer.getTileUrl === "function"
			|| typeof layer.createTile === "function"
			|| layer._tiles != null
			|| layer._tileZoom != null;
	}

	function getLayerNativeMinZoom(layer, fallbackMinNativeZoom = 0) {
		const explicitNativeMinZoom = Number(layer?.options?.minNativeZoom);
		if (Number.isFinite(explicitNativeMinZoom)) {
			return Math.round(explicitNativeMinZoom);
		}

		const declaredMinZoom = Number(layer?.options?.minZoom);
		if (Number.isFinite(declaredMinZoom)) {
			return Math.round(declaredMinZoom);
		}

		return Math.round(fallbackMinNativeZoom);
	}

	function applySyntheticUnderzoomToLayer(
		layer,
		config = normalizedSyntheticUnderzoomConfig,
	) {
		if (!config?.enabled || !isLeafletGridLayerCandidate(layer)) return false;

		if (!layer.options || typeof layer.options !== "object") {
			layer.options = {};
		}

		let changed = false;
		// Keep native tile fetches pinned to the server's lowest real zoom while
		// still allowing the map itself to move into negative synthetic zooms.
		const nativeMinZoom = getLayerNativeMinZoom(layer, config.minNativeZoom);
		if (layer.options.minNativeZoom !== nativeMinZoom) {
			layer.options.minNativeZoom = nativeMinZoom;
			changed = true;
		}
		if (
			!Number.isFinite(Number(layer.options.minZoom))
			|| Number(layer.options.minZoom) > config.minZoom
		) {
			layer.options.minZoom = config.minZoom;
			changed = true;
		}

		if (changed && typeof layer.redraw === "function") {
			try {
				layer.redraw();
			} catch (err) {
				console.warn(`${pageMapPrefix}: failed to redraw underzoomed tile layer`, err);
			}
		}

		return changed;
	}

	function applySyntheticUnderzoomToMap(
		map,
		config = normalizedSyntheticUnderzoomConfig,
	) {
		if (!config?.enabled || !map || typeof map !== "object") return false;

		if (!map.options || typeof map.options !== "object") {
			map.options = {};
		}

		let changed = false;
		// Leaflet still needs the map floor lowered or scroll/zoom controls will
		// clamp before any underzoomed tiles can be rendered.
		if (
			!Number.isFinite(Number(map.options.minZoom))
			|| Number(map.options.minZoom) > config.minZoom
		) {
			map.options.minZoom = config.minZoom;
			changed = true;
		}

		const knownLayers = map._layers ? Object.values(map._layers) : [];
		for (const layer of knownLayers) {
			if (applySyntheticUnderzoomToLayer(layer, config)) changed = true;
		}

		if (map[pageMapSyntheticUnderzoomKey] !== true && typeof map.on === "function") {
			map.on("layeradd", (event) => {
				applySyntheticUnderzoomToLayer(event?.layer, config);
			});
			map[pageMapSyntheticUnderzoomKey] = true;
			changed = true;
		}

		if (changed) {
			try {
				map._updateZoomLevels?.();
				map.fire?.("zoomlevelschange");
			} catch (err) {
				console.warn(`${pageMapPrefix}: failed to refresh map zoom levels after underzoom patch`, err);
			}

			const currentZoom = Number(map.getZoom?.());
			if (
				Number.isFinite(currentZoom)
				&& currentZoom < config.minZoom
				&& typeof map.setZoom === "function"
			) {
				try {
					map.setZoom(config.minZoom);
				} catch (err) {
					console.warn(`${pageMapPrefix}: failed to clamp map zoom after underzoom patch`, err);
				}
			}
		}

		return changed;
	}

	function publishLeafletMapState(map = null) {
		const targetMap = map || getPrimaryLeafletMap();
		if (!targetMap) return;

		const root = document.documentElement;
		if (!root) return;

		try {
			root.setAttribute(pageMapZoomAttr, String(targetMap.getZoom?.() ?? ""));
			const container = targetMap.getContainer?.();
			const containerInfo = [
				container?.id || null,
				container?.className || null,
			]
				.filter(Boolean)
				.join(" | ");
			root.setAttribute(pageMapContainerAttr, containerInfo);
		} catch (err) {
			console.warn(`${pageMapPrefix}: failed to publish Leaflet map state`, err);
		}
	}

	function attachLeafletMapStateListeners(map) {
		if (!map?.on) return;
		if (map[pageMapListenersKey]) return;

		map.on("zoomend moveend resize load", () => publishLeafletMapState(map));
		map[pageMapListenersKey] = true;
	}

	function recordLeafletMap(map, source) {
		if (!map) return map;

		const knownMaps = ensureKnownLeafletMaps();
		if (!knownMaps.includes(map)) {
			knownMaps.push(map);
			applySyntheticUnderzoomToMap(map);
			attachLeafletMapStateListeners(map);
			publishLeafletMapState(map);
			debugInfo(`${pageMapPrefix}: registered Leaflet map`, describeLeafletMap(map, knownMaps.length - 1, source));
		}

		return map;
	}

	function exposeLeafletMapDiagnostics() {
		globalThis.EMCDYNMAPPLUS_PAGE_MAP_DEBUG = {
			getKnownMaps: () => getKnownLeafletMaps().map((map, index) => describeLeafletMap(map, index, "known-map")),
			logKnownMaps: () => {
				const details = getKnownLeafletMaps().map((map, index) => describeLeafletMap(map, index, "known-map"));
				console.info(`${pageMapPrefix}: known map diagnostics`, details);
				return details;
			},
		};
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
		if (!meta || meta.owner !== dynmapPlusLayerOwner || typeof meta.layerId !== "string") return null;

		const definition = layerDefinitionById.get(meta.layerId) || layerDefinitionByName.get(meta.layerName);
		return definition ? getDynmapPlusLayerMeta(definition) : {
			owner: dynmapPlusLayerOwner,
			section: meta.section || dynmapPlusLayerSection,
			layerId: meta.layerId,
			layerName: meta.layerName || meta.layerId,
		};
	}

	function resolveDynmapPlusLayerMeta(name, layer) {
		const explicitMeta = normalizeDynmapPlusLayerMeta(layer?.options?.emcdynmapplusMeta || layer?.emcdynmapplusMeta);
		if (explicitMeta) return explicitMeta;

		const definition =
			layerDefinitionByName.get(name)
			|| layerDefinitionById.get(layer?.options?.id)
			|| layerDefinitionById.get(layer?.id);
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
			layerDefinitionById.get(entry.id)
			|| layerDefinitionByName.get(entry.name);
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
		if (globalThis[pageLayerControlPatchedKey]) return true;
		if (!globalThis.L?.Control?.Layers?.prototype) return false;

		globalThis[pageLayerControlPatchedKey] = true;
		const originalAddLayer = globalThis.L.Control.Layers.prototype._addLayer;
		const originalAddItem = globalThis.L.Control.Layers.prototype._addItem;
		const originalUpdate = globalThis.L.Control.Layers.prototype._update;

		globalThis.L.Control.Layers.prototype._addLayer = function patchedDynmapPlusLayerAdd(layer, name, overlay) {
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

		globalThis.L.Control.Layers.prototype._addItem = function patchedDynmapPlusLayerItem(obj) {
			const label = originalAddItem.call(this, obj);
			const meta = dynmapPlusLayerMetaByLayer.get(obj?.layer) || resolveDynmapPlusLayerMeta(obj?.name, obj?.layer);
			if (meta) applyDynmapPlusLayerMetaToControlLabel(label, meta);
			return label;
		};

		globalThis.L.Control.Layers.prototype._update = function patchedDynmapPlusLayerUpdate(...args) {
			normalizeDynmapPlusLayerRegistrations(this);
			return originalUpdate.call(this, ...args);
		};

		debugInfo(`${pageMapPrefix}: patched Leaflet layer controls`);
		return true;
	}

	function patchLeafletZoomBounds(
		config = normalizedSyntheticUnderzoomConfig,
	) {
		if (!config?.enabled) return true;
		if (globalThis[pageMapZoomBoundsPatchedKey]) return true;
		if (!globalThis.L?.Map?.prototype) return false;

		globalThis[pageMapZoomBoundsPatchedKey] = true;

		const originalGetMinZoom = globalThis.L.Map.prototype.getMinZoom;
		if (typeof originalGetMinZoom === "function") {
			globalThis.L.Map.prototype.getMinZoom = function patchedGetMinZoom(...args) {
				const originalValue = originalGetMinZoom.apply(this, args);
				const numericOriginal = Number(originalValue);
				if (!Number.isFinite(numericOriginal)) return config.minZoom;
				return Math.min(numericOriginal, config.minZoom);
			};
		}

		const originalLimitZoom = globalThis.L.Map.prototype._limitZoom;
		if (typeof originalLimitZoom === "function") {
			globalThis.L.Map.prototype._limitZoom = function patchedLimitZoom(zoom, ...args) {
				const requestedZoom = Number(zoom);
				const originalValue = originalLimitZoom.call(this, zoom, ...args);
				const numericOriginal = Number(originalValue);
				if (!Number.isFinite(requestedZoom)) return numericOriginal;
				if (!Number.isFinite(numericOriginal)) {
					return Math.max(config.minZoom, requestedZoom);
				}
				if (requestedZoom < config.minZoom) return config.minZoom;
				if (requestedZoom < 0 && numericOriginal >= 0) return requestedZoom;
				return numericOriginal;
			};
		}

		debugInfo(`${pageMapPrefix}: patched Leaflet zoom bounds`);
		return true;
	}

	function patchLeafletGridLayerUnderzoom(
		config = normalizedSyntheticUnderzoomConfig,
	) {
		if (!config?.enabled) return true;
		if (globalThis[pageMapGridLayerPatchedKey]) return true;
		if (!globalThis.L?.GridLayer?.prototype) return false;

		globalThis[pageMapGridLayerPatchedKey] = true;

		const originalClampZoom = globalThis.L.GridLayer.prototype._clampZoom;
		if (typeof originalClampZoom === "function") {
			globalThis.L.GridLayer.prototype._clampZoom = function patchedGridLayerClampZoom(zoom, ...args) {
				const requestedZoom = Number(zoom);
				const originalValue = originalClampZoom.call(this, zoom, ...args);
				const nativeMinZoom = getLayerNativeMinZoom(this, config.minNativeZoom);
				const numericOriginal = Number(originalValue);
				if (!Number.isFinite(requestedZoom)) return numericOriginal;
				// Negative map zooms should still resolve to real zoom-0 tiles.
				if (requestedZoom < nativeMinZoom) return nativeMinZoom;
				return numericOriginal;
			};
		}

		debugInfo(`${pageMapPrefix}: patched Leaflet grid layer underzoom`);
		return true;
	}

	function patchLeafletMapCreation() {
		if (globalThis[pageMapPatchedKey]) return true;
		if (!globalThis.L?.Map || typeof globalThis.L.map !== "function") return false;

		globalThis[pageMapPatchedKey] = true;

		try {
			globalThis.L.Map.addInitHook(function addDynmapPlusInitHook() {
				recordLeafletMap(this, "map-init-hook");
			});
		} catch (err) {
			console.warn(`${pageMapPrefix}: failed to add Leaflet init hook`, err);
		}

		const originalLeafletMapFactory = globalThis.L.map;
		globalThis.L.map = function patchedLeafletMapFactory(...args) {
			const createdMap = originalLeafletMapFactory.apply(this, args);
			recordLeafletMap(createdMap, "L.map-factory");
			return createdMap;
		};

		debugInfo(`${pageMapPrefix}: patched Leaflet map creation hooks`);
		return true;
	}

	function patchLeafletMapRuntimeRegistration() {
		if (globalThis[pageMapRuntimeRegistrationPatchedKey]) return true;
		if (!globalThis.L?.Map?.prototype) return false;

		globalThis[pageMapRuntimeRegistrationPatchedKey] = true;
		const methodsToWrap = [
			"setView",
			"setZoom",
			"panTo",
			"flyTo",
			"_resetView",
			"_move",
			"_moveEnd",
		];

		// Some live pages create the Leaflet map before our factory hook lands, so
		// we also register maps lazily the first time runtime methods are invoked.
		for (const methodName of methodsToWrap) {
			const originalMethod = globalThis.L.Map.prototype[methodName];
			if (typeof originalMethod !== "function") continue;
			if (originalMethod.__emcdynmapplusWrapped === true) continue;

			const wrappedMethod = function patchedLeafletMapRuntimeRegistration(...args) {
				recordLeafletMap(this, `prototype:${methodName}`);
				return originalMethod.apply(this, args);
			};
			wrappedMethod.__emcdynmapplusWrapped = true;
			globalThis.L.Map.prototype[methodName] = wrappedMethod;
		}

		debugInfo(`${pageMapPrefix}: patched Leaflet runtime map registration`);
		return true;
	}

	function tryScanWindowForLeafletMaps() {
		if (!globalThis.L?.Map) return [];

		const foundMaps = [];
		for (const [key, value] of Object.entries(globalThis)) {
			try {
				if (!(value instanceof globalThis.L.Map)) continue;
				recordLeafletMap(value, `window.${key}`);
				foundMaps.push(key);
			} catch {}
		}

		if (foundMaps.length > 0) {
			debugInfo(`${pageMapPrefix}: found Leaflet maps on window`, { keys: foundMaps });
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
			const mapRuntimeRegistrationPatched = patchLeafletMapRuntimeRegistration();
			const layerControlPatched = patchLeafletLayerControls();
			const zoomBoundsPatched = patchLeafletZoomBounds();
			const gridLayerPatched = patchLeafletGridLayerUnderzoom();
			if (mapPatched && mapRuntimeRegistrationPatched && layerControlPatched && zoomBoundsPatched && gridLayerPatched) {
				tryScanWindowForLeafletMaps();
				debugInfo(`${pageMapPrefix}: diagnostics ready`, {
					attempts,
					knownMaps: getKnownLeafletMaps().map((map, index) => describeLeafletMap(map, index, "ready")),
				});
				return;
			}

			if (attempts >= maxAttempts) {
				debugInfo(`${pageMapPrefix}: Leaflet diagnostics timed out waiting for Leaflet map/control constructors`);
				return;
			}

			setTimeout(poll, 250);
		};

		poll();
	}

	return {
		getKnownLeafletMaps,
		ensureKnownLeafletMaps,
		describeLeafletMap,
		getPrimaryLeafletMap,
		publishLeafletMapState,
		attachLeafletMapStateListeners,
		recordLeafletMap,
		exposeLeafletMapDiagnostics,
		getDynmapPlusLayerMeta,
		createDynmapPlusManagedLayer,
		normalizeDynmapPlusLayerMeta,
		resolveDynmapPlusLayerMeta,
		applyDynmapPlusLayerMetaToControlLabel,
		isDynmapPlusManagedLayerDataEntry,
		stripDynmapPlusManagedLayers,
		appendDynmapPlusManagedLayer,
		removeExistingDynmapPlusLayerRegistration,
		normalizeDynmapPlusLayerRegistrations,
		normalizeSyntheticUnderzoomConfig,
		isLeafletGridLayerCandidate,
		getLayerNativeMinZoom,
		applySyntheticUnderzoomToLayer,
		applySyntheticUnderzoomToMap,
		patchLeafletZoomBounds,
		patchLeafletGridLayerUnderzoom,
		patchLeafletMapRuntimeRegistration,
		patchLeafletMapCreation,
		tryScanWindowForLeafletMaps,
		patchLeafletLayerControls,
		initLeafletMapDiagnostics,
	};
}

globalThis[PAGE_MAP_HELPERS_KEY] = Object.freeze({
	createMarkerEnginePageMap,
});
})();
