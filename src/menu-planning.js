/** Planning-specific menu helpers shared by the sidebar and planning preview UI. */

(() => {
	const MENU_PLANNING_KEY = "EMCDYNMAPPLUS_MENU_PLANNING";
	if (globalThis[MENU_PLANNING_KEY]) return;

	const PLANNING_PLACEMENT_ARMED_KEY = "emcdynmapplus-planning-placement-armed";
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
		defaultPlanningNation: DEFAULT_PLANNING_NATION,
		loadPlanningNations,
		savePlanningNations,
		getPlanningDefaultRange,
		setPlanningDefaultRange: savePlanningDefaultRange,
		normalizePlanningNation,
	} = planningState;
	const PLANNING_STATE_UPDATED_EVENT =
		planningRuntimeHelpers.PLANNING_STATE_UPDATED_EVENT;

	function notifyPlanningStateUpdated(source, detail = {}) {
		planningRuntimeHelpers.dispatchPlanningStateUpdated({
			source,
			...detail,
		});
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

	function isPlanningPlacementArmed() {
		return localStorage[PLANNING_PLACEMENT_ARMED_KEY] === "true";
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
		debugInfo: planningDebugInfo,
		isDebugLoggingEnabled: isPlanningDebugLoggingEnabled,
	});

	function setPlanningPlacementArmed(armed) {
		localStorage[PLANNING_PLACEMENT_ARMED_KEY] = String(armed);
		setPlanningDebugState("placement armed state updated", { armed });
		updatePlanningCursorPreviewState();
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

	function setPlanningDefaultRange(range, source = "unknown", notifyRuntime = true) {
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

	function buildPlanningNation(center) {
		return {
			...DEFAULT_PLANNING_NATION,
			rangeRadiusBlocks: getPlanningDefaultRange(),
			center: {
				x: Math.round(center.x),
				z: Math.round(center.z),
			},
		};
	}

	function updatePlanningNationRange(range, source = "unknown") {
		const normalizedRange = normalizePlanningRange(range);
		if (normalizedRange == null) {
			showAlert("Enter a valid nation range in blocks.", 4);
			return false;
		}

		const activeNation = getHardcodedPlanningNation();
		setPlanningDefaultRange(normalizedRange, source, activeNation == null);
		if (!activeNation) return true;

		savePlanningNations([
			{ ...activeNation, rangeRadiusBlocks: normalizedRange },
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
		setPlanningPlacementArmed(false);
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
		const nation = buildPlanningNation(center);
		savePlanningNations([nation]);
		setPlanningPlacementArmed(false);
		setPlanningDebugState("stored planning nation", {
			source,
			center: nation.center,
			rangeRadiusBlocks: nation.rangeRadiusBlocks,
		});
		notifyPlanningStateUpdated("planning-nations-updated", {
			center: nation.center,
			rangeRadiusBlocks: nation.rangeRadiusBlocks,
			trigger: source,
		});
		return nation;
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
		const nation = storePlanningNation(center, source);
		if (!usePlanningLiveUpdates()) reloadPlanningMapAt(nation.center);
	}

	function handlePlanningPlacementRequest(center, source = "unknown") {
		const x = Number(center?.x);
		const z = Number(center?.z);
		const coords =
			Number.isFinite(x) && Number.isFinite(z)
				? { x: Math.round(x), z: Math.round(z) }
				: null;

		if (getStoredCurrentMapMode() !== "planning") {
			setPlanningDebugState("ignored planning placement request", {
				reason: "wrong-map-mode",
				source,
				mapMode: getStoredCurrentMapMode(),
				coords,
			});
			return false;
		}

		if (!isPlanningPlacementArmed()) {
			setPlanningDebugState("ignored planning placement request", {
				reason: "not-armed",
				source,
				mapMode: getStoredCurrentMapMode(),
				coords,
			});
			return false;
		}

		if (!coords) {
			setPlanningDebugState("ignored planning placement request", {
				reason: "invalid-coords",
				source,
				center,
			});
			showAlert(
				"Could not read map coordinates for planning placement. Move the cursor over the map and try again.",
				5,
			);
			return false;
		}

		placeHardcodedPlanningNation(coords, source);
		return true;
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
			setPlanningDebugState("ignored text placement click in favor of native placement bridge", {
				targetTag: target.tagName,
				targetClassName: target.className || null,
			});
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
			typeof detail?.source === "string"
				? detail.source
				: "custom-event";
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

	function armPlanningPlacement() {
		setPlanningPlacementArmed(true);
		ensurePlanningPlacementClickHandler();
		showAlert(
			"Planning placement armed. Click on the live map to place the nation.",
			5,
		);
		setPlanningDebugState("placement armed", {
			existingNationCenter: getHardcodedPlanningNation()?.center ?? null,
		});
	}

	function addPlanningSection(sidebar) {
		const section = addSidebarSection(
			sidebar,
			"Planning",
			"Set the nation range, then place or move the center on the map.",
		);
		section.id = "planning-section";
		ensurePlanningPlacementClickHandler();
		ensurePlanningCursorPreview();

		const placedNation = getHardcodedPlanningNation();
		const placedCenter = placedNation?.center ?? null;
		const activeRange =
			placedNation?.rangeRadiusBlocks ?? getPlanningDefaultRange();

		const rangeField = addElement(
			section,
			createElement("div", {
				className: "sidebar-field-group planning-range-control",
			}),
		);
		addElement(
			rangeField,
			createElement("label", {
				className: "sidebar-field-label",
				htmlFor: "planning-range-input",
				text: "Nation range (blocks)",
			}),
		);
		const rangeControls = addElement(
			rangeField,
			createElement("div", {
				className: "planning-range-row",
			}),
		);
		const rangeInput = addElement(
			rangeControls,
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

		const centerField = addElement(
			section,
			createElement("div", {
				className: "sidebar-field-group",
			}),
		);
		addElement(
			centerField,
			createElement("span", {
				className: "sidebar-field-label",
				text: "Center",
			}),
		);
		addElement(
			centerField,
			createElement("div", {
				id: "planning-center-label",
				className: "planning-chip-value",
				text: placedCenter
					? `X ${placedCenter.x} Z ${placedCenter.z}`
					: "Not set",
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
		rangeInput.addEventListener("change", applyPlanningRangeFromInput);
		rangeInput.addEventListener("blur", applyPlanningRangeFromInput);
		rangeInput.addEventListener("keyup", (event) => {
			if (event.key !== "Enter") return;
			applyPlanningRangeFromInput();
		});

		const actionRow = addElement(
			section,
			createElement("div", { className: "planning-actions-grid" }),
		);
		const createNationButton = addElement(
			actionRow,
			createElement("button", {
				className: "sidebar-button sidebar-button-primary",
				id: "planning-place-button",
				text: isPlanningPlacementArmed()
					? "Click Map To Place"
					: placedNation
						? "Reposition Nation"
						: "Place Nation On Map",
				type: "button",
			}),
		);

		const removeNationButton = addElement(
			actionRow,
			createElement("button", {
				className:
					"sidebar-button sidebar-button-secondary sidebar-button-danger",
				id: "planning-remove-button",
				text:
					isPlanningPlacementArmed() && !placedNation
						? "Cancel Placement"
						: "Remove Nation",
				type: "button",
			}),
		);
		removeNationButton.disabled = !placedNation && !isPlanningPlacementArmed();
		removeNationButton.addEventListener("click", () => {
			if (isPlanningPlacementArmed() && !hasHardcodedPlanningNation()) {
				setPlanningPlacementArmed(false);
				syncPlanningSectionState();
				return;
			}

			removeHardcodedPlanningNation();
		});

		addElement(
			section,
			createElement("p", {
				className: "sidebar-help",
				text: "Click place, then click the live map to set the center.",
			}),
		);

		const syncPlanningSectionState = () => {
			const activeNation = getHardcodedPlanningNation();
			const isArmed = isPlanningPlacementArmed();
			const center = activeNation?.center ?? null;
			const currentRange =
				activeNation?.rangeRadiusBlocks ?? getPlanningDefaultRange();
			section.querySelector("#planning-center-label").textContent = center
				? `X ${center.x} Z ${center.z}`
				: "Not set";
			rangeInput.value = String(currentRange);
			createNationButton.textContent = isArmed
				? "Click Map To Place"
				: activeNation
					? "Reposition Nation"
					: "Place Nation On Map";
			removeNationButton.textContent =
				isArmed && !activeNation ? "Cancel Placement" : "Remove Nation";
			removeNationButton.disabled = !activeNation && !isArmed;
			updatePlanningCursorPreviewState();
		};

		createNationButton.addEventListener("click", () => {
			armPlanningPlacement();
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
		normalizePlanningRange,
		normalizePlanningNation,
		setPlanningPlacementArmed,
		addPlanningSection,
	});
})();
