(() => {
const INTERCEPTOR_GUARD = "__EMCDYNMAPPLUS_INTERCEPTOR_INITIALIZED__";
if (window[INTERCEPTOR_GUARD]) {
	try {
		if (localStorage["emcdynmapplus-debug"] === "true") {
			console.info("emcdynmapplus[page]: interceptor already initialized, skipping duplicate injection");
		}
	} catch {}
	return;
}
window[INTERCEPTOR_GUARD] = true;

const { fetch: originalFetch } = window;
const LOG_PREFIX = "emcdynmapplus[page]";
const MARKER_EVENT_TIMEOUT_MS = 5000;
const PAGE_TILE_ZOOM_ATTR = "data-emcdynmapplus-tile-zoom";
const PAGE_TILE_URL_ATTR = "data-emcdynmapplus-tile-url";
const PAGE_TILE_DOMINANT_ZOOM_ATTR = "data-emcdynmapplus-tile-dominant-zoom";
const PAGE_TILE_SUMMARY_ATTR = "data-emcdynmapplus-tile-zoom-summary";
const TILE_HISTORY_WINDOW_MS = 2500;
const TILE_HISTORY_LIMIT = 80;
let markerRequestId = 0;
let lastPublishedTileKey = null;
let recentTileRequests = [];

function isDebugLoggingEnabled() {
	try {
		return localStorage["emcdynmapplus-debug"] === "true";
	} catch {
		return false;
	}
}

const debugInfo = (...args) => {
	if (isDebugLoggingEnabled()) console.info(...args);
};

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
		} catch (err) {
			console.warn(`${LOG_PREFIX}: failed to parse string event detail`, err);
			return null;
		}
	}

	return cloneSerializable(detail);
}

function getRequestUrl(input) {
	try {
		if (typeof input === "string") return resolveUrl(input);
		if (input instanceof URL) return resolveUrl(input.toString());
		if (input instanceof Request && typeof input.url === "string")
			return resolveUrl(input.url);
		if (input && typeof input.url === "string") return resolveUrl(input.url);
	} catch {}

	return "";
}

function getResponseUrl(response, fallback = "") {
	try {
		if (typeof response?.url === "string" && response.url.length > 0)
			return resolveUrl(response.url);
	} catch {}

	return resolveUrl(fallback);
}

function resolveUrl(url) {
	if (typeof url !== "string" || url.length === 0) return "";

	try {
		return new URL(url, window.location.href).toString();
	} catch {
		return url;
	}
}

