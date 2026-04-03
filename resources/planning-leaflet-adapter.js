(() => {
const PLANNING_LEAFLET_ADAPTER_KEY = "__EMCDYNMAPPLUS_PLANNING_LEAFLET_ADAPTER__";
if (globalThis[PLANNING_LEAFLET_ADAPTER_KEY]) return;

const DEFAULT_PROJECTION_MODEL = Object.freeze({
	xScale: 8,
	zScale: -8,
	zOffset: -4,
});

function resolveProjectionModel({
	mapType = null,
	projectionModel = null,
	getCurrentMapType = () => globalThis.EMCDYNMAPPLUS_MAP?.getCurrentMapType?.() ?? null,
	getPlanningLeafletProjection = (nextMapType) =>
		globalThis.EMCDYNMAPPLUS_MAP?.getPlanningLeafletProjection?.(nextMapType) ?? null,
	getMapConfig = (nextMapType) => globalThis.EMCDYNMAPPLUS_MAP?.getMapConfig?.(nextMapType) ?? null,
} = {}) {
	const currentMapType = mapType || getCurrentMapType?.() || null;
	const mapProjectionModel =
		projectionModel
		?? getPlanningLeafletProjection?.(currentMapType)
		?? getMapConfig?.(currentMapType)?.planningLeafletProjection
		?? DEFAULT_PROJECTION_MODEL;
	const xScale = Number(mapProjectionModel?.xScale);
	const zScale = Number(mapProjectionModel?.zScale);
	const zOffset = Number(mapProjectionModel?.zOffset);
	if (!Number.isFinite(xScale) || !Number.isFinite(zScale) || !Number.isFinite(zOffset)) {
		return DEFAULT_PROJECTION_MODEL;
	}

	return Object.freeze({ xScale, zScale, zOffset });
}

function createPlanningLeafletAdapter({
	mapType = null,
	projectionModel = null,
	getCurrentMapType = () => globalThis.EMCDYNMAPPLUS_MAP?.getCurrentMapType?.() ?? null,
	getPlanningLeafletProjection = (nextMapType) =>
		globalThis.EMCDYNMAPPLUS_MAP?.getPlanningLeafletProjection?.(nextMapType) ?? null,
	getMapConfig = (nextMapType) => globalThis.EMCDYNMAPPLUS_MAP?.getMapConfig?.(nextMapType) ?? null,
	latLngFactory = (lat, lng) =>
		typeof globalThis.L?.latLng === "function"
			? globalThis.L.latLng(lat, lng)
			: { lat, lng },
} = {}) {
	const { xScale, zScale, zOffset } = resolveProjectionModel({
		mapType,
		projectionModel,
		getCurrentMapType,
		getPlanningLeafletProjection,
		getMapConfig,
	});

	function getModel() {
		return {
			xScale,
			zScale,
			zOffset,
		};
	}

	function worldToLatLng(worldPoint) {
		const x = Number(worldPoint?.x);
		const z = Number(worldPoint?.z);
		if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

		const lng = x / xScale;
		const lat = (z - zOffset) / zScale;
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
		return latLngFactory(lat, lng);
	}

	function latLngToWorld(latLng, { round = false } = {}) {
		const lat = Number(latLng?.lat);
		const lng = Number(latLng?.lng);
		if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

		const x = lng * xScale;
		const z = lat * zScale + zOffset;
		if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

		return {
			x: round ? Math.round(x) : x,
			z: round ? Math.round(z) : z,
		};
	}

	function canProjectWithMap(map = null) {
		return !!(
			map &&
			typeof map.latLngToLayerPoint === "function" &&
			typeof map.layerPointToLatLng === "function"
		);
	}

	function projectWorldToLayerPoint(worldPoint, map = null) {
		if (!canProjectWithMap(map)) return null;
		const latLng = worldToLatLng(worldPoint);
		if (!latLng) return null;

		try {
			const layerPoint = map.latLngToLayerPoint(latLng);
			const x = Number(layerPoint?.x);
			const y = Number(layerPoint?.y);
			if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
			return { x, y };
		} catch {
			return null;
		}
	}

	return {
		getModel,
		worldToLatLng,
		latLngToWorld,
		canProjectWithMap,
		projectWorldToLayerPoint,
	};
}

globalThis[PLANNING_LEAFLET_ADAPTER_KEY] = Object.freeze({
	createPlanningLeafletAdapter,
});
})();
