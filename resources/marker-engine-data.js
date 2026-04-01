(() => {
const DATA_HELPERS_KEY = "__EMCDYNMAPPLUS_MARKER_ENGINE_DATA__";
if (globalThis[DATA_HELPERS_KEY]) return;

function createMarkerEngineData({
	fetchJSON,
	getCurrentCapiUrl,
	getArchiveMarkersSourceUrl,
	parseStoredJson,
	parseColours,
	showPageAlert,
	updateArchiveModeLabel,
	exitArchiveModeAfterFailure,
	cloneSerializable,
	archiveDate,
	getCachedAlliances = () => null,
	debugInfo = () => {},
	proxyUrl = "",
	logPrefix = "emcdynmapplus[page-markers]",
	cachedArchives = new Map(),
	pendingArchiveLoads = new Map(),
} = {}) {
	if (typeof fetchJSON !== "function") {
		throw new Error("marker-engine data helpers require fetchJSON");
	}
	if (typeof getCurrentCapiUrl !== "function") {
		throw new Error("marker-engine data helpers require getCurrentCapiUrl");
	}
	if (typeof getArchiveMarkersSourceUrl !== "function") {
		throw new Error("marker-engine data helpers require getArchiveMarkersSourceUrl");
	}
	if (typeof parseStoredJson !== "function") {
		throw new Error("marker-engine data helpers require parseStoredJson");
	}
	if (typeof parseColours !== "function") {
		throw new Error("marker-engine data helpers require parseColours");
	}
	if (typeof cloneSerializable !== "function") {
		throw new Error("marker-engine data helpers require cloneSerializable");
	}
	if (typeof archiveDate !== "function") {
		throw new Error("marker-engine data helpers require archiveDate");
	}

	function getNationAlliances(nationName, mapMode) {
		const alliances = getCachedAlliances();
		if (alliances == null) return [];

		const nationAlliances = [];
		for (const alliance of alliances) {
			if (alliance.modeType !== mapMode) continue;

			const nations = [...alliance.ownNations, ...alliance.puppetNations];
			if (!nations.includes(nationName)) continue;

			nationAlliances.push({ name: alliance.name, colours: alliance.colours });
		}

		return nationAlliances;
	}

	async function getAlliances() {
		const alliances = await fetchJSON(getCurrentCapiUrl("alliances"));
		if (!alliances) {
			const cache = parseStoredJson("emcdynmapplus-alliances", null);
			if (cache == null) {
				showPageAlert?.("Service responsible for loading alliances will be available later.");
				return [];
			}

			showPageAlert?.("Service responsible for loading alliances is unavailable, falling back to locally cached data.", 5);
			return cache;
		}

		const childrenByParent = new Map();
		for (const alliance of alliances) {
			if (!alliance.parentAlliance) continue;
			const arr = childrenByParent.get(alliance.parentAlliance) || [];
			arr.push(alliance);
			childrenByParent.set(alliance.parentAlliance, arr);
		}

		const allianceData = [];
		for (const alliance of alliances) {
			const allianceType = alliance.type?.toLowerCase() || "mega";
			const children = childrenByParent.get(alliance.identifier) || [];
			allianceData.push({
				name: alliance.label || alliance.identifier,
				modeType: allianceType === "mega" ? "meganations" : "alliances",
				ownNations: alliance.ownNations || [],
				puppetNations: children.flatMap((entry) => entry.ownNations || []),
				colours: parseColours(alliance.optional.colours),
			});
		}

		localStorage["emcdynmapplus-alliances"] = JSON.stringify(allianceData);
		return allianceData;
	}

	const getArchiveURL = (date, markersURL) =>
		`https://web.archive.org/web/${date}id_/${markersURL}`;

	function normalizeArchivePayload(date, data, archive, convertOldMarkersStructure) {
		let normalizedData = cloneSerializable(data);
		let actualArchiveDate;
		if (date < 20240701) {
			if (!normalizedData?.[0] || typeof convertOldMarkersStructure !== "function") return null;
			normalizedData[0].markers = convertOldMarkersStructure(
				archive.sets["townyPlugin.markerset"],
			);
			actualArchiveDate = archive.timestamp;
		} else {
			normalizedData = cloneSerializable(archive);
			actualArchiveDate = archive[0]?.timestamp;
		}

		if (!normalizedData || !actualArchiveDate) return null;

		const formattedArchiveDate = new Date(parseInt(actualArchiveDate)).toLocaleDateString("en-ca");
		return { data: normalizedData, actualArchiveDate: formattedArchiveDate };
	}

	async function loadArchiveForDate(date, data, { convertOldMarkersStructure } = {}) {
		const markersURL = getArchiveMarkersSourceUrl(date);
		const archive = await fetchJSON(proxyUrl + getArchiveURL(date, markersURL));
		if (!archive) {
			console.warn(`${logPrefix}: archive fetch returned no data`, {
				requestedDate: date,
				markersURL,
			});
			return null;
		}

		return normalizeArchivePayload(
			date,
			data,
			archive,
			convertOldMarkersStructure,
		);
	}

	async function getArchive(data, { convertOldMarkersStructure } = {}) {
		const date = archiveDate();
		debugInfo(`${logPrefix}: getArchive started`, { requestedDate: date });

		let archiveResult = cachedArchives.get(date) ?? null;
		if (!archiveResult) {
			let pendingLoad = pendingArchiveLoads.get(date);
			if (!pendingLoad) {
				pendingLoad = (async () => {
					const markersURL = getArchiveMarkersSourceUrl(date);
					const archive = await fetchJSON(proxyUrl + getArchiveURL(date, markersURL));
					if (!archive) {
						console.warn(`${logPrefix}: archive fetch returned no data`, {
							requestedDate: date,
							markersURL,
						});
						return null;
					}

					return normalizeArchivePayload(
						date,
						data,
						archive,
						convertOldMarkersStructure,
					);
				})().finally(() => pendingArchiveLoads.delete(date));
				pendingArchiveLoads.set(date, pendingLoad);
			}

			archiveResult = await pendingLoad;
			if (archiveResult) cachedArchives.set(date, archiveResult);
		}

		if (!archiveResult) {
			const cachedArchive = cachedArchives.get(date);
			if (cachedArchive) {
				updateArchiveModeLabel?.(cachedArchive.actualArchiveDate);
				return cloneSerializable(cachedArchive.data) || data;
			}

			exitArchiveModeAfterFailure?.("Unable to communicate with the Wayback archive. Returned to the live map.");
			return data;
		}

		updateArchiveModeLabel?.(archiveResult.actualArchiveDate);
		if (archiveResult.actualArchiveDate.replaceAll("-", "") !== String(date)) {
			showPageAlert?.(`The closest archive to your prompt comes from ${archiveResult.actualArchiveDate}.`);
		}

		return cloneSerializable(archiveResult.data) || data;
	}

	return {
		getNationAlliances,
		getAlliances,
		getArchiveURL,
		loadArchiveForDate,
		getArchive,
	};
}

globalThis[DATA_HELPERS_KEY] = Object.freeze({
	createMarkerEngineData,
});
})();
