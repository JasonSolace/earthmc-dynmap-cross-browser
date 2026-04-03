(() => {
const PLANNING_STATE_KEY = "__EMCDYNMAPPLUS_PLANNING_STATE__";
if (globalThis[PLANNING_STATE_KEY]) return;

function createPlanningState({
	storage = null,
	plannerStorageKey = "emcdynmapplus-planner-nations",
	planningDefaultRangeKey = "emcdynmapplus-planning-default-range",
	defaultPlanningNationRange = 5000,
	defaultPlanningNation = null,
} = {}) {
	const resolvedDefaultPlanningNation = Object.freeze({
		id: "hardcoded-demo-nation",
		name: "Planning Nation",
		color: "#d98936",
		outlineColor: "#fff3cf",
		rangeRadiusBlocks: defaultPlanningNationRange,
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

	function savePlanningNations(nations) {
		writeStorageValue(
			plannerStorageKey,
			JSON.stringify(Array.isArray(nations) ? nations : []),
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
		};
	}

	return {
		plannerStorageKey,
		planningDefaultRangeKey,
		defaultPlanningNationRange,
		defaultPlanningNation: resolvedDefaultPlanningNation,
		normalizePlanningRange,
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
