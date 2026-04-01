(() => {
const TRANSFORM_HELPERS_KEY = "__EMCDYNMAPPLUS_MARKER_ENGINE_TRANSFORM__";
if (globalThis[TRANSFORM_HELPERS_KEY]) return;

function createMarkerEngineTransform({
	html,
	calcMarkerArea,
	calcPolygonArea,
	midrange,
	hashCode,
	checkOverclaimed,
	checkOverclaimedNationless,
	getNationAlliances,
	getCachedApiNations = () => null,
	defaultBlue = "#3fb4ff",
	defaultGreen = "#89c500",
} = {}) {
	if (!html) throw new Error("marker-engine transform helpers require html templates");
	if (typeof calcMarkerArea !== "function") throw new Error("marker-engine transform helpers require calcMarkerArea");
	if (typeof calcPolygonArea !== "function") throw new Error("marker-engine transform helpers require calcPolygonArea");
	if (typeof midrange !== "function") throw new Error("marker-engine transform helpers require midrange");
	if (typeof hashCode !== "function") throw new Error("marker-engine transform helpers require hashCode");
	if (typeof checkOverclaimed !== "function") throw new Error("marker-engine transform helpers require checkOverclaimed");
	if (typeof checkOverclaimedNationless !== "function") throw new Error("marker-engine transform helpers require checkOverclaimedNationless");
	if (typeof getNationAlliances !== "function") throw new Error("marker-engine transform helpers require getNationAlliances");

	function modifyDescription(marker, mapMode) {
		const town = marker.tooltip.match(/<b>(.*)<\/b>/)[1];
		const nation = marker.tooltip.match(/\(\b(?:Member|Capital)\b of (.*)\)\n/)?.[1];
		const isCapital = marker.tooltip.match(/\(Capital of (.*)\)/) != null;
		const mayor = marker.popup.match(/Mayor: <b>(.*)<\/b>/)?.[1];

		const residents = marker.popup.match(/<\/summary>\n    \t(.*)\n   \t<\/details>/)?.[1];
		const residentListRaw = residents.split(", ");
		const residentNum = residentListRaw.length;

		const councillors = marker.popup.match(/Councillors: <b>(.*)<\/b>/)?.[1]
			.split(", ")
			.filter((councillor) => councillor !== "None");

		const fixedTownName = town.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		const fixedNationName = nation?.replaceAll("<", "&lt;").replaceAll(">", "&gt;") ?? nation;
		const area = calcMarkerArea(marker);

		let location = { x: 0, z: 0 };
		if (marker.points) location = midrange(marker.points.flat(2));

		const isArchiveMode = mapMode === "archive";
		const residentList = isArchiveMode ? residents :
			residentListRaw.map((resident) => html.residentClickable.replaceAll("{player}", resident)).join(", ");
		const councillorList = isArchiveMode ? councillors :
			councillors.map((councillor) => html.residentClickable.replaceAll("{player}", councillor)).join(", ");

		if (residentNum > 50) {
			marker.popup = marker.popup.replace(residents, html.scrollableResidentList.replace("{list}", residentList));
		} else {
			marker.popup = marker.popup.replace(
				`${residents}\n`,
				`${html.residentList.replace("{list}", residentList)}\n`,
			);
		}

		marker.popup = marker.popup
			.replace("</details>\n   \t<br>", "</details>")
			.replace("Councillors:", `Size: <b>${area} chunks</b><br/>Councillors:`)
			.replace("<i>/town set board [msg]</i>", "<i></i>")
			.replace("<i></i> \n    <br>\n", "")
			.replace("\n    <i>", '\n    <i style="overflow-wrap: break-word">')
			.replace("Councillors: <b>None</b>\n\t<br>", "")
			.replace("Size: <b>0 chunks</b><br/>", "")
			.replace(town, fixedTownName)
			.replace(nation, fixedNationName)
			.replaceAll("<b>false</b>", '<b><span style="color: red">No</span></b>')
			.replaceAll("<b>true</b>", '<b><span style="color: green">Yes</span></b>');

		if (!isArchiveMode) {
			marker.popup = marker.popup
				.replace(/Mayor: <b>(.*)<\/b>/, `Mayor: <b>${html.residentClickable.replaceAll("{player}", mayor)}</b>`)
				.replace(/Councillors: <b>(.*)<\/b>/, `Councillors: <b>${councillorList}</b>`);
		}

		if (isCapital) {
			marker.popup = marker.popup.replace('<span style="font-size:120%;">', '<span style="font-size: 120%">&#9733; ');
		}

		marker.tooltip = marker.tooltip
			.replace("<i>/town set board [msg]</i>", "<i></i>")
			.replace("<br>\n    <i></i>", "")
			.replace("\n    <i>", '\n    <i id="clamped-board">')
			.replace(town, fixedTownName)
			.replace(nation, fixedNationName);

		if (mapMode === "alliances" || mapMode === "meganations") {
			const nationAlliances = getNationAlliances(nation, mapMode);
			if (nationAlliances.length > 0) {
				const allianceList = nationAlliances.map((alliance) => alliance.name).join(", ");
				const partOfLabel = html.partOfLabel.replace("{allianceList}", allianceList);
				marker.popup = marker.popup.replace("</span>\n", `</span></br>${partOfLabel}`);
			}
		}

		return {
			townName: fixedTownName,
			nationName: fixedNationName,
			residentNum,
			residentList: residentListRaw,
			isCapital,
			mayor,
			area,
			...location,
		};
	}

	function modifyDynmapDescription(marker, curArchiveDate) {
		const residents = marker.popup.match(/Members <span style="font-weight:bold">(.*)<\/span><br \/>Flags/)?.[1];
		const residentList = residents?.split(", ") ?? [];
		const residentNum = residentList.length;
		const isCapital = marker.popup.match(/capital: true/) != null;
		const area = calcPolygonArea(marker.points);
		const location = midrange(marker.points.flat(2));

		if (isCapital) marker.popup = marker.popup.replace('120%">', '120%">&#9733; ');
		if (curArchiveDate < 20220906) {
			marker.popup = marker.popup.replace(/">hasUpkeep:.+?(?<=<br \/>)/, '; white-space:pre">');
		} else {
			marker.popup = marker.popup.replace('">pvp:', '; white-space:pre">pvp:');
		}

		marker.popup = marker.popup
			.replace("Mayor", "Mayor:")
			.replace("Flags<br />", "<br>Flags<br>")
			.replace(">pvp:", ">PVP allowed:")
			.replace(">mobs:", ">Mob spawning:")
			.replace(">public:", ">Public status:")
			.replace(">explosion:", ">Explosions:&#9;")
			.replace(">fire:", ">Fire spread:&#9;")
			.replace(/<br \/>capital:.*<\/span>/, "</span>")
			.replaceAll("true<", '&#9;<span style="color:green">Yes</span><')
			.replaceAll("false<", '&#9;<span style="color:red">No</span><')
			.replace(`Members <span`, `Members <b>[${residentNum}]</b> <span`);
		if (area > 0) {
			marker.popup = marker.popup
				.replace(`</span><br /> Members`, `</span><br>Size:<span style="font-weight:bold"> ${area} chunks</span><br> Members`);
		}
		if (residentNum > 50) {
			marker.popup = marker.popup
				.replace(`<b>[${residentNum}]</b> <span style="font-weight:bold">`, `<b>[${residentNum}]</b> <div id="scrollable-list"><span style="font-weight:bold">`)
				.replace("<br>Flags", "</div><br>Flags");
		}

		const clean = marker.popup.replace(/<[^>]+>/g, "").trim().replace(/^\u2605\s*/, "");
		const [, town, nation] = clean.match(/^(.+?)\s*\((.+?)\)/) || [];

		return {
			townName: town?.trim() || null,
			nationName: nation?.trim() || null,
			residentList,
			residentNum,
			isCapital,
			area,
			...location,
		};
	}

	const colorMarker = (marker, fill, outline, weight = null) => {
		marker.fillColor = fill;
		marker.color = outline;
		if (weight) marker.weight = weight;
	};

	function colorTown(rawMarker, parsedMarker, mapMode) {
		const mayor = rawMarker.popup.match(/Mayor: <b>(.*)<\/b>/)?.[1];
		const isRuin = !!mayor?.match(/NPC[0-9]+/);
		if (isRuin) return colorMarker(rawMarker, "#000000", "#000000");

		const { nationName } = parsedMarker;
		if (mapMode === "meganations") {
			const isDefaultCol = rawMarker.color === defaultBlue && rawMarker.fillColor === defaultBlue;
			rawMarker.color = isDefaultCol ? "#363636" : defaultGreen;
			rawMarker.fillColor = isDefaultCol ? hashCode(nationName) : rawMarker.fillColor;
		} else if (mapMode === "overclaim") {
			const cachedApiNations = getCachedApiNations();
			const nation = nationName ? cachedApiNations?.get(nationName.toLowerCase()) : null;
			const overclaimInfo = !nation
				? checkOverclaimedNationless(parsedMarker.area, parsedMarker.residentNum)
				: checkOverclaimed(parsedMarker.area, parsedMarker.residentNum, nation.stats.numResidents);

			const colour = overclaimInfo.isOverclaimed ? "#ff0000" : "#00ff00";
			colorMarker(rawMarker, colour, colour, overclaimInfo.isOverclaimed ? 2 : 0.5);
		} else {
			colorMarker(rawMarker, "#000000", "#000000", 1);
		}

		const nationAlliances = getNationAlliances(nationName, mapMode);
		if (nationAlliances.length === 0) return;

		const { colours } = nationAlliances[0];
		const newWeight = nationAlliances.length > 1 ? 1.5 : 0.75;
		return colorMarker(rawMarker, colours.fill, colours.outline, newWeight);
	}

	function colorTownNationClaims(marker, nationName, claimsCustomizerInfo, useOpaque, showExcluded) {
		const nationColorInput = claimsCustomizerInfo.get(nationName?.toLowerCase());
		if (!nationColorInput) {
			if (useOpaque) marker.fillOpacity = marker.opacity = 0.5;
			if (!showExcluded) marker.fillOpacity = marker.opacity = 0;
			return colorMarker(marker, "#000000", "#000000", 1);
		}

		if (useOpaque) marker.fillOpacity = marker.opacity = 1;
		return colorMarker(marker, nationColorInput, nationColorInput, 1.5);
	}

	return {
		modifyDescription,
		modifyDynmapDescription,
		colorTown,
		colorTownNationClaims,
	};
}

globalThis[TRANSFORM_HELPERS_KEY] = Object.freeze({
	createMarkerEngineTransform,
});
})();
