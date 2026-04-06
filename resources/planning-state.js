(() => {
const PLANNING_STATE_KEY = "__EMCDYNMAPPLUS_PLANNING_STATE__";
if (globalThis[PLANNING_STATE_KEY]) return;

function createPlanningState({
	storage = null,
	plannerStorageKey = "emcdynmapplus-planner-nations",
	planningDefaultRangeKey = "emcdynmapplus-planning-default-range",
	defaultPlanningNationRange = 5000,
	defaultPlanningTownRange = 1500,
	defaultPlanningNation = null,
} = {}) {
	const resolvedDefaultPlanningTown = Object.freeze({
		id: "hardcoded-demo-town",
		name: "Town 1",
		rangeRadiusBlocks: defaultPlanningTownRange,
	});
	const resolvedDefaultPlanningNation = Object.freeze({
		id: "hardcoded-demo-nation",
		name: "Planning Nation",
		color: "#d98936",
		outlineColor: "#fff3cf",
		rangeRadiusBlocks: defaultPlanningNationRange,
		towns: [],
		...(defaultPlanningNation && typeof defaultPlanningNation === "object"
			? defaultPlanningNation
			: {}),
	});

	function getStorage() {
		return storage ?? globalThis.localStorage ?? null;
	}

	function readStorageValue(key) {
		const targetStorage = getStorage();
		if (!targetStorage || !key) return null;

		try {
			if (typeof targetStorage.getItem === "function") {
				return targetStorage.getItem(key);
			}
			return targetStorage[key] ?? null;
		} catch {
			return null;
		}
	}

	function writeStorageValue(key, value) {
		const targetStorage = getStorage();
		if (!targetStorage || !key) return false;

		try {
			if (typeof targetStorage.setItem === "function") {
				targetStorage.setItem(key, value);
			} else {
				targetStorage[key] = String(value);
			}
			return true;
		} catch {
			return false;
		}
	}

	function normalizePlanningRange(value) {
		const numericValue = Number(value);
		if (!Number.isFinite(numericValue)) return null;
		return Math.max(0, Math.round(numericValue));
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

	function loadPlanningNations() {
		try {
			const stored = readStorageValue(plannerStorageKey);
			if (!stored) return [];

			const parsed = JSON.parse(stored);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}

	function normalizePlanningTown(town, index = 0) {
		const x = Number(town?.x);
		const z = Number(town?.z);
		const rangeRadiusBlocks = Number(town?.rangeRadiusBlocks);
		if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

		return {
			id:
				typeof town?.id === "string" && town.id
					? town.id
					: `${resolvedDefaultPlanningTown.id}-${index + 1}`,
			name:
				typeof town?.name === "string" && town.name.trim()
					? town.name
					: `Town ${index + 1}`,
			x: Math.round(x),
			z: Math.round(z),
			rangeRadiusBlocks: Number.isFinite(rangeRadiusBlocks)
				? Math.max(0, Math.round(rangeRadiusBlocks))
				: resolvedDefaultPlanningTown.rangeRadiusBlocks,
		};
	}

	function normalizePlanningNation(nation) {
		const x = Number(nation?.center?.x);
		const z = Number(nation?.center?.z);
		const rangeRadiusBlocks = Number(nation?.rangeRadiusBlocks);
		if (!Number.isFinite(x) || !Number.isFinite(z)) return null;

		return {
			id:
				typeof nation?.id === "string" && nation.id
					? nation.id
					: resolvedDefaultPlanningNation.id,
			name:
				typeof nation?.name === "string" && nation.name.trim()
					? nation.name
					: resolvedDefaultPlanningNation.name,
			color:
				typeof nation?.color === "string" && nation.color
					? nation.color
					: resolvedDefaultPlanningNation.color,
			outlineColor:
				typeof nation?.outlineColor === "string" && nation.outlineColor
					? nation.outlineColor
					: resolvedDefaultPlanningNation.outlineColor,
			rangeRadiusBlocks: Number.isFinite(rangeRadiusBlocks)
				? Math.max(0, Math.round(rangeRadiusBlocks))
				: getPlanningDefaultRange(),
			center: {
				x: Math.round(x),
				z: Math.round(z),
			},
			towns: Array.isArray(nation?.towns)
				? nation.towns
					.map((town, index) => normalizePlanningTown(town, index))
					.filter((town) => town != null)
				: [],
		};
	}

	function getPlanningTownConnectivity(nation) {
		const normalizedNation = normalizePlanningNation(nation);
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
			disconnectedTownIds: new Set(
				disconnectedTowns.map((town) => town.id),
			),
		};
	}

	function savePlanningNations(nations) {
		writeStorageValue(
			plannerStorageKey,
			JSON.stringify(
				Array.isArray(nations)
					? nations
						.map((nation) => normalizePlanningNation(nation))
						.filter((nation) => nation != null)
					: [],
			),
		);
	}

	function getPlanningDefaultRange() {
		const savedRange = normalizePlanningRange(
			readStorageValue(planningDefaultRangeKey),
		);
		return savedRange ?? defaultPlanningNationRange;
	}

	function setPlanningDefaultRange(range) {
		const normalizedRange = normalizePlanningRange(range);
		if (normalizedRange == null) return null;
		writeStorageValue(planningDefaultRangeKey, String(normalizedRange));
		return normalizedRange;
	}

	return {
		plannerStorageKey,
		planningDefaultRangeKey,
		defaultPlanningNationRange,
		defaultPlanningTownRange,
		defaultPlanningNation: resolvedDefaultPlanningNation,
		defaultPlanningTown: resolvedDefaultPlanningTown,
		normalizePlanningRange,
		getPlanningDistanceSquared,
		isPlanningPointWithinRange,
		getPlanningTownConnectivity,
		normalizePlanningTown,
		loadPlanningNations,
		savePlanningNations,
		getPlanningDefaultRange,
		setPlanningDefaultRange,
		normalizePlanningNation,
	};
}

globalThis[PLANNING_STATE_KEY] = Object.freeze({
	createPlanningState,
});
})();