function parseTileRequestInfo(url) {
	if (typeof url !== "string" || url.length === 0) return null;

	const match = url.match(/(?:^|\/)tiles\/([^/]+)\/(-?\d+)\/(-?\d+)_(-?\d+)\.(png|jpg|jpeg|webp)(?:[?#].*)?$/i);
	if (!match) return null;

	const [, world, zoomRaw, tileXRaw, tileYRaw] = match;
	const zoom = Number(zoomRaw);
	const tileX = Number(tileXRaw);
	const tileY = Number(tileYRaw);
	if (!Number.isFinite(zoom) || !Number.isFinite(tileX) || !Number.isFinite(tileY)) return null;

	return {
		world,
		zoom,
		tileX,
		tileY,
		url,
	};
}

function roundTo3(value) {
	return Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function summarizeRecentTileRequests(now = Date.now()) {
	recentTileRequests = recentTileRequests
		.filter((entry) => now - entry.at <= TILE_HISTORY_WINDOW_MS)
		.slice(-TILE_HISTORY_LIMIT);

	const zoomCounts = {};
	for (const entry of recentTileRequests) {
		const key = String(entry.zoom);
		zoomCounts[key] = (zoomCounts[key] || 0) + 1;
	}

	const dominantEntry = Object.entries(zoomCounts)
		.sort((left, right) => {
			if (right[1] !== left[1]) return right[1] - left[1];
			return Number(right[0]) - Number(left[0]);
		})[0] ?? null;
	const dominantZoom = dominantEntry ? Number(dominantEntry[0]) : null;

	return {
		dominantZoom,
		lastZoom: recentTileRequests.at(-1)?.zoom ?? null,
		sampleCount: recentTileRequests.length,
		windowMs: TILE_HISTORY_WINDOW_MS,
		zoomCounts,
		lastUrl: recentTileRequests.at(-1)?.url ?? null,
		lastAt: roundTo3(recentTileRequests.at(-1)?.at ?? null),
	};
}

function publishTileRequestState(url, source = "fetch") {
	const info = parseTileRequestInfo(url);
	if (!info) return null;

	const tileKey = `${info.world}:${info.zoom}:${info.tileX}:${info.tileY}`;
	const root = document.documentElement;
	if (!root) return info;
	const now = Date.now();

	recentTileRequests.push({
		at: now,
		zoom: info.zoom,
		url: info.url,
		tileX: info.tileX,
		tileY: info.tileY,
		world: info.world,
	});
	const summary = summarizeRecentTileRequests(now);

	root.setAttribute(PAGE_TILE_ZOOM_ATTR, String(info.zoom));
	root.setAttribute(PAGE_TILE_URL_ATTR, info.url);
	if (summary.dominantZoom != null) {
		root.setAttribute(PAGE_TILE_DOMINANT_ZOOM_ATTR, String(summary.dominantZoom));
	}
	root.setAttribute(PAGE_TILE_SUMMARY_ATTR, JSON.stringify(summary));

	if (tileKey !== lastPublishedTileKey) {
		lastPublishedTileKey = tileKey;
	}

	return info;
}

// Replace the default fetch() with ours to intercept responses
window.fetch = async (...args) => {
	const requestUrl = getRequestUrl(args[0]);
	let response = null;

	try {
		response = await originalFetch(...args);
	} catch (err) {
		console.error(
			`${LOG_PREFIX}: original fetch failed during interception`,
			{
				url: requestUrl,
				error: err,
			},
		);
		throw err;
	}

	try {
		const responseUrl = getResponseUrl(response, requestUrl);
		if (!response.ok && response.status != 304) return response;
		if (responseUrl.includes("web.archive.org")) return response;
		publishTileRequestState(responseUrl || requestUrl, "fetch-response");

		const isMarkers = responseUrl.includes("markers.json");
		const isSettings = responseUrl.includes(
			"minecraft_overworld/settings.json",
		);
		if (!isMarkers && !isSettings) return response;

		debugInfo(
			`${LOG_PREFIX}: intercepted ${isMarkers ? "markers" : "settings"} response`,
			{
				url: responseUrl,
				status: response.status,
			},
		);

		const start = performance.now();
		const data = await response
			.clone()
			.json()
			.catch((e) => {
				console.error(`${LOG_PREFIX}: failed to parse intercepted JSON`, e);
				return null;
			});
		if (data == null) {
			console.warn(
				`${LOG_PREFIX}: intercepted payload was null, returning original response`,
				{ url: responseUrl },
			);
			return response;
		}

		if (isSettings) {
			// `response.json()` already yields plain JSON data, so avoid an extra deep clone here.
			const modifiedData = modifySettings(data);
			if (modifiedData == null) {
				console.warn(
					`${LOG_PREFIX}: settings modification returned unserializable data, returning original response`,
					{ url: responseUrl },
				);
				return response;
			}

			const elapsed = performance.now() - start;
			debugInfo(`${LOG_PREFIX}: modified settings response`, {
				url: responseUrl,
				elapsedMs: Number(elapsed.toFixed(2)),
			});

			return new Response(JSON.stringify(modifiedData), {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			});
		}

		const requestId = ++markerRequestId;
		const markerModifier = window.EMCDYNMAPPLUS_PAGE_MARKERS?.modifyMarkers;
		if (typeof markerModifier !== "function") {
			console.warn(`${LOG_PREFIX}: marker modifier is unavailable, returning original response`, {
				id: requestId,
				url: responseUrl,
			});
			return response;
		}

		debugInfo(`${LOG_PREFIX}: dispatching markers event to page marker engine`, {
			id: requestId,
			url: responseUrl,
			layerCount: Array.isArray(data) ? data.length : null,
			markerCount: Array.isArray(data?.[0]?.markers)
				? data[0].markers.length
				: null,
		});
		const modifiedData = await Promise.race([
			markerModifier(data),
			new Promise((resolve) => setTimeout(() => resolve(null), MARKER_EVENT_TIMEOUT_MS)),
		]);
		if (modifiedData == null) {
			console.warn(
				`${LOG_PREFIX}: marker engine returned no data, returning original response`,
				{
					id: requestId,
					url: responseUrl,
					timeoutMs: MARKER_EVENT_TIMEOUT_MS,
				},
			);
			return response;
		}

		const elapsed = performance.now() - start;
		debugInfo(`${LOG_PREFIX}: returning modified markers response`, {
			id: requestId,
			url: responseUrl,
			elapsedMs: Number(elapsed.toFixed(2)),
			layerCount: Array.isArray(modifiedData)
				? modifiedData.length
				: null,
			markerCount: Array.isArray(modifiedData?.[0]?.markers)
				? modifiedData[0].markers.length
				: null,
		});

		return new Response(JSON.stringify(modifiedData), {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	} catch (err) {
		console.warn(
			`${LOG_PREFIX}: fetch interception failed after original response succeeded, returning original response`,
			{
				url: response?.url || requestUrl,
				error: err,
			},
		);
		return response;
	}
};

/** @param {Object} data - The settings response JSON data. */
function modifySettings(data) {
	// Set camera on Europe and zoom all the way out
	data.spawn = { x: 3400, z: -8800 };
	data.zoom.def = 0;

	data["player_tracker"].nameplates["heads_url"] =
		"https://mc-heads.net/avatar/{uuid}/16";
	data["player_tracker"].nameplates["show_heads"] = true;

	// I think these are all disabled server side but may as well ;)
	data["player_tracker"].update_interval = 5;
	data["player_tracker"].nameplates["show_health"] = true;
	data["player_tracker"].nameplates["show_armor"] = true;
	data["player_tracker"].nameplates["show_effects"] = true;

	return data;
}

document.addEventListener("EMCDYNMAPPLUS_ADJUST_SCROLL", (e) => {
	let adjustedZoom = null;
	try {
		if (typeof e.detail === "number" && Number.isFinite(e.detail))
			adjustedZoom = e.detail;
		else if (
			typeof e.detail?.pxPerZoomLevel === "number" &&
			Number.isFinite(e.detail.pxPerZoomLevel)
		) {
			adjustedZoom = e.detail.pxPerZoomLevel;
		}
	} catch (err) {
		console.warn(`${LOG_PREFIX}: could not read adjusted zoom detail`, err);
		return;
	}

	if (adjustedZoom == null) return;

	// Apply the zoom sensitivity adjustment via Leaflet
	if (window.L && window.L.Map) {
		window.L.Map.mergeOptions({ wheelPxPerZoomLevel: adjustedZoom });
	}
});
})();
