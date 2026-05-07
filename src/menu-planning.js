/** Planning-specific menu helpers shared by the sidebar and planning preview UI. */

(() => {
	const MENU_PLANNING_KEY = "EMCDYNMAPPLUS_MENU_PLANNING";
	if (globalThis[MENU_PLANNING_KEY]) return;

	const PLANNING_PLACEMENT_ARMED_KEY = "emcdynmapplus-planning-placement-armed";
	const PLANNING_PLACEMENT_MODE_KEY = "emcdynmapplus-planning-placement-mode";
	const PLANNING_DEBUG_STATE_KEY = "emcdynmapplus-planning-debug-state";
	const PLANNING_UI_PREFIX = "emcdynmapplus[planning-ui]";
	const PLANNING_PLACE_EVENT = "EMCDYNMAPPLUS_PLACE_PLANNING_NATION";
	const PARSED_MARKERS_EVENT = "EMCDYNMAPPLUS_SYNC_PARSED_MARKERS";
	const PLANNING_LIVE_READY_ATTR = "data-emcdynmapplus-planning-live-ready";
	const PLANNING_NATIVE_PLACEMENT_READY_ATTR =
		"data-emcdynmapplus-planning-native-placement-ready";

	let planningPlacementClickInitialized = false;
	let planningTownPlacementTargetId = null;

	function isPlanningDebugLoggingEnabled() {
		try {
			return localStorage["emcdynmapplus-debug"] === "true";
		} catch {
			return false;
		}
	}

	const planningDebugInfo = (...args) => {
		if (isPlanningDebugLoggingEnabled()) console.info(...args);
	};

	const menuPlanningPreviewFactory =
		globalThis.EMCDYNMAPPLUS_MENU_PLANNING_PREVIEW?.createMenuPlanningPreview;
	if (typeof menuPlanningPreviewFactory !== "function") {
		throw new Error(
			"emcdynmapplus: menu planning preview helpers were not loaded before menu-planning.js",
		);
	}
	const planningRuntimeHelpers = globalThis.__EMCDYNMAPPLUS_PLANNING_RUNTIME__;
	if (
		!planningRuntimeHelpers ||
		typeof planningRuntimeHelpers.dispatchPlanningStateUpdated !== "function"
	) {
		throw new Error(
			"emcdynmapplus: planning runtime helpers were not loaded before menu-planning.js",
		);
	}
	const planningStateFactory =
		globalThis.__EMCDYNMAPPLUS_PLANNING_STATE__?.createPlanningState;
	if (typeof planningStateFactory !== "function") {
		throw new Error(
			"emcdynmapplus: planning state helpers were not loaded before menu-planning.js",
		);
	}
	const planningState = planningStateFactory();
	const {
		defaultPlanningNationRange: DEFAULT_PLANNING_NATION_RANGE,
		defaultPlanningTownRange: DEFAULT_PLANNING_TOWN_RANGE,
		defaultPlanningNation: DEFAULT_PLANNING_NATION,
		loadPlanningNations,
		savePlanningNations,
		getPlanningDefaultRange,
		setPlanningDefaultRange: savePlanningDefaultRange,
		getPlanningTownConnectivity,
		isPlanningPointWithinRange,
		normalizePlanningNation,
		normalizePlanningTown,
		getPlanningMode,
		setPlanningMode: savePlanningMode,
		getSelectedExistingNationName,
		setSelectedExistingNationName: saveSelectedExistingNationName,
		loadExistingPlanningTowns,
		saveExistingPlanningTowns,
		normalizeExistingTownCoordinateKey,
		loadExistingTownCoordinates,
		saveExistingTownCoordinates,
		getExistingNationOptions,
		loadRenderablePlanningNations,
	} = planningState;
	const PLANNING_STATE_UPDATED_EVENT =
		planningRuntimeHelpers.PLANNING_STATE_UPDATED_EVENT;
	const PLANNING_TOWN_HOVER_EVENT =
		planningRuntimeHelpers.PLANNING_TOWN_HOVER_EVENT;

	function getParsedMarkersForPlanning() {
		try {
			if (typeof parsedMarkers !== "undefined" && Array.isArray(parsedMarkers)) {
				return parsedMarkers;
			}
		} catch {}

		return [];
	}

	async function refreshExistingTownCoordinatesForSelected() {
		const selectedNationName = getSelectedExistingNationName();
		if (!selectedNationName) return false;
		if (typeof postJSON !== "function" || typeof getCurrentOapiUrl !== "function") {
			return false;
		}

		const townNames = [
			...new Set(
				getParsedMarkersForPlanning()
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

		try {
			const towns = await postJSON(getCurrentOapiUrl("towns"), {
				query: townNames,
				template: { name: true, coordinates: true },
			});
			if (!Array.isArray(towns)) return false;

			const mergedCoordinates = loadExistingTownCoordinates();
			let didUpdate = false;
			for (const [index, town] of towns.entries()) {
				const townName =
					typeof town?.name === "string" && town.name.trim()
						? town.name.trim()
						: townNames[index] ?? "";
				const key = normalizeExistingTownCoordinateKey(
					selectedNationName,
					townName,
				);
				const homeBlock = Array.isArray(town?.coordinates?.homeBlock)
					? town.coordinates.homeBlock
					: null;
				const spawn = town?.coordinates?.spawn ?? null;
				const homeBlockX = Number(homeBlock?.[0]);
				const homeBlockZ = Number(homeBlock?.[1]);
				const x = Number.isFinite(homeBlockX)
					? homeBlockX * 16 + 8
					: Number(spawn?.x);
				const z = Number.isFinite(homeBlockZ)
					? homeBlockZ * 16 + 8
					: Number(spawn?.z);
				if (!key || !Number.isFinite(x) || !Number.isFinite(z)) continue;
				mergedCoordinates[key] = {
					x: Math.round(x),
					z: Math.round(z),
				};
				didUpdate = true;
			}
			if (!didUpdate) return false;

			saveExistingTownCoordinates(mergedCoordinates);
			notifyPlanningStateUpdated("existing-town-coordinates-updated", {
				nationName: selectedNationName,
			});
			return true;
		} catch (err) {
			planningDebugInfo(`${PLANNING_UI_PREFIX}: failed to load town coordinates`, {
				nationName: selectedNationName,
				error: String(err),
			});
			return false;
		}
	}

	function notifyPlanningStateUpdated(source, detail = {}) {
		planningRuntimeHelpers.dispatchPlanningStateUpdated({
			source,
			...detail,
		});
	}

	function notifyPlanningTownHover(townId = null, trigger = "unknown") {
		planningRuntimeHelpers.dispatchPlanningTownHover?.({
			townId: typeof townId === "string" && townId ? townId : null,
			trigger,
		});
	}

	function clearPlanningPlacementAlert() {
		if (typeof globalThis.dismissAlert === "function") {
			globalThis.dismissAlert();
			return;
		}

		document.querySelector("#alert")?.remove();
	}

	function usePlanningLiveUpdates() {
		return (
			document.documentElement?.getAttribute?.(PLANNING_LIVE_READY_ATTR) ===
			"true"
		);
	}

	function setPlanningDebugState(action, details = {}) {
		try {
			localStorage[PLANNING_DEBUG_STATE_KEY] = JSON.stringify({
				action,
				details,
				at: new Date().toISOString(),
			});
		} catch {}

		planningDebugInfo(`${PLANNING_UI_PREFIX}: ${action}`, details);
	}

	function createPlanningEntityId(prefix = "planning") {
		if (
			typeof crypto !== "undefined" &&
			typeof crypto.randomUUID === "function"
		) {
			return `${prefix}-${crypto.randomUUID()}`;
		}

		return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
	}

	function getPlanningPlacementMode() {
		const storedMode = localStorage[PLANNING_PLACEMENT_MODE_KEY];
		return storedMode === "nation-center" || storedMode === "town"
			? storedMode
			: "none";
	}

	function isPlanningPlacementArmed() {
		return getPlanningPlacementMode() !== "none";
	}

	function getPlannedNation() {
		return loadPlanningNations()
			.map(normalizePlanningNation)
			.find((nation) => nation != null) ?? null;
	}

	function getHardcodedPlanningNation() {
		return (
			loadRenderablePlanningNations({
				parsedMarkers: getParsedMarkersForPlanning(),
			})[0] ?? null
		);
	}

	function getEditablePlannedTowns() {
		if (getPlanningMode() === "existing") return loadExistingPlanningTowns();
		return getPlannedNation()?.towns ?? [];
	}

	function getPlanningTownPlacementTarget() {
		if (!planningTownPlacementTargetId) return null;
		return (
			getEditablePlannedTowns().find(
				(town) => town.id === planningTownPlacementTargetId,
			) ?? null
		);
	}

	const {
		PLANNING_LEAFLET_ZOOM_ATTR,
		parseZoomFromTileUrl,
		normalizePlanningRange,
		getPlanningPreviewScaleInfo,
		getScaledPreviewDiameterMetrics,
		getPlanningCursorPreviewDebugInfo,
		ensurePlanningCursorPreview,
		updatePlanningCursorPreviewState,
		updatePlanningCursorPreviewVisual,
	} = menuPlanningPreviewFactory({
		planningUiPrefix: PLANNING_UI_PREFIX,
		defaultPlanningNationRange: DEFAULT_PLANNING_NATION_RANGE,
		createElement: (...args) => globalThis.createElement(...args),
		addElement: (...args) => globalThis.addElement(...args),
		getStoredCurrentMapMode: () => globalThis.getStoredCurrentMapMode(),
		isPlanningPlacementArmed,
		getHardcodedPlanningNation,
		getPlanningDefaultRange,
		getPlanningPreviewSubject: () => {
			if (getPlanningPlacementMode() === "town") {
				const placementTarget = getPlanningTownPlacementTarget();
				return {
					kind: "town",
					rangeRadiusBlocks: DEFAULT_PLANNING_TOWN_RANGE,
					label: placementTarget ? "Reposition Town" : "Add Planned Town",
				};
			}

			if (getPlanningPlacementMode() === "nation-center") {
				return {
					kind: "nation",
					rangeRadiusBlocks: DEFAULT_PLANNING_NATION_RANGE,
					label: "Planning Nation",
				};
			}

			return getHardcodedPlanningNation();
		},
		debugInfo: planningDebugInfo,
		isDebugLoggingEnabled: isPlanningDebugLoggingEnabled,
	});

	function setPlanningPlacementMode(mode = "none", options = {}) {
		const normalizedMode =
			mode === "nation-center" || mode === "town" ? mode : "none";
		const armed = normalizedMode !== "none";
		if (normalizedMode === "town") {
			planningTownPlacementTargetId =
				typeof options?.townId === "string" && options.townId
					? options.townId
					: null;
		} else {
			planningTownPlacementTargetId = null;
		}
		localStorage[PLANNING_PLACEMENT_MODE_KEY] = normalizedMode;
		localStorage[PLANNING_PLACEMENT_ARMED_KEY] = String(armed);
		setPlanningDebugState("placement armed state updated", {
			armed,
			mode: normalizedMode,
			townId: planningTownPlacementTargetId,
		});
		updatePlanningCursorPreviewState();
	}

	function setPlanningPlacementArmed(armed) {
		setPlanningPlacementMode(armed ? "nation-center" : "none");
	}

	function getPlanningMapWorld() {
		const world = new URL(window.location.href).searchParams.get("world");
		return world && world.trim().length > 0 ? world : "minecraft_overworld";
	}

	function reloadPlanningMapAt(coords, zoom = 0) {
		const x = Number(coords?.x);
		const z = Number(coords?.z);
		if (!Number.isFinite(x) || !Number.isFinite(z)) return location.reload();

		const nextUrl = new URL(window.location.href);
		nextUrl.searchParams.set("world", getPlanningMapWorld());
		nextUrl.searchParams.set("zoom", String(Math.max(0, Math.round(zoom))));
		nextUrl.searchParams.set("x", String(Math.round(x)));
		nextUrl.searchParams.set("z", String(Math.round(z)));
		location.href = nextUrl.toString();
	}

	function setPlanningDefaultRange(
		range,
		source = "unknown",
		notifyRuntime = true,
	) {
		const storedRange = savePlanningDefaultRange(range);
		setPlanningDebugState("ignored planning range update because ranges are fixed", {
			source,
			rangeRadiusBlocks: storedRange ?? DEFAULT_PLANNING_NATION_RANGE,
		});
		if (notifyRuntime) {
			notifyPlanningStateUpdated("planning-fixed-range-confirmed", {
				rangeRadiusBlocks: storedRange ?? DEFAULT_PLANNING_NATION_RANGE,
				trigger: source,
			});
		}
		updatePlanningCursorPreviewVisual();
		return storedRange;
	}

	function canPlacePlanningTown(center, nation, options = {}) {
		const excludedTownId =
			typeof options?.excludedTownId === "string"
				? options.excludedTownId
				: null;
		const scopedNation =
			excludedTownId == null
				? nation
				: {
						...nation,
						towns: (nation?.towns ?? []).filter(
							(town) => town.id !== excludedTownId,
						),
					};
		const connectivity = getPlanningTownConnectivity(scopedNation);
		return connectivity.connectedAnchors.some((anchor) =>
			isPlanningPointWithinRange(center, anchor),
		);
	}

	function buildPlanningNation(center) {
		return {
			...DEFAULT_PLANNING_NATION,
			rangeRadiusBlocks: DEFAULT_PLANNING_NATION_RANGE,
			center: {
				x: Math.round(center.x),
				z: Math.round(center.z),
			},
			towns: [],
		};
	}

	function buildPlanningTown(center) {
		return normalizePlanningTown({
			id: createPlanningEntityId("planning-town"),
			x: Math.round(center.x),
			z: Math.round(center.z),
			rangeRadiusBlocks: DEFAULT_PLANNING_TOWN_RANGE,
		});
	}

	function saveSinglePlanningNation(nextNation, source = "unknown") {
		const normalizedNation = normalizePlanningNation(nextNation);
		if (!normalizedNation) return null;

		savePlanningNations([normalizedNation]);
		setPlanningDebugState("stored planning nation", {
			source,
			center: normalizedNation.center,
			rangeRadiusBlocks: normalizedNation.rangeRadiusBlocks,
			townCount: normalizedNation.towns.length,
		});
		notifyPlanningStateUpdated("planning-nations-updated", {
			center: normalizedNation.center,
			rangeRadiusBlocks: normalizedNation.rangeRadiusBlocks,
			towns: normalizedNation.towns,
			trigger: source,
		});
		return normalizedNation;
	}

	function parsePlanningCoords(text) {
		if (typeof text !== "string" || text.trim().length === 0) return null;

		const normalized = text.replaceAll(",", " ");
		const xMatch = normalized.match(/(?:^|\b)x\b[^-\d]*(-?\d+(?:\.\d+)?)/i);
		const zMatch = normalized.match(/(?:^|\b)z\b[^-\d]*(-?\d+(?:\.\d+)?)/i);
		if (xMatch?.[1] && zMatch?.[1]) {
			return {
				x: Math.round(Number(xMatch[1])),
				z: Math.round(Number(zMatch[1])),
			};
		}

		const numericMatches = [...normalized.matchAll(/-?\d+(?:\.\d+)?/g)]
			.map((match) => Number(match[0]))
			.filter((value) => Number.isFinite(value));
		if (numericMatches.length < 2) return null;

		return {
			x: Math.round(numericMatches[0]),
			z: Math.round(numericMatches[numericMatches.length - 1]),
		};
	}

	function getPlanningCoordsText() {
		return (
			document
				.querySelector(".leaflet-control-layers.coordinates")
				?.textContent?.trim() ?? ""
		);
	}

	function clearPlanningForCurrentMode(source = "unknown") {
		const activeNation = getHardcodedPlanningNation();
		setPlanningPlacementMode("none");
		if (getPlanningMode() === "existing") {
			saveSelectedExistingNationName(null, { clearMode: false });
		} else {
			savePlanningNations([]);
		}
		setPlanningDebugState("cleared planning session", {
			source,
			mode: getPlanningMode(),
		});
		notifyPlanningStateUpdated("planning-session-cleared", {
			center: activeNation?.center ?? null,
			trigger: source,
		});
		if (!usePlanningLiveUpdates()) {
			reloadPlanningMapAt(
				activeNation?.center ?? parsePlanningCoords(getPlanningCoordsText()),
			);
		}
	}

	function removeHardcodedPlanningNation() {
		clearPlanningForCurrentMode("planning-clear-button");
	}

	function storePlanningNation(center, source = "unknown") {
		savePlanningMode("planned", { clear: false });
		const existingNation = getPlannedNation();
		const nation = existingNation
			? {
					...existingNation,
					center: {
						x: Math.round(center.x),
						z: Math.round(center.z),
					},
				}
			: buildPlanningNation(center);
		return saveSinglePlanningNation(nation, source);
	}

	function saveExistingPlannedTownSet(towns, source = "unknown") {
		saveExistingPlanningTowns(towns);
		const activeNation = getHardcodedPlanningNation();
		setPlanningDebugState("stored existing-nation planned towns", {
			source,
			selectedNation: getSelectedExistingNationName(),
			plannedTownCount: towns.length,
		});
		notifyPlanningStateUpdated("planning-existing-towns-updated", {
			trigger: source,
			selectedNation: getSelectedExistingNationName(),
			plannedTownCount: towns.length,
		});
		return activeNation;
	}

	function storePlanningTown(center, source = "unknown") {
		const activeNation = getHardcodedPlanningNation();
		if (!activeNation) return null;
		const placementTarget = getPlanningTownPlacementTarget();
		if (
			!canPlacePlanningTown(center, activeNation, {
				excludedTownId: placementTarget?.id ?? null,
			})
		) {
			showAlert(
				"Town centers must be placed within the nation range or a connected town range.",
				5,
			);
			return null;
		}

		const town = placementTarget
			? normalizePlanningTown({
					...placementTarget,
					x: Math.round(center.x),
					z: Math.round(center.z),
					...(getPlanningMode() === "existing"
						? { source: "planned" }
						: {}),
				})
			: buildPlanningTown(center);
		if (!town) return null;

		setPlanningPlacementMode("none");

		if (getPlanningMode() === "existing") {
			const existingPlannedTowns = loadExistingPlanningTowns();
			const nextTowns = placementTarget
				? existingPlannedTowns.map((existingTown) =>
						existingTown.id === placementTarget.id ? town : existingTown,
					)
				: [...existingPlannedTowns, town];
			const savedNation = saveExistingPlannedTownSet(nextTowns, source);
			if (!savedNation) return null;
			return {
				nation: savedNation,
				town,
			};
		}

		const nation = {
			...activeNation,
			towns: placementTarget
				? (activeNation.towns ?? []).map((existingTown) =>
						existingTown.id === placementTarget.id ? town : existingTown,
					)
				: [...(activeNation.towns ?? []), town],
		};
		const savedNation = saveSinglePlanningNation(nation, source);
		if (!savedNation) return null;

		setPlanningDebugState("stored planning town", {
			source,
			town: {
				id: town.id,
				x: town.x,
				z: town.z,
				rangeRadiusBlocks: town.rangeRadiusBlocks,
			},
			repositioned: placementTarget != null,
			center: savedNation.center,
			townCount: savedNation.towns.length,
		});
		return {
			nation: savedNation,
			town,
		};
	}

	function parsePlanningPlacementEventDetail(detail) {
		if (typeof detail === "string") {
			try {
				return JSON.parse(detail);
			} catch {
				return null;
			}
		}

		return detail && typeof detail === "object" ? detail : null;
	}

	function placeHardcodedPlanningNation(center, source = "unknown") {
		if (getPlanningMode() !== "planned") return false;
		setPlanningPlacementMode("none");
		const nation = storePlanningNation(center, source);
		if (!nation) return false;
		clearPlanningPlacementAlert();
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(nation.center);
		return true;
	}

	function placePlanningTown(center, source = "unknown") {
		if (!getHardcodedPlanningNation()) {
			showAlert("Place or select a nation before adding planned towns.", 4);
			return false;
		}

		const result = storePlanningTown(center, source);
		if (!result) return false;
		clearPlanningPlacementAlert();
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(result.nation.center);
		return true;
	}

	function handlePlanningPlacementRequest(center, source = "unknown") {
		const x = Number(center?.x);
		const z = Number(center?.z);
		const placementMode = getPlanningPlacementMode();
		const coords =
			Number.isFinite(x) && Number.isFinite(z)
				? { x: Math.round(x), z: Math.round(z) }
				: null;

		if (getStoredCurrentMapMode() !== "planning") {
			setPlanningDebugState("ignored planning placement request", {
				reason: "wrong-map-mode",
				source,
				mapMode: getStoredCurrentMapMode(),
				placementMode,
				coords,
			});
			return false;
		}

		if (!isPlanningPlacementArmed()) {
			setPlanningDebugState("ignored planning placement request", {
				reason: "not-armed",
				source,
				mapMode: getStoredCurrentMapMode(),
				placementMode,
				coords,
			});
			return false;
		}

		if (!coords) {
			setPlanningDebugState("ignored planning placement request", {
				reason: "invalid-coords",
				source,
				center,
				placementMode,
			});
			showAlert(
				"Could not read map coordinates for planning placement. Move the cursor over the map and try again.",
				5,
			);
			return false;
		}

		if (placementMode === "town") {
			return placePlanningTown(coords, source);
		}

		return placeHardcodedPlanningNation(coords, source);
	}

	function handlePlanningPlacementClick(event) {
		if (!isPlanningPlacementArmed()) return;
		if (getStoredCurrentMapMode() !== "planning") return;

		const target = event.target;
		if (!(target instanceof HTMLElement)) return;
		if (!target.closest(".leaflet-container")) return;
		if (target.closest(".leaflet-control-container")) return;
		if (
			document.documentElement?.getAttribute?.(
				PLANNING_NATIVE_PLACEMENT_READY_ATTR,
			) === "true"
		) {
			setPlanningDebugState(
				"ignored text placement click in favor of native placement bridge",
				{
					targetTag: target.tagName,
					targetClassName: target.className || null,
				},
			);
			return;
		}

		const rawCoordinatesText = getPlanningCoordsText();
		const coords = parsePlanningCoords(rawCoordinatesText);
		setPlanningDebugState("captured map click while armed", {
			rawCoordinatesText,
			targetTag: target.tagName,
			targetClassName: target.className || null,
			coords,
		});
		handlePlanningPlacementRequest(coords, "map-click");
	}

	function handlePlanningPlacementEvent(event) {
		const detail = parsePlanningPlacementEventDetail(event.detail);
		const center = detail?.center ?? null;
		const source =
			typeof detail?.source === "string" ? detail.source : "custom-event";
		setPlanningDebugState("received planning placement event", {
			source,
			center,
		});
		handlePlanningPlacementRequest(center, source);
	}

	function ensurePlanningPlacementClickHandler() {
		if (planningPlacementClickInitialized) return;

		document.addEventListener("click", handlePlanningPlacementClick, true);
		document.addEventListener(
			PLANNING_PLACE_EVENT,
			handlePlanningPlacementEvent,
		);
		planningPlacementClickInitialized = true;
		setPlanningDebugState("attached planning placement listeners", {
			clickListener: true,
			eventListener: PLANNING_PLACE_EVENT,
		});
	}

	function armPlanningPlacement(mode = "nation-center") {
		if (mode === "nation-center" && getPlanningMode() !== "planned") return;
		setPlanningPlacementMode(mode);
		ensurePlanningPlacementClickHandler();
		const placementTarget = getPlanningTownPlacementTarget();
		showAlert(
			mode === "town"
				? placementTarget
					? "Town reposition armed. Click on the live map to move the planned town."
					: "Town placement armed. Click on the live map to place the planned town."
				: "Planning placement armed. Click on the live map to place the nation center.",
			3,
		);
		setPlanningDebugState("placement armed", {
			mode,
			existingNationCenter: getHardcodedPlanningNation()?.center ?? null,
			townId: placementTarget?.id ?? null,
		});
	}

	function armPlanningTownPlacement(townId = null) {
		setPlanningPlacementMode("town", { townId });
		ensurePlanningPlacementClickHandler();
		const placementTarget = getPlanningTownPlacementTarget();
		showAlert(
			placementTarget
				? "Town reposition armed. Click on the live map to move the planned town."
				: "Town placement armed. Click on the live map to place the planned town.",
			3,
		);
		setPlanningDebugState("placement armed", {
			mode: "town",
			existingNationCenter: getHardcodedPlanningNation()?.center ?? null,
			townId: placementTarget?.id ?? null,
		});
	}

	function updatePlanningTownById(townId, updater, source = "unknown") {
		if (typeof updater !== "function") return null;

		if (getPlanningMode() === "existing") {
			const nextTowns = loadExistingPlanningTowns()
				.map((town, index) => {
					if (town.id !== townId) return town;
					return normalizePlanningTown(
						{
							...updater(town),
							source: "planned",
						},
						index,
					);
				})
				.filter((town) => town != null);
			const savedNation = saveExistingPlannedTownSet(nextTowns, source);
			if (!savedNation) return null;
			if (!usePlanningLiveUpdates()) reloadPlanningMapAt(savedNation.center);
			return savedNation;
		}

		const activeNation = getPlannedNation();
		if (!activeNation) return null;

		const nextTowns = (activeNation.towns ?? [])
			.map((town, index) => {
				if (town.id !== townId) return town;
				return normalizePlanningTown(updater(town), index);
			})
			.filter((town) => town != null);
		const savedNation = saveSinglePlanningNation(
			{
				...activeNation,
				towns: nextTowns,
			},
			source,
		);
		if (!savedNation) return null;
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(savedNation.center);
		return savedNation;
	}

	function removePlanningTownById(townId, source = "unknown") {
		if (getPlanningMode() === "existing") {
			const nextTowns = loadExistingPlanningTowns().filter(
				(town) => town.id !== townId,
			);
			const savedNation = saveExistingPlannedTownSet(nextTowns, source);
			if (!savedNation) return null;
			if (!usePlanningLiveUpdates()) reloadPlanningMapAt(savedNation.center);
			return savedNation;
		}

		const activeNation = getPlannedNation();
		if (!activeNation) return null;

		const savedNation = saveSinglePlanningNation(
			{
				...activeNation,
				towns: (activeNation.towns ?? []).filter((town) => town.id !== townId),
			},
			source,
		);
		if (!savedNation) return null;
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(savedNation.center);
		return savedNation;
	}

	function addPlanningSection(sidebar) {
		const section = addSidebarSection(
			sidebar,
			"Planning",
			"Inspect one nation range or place a planned nation and planned towns.",
		);
		section.id = "planning-section";
		ensurePlanningPlacementClickHandler();
		ensurePlanningCursorPreview();
		if (getPlanningMode() === "planned") {
			const normalizedStoredNation = getPlannedNation();
			if (normalizedStoredNation) savePlanningNations([normalizedStoredNation]);
		}

		const modeSection = addElement(
			section,
			createElement("div", {
				className: "planning-subsection",
			}),
		);
		addElement(
			modeSection,
			createElement("div", {
				className: "planning-subsection-title",
				text: "Planning Nation",
			}),
		);
		const modeToolbar = addElement(
			modeSection,
			createElement("div", {
				className: "planning-town-toolbar planning-nation-toolbar",
			}),
		);
		const existingModeButton = addElement(
			modeToolbar,
			createElement("button", {
				id: "planning-mode-existing-button",
				className: "sidebar-button",
				text: "Existing Nation",
				type: "button",
			}),
		);
		const plannedModeButton = addElement(
			modeToolbar,
			createElement("button", {
				id: "planning-mode-planned-button",
				className: "sidebar-button",
				text: "Planned Nation",
				type: "button",
			}),
		);

		let existingNationFilterText = getSelectedExistingNationName() ?? "";
		let isExistingNationDropdownOpen = false;
		const existingNationField = addElement(
			modeSection,
			createElement("div", {
				className: "planning-existing-nation-field",
				attrs: {
					id: "planning-existing-nation-field",
				},
			}),
		);
		addElement(
			existingNationField,
			createElement("span", {
				className: "planning-town-toolbar-label",
				text: "Existing Nation",
			}),
		);
		const existingNationCombobox = addElement(
			existingNationField,
			createElement("div", {
				className: "planning-existing-nation-combobox",
			}),
		);
		const existingNationInput = addElement(
			existingNationCombobox,
			createElement("input", {
				id: "planning-existing-nation-input",
				className: "sidebar-input",
				type: "text",
				value: existingNationFilterText,
				attrs: {
					autocomplete: "off",
					role: "combobox",
					"aria-autocomplete": "list",
					"aria-expanded": "false",
					"aria-controls": "planning-existing-nation-options",
				},
			}),
		);
		const existingNationOptionsList = addElement(
			existingNationCombobox,
			createElement("div", {
				id: "planning-existing-nation-options",
				className: "planning-existing-nation-options",
				hidden: true,
				attrs: {
					role: "listbox",
				},
			}),
		);

		const nationSection = addElement(
			section,
			createElement("div", {
				className: "planning-subsection",
			}),
		);
		const nationHeader = addElement(
			nationSection,
			createElement("div", {
				className: "planning-subsection-header",
			}),
		);
		addElement(
			nationHeader,
			createElement("div", {
				className: "planning-subsection-title",
				text: "Nation",
			}),
		);
		addElement(
			nationHeader,
			createElement("div", {
				id: "planning-fixed-range-label",
				className: "planning-section-meta",
				text: "",
				hidden: true,
			}),
		);
		const nationToolbar = addElement(
			nationSection,
			createElement("div", {
				className: "planning-town-toolbar planning-nation-toolbar",
			}),
		);
		const createNationButton = addElement(
			nationToolbar,
			createElement("button", {
				className: "sidebar-button sidebar-button-primary",
				id: "planning-place-button",
				text: "Add Nation",
				type: "button",
			}),
		);
		const removeNationButton = addElement(
			nationToolbar,
			createElement("button", {
				className: "planning-town-icon-button planning-nation-icon-button",
				id: "planning-remove-button",
				text: "x",
				type: "button",
				attrs: {
					title: "Clear planning nation",
				},
			}),
		);
		removeNationButton.addEventListener("click", () => {
			removeHardcodedPlanningNation();
			syncPlanningSectionState();
		});
		addElement(
			nationSection,
			createElement("div", {
				id: "planning-center-label",
				className: "planning-section-meta planning-center-meta",
				text: "Center not set",
			}),
		);

		const townSection = addElement(
			section,
			createElement("div", {
				className: "planning-subsection planning-subsection-towns",
			}),
		);
		const townSectionHeader = addElement(
			townSection,
			createElement("div", {
				className: "planning-subsection-header",
			}),
		);
		addElement(
			townSectionHeader,
			createElement("div", {
				className: "planning-subsection-title",
				text: "Towns",
			}),
		);
		addElement(
			townSectionHeader,
			createElement("div", {
				id: "planning-town-count-label",
				className: "planning-section-meta",
				text: "0 total",
			}),
		);
		const townToolbar = addElement(
			townSection,
			createElement("div", {
				className: "planning-town-toolbar",
			}),
		);
		const placeTownButton = addElement(
			townToolbar,
			createElement("button", {
				className: "sidebar-button sidebar-button-primary",
				id: "planning-place-town-button",
				text: "Add Planned Town",
				type: "button",
			}),
		);

		addElement(
			townSection,
			createElement("p", {
				id: "planning-town-helper",
				className: "sidebar-help planning-inline-note",
				text: "",
				hidden: true,
			}),
		);
		const townList = addElement(
			townSection,
			createElement("div", {
				id: "planning-town-list",
				className: "planning-town-list",
			}),
		);

		async function applyExistingNationSelection(nationName) {
			saveSelectedExistingNationName(nationName);
			existingNationFilterText = getSelectedExistingNationName() ?? "";
			existingNationInput.value = existingNationFilterText;
			isExistingNationDropdownOpen = false;
			setPlanningPlacementMode("none");
			await refreshExistingTownCoordinatesForSelected();
			notifyPlanningStateUpdated("planning-existing-nation-selected", {
				nationName: getSelectedExistingNationName(),
			});
			syncPlanningSectionState();
		}

		function getFilteredExistingNationOptions() {
			const options = getExistingNationOptions(getParsedMarkersForPlanning());
			const selectedName = getSelectedExistingNationName();
			if (!selectedName && existingNationInput.value !== existingNationFilterText) {
				existingNationFilterText = existingNationInput.value;
			}
			const filter = existingNationFilterText.trim().toLowerCase();
			return {
				options,
				filteredOptions: filter
					? options.filter((option) =>
							option.name.toLowerCase().includes(filter),
						)
					: options,
			};
		}

		function renderExistingNationOptions() {
			const selectedName = getSelectedExistingNationName();
			if (!isExistingNationDropdownOpen) {
				existingNationFilterText = selectedName ?? existingNationFilterText;
				existingNationInput.value = existingNationFilterText;
			}
			const { options, filteredOptions } = getFilteredExistingNationOptions();
			existingNationOptionsList.replaceChildren();
			existingNationOptionsList.hidden =
				!isExistingNationDropdownOpen || getPlanningMode() !== "existing";
			existingNationInput.setAttribute(
				"aria-expanded",
				existingNationOptionsList.hidden ? "false" : "true",
			);

			if (existingNationOptionsList.hidden) return;

			if (selectedName) {
				const clearOption = addElement(
					existingNationOptionsList,
					createElement("button", {
						className: "planning-existing-nation-option",
						text: "Clear selection",
						type: "button",
						attrs: {
							role: "option",
						},
					}),
				);
				clearOption.addEventListener("mousedown", (event) => {
					event.preventDefault?.();
				});
				clearOption.addEventListener("click", () =>
					applyExistingNationSelection(""),
				);
			}

			if (options.length === 0) {
				addElement(
					existingNationOptionsList,
					createElement("div", {
						className: "planning-existing-nation-empty",
						text: "Map data not ready",
					}),
				);
				return;
			}

			if (filteredOptions.length === 0) {
				addElement(
					existingNationOptionsList,
					createElement("div", {
						className: "planning-existing-nation-empty",
						text: "No matching nations",
					}),
				);
				return;
			}

			for (const option of filteredOptions) {
				const optionButton = addElement(
					existingNationOptionsList,
					createElement("button", {
						className: "planning-existing-nation-option",
						text: option.hasCapital
							? `${option.name} (${option.townCount})`
							: `${option.name} (no capital)`,
						type: "button",
						disabled: !option.hasCapital,
						attrs: {
							role: "option",
							"data-value": option.name,
						},
					}),
				);
				optionButton.addEventListener("mousedown", (event) => {
					event.preventDefault?.();
				});
				optionButton.addEventListener("click", () =>
					applyExistingNationSelection(option.name),
				);
			}
		}

		function renderTownList(activeNation) {
			townList.replaceChildren();
			if (
				!activeNation ||
				!Array.isArray(activeNation.towns) ||
				activeNation.towns.length === 0
			) {
				addElement(
					townList,
					createElement("p", {
						className: "sidebar-help planning-inline-note",
						text: "No towns yet. Add a planned town on the map to test expansion.",
					}),
				);
				return;
			}

			const connectivity = getPlanningTownConnectivity(activeNation);
			let existingTownIndex = 0;
			let plannedTownIndex = 0;

			for (const town of activeNation.towns) {
				const isDisconnected = connectivity.disconnectedTownIds.has(town.id);
				const isExistingTown = town.source === "existing";
				const townLabel = isExistingTown
					? `T${++existingTownIndex}`
					: `P${++plannedTownIndex}`;
				const townRow = addElement(
					townList,
					createElement("div", {
						className: "planning-town-row",
						attrs: {
							...(isDisconnected
								? {
										"data-state": "disconnected",
									}
								: {}),
							...(planningTownPlacementTargetId === town.id
								? {
										"data-active": "true",
									}
								: {}),
							"data-source": isExistingTown ? "existing" : "planned",
							title: `${isDisconnected ? "Disconnected" : "Connected"} ${
								isExistingTown ? "existing" : "planned"
							} town at X ${town.x} Z ${town.z}`,
						},
					}),
				);
				townRow.addEventListener("mouseenter", () => {
					townRow.setAttribute("data-hovered", "true");
					notifyPlanningTownHover(town.id, "town-row-hover");
				});
				townRow.addEventListener("mouseleave", () => {
					townRow.removeAttribute("data-hovered");
					notifyPlanningTownHover(null, "town-row-leave");
				});
				townRow.addEventListener("focusin", () => {
					townRow.setAttribute("data-hovered", "true");
					notifyPlanningTownHover(town.id, "town-row-focus");
				});
				townRow.addEventListener("focusout", () => {
					townRow.removeAttribute("data-hovered");
					notifyPlanningTownHover(null, "town-row-blur");
				});
				addElement(
					townRow,
					createElement("div", {
						className: "planning-town-row-label",
						text: townLabel,
					}),
				);
				addElement(
					townRow,
					createElement("div", {
						className: "planning-town-row-coords",
						text: isExistingTown
							? `${townLabel} - ${town.name || "Town"}`
							: `${townLabel} - X: ${town.x}, Z: ${town.z}`,
					}),
				);
				addElement(
					townRow,
					createElement("div", {
						className: "planning-town-row-status",
						text: isDisconnected ? "!" : "",
						attrs: {
							title: isDisconnected ? "Disconnected" : "Connected",
						},
					}),
				);
				const townActions = addElement(
					townRow,
					createElement("div", {
						className: "planning-town-row-actions",
					}),
				);
				if (isExistingTown) {
					continue;
				}

				const repositionTownButton = addElement(
					townActions,
					createElement("button", {
						className: "planning-town-icon-button",
						text:
							getPlanningPlacementMode() === "town" &&
							planningTownPlacementTargetId === town.id
								? "*"
								: "<>",
						type: "button",
						attrs: {
							title:
								getPlanningPlacementMode() === "town" &&
								planningTownPlacementTargetId === town.id
									? "Reposition armed"
									: "Reposition town",
						},
					}),
				);
				repositionTownButton.addEventListener("click", () => {
					if (
						getPlanningPlacementMode() === "town" &&
						planningTownPlacementTargetId === town.id
					) {
						setPlanningPlacementMode("none");
					} else {
						armPlanningTownPlacement(town.id);
					}
					syncPlanningSectionState();
				});
				const removeTownButton = addElement(
					townActions,
					createElement("button", {
						className: "planning-town-icon-button",
						text: "x",
						type: "button",
						attrs: {
							title: "Remove town",
						},
					}),
				);
				removeTownButton.addEventListener("click", () => {
					removePlanningTownById(town.id, "planning-town-remove");
					syncPlanningSectionState();
				});
			}
		}

		const syncPlanningSectionState = () => {
			renderExistingNationOptions();
			const mode = getPlanningMode();
			const activeNation = getHardcodedPlanningNation();
			const placementMode = getPlanningPlacementMode();
			const center = activeNation?.center ?? null;
			const selectedExistingNation = getSelectedExistingNationName();
			const options = getExistingNationOptions(getParsedMarkersForPlanning());
			const hasExistingOptions = options.length > 0;

			plannedModeButton.setAttribute(
				"data-active",
				mode === "planned" ? "true" : "false",
			);
			existingModeButton.setAttribute(
				"data-active",
				mode === "existing" ? "true" : "false",
			);
			existingNationField.hidden = mode !== "existing";
			nationSection.hidden = mode === "existing";
			createNationButton.hidden = mode !== "planned";
			createNationButton.textContent =
				placementMode === "nation-center"
					? "Click Map"
					: activeNation
						? "Reposition Nation"
						: "Add Nation";
			removeNationButton.hidden = mode !== "planned";
			removeNationButton.disabled = !activeNation;
			placeTownButton.disabled = !activeNation;
			placeTownButton.textContent =
				placementMode === "town" && planningTownPlacementTargetId == null
					? "Click Map"
					: "Add Planned Town";
			const centerLabel = section.querySelector("#planning-center-label");
			centerLabel.hidden = mode === "existing";
			centerLabel.textContent = center
				? mode === "existing"
					? `Capital: X: ${center.x}, Z: ${center.z}`
					: `Center: X: ${center.x}, Z: ${center.z}`
				: mode === "existing"
					? hasExistingOptions
						? "Select an existing nation"
						: "Existing nations unavailable until map data loads"
					: "Center not set";
			section.querySelector("#planning-town-count-label").textContent =
				`${activeNation?.towns?.length ?? 0} total`;
			const helper = section.querySelector("#planning-town-helper");
			helper.hidden = true;
			helper.textContent = "";
			renderTownList(activeNation);
			updatePlanningCursorPreviewState();
		};

		plannedModeButton.addEventListener("click", () => {
			if (getPlanningMode() !== "planned") {
				savePlanningMode("planned");
				setPlanningPlacementMode("none");
				notifyPlanningStateUpdated("planning-mode-updated", {
					mode: "planned",
				});
			}
			syncPlanningSectionState();
		});
		existingModeButton.addEventListener("click", () => {
			if (getPlanningMode() !== "existing") {
				savePlanningMode("existing");
				setPlanningPlacementMode("none");
				notifyPlanningStateUpdated("planning-mode-updated", {
					mode: "existing",
				});
			}
			syncPlanningSectionState();
		});
		existingNationInput.addEventListener("focus", () => {
			isExistingNationDropdownOpen = true;
			renderExistingNationOptions();
		});
		existingNationInput.addEventListener("click", () => {
			isExistingNationDropdownOpen = true;
			renderExistingNationOptions();
		});
		existingNationInput.addEventListener("input", () => {
			existingNationFilterText = existingNationInput.value;
			isExistingNationDropdownOpen = true;
			if (!existingNationFilterText.trim() && getSelectedExistingNationName()) {
				applyExistingNationSelection("");
				return;
			}
			renderExistingNationOptions();
		});
		existingNationInput.addEventListener("keydown", (event) => {
			if (event.key === "Escape") {
				isExistingNationDropdownOpen = false;
				renderExistingNationOptions();
				return;
			}
			if (event.key !== "Enter") return;
			const { filteredOptions } = getFilteredExistingNationOptions();
			const exactMatch = filteredOptions.find(
				(option) =>
					option.hasCapital &&
					option.name.toLowerCase() ===
						existingNationInput.value.trim().toLowerCase(),
			);
			const nextOption =
				exactMatch ?? filteredOptions.find((option) => option.hasCapital);
			if (!nextOption) return;
			event.preventDefault?.();
			applyExistingNationSelection(nextOption.name);
		});
		existingNationInput.addEventListener("blur", () => {
			setTimeout(() => {
				isExistingNationDropdownOpen = false;
				existingNationFilterText = getSelectedExistingNationName() ?? "";
				syncPlanningSectionState();
			}, 120);
		});
		createNationButton.addEventListener("click", () => {
			if (getPlanningMode() !== "planned") return;
			if (getPlanningPlacementMode() === "nation-center") {
				setPlanningPlacementMode("none");
			} else {
				armPlanningPlacement("nation-center");
			}
			syncPlanningSectionState();
			if (
				isPlanningDebugLoggingEnabled() &&
				getPlanningPlacementMode() === "nation-center"
			) {
				const debugSnapshot = getPlanningCursorPreviewDebugInfo();
				planningDebugInfo(
					`${PLANNING_UI_PREFIX}: add nation preview diagnostics`,
					{
						trigger: "planning-place-button",
						mapMode: getStoredCurrentMapMode(),
						placementMode: getPlanningPlacementMode(),
						previewLabel: `${debugSnapshot.previewSubjectLabel} - ${debugSnapshot.rangeRadiusBlocks} b`,
						rangeRadiusBlocks: debugSnapshot.rangeRadiusBlocks,
						rawPreviewDiameterPx:
							debugSnapshot.diameterMetrics?.rawDiameterPx ?? null,
						previewDiameterPx:
							debugSnapshot.diameterMetrics?.previewDiameterPx ?? null,
						previewWasClamped:
							debugSnapshot.diameterMetrics?.wasClamped ?? null,
						scaleInfo: debugSnapshot.scaleInfo ?? null,
						liveScaleAttrs: debugSnapshot.liveScaleAttrs ?? null,
						exactPreviewAttrs: debugSnapshot.exactPreviewAttrs ?? null,
					},
				);
			}
		});
		placeTownButton.addEventListener("click", () => {
			if (!getHardcodedPlanningNation()) {
				showAlert("Place or select a nation before adding planned towns.", 4);
				return;
			}
			if (
				getPlanningPlacementMode() === "town" &&
				planningTownPlacementTargetId == null
			) {
				setPlanningPlacementMode("none");
			} else {
				armPlanningTownPlacement();
			}
			syncPlanningSectionState();
		});
		document.addEventListener(PLANNING_STATE_UPDATED_EVENT, () =>
			syncPlanningSectionState(),
		);
		document.addEventListener(PARSED_MARKERS_EVENT, () => {
			refreshExistingTownCoordinatesForSelected();
			syncPlanningSectionState();
		});
		syncPlanningSectionState();

		return section;
	}

	globalThis[MENU_PLANNING_KEY] = Object.freeze({
		PLANNING_LEAFLET_ZOOM_ATTR,
		parseZoomFromTileUrl,
		getPlanningPreviewScaleInfo,
		getScaledPreviewDiameterMetrics,
		getPlanningCursorPreviewDebugInfo,
		normalizePlanningRange,
		normalizePlanningNation,
		setPlanningDefaultRange,
		setPlanningPlacementArmed,
		addPlanningSection,
	});
})();
