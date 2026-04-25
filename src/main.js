/** Content-side runtime helpers that are still needed after marker parsing moved to resources/marker-engine.js. */

bindNameplatePlayerLookup();
bindPopupResidentLookup();
bindSquaremapPlayerListLookup();

/** @type {Array<ParsedMarker>} */
let parsedMarkers = [];
const squaremapPlayerNameByUuid = new Map();
let lastNameplateLookupKey = "";
let lastNameplateLookupAt = 0;
const PLAYER_LOOKUP_TIMEOUT_MS = 10000;

function getEventElement(target) {
	if (target && typeof target.closest === "function") return target;
	return target?.parentElement && typeof target.parentElement.closest === "function"
		? target.parentElement
		: null;
}

function bindNameplatePlayerLookup() {
	document.addEventListener("click", handleNameplatePlayerLookupEvent, true);
	document.addEventListener("pointerup", handleNameplatePlayerLookupEvent, true);

	waitForElement(".leaflet-nameplate-pane").then((element) => {
		if (element) element.style.pointerEvents = "auto";
	});
}

function handleNameplatePlayerLookupEvent(event) {
	const target = getEventElement(event.target);
	if (!target) return;

	const username = getNameplatePlayerName(target);
	if (!username) return;

	const now = Date.now();
	const lookupKey = `${event.type}:${username}`;
	const previousLookupSamePlayer = lastNameplateLookupKey.endsWith(`:${username}`);
	if (previousLookupSamePlayer && now - lastNameplateLookupAt < 350) return;

	lastNameplateLookupKey = lookupKey;
	lastNameplateLookupAt = now;
	lookupPlayer(username, false);
}

/**
 * @param {Element} target
 */
function getNameplatePlayerName(target) {
	const tooltip = target.closest(".leaflet-nameplate-pane .leaflet-tooltip");
	if (tooltip) return sanitizeVisiblePlayerName(tooltip.textContent);

	if (!target.closest(".leaflet-nameplate-pane")) return "";

	return sanitizeVisiblePlayerName(
		target.textContent ||
			target.parentElement?.parentElement?.textContent ||
			"",
	);
}

function bindSquaremapPlayerListLookup() {
	document.addEventListener(
		"click",
		(event) => {
			const target = getEventElement(event.target);
			if (!target) return;

			const link = getSquaremapPlayerListLink(target);
			if (!link) return;

			resolveSquaremapPlayerName(link).then((playerName) => {
				if (!playerName) return;

				lookupPlayer(playerName);
			});
		},
		true,
	);
}

/**
 * @param {Element} target
 * @returns {HTMLAnchorElement | null}
 */
function getSquaremapPlayerListLink(target) {
	const link = target.closest("#players a[id]");
	return link?.tagName === "A" ? link : null;
}

/**
 * @param {string} value
 */
function normalizeSquaremapUuid(value) {
	return String(value || "").replaceAll("-", "").toLowerCase();
}

/**
 * @param {string} text
 */
function sanitizeVisiblePlayerName(text) {
	return String(text || "").trim();
}

/**
 * @param {HTMLAnchorElement} link
 */
async function resolveSquaremapPlayerName(link) {
	const uuid = normalizeSquaremapUuid(link.id);
	if (uuid && squaremapPlayerNameByUuid.has(uuid)) {
		return squaremapPlayerNameByUuid.get(uuid);
	}

	if (uuid) {
		const playersJsonUrl = new URL("tiles/players.json", location.href).toString();
		try {
			const playersJson = await fetchJSON(playersJsonUrl, { cache: "no-store" });
			const players = Array.isArray(playersJson?.players) ? playersJson.players : [];
			for (const player of players) {
				const playerUuid = normalizeSquaremapUuid(player?.uuid);
				const playerName = sanitizeVisiblePlayerName(player?.name);
				if (!playerUuid || !playerName) continue;

				squaremapPlayerNameByUuid.set(playerUuid, playerName);
			}
		} catch (err) {
			console.warn("emcdynmapplus: failed to resolve Squaremap player name", err);
		}

		if (squaremapPlayerNameByUuid.has(uuid)) {
			return squaremapPlayerNameByUuid.get(uuid);
		}
	}

	return sanitizeVisiblePlayerName(
		link.querySelector("span")?.textContent || link.textContent,
	);
}

function createTimeoutSignal(timeoutMs) {
	if (typeof AbortController !== "function") return {};

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	return {
		signal: controller.signal,
		cancel() {
			clearTimeout(timeoutId);
		},
	};
}

async function lookupPlayersByName(playerName) {
	const url = getCurrentOapiUrl("players");
	const timeout = createTimeoutSignal(PLAYER_LOOKUP_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			body: JSON.stringify({ query: [playerName] }),
			method: "POST",
			...(timeout.signal ? { signal: timeout.signal } : {}),
		});
		if (!response.ok && response.status !== 304) return null;

		return await response.json();
	} catch (err) {
		console.warn("emcdynmapplus: player lookup request failed", {
			url,
			playerName,
			err,
		});
		return null;
	} finally {
		timeout.cancel?.();
	}
}

function bindPopupResidentLookup() {
	waitForElement(".leaflet-popup-pane").then((element) => {
		element.addEventListener("click", (event) => {
			const eventTarget = getEventElement(event.target);
			const target =
				eventTarget?.closest(".resident-clickable") ?? null;
			const playerName = target?.textContent?.trim() ?? "";
			if (!playerName) return;

			lookupPlayer(playerName);
		});
	});
}

