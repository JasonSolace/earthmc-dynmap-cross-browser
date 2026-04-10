/** Planning-specific menu helpers shared by the sidebar and planning preview UI. */

(() => {
	const MENU_PLANNING_KEY = "EMCDYNMAPPLUS_MENU_PLANNING";
	if (globalThis[MENU_PLANNING_KEY]) return;

	const PLANNING_PLACEMENT_ARMED_KEY = "emcdynmapplus-planning-placement-armed";
	const PLANNING_PLACEMENT_MODE_KEY = "emcdynmapplus-planning-placement-mode";
	const PLANNING_DEBUG_STATE_KEY = "emcdynmapplus-planning-debug-state";
	const PLANNING_UI_PREFIX = "emcdynmapplus[planning-ui]";
	const PLANNING_PLACE_EVENT = "EMCDYNMAPPLUS_PLACE_PLANNING_NATION";
	const PLANNING_LIVE_READY_ATTR = "data-emcdynmapplus-planning-live-ready";
	const PLANNING_NATIVE_PLACEMENT_READY_ATTR =
		"data-emcdynmapplus-planning-native-placement-ready";

	let planningPlacementClickInitialized = false;

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
	} = planningState;
	const PLANNING_STATE_UPDATED_EVENT =
		planningRuntimeHelpers.PLANNING_STATE_UPDATED_EVENT;
	const PLANNING_TOWN_HOVER_EVENT =
		planningRuntimeHelpers.PLANNING_TOWN_HOVER_EVENT;
	let planningTownDraft = {
		rangeRadiusBlocks: String(DEFAULT_PLANNING_TOWN_RANGE),
	};
	let planningTownPlacementTargetId = null;

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

	function createPlanningTownDraft(overrides = {}) {
		const normalizedRange = normalizePlanningRange(
			overrides?.rangeRadiusBlocks ?? DEFAULT_PLANNING_TOWN_RANGE,
		);
		return {
			rangeRadiusBlocks: String(normalizedRange ?? DEFAULT_PLANNING_TOWN_RANGE),
		};
	}

	function getPlanningTownDraftRange() {
		return (
			normalizePlanningRange(planningTownDraft?.rangeRadiusBlocks) ??
			DEFAULT_PLANNING_TOWN_RANGE
		);
	}

	function getPlanningPlacementMode() {
		const storedMode = localStorage[PLANNING_PLACEMENT_MODE_KEY];
		return storedMode === "nation-center" || storedMode === "town"
			? storedMode
			: "none";
	}

	function getPlanningTownPlacementTarget(
		activeNation = getHardcodedPlanningNation(),
	) {
		if (!activeNation || !planningTownPlacementTargetId) return null;
		return (
			(activeNation.towns ?? []).find(
				(town) => town.id === planningTownPlacementTargetId,
			) ?? null
		);
	}

	function isPlanningPlacementArmed() {
		return getPlanningPlacementMode() !== "none";
	}

	function getHardcodedPlanningNation() {
		return (
			loadPlanningNations()
				.map(normalizePlanningNation)
				.find((nation) => nation != null) ?? null
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
				const activeNation = getHardcodedPlanningNation();
				const placementTarget = getPlanningTownPlacementTarget(activeNation);
				return {
					kind: "town",
					rangeRadiusBlocks:
						placementTarget?.rangeRadiusBlocks ?? getPlanningTownDraftRange(),
					label: placementTarget ? "Reposition Town" : "Add Town",
				};
			}

			const activeNation = getHardcodedPlanningNation();
			return activeNation
				? {
						kind: "nation",
						rangeRadiusBlocks: activeNation.rangeRadiusBlocks,
						label: activeNation.name,
					}
				: null;
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
		setPlanningDebugState("updated planning default range", {
			source,
			rangeRadiusBlocks: storedRange ?? range,
		});
		if (notifyRuntime) {
			notifyPlanningStateUpdated("planning-default-range-updated", {
				rangeRadiusBlocks: storedRange ?? range,
				trigger: source,
			});
		}
		updatePlanningCursorPreviewVisual();
	}

	function hasHardcodedPlanningNation() {
		return getHardcodedPlanningNation() != null;
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
			rangeRadiusBlocks: getPlanningDefaultRange(),
			center: {
				x: Math.round(center.x),
				z: Math.round(center.z),
			},
			towns: [],
		};
	}

	function buildPlanningTown(
		center,
		activeNation = getHardcodedPlanningNation(),
	) {
		return normalizePlanningTown({
			id: createPlanningEntityId("planning-town"),
			x: Math.round(center.x),
			z: Math.round(center.z),
			rangeRadiusBlocks: getPlanningTownDraftRange(),
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

	function updatePlanningNationRange(range, source = "unknown") {
		const normalizedRange = normalizePlanningRange(range);
		if (normalizedRange == null) {
			showAlert("Enter a valid nation range in blocks.", 4);
			return false;
		}

		const activeNation = getHardcodedPlanningNation();
		if (!activeNation) {
			setPlanningDefaultRange(normalizedRange, source, true);
			return true;
		}

		setPlanningDefaultRange(normalizedRange, source, false);
		savePlanningNations([
			{
				...activeNation,
				rangeRadiusBlocks: normalizedRange,
			},
		]);
		setPlanningDebugState("updated placed planning range", {
			source,
			rangeRadiusBlocks: normalizedRange,
			center: activeNation.center,
		});
		notifyPlanningStateUpdated("planning-nations-updated", {
			center: activeNation.center,
			rangeRadiusBlocks: normalizedRange,
			trigger: source,
		});
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(activeNation.center);
		return true;
	}

	function updatePlanningTownRange(range, source = "unknown") {
		const normalizedRange = normalizePlanningRange(range);
		if (normalizedRange == null) {
			showAlert("Enter a valid town range in blocks.", 4);
			return false;
		}

		planningTownDraft = createPlanningTownDraft({
			rangeRadiusBlocks: normalizedRange,
		});

		const activeNation = getHardcodedPlanningNation();
		if (!activeNation) {
			notifyPlanningStateUpdated("planning-town-range-updated", {
				rangeRadiusBlocks: normalizedRange,
				trigger: source,
			});
			return true;
		}

		const savedNation = saveSinglePlanningNation(
			{
				...activeNation,
				towns: (activeNation.towns ?? []).map((town) => ({
					...town,
					rangeRadiusBlocks: normalizedRange,
				})),
			},
			source,
		);
		if (!savedNation) return false;

		setPlanningDebugState("updated planning town range", {
			source,
			rangeRadiusBlocks: normalizedRange,
			townCount: savedNation.towns.length,
			center: savedNation.center,
		});
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(savedNation.center);
		return true;
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

	function removeHardcodedPlanningNation() {
		const activeNation = getHardcodedPlanningNation();
		setPlanningPlacementMode("none");
		savePlanningNations([]);
		setPlanningDebugState("removed planning nation", {
			remainingNationCount: loadPlanningNations().length,
		});
		notifyPlanningStateUpdated("planning-nations-cleared", {
			center: activeNation?.center ?? null,
		});
		if (!usePlanningLiveUpdates()) {
			reloadPlanningMapAt(
				activeNation?.center ?? parsePlanningCoords(getPlanningCoordsText()),
			);
		}
	}

	function storePlanningNation(center, source = "unknown") {
		const existingNation = getHardcodedPlanningNation();
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

	function storePlanningTown(center, source = "unknown") {
		const activeNation = getHardcodedPlanningNation();
		if (!activeNation) return null;
		const placementTarget = getPlanningTownPlacementTarget(activeNation);
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
				})
			: buildPlanningTown(center, activeNation);
		if (!town) return null;

		const nation = {
			...activeNation,
			towns: placementTarget
				? (activeNation.towns ?? []).map((existingTown) =>
						existingTown.id === placementTarget.id ? town : existingTown,
					)
				: [...(activeNation.towns ?? []), town],
		};
		setPlanningPlacementMode("none");
		const savedNation = saveSinglePlanningNation(nation, source);
		if (!savedNation) return null;
		planningTownDraft = createPlanningTownDraft({
			rangeRadiusBlocks:
				placementTarget?.rangeRadiusBlocks ??
				planningTownDraft.rangeRadiusBlocks,
		});

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
		setPlanningPlacementMode("none");
		const nation = storePlanningNation(center, source);
		if (!nation) return false;
		clearPlanningPlacementAlert();
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(nation.center);
		return true;
	}

	function placePlanningTown(center, source = "unknown") {
		if (!getHardcodedPlanningNation()) {
			showAlert("Place a nation center before adding towns.", 4);
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
		setPlanningPlacementMode(mode);
		ensurePlanningPlacementClickHandler();
		const activeNation = getHardcodedPlanningNation();
		const placementTarget = getPlanningTownPlacementTarget(activeNation);
		showAlert(
			mode === "town"
				? placementTarget
					? "Town reposition armed. Click on the live map to move the town."
					: "Town placement armed. Click on the live map to place the town."
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
		const activeNation = getHardcodedPlanningNation();
		const placementTarget = getPlanningTownPlacementTarget(activeNation);
		showAlert(
			placementTarget
				? "Town reposition armed. Click on the live map to move the town."
				: "Town placement armed. Click on the live map to place the town.",
			3,
		);
		setPlanningDebugState("placement armed", {
			mode: "town",
			existingNationCenter: activeNation?.center ?? null,
			townId: placementTarget?.id ?? null,
		});
	}

	function updatePlanningTownById(townId, updater, source = "unknown") {
		const activeNation = getHardcodedPlanningNation();
		if (!activeNation || typeof updater !== "function") return null;

		const nextTowns = (activeNation.towns ?? [])
			.map((town, index) => {
				if (town.id !== townId) return town;
				return normalizePlanningTown(updater(town), index);
			})
			.filter((town) => town != null);
		const nextNation = {
			...activeNation,
			towns: nextTowns,
		};
		const savedNation = saveSinglePlanningNation(nextNation, source);
		if (!savedNation) return null;
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(savedNation.center);

		setPlanningDebugState("updated planning town", {
			source,
			townId,
			townCount: savedNation.towns.length,
		});
		return savedNation;
	}

	function removePlanningTownById(townId, source = "unknown") {
		const activeNation = getHardcodedPlanningNation();
		if (!activeNation) return null;

		const nextNation = {
			...activeNation,
			towns: (activeNation.towns ?? []).filter((town) => town.id !== townId),
		};
		const savedNation = saveSinglePlanningNation(nextNation, source);
		if (!savedNation) return null;
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(savedNation.center);

		setPlanningDebugState("removed planning town", {
			source,
			townId,
			townCount: savedNation.towns.length,
		});
		return savedNation;
	}

	function addPlanningSection(sidebar) {
		const section = addSidebarSection(
			sidebar,
			"Planning",
			"Set the nation center, add towns, and preview the merged range live on the map.",
		);
		section.id = "planning-section";
		ensurePlanningPlacementClickHandler();
		ensurePlanningCursorPreview();

		const placedNation = getHardcodedPlanningNation();
		const placedCenter = placedNation?.center ?? null;
		const activeRange =
			placedNation?.rangeRadiusBlocks ?? getPlanningDefaultRange();
		const nationSection = addElement(
			section,
			createElement("div", {
				className: "planning-subsection",
			}),
		);
		addElement(
			nationSection,
			createElement("div", {
				className: "planning-subsection-title",
				text: "Nation",
			}),
		);

		const nationToolbar = addElement(
			nationSection,
			createElement("div", {
				className: "planning-town-toolbar planning-nation-toolbar",
			}),
		);
		const rangeField = addElement(
			nationToolbar,
			createElement("label", {
				className: "planning-town-toolbar-range",
			}),
		);
		addElement(
			rangeField,
			createElement("span", {
				className: "planning-town-toolbar-label",
				text: "Range (Blocks)",
			}),
		);
		const rangeInput = addElement(
			rangeField,
			createElement("input", {
				id: "planning-range-input",
				className: "sidebar-input",
				type: "number",
				value: String(activeRange),
				attrs: {
					min: "0",
					step: "50",
					inputmode: "numeric",
				},
			}),
		);

		const applyPlanningRangeFromInput = () => {
			if (
				!updatePlanningNationRange(rangeInput.value, "planning-range-input")
			) {
				rangeInput.value = String(
					getHardcodedPlanningNation()?.rangeRadiusBlocks ??
						getPlanningDefaultRange(),
				);
				return;
			}
			if (!getHardcodedPlanningNation()) {
				syncPlanningSectionState();
				showAlert("Saved range for the next nation placement.", 4);
			}
		};
		rangeInput.addEventListener("input", () =>
			updatePlanningCursorPreviewVisual(),
		);
		rangeInput.addEventListener("change", applyPlanningRangeFromInput);
		rangeInput.addEventListener("blur", applyPlanningRangeFromInput);
		rangeInput.addEventListener("keyup", (event) => {
			if (event.key !== "Enter") return;
			applyPlanningRangeFromInput();
		});

		const createNationButton = addElement(
			nationToolbar,
			createElement("button", {
				className: "sidebar-button sidebar-button-primary",
				id: "planning-place-button",
				text:
					getPlanningPlacementMode() === "nation-center"
						? "Click Map"
						: placedNation
							? "Reposition Nation"
							: "Add Nation",
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
					title: "Remove nation",
				},
			}),
		);
		removeNationButton.disabled = !placedNation;
		removeNationButton.addEventListener("click", () => {
			if (!hasHardcodedPlanningNation()) return;
			removeHardcodedPlanningNation();
		});
		const centerField = addElement(
			nationSection,
			createElement("div", {
				id: "planning-center-label",
				className: "planning-section-meta planning-center-meta",
				text: placedCenter
					? `Center: X ${placedCenter.x}, Z ${placedCenter.z}`
					: "Center not set",
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
				text: `${placedNation?.towns?.length ?? 0} total`,
			}),
		);
		const townToolbar = addElement(
			townSection,
			createElement("div", {
				className: "planning-town-toolbar",
			}),
		);
		const townRangeField = addElement(
			townToolbar,
			createElement("label", {
				className: "planning-town-toolbar-range",
			}),
		);
		addElement(
			townRangeField,
			createElement("span", {
				className: "planning-town-toolbar-label",
				text: "Town Range (Blocks)",
			}),
		);
		const townRangeInput = addElement(
			townRangeField,
			createElement("input", {
				id: "planning-town-range-input",
				className: "sidebar-input",
				type: "number",
				value: planningTownDraft.rangeRadiusBlocks,
				attrs: {
					min: "0",
					step: "50",
					inputmode: "numeric",
				},
			}),
		);
		const placeTownButton = addElement(
			townToolbar,
			createElement("button", {
				className: "sidebar-button sidebar-button-primary",
				id: "planning-place-town-button",
				text: "Add Town",
				type: "button",
			}),
		);

		addElement(
			townSection,
			createElement("p", {
				id: "planning-town-helper",
				className: "sidebar-help planning-inline-note",
				text: placedNation
					? "Add a town or move an existing one."
					: "Place a nation center first, then add towns.",
			}),
		);
		const townList = addElement(
			townSection,
			createElement("div", {
				id: "planning-town-list",
				className: "planning-town-list",
			}),
		);

		function commitPlanningTownDraftRange(resetOnInvalid = false) {
			if (
				!updatePlanningTownRange(
					townRangeInput.value,
					"planning-town-range-input",
				)
			) {
				if (resetOnInvalid) {
					townRangeInput.value = String(getPlanningTownDraftRange());
				}
				return false;
			}
			townRangeInput.value = planningTownDraft.rangeRadiusBlocks;
			updatePlanningCursorPreviewVisual();
			return true;
		}

		townRangeInput.addEventListener("input", () => {
			planningTownDraft = {
				...planningTownDraft,
				rangeRadiusBlocks: townRangeInput.value,
			};
			updatePlanningCursorPreviewVisual();
		});
		townRangeInput.addEventListener("change", () =>
			commitPlanningTownDraftRange(true),
		);
		townRangeInput.addEventListener("blur", () =>
			commitPlanningTownDraftRange(true),
		);
		townRangeInput.addEventListener("keyup", (event) => {
			if (event.key !== "Enter") return;
			commitPlanningTownDraftRange(true);
		});

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
						text: "No towns yet. Place one on the map to extend the nation chain.",
					}),
				);
				return;
			}

			const connectivity = getPlanningTownConnectivity(activeNation);

			for (const [index, town] of activeNation.towns.entries()) {
				const isDisconnected = connectivity.disconnectedTownIds.has(town.id);
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
							title: isDisconnected
								? `Disconnected town at X ${town.x} Z ${town.z}`
								: `Connected town at X ${town.x} Z ${town.z}`,
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
						text: `T${index + 1}`,
					}),
				);
				addElement(
					townRow,
					createElement("div", {
						className: "planning-town-row-coords",
						text: `X: ${town.x},  Z: ${town.z}`,
					}),
				);
				addElement(
					townRow,
					createElement("div", {
						className: "planning-town-row-status",
						text: isDisconnected ? "!" : "●",
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
			const activeNation = getHardcodedPlanningNation();
			const placementMode = getPlanningPlacementMode();
			const isArmed = placementMode !== "none";
			const center = activeNation?.center ?? null;
			const currentRange =
				activeNation?.rangeRadiusBlocks ?? getPlanningDefaultRange();
			section.querySelector("#planning-center-label").textContent = center
				? `Center: X: ${center.x}, Z: ${center.z}`
				: "Center not set";
			rangeInput.value = String(currentRange);
			createNationButton.textContent =
				placementMode === "nation-center"
					? "Click Map"
					: activeNation
						? "Reposition Nation"
						: "Add Nation";
			placeTownButton.textContent =
				placementMode === "town" && planningTownPlacementTargetId == null
					? "Click Map"
					: "Add Town";
			removeNationButton.disabled = !activeNation;
			placeTownButton.disabled = !activeNation;
			townRangeInput.value = planningTownDraft.rangeRadiusBlocks;
			section.querySelector("#planning-town-count-label").textContent =
				`${activeNation?.towns?.length ?? 0} total`;
			section.querySelector("#planning-town-helper").textContent = !activeNation
				? "Place a nation center first, then add towns."
				: placementMode === "town" && planningTownPlacementTargetId
					? "Click the map to reposition the selected town."
					: placementMode === "town"
						? "Click the map to add a new town."
						: "Add a town or move an existing one.";
			renderTownList(activeNation);
			updatePlanningCursorPreviewState();
		};

		createNationButton.addEventListener("click", () => {
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
				showAlert("Place a nation center before adding towns.", 4);
				return;
			}
			if (!commitPlanningTownDraftRange(true)) return;
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
		setPlanningPlacementArmed,
		addPlanningSection,
	});
})();
