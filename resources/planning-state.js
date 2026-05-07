(() => {
const PLANNING_STATE_KEY = "__EMCDYNMAPPLUS_PLANNING_STATE__";
if (globalThis[PLANNING_STATE_KEY]) return;

function createPlanningState({
	storage = null,
	plannerStorageKey = "emcdynmapplus-planner-nations",
	planningModeStorageKey = "emcdynmapplus-planning-mode",
	existingNationStorageKey = "emcdynmapplus-planning-existing-nation",
	existingPlannedTownsStorageKey = "emcdynmapplus-planning-existing-planned-towns",
	existingTownCoordinatesStorageKey = "emcdynmapplus-planning-existing-town-coordinates-v2",
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

	function removeStorageValue(key) {
		const targetStorage = getStorage();
		if (!targetStorage || !key) return false;

		try {
			if (typeof targetStorage.removeItem === "function") {
				targetStorage.removeItem(key);
			} else {
				delete targetStorage[key];
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
			return Array.isArray(parsed)
				? parsed
					.map((nation) => normalizePlanningNation(nation))
					.filter((nation) => nation != null)
				: [];
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
			rangeRadiusBlocks: resolvedDefaultPlanningTown.rangeRadiusBlocks,
			...(typeof town?.source === "string" && town.source
				? { source: town.source }
				: {}),
			...(town?.isCapital === true ? { isCapital: true } : {}),
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
				? resolvedDefaultPlanningNation.rangeRadiusBlocks
				: getPlanningDefaultRange(),
			center: {
				x: Math.round(x),
				z: Math.round(z),
			},
			...(typeof nation?.source === "string" && nation.source
				? { source: nation.source }
				: {}),
			...(typeof nation?.existingNationName === "string" && nation.existingNationName
				? { existingNationName: nation.existingNationName }
				: {}),
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
		return defaultPlanningNationRange;
	}

	function setPlanningDefaultRange(range) {
		const normalizedRange = normalizePlanningRange(range);
		if (normalizedRange == null) return null;
		writeStorageValue(planningDefaultRangeKey, String(defaultPlanningNationRange));
		return defaultPlanningNationRange;
	}

	function normalizePlanningMode(mode) {
		return mode === "planned" ? "planned" : "existing";
	}

	function getPlanningMode() {
		return normalizePlanningMode(readStorageValue(planningModeStorageKey));
	}

	function saveExistingPlanningTowns(towns) {
		writeStorageValue(
			existingPlannedTownsStorageKey,
			JSON.stringify(
				Array.isArray(towns)
					? towns
						.map((town, index) =>
							normalizePlanningTown(
								{
									...town,
									source: "planned",
								},
								index,
							),
						)
						.filter((town) => town != null)
					: [],
			),
		);
	}

	function loadExistingPlanningTowns() {
		try {
			const stored = readStorageValue(existingPlannedTownsStorageKey);
			if (!stored) return [];

			const parsed = JSON.parse(stored);
			return Array.isArray(parsed)
				? parsed
					.map((town, index) =>
						normalizePlanningTown(
							{
								...town,
								source: "planned",
							},
							index,
						),
					)
					.filter((town) => town != null)
				: [];
		} catch {
			return [];
		}
	}

	function normalizeExistingTownCoordinateKey(nationName, townName) {
		if (typeof nationName !== "string" || typeof townName !== "string") return null;
		const normalizedNation = nationName.trim().toLowerCase();
		const normalizedTown = townName.trim().toLowerCase();
		if (!normalizedNation || !normalizedTown) return null;
		return `${normalizedNation}:${normalizedTown}`;
	}

	function loadExistingTownCoordinates() {
		try {
			const stored = readStorageValue(existingTownCoordinatesStorageKey);
			if (!stored) return {};

			const parsed = JSON.parse(stored);
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
				return {};
			}

			const normalizedEntries = {};
			for (const [key, coords] of Object.entries(parsed)) {
				const x = Number(coords?.x);
				const z = Number(coords?.z);
				if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
				normalizedEntries[String(key).toLowerCase()] = {
					x: Math.round(x),
					z: Math.round(z),
				};
			}
			return normalizedEntries;
		} catch {
			return {};
		}
	}

	function saveExistingTownCoordinates(coordinatesByKey = {}) {
		const normalizedEntries = {};
		if (coordinatesByKey && typeof coordinatesByKey === "object") {
			for (const [key, coords] of Object.entries(coordinatesByKey)) {
				const x = Number(coords?.x);
				const z = Number(coords?.z);
				if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
				normalizedEntries[String(key).toLowerCase()] = {
					x: Math.round(x),
					z: Math.round(z),
				};
			}
		}

		writeStorageValue(
			existingTownCoordinatesStorageKey,
			JSON.stringify(normalizedEntries),
		);
		return normalizedEntries;
	}

	function clearPlanningSessionForMode(nextMode) {
		savePlanningNations([]);
		saveExistingPlanningTowns([]);
		if (nextMode !== "existing") {
			removeStorageValue(existingNationStorageKey);
		}
	}

	function setPlanningMode(mode, options = {}) {
		const nextMode = normalizePlanningMode(mode);
		const previousMode = getPlanningMode();
		const shouldClear = options?.clear !== false && previousMode !== nextMode;
		writeStorageValue(planningModeStorageKey, nextMode);
		if (shouldClear) clearPlanningSessionForMode(nextMode);
		return nextMode;
	}

	function getSelectedExistingNationName() {
		const nationName = readStorageValue(existingNationStorageKey);
		return typeof nationName === "string" && nationName.trim()
			? nationName.trim()
			: null;
	}

	function setSelectedExistingNationName(nationName, options = {}) {
		const normalizedName =
			typeof nationName === "string" && nationName.trim()
				? nationName.trim()
				: null;
		setPlanningMode("existing", { clear: options?.clearMode !== false });
		savePlanningNations([]);
		if (options?.clearPlannedTowns !== false) saveExistingPlanningTowns([]);
		if (!normalizedName) {
			removeStorageValue(existingNationStorageKey);
			return null;
		}
		writeStorageValue(existingNationStorageKey, normalizedName);
		return normalizedName;
	}

	function normalizeParsedPlanningMarker(marker) {
		const nationName =
			typeof marker?.nationName === "string" && marker.nationName.trim()
				? marker.nationName.trim()
				: null;
		const townName =
			typeof marker?.townName === "string" && marker.townName.trim()
				? marker.townName.trim()
				: null;
		const x = Number(marker?.x);
		const z = Number(marker?.z);
		if (!nationName || !townName || !Number.isFinite(x) || !Number.isFinite(z)) {
			return null;
		}

		return {
			nationName,
			townName,
			x: Math.round(x),
			z: Math.round(z),
			isCapital: marker?.isCapital === true,
		};
	}

	function getExistingNationOptions(parsedMarkers = []) {
		const optionsByName = new Map();
		for (const marker of Array.isArray(parsedMarkers) ? parsedMarkers : []) {
			const normalized = normalizeParsedPlanningMarker(marker);
			if (!normalized) continue;

			const option = optionsByName.get(normalized.nationName) ?? {
				name: normalized.nationName,
				townCount: 0,
				hasCapital: false,
				capitalTownName: null,
			};
			option.townCount += 1;
			if (normalized.isCapital) {
				option.hasCapital = true;
				option.capitalTownName = normalized.townName;
			}
			optionsByName.set(normalized.nationName, option);
		}

		return [...optionsByName.values()].sort((a, b) =>
			a.name.localeCompare(b.name),
		);
	}

	function buildExistingPlanningNation(
		parsedMarkers = [],
		nationName = getSelectedExistingNationName(),
		options = {},
	) {
		const selectedNationName =
			typeof nationName === "string" && nationName.trim()
				? nationName.trim()
				: null;
		if (!selectedNationName) return null;

		const markers = (Array.isArray(parsedMarkers) ? parsedMarkers : [])
			.map(normalizeParsedPlanningMarker)
			.filter(
				(marker) =>
					marker != null &&
					marker.nationName.toLowerCase() === selectedNationName.toLowerCase(),
			);
		const capital = markers.find((marker) => marker.isCapital) ?? null;
		if (!capital) return null;
		const townCoordinatesByName =
			options?.townCoordinatesByName &&
			typeof options.townCoordinatesByName === "object"
				? options.townCoordinatesByName
				: loadExistingTownCoordinates();
		const getTownCoordinates = (marker) => {
			const key = normalizeExistingTownCoordinateKey(
				selectedNationName,
				marker.townName,
			);
			const coords = key ? townCoordinatesByName[key] : null;
			const x = Number(coords?.x);
			const z = Number(coords?.z);
			return Number.isFinite(x) && Number.isFinite(z)
				? { x: Math.round(x), z: Math.round(z) }
				: { x: marker.x, z: marker.z };
		};
		const capitalCoords = getTownCoordinates(capital);

		const realTowns = markers
			.map((marker, index) =>
				normalizePlanningTown(
					{
						id: `existing-town:${selectedNationName}:${marker.townName}`,
						name: marker.townName,
						...getTownCoordinates(marker),
						source: "existing",
						isCapital: marker.isCapital,
					},
					index,
				),
			)
			.filter((town) => town != null);
		const plannedTowns = Array.isArray(options?.plannedTowns)
			? options.plannedTowns
			: loadExistingPlanningTowns();

		return normalizePlanningNation({
			id: `existing-nation:${selectedNationName}`,
			name: selectedNationName,
			source: "existing",
			existingNationName: selectedNationName,
			center: {
				x: capitalCoords.x,
				z: capitalCoords.z,
			},
			towns: [
				...realTowns,
				...plannedTowns.map((town) => ({
					...town,
					source: "planned",
				})),
			],
		});
	}

	function loadRenderablePlanningNations({ parsedMarkers = [] } = {}) {
		if (getPlanningMode() !== "existing") return loadPlanningNations();

		const existingNation = buildExistingPlanningNation(
			parsedMarkers,
			getSelectedExistingNationName(),
			{
				plannedTowns: loadExistingPlanningTowns(),
			},
		);
		return existingNation ? [existingNation] : [];
	}

	return {
		plannerStorageKey,
		planningModeStorageKey,
		existingNationStorageKey,
		existingPlannedTownsStorageKey,
		existingTownCoordinatesStorageKey,
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
		getPlanningMode,
		setPlanningMode,
		getSelectedExistingNationName,
		setSelectedExistingNationName,
		loadExistingPlanningTowns,
		saveExistingPlanningTowns,
		normalizeExistingTownCoordinateKey,
		loadExistingTownCoordinates,
		saveExistingTownCoordinates,
		getExistingNationOptions,
		buildExistingPlanningNation,
		loadRenderablePlanningNations,
	};
}

globalThis[PLANNING_STATE_KEY] = Object.freeze({
	createPlanningState,
});
})();