function formatLookupDate(timestamp) {
	if (!Number.isFinite(timestamp) || timestamp <= 0) return null;

	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

/**
 * @param {string} playerName
 * @param {boolean} showOnlineStatus
 */
async function lookupPlayer(playerName, showOnlineStatus = true) {
	document.querySelector("#player-lookup")?.remove();
	document.querySelector("#player-lookup-loading")?.remove();

	const lookupHost = getPlayerLookupHost();

	const loading = addElement(
		lookupHost,
		createElement("div", {
			id: "player-lookup-loading",
			className: "leaflet-control-layers leaflet-control",
			text: "Loading...",
		}),
	);

	const players = await lookupPlayersByName(playerName);
	loading.remove();

	if (!players) {
		return showAlert("Service is currently unavailable, please try later.", 5);
	}
	if (players.length < 1) {
		return showAlert(
			`Error looking up player: ${playerName}. They have possibly opted-out.`,
			3,
		);
	}

	const player = players[0] ?? {};
	const status = player.status ?? {};
	const ranks = player.ranks ?? {};
	const timestamps = player.timestamps ?? {};
	const town = player.town?.name ?? "";
	const nation = player.nation?.name ?? "";
	const hasTown = Boolean(player.town?.uuid || town || status.hasTown);
	const isOnline = Boolean(status.isOnline);
	const balance = player.stats?.balance ?? 0;
	const registeredDate = formatLookupDate(timestamps.registered);
	const townJoinDate = formatLookupDate(timestamps.joinedTownAt);
	const lastOnlineDate = formatLookupDate(timestamps.lastOnline);
	const about =
		!player.about || player.about === "/res set about [msg]" ? "" : player.about;

	let rank = "Townless";
	if (status.hasTown) rank = "Resident";
	if (Array.isArray(ranks.townRanks) && ranks.townRanks.includes("Councillor")) rank = "Councillor";
	if (status.isMayor) rank = "Mayor";
	if (Array.isArray(ranks.nationRanks) && ranks.nationRanks.includes("Chancellor")) rank = "Chancellor";
	if (status.isKing) rank = "Leader";

	const avatarKey = player.uuid
		? player.uuid.replaceAll("-", "")
		: encodeURIComponent(player.name || playerName);
	const lookup = addElement(
		lookupHost,
		createElement("div", {
			id: "player-lookup",
			className: "leaflet-control-layers leaflet-control",
		}),
	);

	const closeButton = addElement(
		lookup,
		createElement("button", {
			className: "close-container",
			text: "Close",
			type: "button",
		}),
	);
	const top = addElement(lookup, createElement("div", { className: "player-lookup-top" }));
	addElement(
		top,
		createElement("img", {
			id: "player-lookup-avatar",
			src: `https://mc-heads.net/avatar/${avatarKey}`,
		}),
	);

	const identity = addElement(
		top,
		createElement("div", { className: "player-lookup-identity" }),
	);
	addElement(
		identity,
		createElement("b", {
			id: "player-lookup-name",
			text: player.name || playerName,
		}),
	);
	if (showOnlineStatus) {
		addElement(
			identity,
			createElement("span", {
				id: "player-lookup-online",
				text: isOnline ? "Online" : "Offline",
				style: {
					color: isOnline ? "var(--success-color)" : "var(--danger-color)",
				},
			}),
		);
	}
	if (about) {
		addElement(
			identity,
			createElement("p", {
				className: "player-lookup-about",
				text: about,
			}),
		);
	}

	const stats = addElement(
		lookup,
		createElement("div", { className: "player-lookup-stats" }),
	);
	const appendStat = (label, value) =>
		addElement(
			stats,
			createElement("div", { className: "player-lookup-stat" }, [
				createElement("span", {
					className: "player-lookup-stat-label",
					text: label,
				}),
				createElement("strong", {
					className: "player-lookup-stat-value",
					text: value,
				}),
			]),
		);

	if (town) appendStat("Town", town);
	if (nation) appendStat("Nation", nation);
	appendStat("Rank", rank);
	appendStat("Balance", `${balance} gold`);

	const dates = addElement(
		lookup,
		createElement("div", { className: "player-lookup-meta" }),
	);
	const appendDateInfo = (label, dateText, relativeText) =>
		addElement(
			dates,
			createElement("div", { className: "player-lookup-meta-row" }, [
				createElement("span", {
					className: "player-lookup-meta-label",
					text: label,
				}),
				createElement("strong", {
					className: "player-lookup-meta-value",
					text: dateText,
				}),
				createElement("span", {
					className: "player-lookup-meta-subtle",
					text: relativeText,
				}),
			]),
		);

	if (registeredDate) {
		appendDateInfo(
			"Registered",
			registeredDate,
			timeAgo(timestamps.registered),
		);
	}
	if (hasTown && townJoinDate) {
		appendDateInfo("Joined town", townJoinDate, timeAgo(timestamps.joinedTownAt));
	}
	if (!isOnline && lastOnlineDate) {
		appendDateInfo("Last online", lastOnlineDate, timeAgo(timestamps.lastOnline));
	}

	closeButton.addEventListener("click", (event) => {
		event.target.parentElement.remove();
	});
}

function getPlayerLookupHost() {
	const existing = document.querySelector("#emcdynmapplus-player-lookup-host");
	if (existing) return existing;

	return addElement(
		document.body,
		createElement("div", {
			id: "emcdynmapplus-player-lookup-host",
		}),
	);
}

const DAY_MS = 86400000;

/**
 * Formats a timestamp into a compact relative string.
 * @param {number} ts
 */
function timeAgo(ts) {
	const diff = Date.now() - ts;
	const units = [
		["year", 365 * DAY_MS],
		["month", 30 * DAY_MS],
		["day", DAY_MS],
	];

	for (const [name, ms] of units) {
		const value = Math.floor(diff / ms);
		if (value >= 1) return `${value} ${name}${value > 1 ? "s" : ""} ago`;
	}

	return "Today";
}
