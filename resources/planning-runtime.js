(() => {
const PLANNING_RUNTIME_KEY = "__EMCDYNMAPPLUS_PLANNING_RUNTIME__";
if (globalThis[PLANNING_RUNTIME_KEY]) return;

const PLANNING_STATE_UPDATED_EVENT = "EMCDYNMAPPLUS_PLANNING_STATE_UPDATED";
const PLANNING_TOWN_HOVER_EVENT = "EMCDYNMAPPLUS_PLANNING_TOWN_HOVER";

function cloneSerializable(value) {
	if (typeof value === "undefined") return undefined;

	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		try {
			if (typeof structuredClone === "function") return structuredClone(value);
		} catch {}

		return null;
	}
}

function parseEventDetail(detail) {
	if (typeof detail === "string") {
		try {
			return JSON.parse(detail);
		} catch {
			return null;
		}
	}

	return cloneSerializable(detail);
}

function dispatchPlanningStateUpdated(detail = {}) {
	if (!globalThis.document?.dispatchEvent || typeof globalThis.CustomEvent !== "function") {
		return false;
	}
	const payload = cloneSerializable(detail) ?? {};

	globalThis.document.dispatchEvent(
		new globalThis.CustomEvent(PLANNING_STATE_UPDATED_EVENT, {
			detail: JSON.stringify(payload),
		}),
	);
	return true;
}

function dispatchPlanningTownHover(detail = {}) {
	if (!globalThis.document?.dispatchEvent || typeof globalThis.CustomEvent !== "function") {
		return false;
	}
	const payload = cloneSerializable(detail) ?? {};

	globalThis.document.dispatchEvent(
		new globalThis.CustomEvent(PLANNING_TOWN_HOVER_EVENT, {
			detail: JSON.stringify(payload),
		}),
	);
	return true;
}

function createPlanningRuntime({
	planningRuntimePrefix = "emcdynmapplus[planning-runtime]",
	loadPlanningNations = () => [],
	debugInfo = () => {},
} = {}) {
	let initialized = false;
	let lastSnapshot = {
		nations: [],
		source: "uninitialized",
		detail: null,
	};

	function syncFromStorage(source = "runtime-sync", detail = null) {
		const nextNations = Array.isArray(loadPlanningNations())
			? loadPlanningNations()
			: [];
		lastSnapshot = {
			nations: cloneSerializable(nextNations) ?? [],
			source,
			detail: cloneSerializable(detail),
		};

		debugInfo(`${planningRuntimePrefix}: synced planning state`, {
			source,
			nationCount: lastSnapshot.nations.length,
		});
		return getSnapshot();
	}

	function getSnapshot() {
		return cloneSerializable(lastSnapshot) ?? {
			nations: [],
			source: "clone-failed",
			detail: null,
		};
	}

	function getPlanningNations() {
		return cloneSerializable(lastSnapshot.nations) ?? [];
	}

	function handlePlanningStateUpdated(event) {
		const rawDetail =
			event && typeof event === "object" && "detail" in event
				? event.detail
				: null;
		const detail = parseEventDetail(rawDetail);
		const source =
			typeof detail?.source === "string" && detail.source
				? detail.source
				: "planning-state-updated";
		return syncFromStorage(source, detail);
	}

	function init() {
		if (initialized) return getSnapshot();
		if (globalThis.document?.addEventListener) {
			globalThis.document.addEventListener(
				PLANNING_STATE_UPDATED_EVENT,
				handlePlanningStateUpdated,
			);
		}
		initialized = true;
		return syncFromStorage("planning-runtime-init");
	}

	return {
		PLANNING_STATE_UPDATED_EVENT,
		PLANNING_TOWN_HOVER_EVENT,
		init,
		syncFromStorage,
		getSnapshot,
		getPlanningNations,
		handlePlanningStateUpdated,
	};
}

globalThis[PLANNING_RUNTIME_KEY] = Object.freeze({
	PLANNING_STATE_UPDATED_EVENT,
	PLANNING_TOWN_HOVER_EVENT,
	dispatchPlanningStateUpdated,
	dispatchPlanningTownHover,
	createPlanningRuntime,
});
})();
