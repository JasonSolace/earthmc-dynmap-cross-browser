/** Sidebar shell and layout helpers for the Dynmap+ floating menu. */

(() => {
	const MENU_SIDEBAR_KEY = "EMCDYNMAPPLUS_MENU_SIDEBAR";
	if (globalThis[MENU_SIDEBAR_KEY]) return;

	function createMenuSidebar({
		createElement,
		addElement,
		sidebarExpandedKey = "emcdynmapplus-sidebar-expanded",
		sidebarUiPrefix = "emcdynmapplus[sidebar-ui]",
		getStoredCurrentMapMode = () => "default",
		getSidebarModeLabel = (mode) => mode,
		formatMapModeLabel = (mode) => mode,
		addLocateMenu,
		addMapModeSection,
		addPlanningSection,
		debugInfo = () => {},
	} = {}) {
		if (typeof createElement !== "function") {
			throw new Error("emcdynmapplus: menu sidebar helpers require createElement");
		}
		if (typeof addElement !== "function") {
			throw new Error("emcdynmapplus: menu sidebar helpers require addElement");
		}
		if (typeof addLocateMenu !== "function") {
			throw new Error("emcdynmapplus: menu sidebar helpers require addLocateMenu");
		}
		if (typeof addMapModeSection !== "function") {
			throw new Error("emcdynmapplus: menu sidebar helpers require addMapModeSection");
		}
		if (typeof addPlanningSection !== "function") {
			throw new Error("emcdynmapplus: menu sidebar helpers require addPlanningSection");
		}

		function updateSidebarContentPosition(sidebarSummary, sidebarContent) {
			if (
				!(sidebarSummary instanceof HTMLElement) ||
				!(sidebarContent instanceof HTMLElement)
			) {
				return;
			}

			const summaryRect = sidebarSummary.getBoundingClientRect();
			const viewportPadding = 12;
			const verticalGap = 8;
			const bottomControls = document.querySelector(".leaflet-bottom.leaflet-left");
			const bottomControlsRect =
				bottomControls instanceof HTMLElement
					? bottomControls.getBoundingClientRect()
					: null;
			const defaultBottomClearance = 112;
			const fallbackWidth = 292;
			const measuredWidth = sidebarContent.offsetWidth || fallbackWidth;
			const maxLeft = Math.max(
				viewportPadding,
				window.innerWidth - measuredWidth - viewportPadding,
			);
			const left = Math.min(
				Math.max(viewportPadding, Math.round(summaryRect.left)),
				maxLeft,
			);
			const top = Math.max(
				viewportPadding,
				Math.round(summaryRect.bottom + verticalGap),
			);
			const fallbackSafeBottom = window.innerHeight - defaultBottomClearance;
			const safeBottom =
				bottomControlsRect?.top && Number.isFinite(bottomControlsRect.top)
					? Math.min(
							fallbackSafeBottom,
							Math.round(bottomControlsRect.top - viewportPadding),
						)
					: fallbackSafeBottom;
			const maxHeight = Math.max(120, safeBottom - top);

			sidebarContent.style.left = `${left}px`;
			sidebarContent.style.top = `${top}px`;
			sidebarContent.style.maxHeight = `${maxHeight}px`;

			debugInfo(`${sidebarUiPrefix}: updated floating sidebar position`, {
				left,
				top,
				maxHeight,
				safeBottom,
				summaryRect: {
					left: Math.round(summaryRect.left),
					top: Math.round(summaryRect.top),
					bottom: Math.round(summaryRect.bottom),
				},
			});
		}

		function addSidebarSummary(sidebar, curMapMode) {
			return addElement(
				sidebar,
				createElement(
					"summary",
					{
						id: "sidebar-toggle",
					},
					[
						createElement("span", { className: "sidebar-summary-copy" }, [
							createElement("span", {
								className: "sidebar-summary-eyebrow",
								text: "Dynmap+",
							}),
							createElement("strong", {
								className: "sidebar-summary-title",
								text: "Map Toolkit",
							}),
							createElement("span", {
								id: "sidebar-summary-mode",
								className: "sidebar-summary-mode",
								text: getSidebarModeLabel(curMapMode),
							}),
						]),
						createElement("span", {
							className: "sidebar-summary-indicator",
							text: "v",
						}),
					],
				),
			);
		}

		function addSidebarHeader(sidebar, curMapMode) {
			const header = addElement(
				sidebar,
				createElement("div", { className: "sidebar-header" }),
			);

			const status = addElement(
				header,
				createElement("div", { className: "sidebar-status-row" }),
			);
			addElement(
				status,
				createElement("div", {
					id: "current-map-mode-label",
					className: "sidebar-mode-pill",
					text: formatMapModeLabel(curMapMode),
				}),
			);
		}

		function addSidebarSection(parent, title, description) {
			const section = addElement(
				parent,
				createElement("section", { className: "sidebar-section" }),
			);
			const header = addElement(
				section,
				createElement("div", { className: "sidebar-section-header" }),
			);
			addElement(
				header,
				createElement("h3", {
					className: "sidebar-section-title",
					text: title,
				}),
			);
			addElement(
				header,
				createElement("p", {
					className: "sidebar-section-copy",
					text: description,
				}),
			);
			return section;
		}

		function addMainMenu(parent) {
			const existingSidebar = parent.querySelector("#sidebar");
			if (existingSidebar) return existingSidebar;
			const scheduleLayoutUpdate =
				typeof globalThis.requestAnimationFrame === "function"
					? globalThis.requestAnimationFrame.bind(globalThis)
					: (callback) => callback();

			const curMapMode = getStoredCurrentMapMode();
			const isExpanded = localStorage[sidebarExpandedKey] === "true";
			const sidebar = addElement(
				parent,
				createElement("details", {
					id: "sidebar",
					className: "leaflet-control-layers leaflet-control",
					attrs: {
						"data-active-mode": curMapMode,
						...(isExpanded ? { open: "" } : {}),
					},
				}),
			);
			let sidebarSummary = null;
			let sidebarContent = null;
			sidebar.addEventListener("toggle", () => {
				localStorage[sidebarExpandedKey] = String(sidebar.open);
				if (sidebar.open) {
					scheduleLayoutUpdate(() =>
						updateSidebarContentPosition(sidebarSummary, sidebarContent),
					);
				}
			});
			sidebarSummary = addSidebarSummary(sidebar, curMapMode);
			const toggleSidebar = (event) => {
				event.preventDefault();
				event.stopPropagation();
				sidebar.open = !sidebar.open;
				localStorage[sidebarExpandedKey] = String(sidebar.open);
				if (sidebar.open) {
					scheduleLayoutUpdate(() =>
						updateSidebarContentPosition(sidebarSummary, sidebarContent),
					);
				}
			};
			sidebarSummary.addEventListener("click", toggleSidebar);
			sidebarSummary.addEventListener("keydown", (event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				toggleSidebar(event);
			});

			sidebarContent = addElement(
				sidebar,
				createElement("div", { id: "sidebar-content" }),
			);
			addSidebarHeader(sidebarContent, curMapMode);
			addLocateMenu(sidebarContent);
			addMapModeSection(sidebarContent, curMapMode);
			if (curMapMode === "planning") addPlanningSection(sidebarContent);

			if (typeof window?.addEventListener === "function") {
				window.addEventListener("resize", () =>
					updateSidebarContentPosition(sidebarSummary, sidebarContent),
				);
				window.addEventListener(
					"scroll",
					() => updateSidebarContentPosition(sidebarSummary, sidebarContent),
					true,
				);
			}
			scheduleLayoutUpdate(() =>
				updateSidebarContentPosition(sidebarSummary, sidebarContent),
			);

			return sidebar;
		}

		return {
			updateSidebarContentPosition,
			addMainMenu,
			addSidebarSummary,
			addSidebarHeader,
			addSidebarSection,
		};
	}

	globalThis[MENU_SIDEBAR_KEY] = Object.freeze({
		createMenuSidebar,
	});
})();
