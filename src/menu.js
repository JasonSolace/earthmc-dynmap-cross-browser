/** ANY CODE RELATING TO THE MAIN ONSCREEN EXTENSION MENU GOES HERE */
//console.log('emcdynmapplus: loaded menu')

// TODO: Use Custom Element Registry and convert the main menu into one.

const MAP_MODE_METADATA = [
	{
		value: "default",
		label: "Live Map",
		description: "Use the base map styling with only the shared enhancements.",
	},
	{
		value: "meganations",
		label: "Mega Nations",
		description: "Show mega-alliance colors directly on town claims.",
	},
	{
		value: "alliances",
		label: "Alliances",
		description: "Color towns by alliance ownership with clean borders.",
	},
	{
		value: "nationclaims",
		label: "Nation Claims",
		description: "Load the nation-claims customizer for manual color maps.",
	},
	{
		value: "overclaim",
		label: "Overclaim",
		description: "Highlight towns that exceed their current claim limits.",
	},
	{
		value: "planning",
		label: "Planning",
		description: "Draw simple custom nation circles directly on the live map.",
	},
	{
		value: "archive",
		label: "Archive",
		description:
			"Load the nearest historical snapshot from the Wayback archive.",
	},
];

const DEFAULT_MAP_MODE = "default";
const LIVE_MAP_MODE_METADATA = MAP_MODE_METADATA.filter(
	(option) => option.value !== "archive",
);
const LIVE_MAP_MODE_VALUES = new Set(
	LIVE_MAP_MODE_METADATA.map((option) => option.value),
);
const getMapModeMeta = (mode) =>
	MAP_MODE_METADATA.find((option) => option.value === mode) ||
	MAP_MODE_METADATA[0];
const LAST_LIVE_MAP_MODE_KEY = "emcdynmapplus-last-live-mapmode";
const SIDEBAR_EXPANDED_KEY = "emcdynmapplus-sidebar-expanded";
const DYNMAP_PLUS_LAYER_OWNER = "dynmapplus";
const DYNMAP_PLUS_LAYER_SECTION = "dynmapplus";
const SIDEBAR_UI_PREFIX = "emcdynmapplus[sidebar-ui]";

const MENU_PLANNING = globalThis.EMCDYNMAPPLUS_MENU_PLANNING;
if (!MENU_PLANNING) {
	throw new Error(
		"emcdynmapplus: menu planning helpers were not loaded before menu.js",
	);
}

const MENU_MAP_CONTROLS = globalThis.EMCDYNMAPPLUS_MENU_MAP_CONTROLS;
if (!MENU_MAP_CONTROLS) {
	throw new Error(
		"emcdynmapplus: menu map controls helpers were not loaded before menu.js",
	);
}

const MENU_OPTIONS = globalThis.EMCDYNMAPPLUS_MENU_OPTIONS;
if (!MENU_OPTIONS) {
	throw new Error(
		"emcdynmapplus: menu options helpers were not loaded before menu.js",
	);
}

const MENU_SIDEBAR = globalThis.EMCDYNMAPPLUS_MENU_SIDEBAR;
if (!MENU_SIDEBAR) {
	throw new Error(
		"emcdynmapplus: menu sidebar helpers were not loaded before menu.js",
	);
}

const {
	PLANNING_LEAFLET_ZOOM_ATTR,
	parseZoomFromTileUrl,
	getPlanningPreviewScaleInfo,
	getScaledPreviewDiameterMetrics,
	normalizePlanningRange,
	normalizePlanningNation,
	setPlanningPlacementArmed,
	addPlanningSection,
} = MENU_PLANNING;

const {
	addMapModeSection,
	applyMapModeSelection,
	addLocateMenu,
	searchArchive,
	isValidArchiveDateInput,
} = MENU_MAP_CONTROLS;

function isMenuDebugLoggingEnabled() {
	try {
		return localStorage["emcdynmapplus-debug"] === "true";
	} catch {
		return false;
	}
}

const menuDebugInfo = (...args) => {
	if (isMenuDebugLoggingEnabled()) console.info(...args);
};

