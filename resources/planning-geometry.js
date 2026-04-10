(() => {
const PLANNING_GEOMETRY_KEY = "__EMCDYNMAPPLUS_PLANNING_GEOMETRY__";
if (globalThis[PLANNING_GEOMETRY_KEY]) return;

function createPlanningGeometry({
	createPlanningCircleVertices: providedCreatePlanningCircleVertices = null,
} = {}) {
	function createPlanningCircleVertices(point, radiusBlocks, segments = 96) {
		if (typeof providedCreatePlanningCircleVertices === "function") {
			return providedCreatePlanningCircleVertices(point, radiusBlocks, segments);
		}

		const polygon = [];
		for (let index = 0; index < segments; index += 1) {
			const angle = (Math.PI * 2 * index) / segments;
			polygon.push({
				x: point.x + Math.cos(angle) * radiusBlocks,
				z: point.z + Math.sin(angle) * radiusBlocks,
			});
		}
		return polygon;
	}

	function computeBounds(points) {
		if (!Array.isArray(points) || points.length === 0) return null;

		let minX = Number.POSITIVE_INFINITY;
		let minY = Number.POSITIVE_INFINITY;
		let maxX = Number.NEGATIVE_INFINITY;
		let maxY = Number.NEGATIVE_INFINITY;

		for (const point of points) {
			const x = Number(point?.x);
			const y = Number(point?.y);
			if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
			if (x < minX) minX = x;
			if (y < minY) minY = y;
			if (x > maxX) maxX = x;
			if (y > maxY) maxY = y;
		}

		if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
		return {
			left: minX,
			top: minY,
			right: maxX,
			bottom: maxY,
			width: maxX - minX,
			height: maxY - minY,
		};
	}

	function flattenPolygons(polygons) {
		if (!Array.isArray(polygons)) return [];
		return polygons.flatMap((polygon) =>
			Array.isArray(polygon) ? polygon.flatMap((ring) => ring) : [],
		);
	}

	function projectWorldRing(points, projector) {
		if (!Array.isArray(points) || typeof projector !== "function") return [];
		return points
			.map((point) => projector(point))
			.filter((point) => point != null);
	}

	function projectWorldMultiPolygon(polygons, projector) {
		if (!Array.isArray(polygons) || typeof projector !== "function") return [];
		return polygons
			.map((polygon) =>
				Array.isArray(polygon)
					? polygon
						.map((ring) => projectWorldRing(ring, projector))
						.filter((ring) => ring.length >= 3)
					: [],
			)
			.filter((polygon) => polygon.length > 0);
	}

	function getProjectedCirclePolygons({
		center = null,
		rangeRadiusBlocks = null,
		projector = null,
		segments = 96,
	} = {}) {
		const x = Number(center?.x);
		const z = Number(center?.z);
		const radius = Number(rangeRadiusBlocks);
		if (
			!Number.isFinite(x) ||
			!Number.isFinite(z) ||
			!Number.isFinite(radius) ||
			radius < 0 ||
			typeof projector !== "function"
		) {
			return [];
		}

		return projectWorldMultiPolygon(
			[[
				createPlanningCircleVertices({ x, z }, radius, segments),
			]],
			projector,
		);
	}

	function getProjectedCircleBounds(options = {}) {
		return computeBounds(flattenPolygons(getProjectedCirclePolygons(options)));
	}

	return Object.freeze({
		createPlanningCircleVertices,
		computeBounds,
		flattenPolygons,
		projectWorldRing,
		projectWorldMultiPolygon,
		getProjectedCirclePolygons,
		getProjectedCircleBounds,
	});
}

globalThis[PLANNING_GEOMETRY_KEY] = Object.freeze({
	createPlanningGeometry,
});
})();
