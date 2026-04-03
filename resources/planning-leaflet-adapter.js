(() => {
const PLANNING_LEAFLET_ADAPTER_KEY = "__EMCDYNMAPPLUS_PLANNING_LEAFLET_ADAPTER__";
if (globalThis[PLANNING_LEAFLET_ADAPTER_KEY]) return;

function createPlanningLeafletAdapter({
	xScale = 8,
	zScale = -8,
	zOffset = -4,
	latLngFactory = (lat, lng) =>
		typeof globalThis.L?.latLng === "function"
			? globalThis.L.latLng(lat, lng)
			: { lat, lng },
} = {}) {
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