const menuOptionsFactory = MENU_OPTIONS.createMenuOptions;
const menuOptions = menuOptionsFactory({
	createElement: (...args) => globalThis.createElement(...args),
	addElement: (...args) => globalThis.addElement(...args),
	getStoredCurrentMapMode: () => getStoredCurrentMapMode(),
});
const menuSidebarFactory = MENU_SIDEBAR.createMenuSidebar;
const menuSidebar = menuSidebarFactory({
	createElement: (...args) => globalThis.createElement(...args),
	addElement: (...args) => globalThis.addElement(...args),
	sidebarExpandedKey: SIDEBAR_EXPANDED_KEY,
	sidebarUiPrefix: SIDEBAR_UI_PREFIX,
	getStoredCurrentMapMode: () => getStoredCurrentMapMode(),
	getSidebarModeLabel: (mode) => getSidebarModeLabel(mode),
	formatMapModeLabel: (mode, archiveDateLabel) =>
		formatMapModeLabel(mode, archiveDateLabel),
	addLocateMenu: (...args) => addLocateMenu(...args),
	addMapModeSection: (...args) => addMapModeSection(...args),
	addPlanningSection: (...args) => addPlanningSection(...args),
	debugInfo: menuDebugInfo,
});

function addOptions(...args) {
	return menuOptions.addOptions(...args);
}

function syncDynmapPlusLayerOptions(...args) {
	return menuOptions.syncDynmapPlusLayerOptions(...args);
}

function resolveLinkedDynmapPlusLayerToggleChanges(...args) {
	return menuOptions.resolveLinkedDynmapPlusLayerToggleChanges(...args);
}

function insertCustomStylesheets(...args) {
	return menuOptions.insertCustomStylesheets(...args);
}

function toggleDarkened(...args) {
	return menuOptions.toggleDarkened(...args);
}

function toggleServerInfo(...args) {
	return menuOptions.toggleServerInfo(...args);
}

function toggleShowCapitalStars(...args) {
	return menuOptions.toggleShowCapitalStars(...args);
}

function toggleDarkMode(...args) {
	return menuOptions.toggleDarkMode(...args);
}

function loadDarkMode(...args) {
	return menuOptions.loadDarkMode(...args);
}

function unloadDarkMode(...args) {
	return menuOptions.unloadDarkMode(...args);
}

function toggleScrollNormalize(...args) {
	return menuOptions.toggleScrollNormalize(...args);
}

function addMainMenu(...args) {
	return menuSidebar.addMainMenu(...args);
}

function addSidebarSection(...args) {
	return menuSidebar.addSidebarSection(...args);
}

const isLiveMapMode = (mode) => LIVE_MAP_MODE_VALUES.has(mode);

function formatStoredArchiveDate(rawDate) {
	return typeof rawDate === "string" && /^\d{8}$/.test(rawDate)
		? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
		: "";
}

function getStoredArchiveDateLabel() {
	return formatStoredArchiveDate(localStorage["emcdynmapplus-archive-date"]);
}

function getStoredCurrentMapMode() {
	return localStorage["emcdynmapplus-mapmode"] ?? DEFAULT_MAP_MODE;
}

function getPreferredLiveMapMode(fallbackMode = null) {
	const resolvedFallbackMode = fallbackMode ?? getStoredCurrentMapMode();
	const storedMode = localStorage[LAST_LIVE_MAP_MODE_KEY];
	if (isLiveMapMode(storedMode)) return storedMode;
	if (isLiveMapMode(resolvedFallbackMode)) return resolvedFallbackMode;
	return DEFAULT_MAP_MODE;
}

function rememberPreferredLiveMapMode(mode) {
	if (!isLiveMapMode(mode)) return;
	localStorage[LAST_LIVE_MAP_MODE_KEY] = mode;
}

function getSidebarModeLabel(mode) {
	if (mode === "archive") return "Archive Snapshot";
	return getMapModeMeta(mode).label;
}

function formatMapModeLabel(
	mode,
	archiveDateLabel = getStoredArchiveDateLabel(),
) {
	if (mode === "archive")
		return archiveDateLabel
			? `Archive Snapshot: ${archiveDateLabel}`
			: "Archive Snapshot";
	return `View: ${getMapModeMeta(mode).label}`;
}
