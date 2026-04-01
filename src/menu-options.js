/** Sidebar options and toggle behavior for Dynmap+ layer controls and appearance settings. */

(() => {
	const MENU_OPTIONS_KEY = "EMCDYNMAPPLUS_MENU_OPTIONS";
	if (globalThis[MENU_OPTIONS_KEY]) return;

	const DYNMAP_PLUS_LAYER_OWNER = "dynmapplus";
	const DYNMAP_PLUS_LAYER_SECTION = "dynmapplus";

	function createMenuOptions({
		createElement,
		addElement,
		getStoredCurrentMapMode = () => "default",
	} = {}) {
		if (typeof createElement !== "function") {
			throw new Error("emcdynmapplus: menu options helpers require createElement");
		}
		if (typeof addElement !== "function") {
			throw new Error("emcdynmapplus: menu options helpers require addElement");
		}

		function addOptions(layersList, curMapMode = getStoredCurrentMapMode()) {
			const existingOptions = layersList.querySelector(
				"#emcdynmapplus-layer-options",
			);
			if (existingOptions) return existingOptions;

			addElement(
				layersList,
				createElement("div", {
					className:
						"leaflet-control-layers-separator emcdynmapplus-layer-separator",
				}),
			);
			const section = addElement(
				layersList,
				createElement("div", {
					id: "emcdynmapplus-layer-options",
					className: "emcdynmapplus-layer-options",
				}),
			);
			addElement(
				section,
				createElement("div", {
					className: "emcdynmapplus-layer-title",
					text: "Dynmap+ Options",
				}),
			);
			const optionsMenu = addElement(
				section,
				createElement("div", { id: "options-menu" }),
			);
			syncDynmapPlusLayerOptions(layersList, optionsMenu);
			observeDynmapPlusLayerOptions(layersList, optionsMenu);

			const checkboxes = {
				normalizeScroll: addLayerCheckboxOption(
					optionsMenu,
					"toggle-normalize-scroll",
					"Normalize scroll inputs",
					"Smoother zoom input.",
					"normalize-scroll",
				),
				decreaseBrightness: addLayerCheckboxOption(
					optionsMenu,
					"toggle-darkened",
					"Reduce tile brightness",
					"Dims bright tiles.",
					"darkened",
				),
				darkMode: addLayerCheckboxOption(
					optionsMenu,
					"toggle-darkmode",
					"Use dark theme",
					"Darker panel theme.",
					"darkmode",
				),
				serverInfo: addLayerCheckboxOption(
					optionsMenu,
					"toggle-serverinfo",
					"Show server info",
					"Live stats panel.",
					"serverinfo",
				),
			};

			checkboxes.normalizeScroll.addEventListener("change", (e) =>
				toggleScrollNormalize(e.target.checked),
			);
			checkboxes.decreaseBrightness.addEventListener("change", (e) =>
				toggleDarkened(e.target.checked),
			);
			checkboxes.darkMode.addEventListener("change", (e) =>
				toggleDarkMode(e.target.checked),
			);
			checkboxes.serverInfo.addEventListener("change", (e) =>
				toggleServerInfo(e.target.checked),
			);

			if (curMapMode !== "archive") {
				const showCapitalStars = addLayerCheckboxOption(
					optionsMenu,
					"toggle-capital-stars",
					"Show capital stars",
					"Keep capital markers visible.",
					"capital-stars",
				);
				showCapitalStars.addEventListener("change", (e) =>
					toggleShowCapitalStars(e.target.checked),
				);
			}

			return section;
		}

		function syncDynmapPlusLayerOptions(layersList, optionsMenu) {
			const insertBefore = optionsMenu.querySelector(".emcdynmapplus-layer-option");
			const layerLabels = Array.from(layersList.querySelectorAll("label")).filter(
				(label) => isDynmapPlusLeafletLayerLabel(label, optionsMenu),
			);

			for (const label of layerLabels) {
				optionsMenu.insertBefore(label, insertBefore);
			}
		}

		function observeDynmapPlusLayerOptions(layersList, optionsMenu) {
			if (layersList.dataset.emcdynmapplusLayerObserverAttached === "true") return;
			layersList.dataset.emcdynmapplusLayerObserverAttached = "true";

			const observer = new MutationObserver(() => {
				if (!optionsMenu.isConnected) return;
				syncDynmapPlusLayerOptions(layersList, optionsMenu);
			});
			observer.observe(layersList, {
				childList: true,
				subtree: true,
			});
		}

		function isDynmapPlusLeafletLayerLabel(label, optionsMenu) {
			if (!(label instanceof HTMLLabelElement)) return false;
			if (label.closest("#options-menu") === optionsMenu) return false;
			if (!label.querySelector("input.leaflet-control-layers-selector")) {
				return false;
			}

			return (
				label.dataset.emcdynmapplusLayerOwner === DYNMAP_PLUS_LAYER_OWNER &&
				label.dataset.emcdynmapplusLayerSection === DYNMAP_PLUS_LAYER_SECTION
			);
		}

		function addCheckboxOption(
			menu,
			optionId,
			optionText,
			optionDescription,
			variable,
		) {
			const option = addElement(
				menu,
				createElement("label", {
					className: "option sidebar-setting",
					htmlFor: optionId,
				}),
			);
			const copy = addElement(
				option,
				createElement("span", { className: "sidebar-toggle-copy" }),
			);
			addElement(
				copy,
				createElement("span", {
					className: "sidebar-toggle-title",
					text: optionText,
				}),
			);
			addElement(
				copy,
				createElement("span", {
					className: "sidebar-toggle-description",
					text: optionDescription,
				}),
			);

			const checkbox = addElement(
				option,
				createElement("input", {
					id: optionId,
					className: "sidebar-switch-input",
					type: "checkbox",
					attrs: {
						role: "switch",
					},
				}),
			);
			checkbox.checked = localStorage["emcdynmapplus-" + variable] === "true";
			return checkbox;
		}

		function addLayerCheckboxOption(
			menu,
			optionId,
			optionText,
			optionDescription,
			variable,
		) {
			const label = addElement(
				menu,
				createElement("label", {
					className: "emcdynmapplus-layer-option",
					attrs: {
						title: optionDescription,
					},
				}),
			);
			const wrapper = addElement(label, createElement("span"));
			const checkbox = addElement(
				wrapper,
				createElement("input", {
					id: optionId,
					className: "leaflet-control-layers-selector emcdynmapplus-layer-checkbox",
					type: "checkbox",
					attrs: {
						role: "switch",
						"aria-label": optionText,
					},
				}),
			);
			addElement(
				wrapper,
				createElement("span", {
					text: ` ${optionText}`,
				}),
			);
			checkbox.checked = localStorage["emcdynmapplus-" + variable] === "true";
			return checkbox;
		}

		function toggleDarkened(boxTicked) {
			const element = document.querySelector(".leaflet-tile-pane");
			if (!element) {
				return showAlert(
					"Failed to toggle brightness. Cannot apply filter to non-existent tile pane.",
					4,
				);
			}

			localStorage["emcdynmapplus-darkened"] = boxTicked;

			if (isFirefoxBrowser()) {
				element.style.filter = "";
				return toggleFirefoxTileDarkener(boxTicked, element);
			}

			removeFirefoxTileDarkener();
			element.style.filter = boxTicked ? getTilePaneFilter() : "";
		}

		function getFirefoxTileDarkener() {
			return document.querySelector("#emcdynmapplus-tile-darkener");
		}

		function ensureFirefoxTileDarkener() {
			let darkener = getFirefoxTileDarkener();
			if (darkener) return darkener;

			const mapContainer = document.querySelector(".leaflet-container");
			if (!(mapContainer instanceof HTMLElement)) return null;

			darkener = document.createElement("div");
			darkener.id = "emcdynmapplus-tile-darkener";
			darkener.setAttribute("aria-hidden", "true");
			mapContainer.appendChild(darkener);
			return darkener;
		}

		function toggleFirefoxTileDarkener(boxTicked, tilePane) {
			const darkener = ensureFirefoxTileDarkener();
			if (!darkener) {
				return showAlert(
					"Failed to toggle brightness overlay. Missing Leaflet container element.",
					4,
				);
			}

			darkener.style.display = boxTicked ? "block" : "none";
			tilePane.style.opacity = boxTicked ? "0.72" : "";
		}

		function removeFirefoxTileDarkener() {
			getFirefoxTileDarkener()?.remove();
			const tilePane = document.querySelector(".leaflet-tile-pane");
			if (tilePane instanceof HTMLElement) tilePane.style.opacity = "";
		}

		function toggleServerInfo(boxTicked) {
			localStorage["emcdynmapplus-serverinfo"] = boxTicked;
			const serverInfoPanel = document.querySelector("#server-info");
			if (serverInfoPanel instanceof HTMLElement) {
				serverInfoPanel.hidden = !boxTicked;
			}

			if (!boxTicked) {
				if (globalThis.serverInfoScheduler != null) {
					clearTimeout(globalThis.serverInfoScheduler);
				}
				globalThis.serverInfoScheduler = null;
				return;
			}

			if (globalThis.serverInfoScheduler == null) {
				updateServerInfo(serverInfoPanel);
			}
		}

		function toggleShowCapitalStars(boxTicked) {
			localStorage["emcdynmapplus-capital-stars"] = boxTicked;
			const iconContainer = document.querySelector(
				".leaflet-pane.leaflet-marker-pane",
			);
			iconContainer.setAttribute(
				"style",
				`visibility: ${boxTicked ? "visible" : "hidden"}`,
			);
		}

		function toggleDarkMode(boxTicked) {
			localStorage["emcdynmapplus-darkmode"] = boxTicked;
			return boxTicked ? loadDarkMode() : unloadDarkMode();
		}

		function insertCustomStylesheets() {
			if (!document.head.querySelector("#emcdynmapplus-preconnect-fonts")) {
				addElement(
					document.head,
					createElement("link", {
						id: "emcdynmapplus-preconnect-fonts",
						rel: "preconnect",
						href: "https://fonts.googleapis.com",
					}),
				);
			}
			if (!document.head.querySelector("#emcdynmapplus-preconnect-fonts-static")) {
				addElement(
					document.head,
					createElement("link", {
						id: "emcdynmapplus-preconnect-fonts-static",
						rel: "preconnect",
						href: "https://fonts.gstatic.com",
						attrs: { crossorigin: "" },
					}),
				);
			}
			if (!document.head.querySelector("#emcdynmapplus-ui-fonts")) {
				addElement(
					document.head,
					createElement("link", {
						id: "emcdynmapplus-ui-fonts",
						rel: "stylesheet",
						href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap",
					}),
				);
			}
		}

		function loadDarkMode() {
			document.documentElement.style.colorScheme = "dark";
			document.documentElement.setAttribute("data-emcdynmapplus-theme", "dark");
			document.head.querySelector("#dark-mode")?.remove();
		}

		function unloadDarkMode() {
			document.documentElement.style.colorScheme = "light";
			document.documentElement.removeAttribute("data-emcdynmapplus-theme");
			document.head.querySelector("#dark-mode")?.remove();
			waitForElement(".leaflet-map-pane").then((el) => (el.style.filter = ""));
		}

		let scrollListener = null;

		function toggleScrollNormalize(boxTicked) {
			localStorage["emcdynmapplus-normalize-scroll"] = boxTicked;

			const el = window.document.querySelector("#map");
			return boxTicked ? addScrollNormalizer(el) : removeScrollNormalizer(el);
		}

		function addScrollNormalizer(mapEl) {
			scrollListener = (e) => {
				e.preventDefault();
				triggerScrollEvent(e.deltaY);
			};

			mapEl.addEventListener("wheel", scrollListener, { passive: false });
		}

		function removeScrollNormalizer(mapEl) {
			mapEl.removeEventListener("wheel", scrollListener);

			document.dispatchEvent(
				new CustomEvent("EMCDYNMAPPLUS_ADJUST_SCROLL", { detail: 60 }),
			);
		}

		return {
			addOptions,
			syncDynmapPlusLayerOptions,
			observeDynmapPlusLayerOptions,
			isDynmapPlusLeafletLayerLabel,
			addCheckboxOption,
			addLayerCheckboxOption,
			toggleDarkened,
			toggleServerInfo,
			toggleShowCapitalStars,
			toggleDarkMode,
			insertCustomStylesheets,
			loadDarkMode,
			unloadDarkMode,
			toggleScrollNormalize,
		};
	}

	globalThis[MENU_OPTIONS_KEY] = Object.freeze({
		createMenuOptions,
	});
})();
