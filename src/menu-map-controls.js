/** Map-mode, archive, and locate helpers used by the sidebar. */

(() => {
	const MENU_MAP_CONTROLS_KEY = "EMCDYNMAPPLUS_MENU_MAP_CONTROLS";
	if (globalThis[MENU_MAP_CONTROLS_KEY]) return;

	function addMapModeSection(sidebar, curMapMode) {
		const section = addSidebarSection(
			sidebar,
			"Map View",
			"Choose a live overlay or jump to a historical snapshot.",
		);
		section.id = "map-mode-section";
		section.setAttribute("data-archive-active", String(curMapMode === "archive"));

		addElement(
			section,
			createElement("label", {
				className: "sidebar-field-label",
				htmlFor: "map-mode-select",
				text: "View mode",
			}),
		);
		const modeSelect = addElement(
			section,
			createElement(
				"select",
				{
					id: "map-mode-select",
					className: "sidebar-input sidebar-select",
				},
				LIVE_MAP_MODE_METADATA.map((mode) =>
					createElement("option", {
						value: mode.value,
						text: mode.label,
					}),
				),
			),
		);
		modeSelect.value =
			curMapMode === "archive" ? "default" : getPreferredLiveMapMode(curMapMode);

		const modeDescription = addElement(
			section,
			createElement("p", {
				id: "map-mode-description",
				className: "sidebar-help",
				text: getMapModeMeta(modeSelect.value).description,
			}),
		);

		const archiveField = addElement(
			section,
			createElement("div", {
				id: "archive-date-group",
				className: "sidebar-field-group sidebar-archive-panel",
			}),
		);
		const archiveStatus = addElement(
			archiveField,
			createElement("div", {
				id: "archive-status",
				className: "sidebar-archive-status",
			}),
		);
		addElement(
			archiveStatus,
			createElement("span", {
				id: "archive-status-eyebrow",
				className: "sidebar-field-label",
				text: curMapMode === "archive" ? "Archive Active" : "Archive Access",
			}),
		);
		addElement(
			archiveStatus,
			createElement("strong", {
				id: "archive-status-title",
				className: "sidebar-archive-title",
				text:
					curMapMode === "archive"
						? getStoredArchiveDateLabel() || "Loading Snapshot"
						: "Open A Historical Snapshot",
			}),
		);
		addElement(
			archiveStatus,
			createElement("p", {
				id: "archive-status-copy",
				className: "sidebar-help",
				text:
					curMapMode === "archive"
						? "You are viewing a historical snapshot. Choose another date below or return to the live map."
						: "Open a past map snapshot without changing your preferred live overlay.",
			}),
		);
		addElement(
			archiveField,
			createElement("label", {
				className: "sidebar-field-label",
				htmlFor: "archive-input",
				text: "Archive date",
			}),
		);
		const archiveInput = addElement(
			archiveField,
			createElement("input", {
				id: "archive-input",
				className: "sidebar-input",
				type: "date",
				attrs: {
					min: ARCHIVE_DATE.MIN,
					max: ARCHIVE_DATE.MAX,
				},
			}),
		);
		const archiveHelp = addElement(
			archiveField,
			createElement("p", {
				className: "sidebar-help",
				text:
					curMapMode === "archive"
						? "Jump to another archive date from here."
						: "Use this only when you want to leave the live map and browse a snapshot.",
			}),
		);

		const viewActions = addElement(
			section,
			createElement("div", { className: "sidebar-action-row" }),
		);
		const switchMapModeButton = addElement(
			viewActions,
			createElement("button", {
				id: "switch-map-mode",
				className: "sidebar-button sidebar-button-primary",
				text: "Apply Selected View",
			}),
		);
		const archiveActions = addElement(
			archiveField,
			createElement("div", {
				className: "sidebar-action-row sidebar-archive-actions",
			}),
		);
		const archiveButton = addElement(
			archiveActions,
			createElement("button", {
				id: "archive-button",
				className: "sidebar-button sidebar-button-primary",
				text: "Open Archive",
			}),
		);

		const syncModeUI = () => {
			const selectedMode = modeSelect.value;
			const selectedMeta = getMapModeMeta(selectedMode);
			const isArchiveActive = curMapMode === "archive";
			const isArchiveAvailable =
				selectedMode === "default" &&
				(curMapMode === "default" || curMapMode === "archive");
			modeDescription.textContent = selectedMeta.description;
			switchMapModeButton.textContent = isArchiveActive
				? selectedMode === "default"
					? "Return To Live Map"
					: "Return To Selected View"
				: "Apply Selected View";
			archiveField.hidden = !isArchiveAvailable;
			archiveButton.textContent = "Open Archive";
			archiveHelp.textContent = isArchiveActive
				? "Jump to another archive date from here."
				: "Use this only when you want to leave the live map and browse a snapshot.";
		};

		switchMapModeButton.addEventListener("click", () =>
			applyMapModeSelection(modeSelect.value),
		);
		archiveButton.addEventListener("click", () =>
			searchArchive(archiveInput.value, modeSelect.value),
		);
		modeSelect.addEventListener("change", syncModeUI);
		archiveInput.addEventListener("keyup", (e) => {
			if (e.key !== "Enter") return;
			searchArchive(archiveInput.value, modeSelect.value);
		});
		archiveInput.addEventListener("change", () => {
			if (!isValidArchiveDateInput(archiveInput.value)) return;
			localStorage["emcdynmapplus-archive-date"] = archiveInput.value.replaceAll(
				"-",
				"",
			);
		});

		syncModeUI();
	}

	function applyMapModeSelection(nextMode) {
		rememberPreferredLiveMapMode(nextMode);
		if (nextMode !== "planning") setPlanningPlacementArmed(false);
		localStorage["emcdynmapplus-mapmode"] = nextMode;
		location.reload();
	}

	function addLocateMenu(sidebar) {
		const locateMenu = addSidebarSection(
			sidebar,
			"Locate",
			"Jump to a town, nation, or resident.",
		);
		locateMenu.id = "locate-menu";
		const locateSubmenu = addElement(
			locateMenu,
			createElement("div", { className: "sidebar-split" }),
		);
		const locateSelect = addElement(
			locateSubmenu,
			createElement(
				"select",
				{
					id: "locate-select",
					className: "sidebar-input sidebar-select",
				},
				[
					createElement("option", { text: "Town" }),
					createElement("option", { text: "Nation" }),
					createElement("option", { text: "Resident" }),
				],
			),
		);
		const locateInput = addElement(
			locateMenu,
			createElement("input", {
				id: "locate-input",
				className: "sidebar-input",
				type: "search",
				placeholder: "London",
			}),
		);
		const locateButton = addElement(
			locateMenu,
			createElement("button", {
				id: "locate-button",
				className: "sidebar-button sidebar-button-primary",
				text: "Locate On Map",
			}),
		);
		locateSelect.addEventListener("change", () => {
			switch (locateSelect.value) {
				case "Town":
					locateInput.placeholder = "London";
					break;
				case "Nation":
					locateInput.placeholder = "Germany";
					break;
				case "Resident":
					locateInput.placeholder = "Notch";
					break;
			}
		});
		locateInput.addEventListener("keyup", (event) => {
			if (event.key != "Enter") return;
			locate(locateSelect.value, locateInput.value);
		});
		locateButton.addEventListener("click", () => {
			locate(locateSelect.value, locateInput.value);
		});
	}

	function locate(selectValue, inputValue) {
		const isArchiveMode = getStoredCurrentMapMode() == "archive";
		switch (selectValue) {
			case "Town":
				locateTown(inputValue, isArchiveMode);
				break;
			case "Nation":
				locateNation(inputValue, isArchiveMode);
				break;
			case "Resident":
				locateResident(inputValue, isArchiveMode);
				break;
		}
	}

	function searchArchive(date, preferredMode = null) {
		if (!isValidArchiveDateInput(date)) {
			showAlert(
				`Choose a valid archive date between ${ARCHIVE_DATE.MIN} and ${ARCHIVE_DATE.MAX}.`,
				4,
			);
			return;
		}

		rememberPreferredLiveMapMode(preferredMode ?? getStoredCurrentMapMode());
		const URLDate = date.replaceAll("-", "");
		localStorage["emcdynmapplus-archive-date"] = URLDate;
		localStorage["emcdynmapplus-mapmode"] = "archive";
		location.reload();
	}

	function isValidArchiveDateInput(date) {
		if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
		return date >= ARCHIVE_DATE.MIN && date <= ARCHIVE_DATE.MAX;
	}

	async function locateTown(townName, isArchiveMode) {
		townName = townName.trim().toLowerCase();
		if (townName == "") return;

		let coords = null;
		if (!isArchiveMode) coords = await getTownSpawn(townName);
		if (!coords) coords = getTownMidpoint(townName);

		if (!coords) {
			return showAlert(`Could not find town/capital with name '${townName}'.`, 5);
		}
		updateUrlLocation(coords);
	}

	async function locateNation(nationName, isArchiveMode) {
		nationName = nationName.trim().toLowerCase();
		if (nationName == "") return;

		let capitalName = null;
		if (!isArchiveMode) {
			const queryBody = { query: [nationName], template: { capital: true } };
			const nations = await postJSON(getCurrentOapiUrl("nations"), queryBody);
			if (nations && nations.length > 0) capitalName = nations[0].capital?.name;
		}
		if (!capitalName) {
			const marker = parsedMarkers.find(
				(m) =>
					m.nationName && m.nationName.toLowerCase() == nationName && m.isCapital,
			);
			if (marker) capitalName = marker.townName;
		}

		if (!capitalName) return showAlert("Searched nation could not be found.", 3);
		await locateTown(capitalName, isArchiveMode);
	}

	async function locateResident(residentName, isArchiveMode) {
		residentName = residentName.trim().toLowerCase();
		if (residentName == "") return;

		let townName = null;
		if (!isArchiveMode) {
			const queryBody = { query: [residentName], template: { town: true } };
			const players = await postJSON(getCurrentOapiUrl("players"), queryBody);
			if (players && players.length > 0) townName = players[0].town?.name;
		}
		if (!townName) {
			const marker = parsedMarkers.find(
				(m) =>
					m.residentList &&
					m.residentList.some((r) => r.toLowerCase() == residentName),
			);
			if (marker) townName = marker.townName;
		}

		if (!townName) return showAlert("Searched resident could not be found.", 3);
		await locateTown(townName, isArchiveMode);
	}

	async function getTownSpawn(townName) {
		const queryBody = { query: [townName], template: { coordinates: true } };
		const towns = await postJSON(getCurrentOapiUrl("towns"), queryBody);
		if (!towns || towns.length < 1) return null;

		const spawn = towns[0].coordinates.spawn;
		return { x: Math.round(spawn.x), z: Math.round(spawn.z) };
	}

	function getTownMidpoint(townName) {
		const town = parsedMarkers.find(
			(m) => m.townName && m.townName.toLowerCase() == townName,
		);
		if (!town) return null;

		return { x: town.x, z: town.z };
	}

	function updateUrlLocation(coords, zoom = 4) {
		location.href = `${MAPI_BASE}?zoom=${zoom}&x=${coords.x}&z=${coords.z}`;
	}

	globalThis[MENU_MAP_CONTROLS_KEY] = Object.freeze({
		addMapModeSection,
		applyMapModeSelection,
		addLocateMenu,
		searchArchive,
		isValidArchiveDateInput,
	});
})();
