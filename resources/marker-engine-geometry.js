(() => {
const GEOMETRY_HELPERS_KEY = "__EMCDYNMAPPLUS_MARKER_ENGINE_GEOMETRY__";
if (globalThis[GEOMETRY_HELPERS_KEY]) return;

function createMarkerEngineGeometry({
	getNationClaimBonus = () => 0,
	chunksPerRes = 12,
	defaultAllianceColours = { fill: "#000000", outline: "#000000" },
} = {}) {
	const roundTo16 = (num) => Math.round(num / 16) * 16;
	const roundToNearest16 = (num) => Math.round(num / 16) * 16;

	function borderEntryToPolylines(line) {
		const segments = [];
		let current = [];
		const length = Math.max(line?.x?.length ?? 0, line?.z?.length ?? 0);

		for (let i = 0; i < length; i++) {
			const rawX = line?.x?.[i];
			const rawZ = line?.z?.[i];
			if (rawX == null || rawZ == null) {
				if (current.length > 1) segments.push(current);
				current = [];
				continue;
			}

			const x = Number(rawX);
			const z = Number(rawZ);
			if (!Number.isFinite(x) || !Number.isFinite(z)) {
				if (current.length > 1) segments.push(current);
				current = [];
				continue;
			}

			current.push({ x, z });
		}

		if (current.length > 1) segments.push(current);
		return segments;
	}

	function hashCode(str) {
		let hexValue = 0x811c9dc5;
		for (let i = 0; i < str.length; i++) {
			hexValue ^= str.charCodeAt(i);
			hexValue += (hexValue << 1) + (hexValue << 4) + (hexValue << 7) + (hexValue << 8) + (hexValue << 24);
		}

		return `#${((hexValue >>> 0) % 16777216).toString(16).padStart(6, "0")}`;
	}

	function calcPolygonArea(vertices) {
		let area = 0;
		for (let i = 0; i < vertices.length; i++) {
			const j = (i + 1) % vertices.length;
			area += roundTo16(vertices[i].x) * roundTo16(vertices[j].z);
			area -= roundTo16(vertices[j].x) * roundTo16(vertices[i].z);
		}

		return (Math.abs(area) / 2) / (16 * 16);
	}

	function pointInPolygon(vertex, polygon) {
		const { x, z } = vertex;
		let inside = false;
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			const xi = polygon[i].x;
			const xj = polygon[j].x;
			const zi = polygon[i].z;
			const zj = polygon[j].z;

			const intersect = ((zi > z) !== (zj > z))
				&& (x < (xj - xi) * (z - zi) / (zj - zi) + xi);
			if (intersect) inside = !inside;
		}

		return inside;
	}

	function calcMarkerArea(marker) {
		if (marker.type !== "polygon") return 0;

		let area = 0;
		const processed = [];
		for (const multiPolygon of marker.points || []) {
			for (let polygon of multiPolygon) {
				if (!polygon || polygon.length < 3) continue;

				polygon = polygon
					.map((vertex) => ({ x: Number(vertex.x), z: Number(vertex.z) }))
					.filter((vertex) => Number.isFinite(vertex.x) && Number.isFinite(vertex.z));
				if (polygon.length < 3) continue;

				const isHole = processed.some((prev) => polygon.every((vertex) => pointInPolygon(vertex, prev)));
				area += isHole ? -calcPolygonArea(polygon) : calcPolygonArea(polygon);
				processed.push(polygon);
			}
		}

		return area;
	}

	function midrange(vertices) {
		let minX = Infinity;
		let maxX = -Infinity;
		let minZ = Infinity;
		let maxZ = -Infinity;

		for (const vertex of vertices) {
			if (vertex.x < minX) minX = vertex.x;
			if (vertex.x > maxX) maxX = vertex.x;
			if (vertex.z < minZ) minZ = vertex.z;
			if (vertex.z > maxZ) maxZ = vertex.z;
		}

		return {
			x: roundToNearest16((minX + maxX) / 2),
			z: roundToNearest16((minZ + maxZ) / 2),
		};
	}

	const makePolyline = (linePoints, weight = 1, colour = "#ffffff") => ({
		type: "polyline",
		points: linePoints,
		weight,
		color: colour,
	});

	function convertOldMarkersStructure(markerset) {
		return Object.entries(markerset.areas)
			.filter(([key]) => !key.includes("_Shop"))
			.map(([_, value]) => ({
				fillColor: value.fillcolor,
				color: value.color,
				popup: value.desc ?? `<div><b>${value.label}</b></div>`,
				weight: value.weight,
				opacity: value.opacity,
				type: "polygon",
				points: value.x.map((x, i) => ({ x, z: value.z[i] })),
			}));
	}

	function checkOverclaimedNationless(claimedChunks, numResidents) {
		const resLimit = numResidents * chunksPerRes;
		const isOverclaimed = claimedChunks > resLimit;
		return {
			isOverclaimed,
			chunksOverclaimed: isOverclaimed ? claimedChunks - resLimit : 0,
			resLimit,
		};
	}

	function checkOverclaimed(claimedChunks, numResidents, numNationResidents) {
		const resLimit = numResidents * chunksPerRes;
		const nationBonus = getNationClaimBonus(numNationResidents);
		const totalClaimLimit = resLimit + nationBonus;
		const isOverclaimed = claimedChunks > totalClaimLimit;
		return {
			isOverclaimed,
			chunksOverclaimed: isOverclaimed ? claimedChunks - totalClaimLimit : 0,
			nationBonus,
			resLimit,
			totalClaimLimit,
		};
	}

	function parseColours(colours) {
		if (!colours) return { ...defaultAllianceColours };
		colours.fill = `#${colours.fill.replaceAll("#", "")}`;
		colours.outline = `#${colours.outline.replaceAll("#", "")}`;
		return colours;
	}

	return {
		borderEntryToPolylines,
		hashCode,
		calcPolygonArea,
		pointInPolygon,
		calcMarkerArea,
		midrange,
		makePolyline,
		convertOldMarkersStructure,
		checkOverclaimedNationless,
		checkOverclaimed,
		parseColours,
	};
}

globalThis[GEOMETRY_HELPERS_KEY] = Object.freeze({
	createMarkerEngineGeometry,
});
})();
