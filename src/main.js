/** Content-side runtime helpers that are still needed after marker parsing moved to resources/marker-engine.js. */

bindNameplatePlayerLookup();
bindPopupResidentLookup();

/** @type {Array<ParsedMarker>} */
let parsedMarkers = [];

function bindNameplatePlayerLookup() {
	waitForElement(".leaflet-nameplate-pane").then((element) => {
		element.addEventListener("click", (event) => {
			const target = event.target;
			const username =
				target?.textContent?.trim() ||
				target?.parentElement?.parentElement?.textContent?.trim() ||
				"";
			if (!username) return;

			lookupPlayer(username, false);
		});
	});
}

function bindPopupResidentLookup() {
	waitForElement(".leaflet-popup-pane").then((element) => {
		element.addEventListener("click", (event) => {
			const target =
				event.target instanceof Element
					? event.target.closest(".resident-clickable")
					: null;
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

	const leafletTopLeft = document.querySelector(".leaflet-top.leaflet-left");
	if (!leafletTopLeft) {
		showAlert("Error selecting element required to show player info popup.");
		return;
	}

	const loading = addElement(
		leafletTopLeft,
		createElement("div", {
			id: "player-lookup-loading",
			className: "leaflet-control-layers leaflet-control",
			text: "Loading...",
		}),
	);

	const players = await postJSON(getCurrentOapiUrl("players"), {
		query: [playerName],
	});
	loading.remove();

	if (!players) return showAlert("Service is currently unavailable, please try later.", 5);
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
		leafletTopLeft,
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
