/** WHERE MAIN LOGIC HAPPENS. ANYTHING NOT RELATING TO HTTP/SETUP/DOM BELONGS HERE */
//console.log('emcdynmapplus: loaded main')

// Add clickable player nameplates
waitForElement('.leaflet-nameplate-pane').then(element => {
	element.addEventListener('click', event => {
		const username = event.target.textContent || event.target.parentElement.parentElement.textContent
		if (username.length > 0) {
			// TODO: We don't need to send a request every click. Use a ~10s expiring cache.
			lookupPlayer(username, false)
		}
	})
})

waitForElement('.leaflet-popup-pane').then(element => {
	element.addEventListener('click', event => {
		const target = event.target instanceof Element ? event.target.closest('.resident-clickable') : null
		const playerName = target?.textContent?.trim() ?? ''
		if (!playerName) return
		lookupPlayer(playerName)
	})
})

/** @type {Array<ParsedMarker>} */
let parsedMarkers = []

/** @type {Array<CachedAlliance>} */
let cachedAlliances = null

/** @type {Map<string, any>} */
let cachedApiNations = null

let cachedStyledBorders = null
let pendingBordersLoad = null

/** @type {Map<number, { data: MarkersResponse, actualArchiveDate: string }>} */
const cachedArchives = new Map()

/** @type {Map<number, Promise<{ data: MarkersResponse, actualArchiveDate: string } | null>>} */
const pendingArchiveLoads = new Map()

/** @typedef {typeof MAP_MODES[number]} MapMode */
const MAP_MODES = /** @type {const} */ (["default", "planning", "overclaim", "nationclaims", "meganations", "alliances"])
const EXTRA_BORDER_OPTS = {
	label: "Country Border",
	opacity: 0.5,
	weight: 3,
	color:  "#000000",
	markup: false,
}

const getCurrentDetectedMapType = () => globalThis.EMCDYNMAPPLUS_MAP?.getCurrentMapType?.() ?? 'aurora'
const getCurrentBordersResourcePath = () => globalThis.EMCDYNMAPPLUS_MAP?.getBorderResourcePath?.() ?? 'resources/borders.aurora.json'
const getCurrentChunkBounds = () => globalThis.EMCDYNMAPPLUS_MAP?.getChunkBounds?.(getCurrentDetectedMapType()) ?? {
	L: -33280,
	R: 33088,
	U: -16640,
	D: 16512,
}
const shouldInjectDynmapPlusChunksLayer = () =>
	globalThis.EMCDYNMAPPLUS_MAP?.shouldInjectDynmapPlusChunksLayer?.(getCurrentDetectedMapType()) ?? true
const getArchiveMarkersSourceUrl = (date) => globalThis.EMCDYNMAPPLUS_MAP?.getArchiveMarkersSourceUrl?.(date)
	?? (
		date < 20230212 ? 'https://earthmc.net/map/aurora/tiles/_markers_/marker_earth.json'
		: date < 20240701 ? 'https://earthmc.net/map/aurora/standalone/MySQL_markers.php?marker=_markers_/marker_earth.json'
		: 'https://map.earthmc.net/tiles/minecraft_overworld/markers.json'
	)
const getNationClaimBonus = (numNationResidents) =>
	globalThis.EMCDYNMAPPLUS_MAP?.getNationClaimBonus?.(numNationResidents, getCurrentDetectedMapType()) ?? 0

function getUserscriptBorders() {
	if (typeof BORDERS_BY_MAP !== 'undefined') {
		return BORDERS_BY_MAP[getCurrentDetectedMapType()] ?? BORDERS_BY_MAP.aurora ?? null
	}

	if (typeof BORDERS !== 'undefined') return BORDERS
	return null
}

function isDynmapPlusManagedLayerDataEntry(entry) {
	if (!entry || typeof entry !== 'object') return false
	return entry.id === 'chunks'
		|| entry.id === 'borders'
		|| entry.id === 'planning-nations'
}

function stripDynmapPlusManagedLayers(data) {
	return data.filter(entry => !isDynmapPlusManagedLayerDataEntry(entry))
}

function appendDynmapPlusManagedLayer(data, definition, layerEntry) {
	const nextData = data.filter(entry => entry?.id !== definition.id && entry?.name !== definition.name)
	nextData.push({
		...layerEntry,
		name: definition.name,
		id: definition.id,
	})
	return nextData
}

// Black
const DEFAULT_ALLIANCE_COLOURS = { fill: '#000000', outline: '#000000' }
const CHUNKS_PER_RES = 12

/** @type {() => MapMode | "archive"} */
const currentMapMode = () => localStorage['emcdynmapplus-mapmode'] ?? 'meganations'
const archiveDate = () => parseInt(localStorage['emcdynmapplus-archive-date'])

/** @type {() => Array<{color: string | null, input: string | null}>} */
const nationClaimsInfo = () => JSON.parse(localStorage['emcdynmapplus-nation-claims-info'] || '[]')

/** @param {MapMode} currentMode */
function switchMapMode(currentMode) {
	const nextModeIndex = (MAP_MODES.indexOf(currentMode) + 1) % MAP_MODES.length
	const nextMode = MAP_MODES[nextModeIndex]

	localStorage['emcdynmapplus-mapmode'] = nextMode
	location.reload()
}

/** @param {string} str */
const isNumeric = (str) => Number.isFinite(+str)

/** @param {number} num */
const roundTo16 = (num) => Math.round(num / 16) * 16

/** 
 * Fowler-Noll-Vo hash function
 * @param {string} str
 */
function hashCode(str) {
	let hexValue = 0x811c9dc5
	for (let i = 0; i < str.length; i++) {
		hexValue ^= str.charCodeAt(i)
		hexValue += (hexValue << 1) + (hexValue << 4) + (hexValue << 7) + (hexValue << 8) + (hexValue << 24)
	}

	return '#' + ((hexValue >>> 0) % 16777216).toString(16).padStart(6, '0')
}

/**
 * Shoelace formula
 * @param {Polygon} vertices 
 */
function calcPolygonArea(vertices) {
	let area = 0
	const amtVerts = vertices.length
	for (let i = 0; i < amtVerts; i++) {
		const j = (i + 1) % amtVerts

		// Vertices need rounding to 16 because data has imprecise coordinates
		area += roundTo16(vertices[i].x) * roundTo16(vertices[j].z)
		area -= roundTo16(vertices[j].x) * roundTo16(vertices[i].z)
	}

	return (Math.abs(area) / 2) / (16 * 16)
}

/**
 * Computes total area of a marker, accounting for holes.
 * @param {SquaremapMarker} marker
 * @returns {number}
 */
function calcMarkerArea(marker) {
    if (marker.type !== 'polygon') return 0

    let area = 0
    const processed = [] // Temp array of polys used to check existence of holes
    for (const multiPolygon of marker.points || []) {
        for (let polygon of multiPolygon) {
            if (!polygon || polygon.length < 3) continue

			// Filter out any NaN points
			polygon = polygon
				.map(v => ({ x: Number(v.x), z: Number(v.z) }))
				.filter(v => Number.isFinite(v.x) && Number.isFinite(v.z))
            
            if (polygon.length < 3) continue

            // Check if polygon is fully inside any previous polygon
            const isHole = processed.some(prev => polygon.every(v => pointInPolygon(v, prev)))
            area += isHole ? -calcPolygonArea(polygon) : calcPolygonArea(polygon)
            processed.push(polygon)
        }
    }

    return area
}

/**
 * Credit: James Halliday (substack)
 * @param {Vertex} vertex 
 * @param {Polygon} polygon
 */
function pointInPolygon(vertex, polygon) {
	let { x, z } = vertex
	let n = polygon.length
	let inside = false
	for (let i = 0, j = n - 1; i < n; j = i++) {
		let xi = polygon[i].x, xj = polygon[j].x
		let zi = polygon[i].z, zj = polygon[j].z

		let intersect = ((zi > z) != (zj > z))
			&& (x < (xj - xi) * (z - zi) / (zj - zi) + xi)
		if (intersect) inside = !inside
	}

	return inside
}

/** @param {number} n */
const roundToNearest16 = n => Math.round(n / 16) * 16

/**
 * Splits one stored border entry into one or more polyline segments.
 * `null`/`NaN` separators are treated as breaks so one country can store
 * multiple Polygon/MultiPolygon exterior rings without stray bridge lines.
 * @param {{x: Array<number|null>, z: Array<number|null>}} line
 * @returns {Array<Polygon>}
 */
function borderEntryToPolylines(line) {
	/** @type {Array<Polygon>} */
	const segments = []
	/** @type {Polygon} */
	let current = []
	const length = Math.max(line?.x?.length ?? 0, line?.z?.length ?? 0)

	for (let i = 0; i < length; i++) {
		const rawX = line?.x?.[i]
		const rawZ = line?.z?.[i]
		if (rawX == null || rawZ == null) {
			if (current.length > 1) segments.push(current)
			current = []
			continue
		}

		const x = Number(rawX)
		const z = Number(rawZ)
		if (!Number.isFinite(x) || !Number.isFinite(z)) {
			if (current.length > 1) segments.push(current)
			current = []
			continue
		}

		current.push({ x, z })
	}

	if (current.length > 1) segments.push(current)
	return segments
}

/**
 * @param {Polygon} vertices 
 * @returns {Vertex}
 */
function midrange(vertices) {
	let minX = Infinity, maxX = -Infinity
	let minZ = Infinity, maxZ = -Infinity

	for (const vert of vertices) {
		if (vert.x < minX) minX = vert.x
		if (vert.x > maxX) maxX = vert.x
		if (vert.z < minZ) minZ = vert.z
		if (vert.z > maxZ) maxZ = vert.z
	}

	return {
		x: roundToNearest16((minX + maxX) / 2),
		z: roundToNearest16((minZ + maxZ) / 2)
	}
}

/**
 * @param {MarkerPoints} linePoints
 * @param {string} weight 
 * @param {string} colour 
 */
const makePolyline = (linePoints, weight = 1, colour = '#ffffff') => ({
	'type': 'polyline', 'points': linePoints,
	'weight': weight, 'color': colour,
})

const MARKERS_LOG_PREFIX = 'emcdynmapplus[markers]'
const MAIN_PENDING_UI_ALERT_KEY = 'emcdynmapplus-pending-ui-alert'
const MAIN_LAST_LIVE_MAP_MODE_KEY = 'emcdynmapplus-last-live-mapmode'

function isMarkersDebugLoggingEnabled() {
	try {
		return localStorage['emcdynmapplus-debug'] === 'true'
	} catch {
		return false
	}
}

const markersDebugInfo = (...args) => {
	if (isMarkersDebugLoggingEnabled()) console.info(...args)
}

async function getStyledBorders() {
	if (cachedStyledBorders != null) return cachedStyledBorders

	if (isUserscript()) {
		const borders = getUserscriptBorders()
		if (!borders) return null

		cachedStyledBorders = Object.fromEntries(
			Object.entries(borders).map(([key, border]) => [key, { ...border, ...EXTRA_BORDER_OPTS }])
		)
		return cachedStyledBorders
	}

	if (!pendingBordersLoad) {
		pendingBordersLoad = fetch(getExtensionURL(getCurrentBordersResourcePath()))
			.then(async response => {
				if (!response.ok) return null

				const borders = await response.json()
				return Object.fromEntries(
					Object.entries(borders).map(([key, border]) => [key, { ...border, ...EXTRA_BORDER_OPTS }])
				)
			})
			.catch(err => {
				console.error(`${MARKERS_LOG_PREFIX}: failed to load borders resource`, err)
				return null
			})
			.finally(() => {
				pendingBordersLoad = null
			})
	}

	cachedStyledBorders = await pendingBordersLoad
	return cachedStyledBorders
}

/** 
 * @param {MarkersResponse} data - The markers response JSON data. 
 */
async function modifyMarkers(data) {
	let result = stripDynmapPlusManagedLayers(data)
	const initialMarkerCount = Array.isArray(result?.[0]?.markers) ? result[0].markers.length : 0

	const mapMode = currentMapMode()
	markersDebugInfo(`${MARKERS_LOG_PREFIX}: modifyMarkers started`, {
		mapMode,
		layerCount: Array.isArray(result) ? result.length : null,
		initialMarkerCount,
	})

	if (mapMode == 'archive') {
		markersDebugInfo(`${MARKERS_LOG_PREFIX}: loading archive markers`, { archiveDate: archiveDate() })
		result = await getArchive(result)
	}

	if (!result?.[0]?.markers?.length) {
		console.warn(`${MARKERS_LOG_PREFIX}: no markers found after initial load`, {
			mapMode,
			layerCount: Array.isArray(result) ? result.length : null,
		})
		showAlert('Unexpected error occurred while loading the map, EarthMC may be down. Try again later.')
		return result
	}

	const isAllianceMode = mapMode == 'alliances' || mapMode == 'meganations'
    if (isAllianceMode && cachedAlliances == null) {
		markersDebugInfo(`${MARKERS_LOG_PREFIX}: loading alliances cache`)
        cachedAlliances = await getAlliances()
		markersDebugInfo(`${MARKERS_LOG_PREFIX}: alliances cache loaded`, {
			count: Array.isArray(cachedAlliances) ? cachedAlliances.length : null,
		})
    }

	if (mapMode == 'overclaim' && cachedApiNations == null) {
		markersDebugInfo(`${MARKERS_LOG_PREFIX}: loading overclaim nation cache`)
		const nationsUrl = getCurrentOapiUrl('nations')
		const nlist = await fetchJSON(nationsUrl)
		const apiNations = await queryConcurrent(nationsUrl, nlist)
		cachedApiNations = new Map(apiNations.map(n => [n.name.toLowerCase(), n]))
		markersDebugInfo(`${MARKERS_LOG_PREFIX}: overclaim nation cache loaded`, {
			count: cachedApiNations.size,
		})
	}

	parsedMarkers = []
	if (shouldInjectDynmapPlusChunksLayer()) {
		result = addChunksLayer(result)
	}
	markersDebugInfo(`${MARKERS_LOG_PREFIX}: chunks layer added`, {
		layerCount: Array.isArray(result) ? result.length : null,
	})

	const borders = await getStyledBorders()
	if (!borders) showAlert("An unexpected error occurred fetching the borders resource file.")
	else {
		result = addCountryBordersLayer(result, borders) || result
		markersDebugInfo(`${MARKERS_LOG_PREFIX}: borders layer added`, {
			borderCount: Object.keys(borders).length,
			layerCount: Array.isArray(result) ? result.length : null,
		})
	}
	
	// Get current local storage values
	const date = archiveDate()
	const isSquaremap = mapMode != 'archive' || date >= 20240701

	const claimsCustomizerInfo = new Map(nationClaimsInfo()
		.filter(obj => obj.input != null)
		.map(obj => [obj.input?.toLowerCase(), obj.color])
	)

	const useOpaque = localStorage['emcdynmapplus-nation-claims-opaque-colors'] == 'true' ? true : false
	const showExcluded = localStorage['emcdynmapplus-nation-claims-show-excluded'] == 'true' ? true : false

	const start = performance.now()
	let processedPolygons = 0
	let skippedMarkers = 0
	let markerErrors = 0
	for (const marker of result[0].markers) {
		if (marker.type != 'polygon' && marker.type != 'icon') {
			skippedMarkers++
			continue
		}

		try {
			const parsedInfo = isSquaremap ? modifyDescription(marker, mapMode) : modifyDynmapDescription(marker, date)
			if (marker.type != 'polygon') continue

			parsedMarkers.push(parsedInfo)
			processedPolygons++

			// Universal properties
			marker.opacity = 1
			marker.fillOpacity = 0.33
			marker.weight = 1.5

			if (mapMode == 'default' || mapMode == 'archive') continue
			if (mapMode == 'nationclaims') {
				colorTownNationClaims(marker, parsedInfo.nationName, claimsCustomizerInfo, useOpaque, showExcluded)
				continue
			}

			// All other modes (alliances, meganations, overclaim)
			colorTown(marker, parsedInfo, mapMode)
		} catch (err) {
			markerErrors++
			console.error(`${MARKERS_LOG_PREFIX}: failed to process marker`, {
				index: processedPolygons + skippedMarkers + markerErrors - 1,
				type: marker?.type,
				tooltip: marker?.tooltip?.slice?.(0, 120) || null,
				error: err,
			})
		}
	}
	
	const elapsed = (performance.now() - start)
	markersDebugInfo(`${MARKERS_LOG_PREFIX}: modifyMarkers completed`, {
		mapMode,
		processedPolygons,
		skippedMarkers,
		markerErrors,
		parsedMarkersCount: parsedMarkers.length,
		elapsedMs: Number(elapsed.toFixed(2)),
	})

	return result
}

/** @param {MarkersResponse} data - The markers response JSON data. */
function addChunksLayer(data) {
	const { L, R, U, D } = getCurrentChunkBounds()
	const ver = (x) => [{ x, z: U }, { x, z: D }, { x, z: U }]
	const hor = (z) => [{ x: L, z }, { x: R, z }, { x: L, z }]
	
	/** @type {MarkerPoints} */
	const chunkLines = []
	for (let x = L; x <= R; x += 16) chunkLines.push(ver(x))
	for (let z = U; z <= D; z += 16) chunkLines.push(hor(z))

	return appendDynmapPlusManagedLayer(data, {
		name: 'Chunks',
		id: 'chunks',
	}, {
		'hide': true,
		'control': true,
		'markers': [makePolyline(chunkLines, 0.33, '#000000')]
	})
}

/**
 * @param {MarkersResponse} data - The markers response JSON data.
 * @param {Object} borders - The borders JSON data.
 */
function addCountryBordersLayer(data, borders) {
	try {
		const points = Object.values(borders).flatMap(line => borderEntryToPolylines(line))

		return appendDynmapPlusManagedLayer(data, {
			name: 'Country Borders',
			id: 'borders',
		}, {
			'order': 999,
			'hide': true,
			'control': true,
			'markers': [makePolyline(points)]
		})
	} catch (e) {
		showAlert(`Could not set up a layer of country borders. You may need to clear this website's data. If problem persists, contact the developer.`)
		console.error(e)
		return null
	}
}

/**
 * Modifies a town description of a Squaremap marker.
 * @param {SquaremapMarker} marker
 * @param {MapMode} mapMode - The currently selected map mode.
 * 
 * @returns {ParsedMarker}
 */
function modifyDescription(marker, mapMode) {
	const town = marker.tooltip.match(/<b>(.*)<\/b>/)[1]
	const nation = marker.tooltip.match(/\(\b(?:Member|Capital)\b of (.*)\)\n/)?.[1]
	const isCapital = marker.tooltip.match(/\(Capital of (.*)\)/) != null
	const mayor = marker.popup.match(/Mayor: <b>(.*)<\/b>/)?.[1]

	const residents = marker.popup.match(/<\/summary>\n    \t(.*)\n   \t<\/details>/)?.[1]
	const residentNum = residents.split(', ').length

	const councillors = marker.popup.match(/Councillors: <b>(.*)<\/b>/)?.[1]
		.split(', ').filter(councillor => councillor != 'None')

	// Fix a bug with names that are wrapped in angle brackets
	const fixedTownName = town.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
	const fixedNationName = nation?.replaceAll('<', '&lt;').replaceAll('>', '&gt;') ?? nation

	const area = calcMarkerArea(marker) // Area excluding interior holes

	let location = { x: 0, z: 0 }
	if (marker.points) location = midrange(marker.points.flat(2))

	// Create clickable resident lists
	const isArchiveMode = mapMode == 'archive'
	const residentList = isArchiveMode ? residents :
		residents.split(', ').map(resident => INSERTABLE_HTML.residentClickable.replaceAll('{player}', resident)).join(', ')
	const councillorList = isArchiveMode ? councillors :
		councillors.map(councillor => INSERTABLE_HTML.residentClickable.replaceAll('{player}', councillor)).join(', ')

	// Modify description
	if (residentNum > 50) {
		marker.popup = marker.popup.replace(residents, INSERTABLE_HTML.scrollableResidentList.replace('{list}', residentList))
	} else {
		marker.popup = marker.popup.replace(residents + '\n', INSERTABLE_HTML.residentList.replace('{list}', residentList) + '\n')
	}

	marker.popup = marker.popup
		.replace('</details>\n   \t<br>', '</details>') // Remove line break
		.replace('Councillors:', `Size: <b>${area} chunks</b><br/>Councillors:`) // Add size info
		.replace('<i>/town set board [msg]</i>', '<i></i>') // Remove default town board
		.replace('<i></i> \n    <br>\n', '') // Remove empty town board
		.replace('\n    <i>', '\n    <i style="overflow-wrap: break-word">') // Wrap long town board
		.replace('Councillors: <b>None</b>\n\t<br>', '') // Remove none councillors info
		.replace('Size: <b>0 chunks</b><br/>', '') // Remove 0 chunks town size info
		.replace(town, fixedTownName)
		.replace(nation, fixedNationName)
		.replaceAll('<b>false</b>', '<b><span style="color: red">No</span></b>') // 'False' flag
		.replaceAll('<b>true</b>', '<b><span style="color: green">Yes</span></b>') // 'True' flag
	
	if (!isArchiveMode) {
		marker.popup = marker.popup
		.replace(/Mayor: <b>(.*)<\/b>/, `Mayor: <b>${INSERTABLE_HTML.residentClickable.replaceAll('{player}', mayor)}</b>`) // Lookup mayor
		.replace(/Councillors: <b>(.*)<\/b>/, `Councillors: <b>${councillorList}</b>`) // Lookup a councillor in the list
	}
	if (isCapital) {
		// Prepend star indicating a capital
		marker.popup = marker.popup.replace('<span style="font-size:120%;">', '<span style="font-size: 120%">★ ')
	}

	marker.tooltip = marker.tooltip
		.replace('<i>/town set board [msg]</i>', '<i></i>')
		.replace('<br>\n    <i></i>', '')
		.replace('\n    <i>', '\n    <i id="clamped-board">') // Clamp long town board
		.replace(town, fixedTownName)
		.replace(nation, fixedNationName)

	if (mapMode == 'alliances' || mapMode == 'meganations') {
		// Add 'Part of' label
		const nationAlliances = getNationAlliances(nation, mapMode)
		if (nationAlliances.length > 0) {
			const allianceList = nationAlliances.map(alliance => alliance.name).join(', ')
			const partOfLabel = INSERTABLE_HTML.partOfLabel.replace('{allianceList}', allianceList)
			marker.popup = marker.popup.replace('</span>\n', '</span></br>' + partOfLabel)
		}
	}

	return {
		townName: fixedTownName, 
		nationName: fixedNationName,
		residentNum, residentList: residents.split(', '), 
		isCapital, mayor, area, ...location
	}
}

/**
 * Modifies a town description of a Dynmap archive marker.
 * @param {DynmapMarker} marker 
 * @param {number} curArchiveDate - Date as a number in the format YYYYDDMM
 * @returns {ParsedMarker}
 */
function modifyDynmapDescription(marker, curArchiveDate) {
	const residents = marker.popup.match(/Members <span style="font-weight:bold">(.*)<\/span><br \/>Flags/)?.[1]
	const residentList = residents?.split(', ') ?? []
	const residentNum = residentList.length
	const isCapital = marker.popup.match(/capital: true/) != null
	const area = calcPolygonArea(marker.points)
	const location = midrange(marker.points.flat(2))

	// Modify description
	if (isCapital) marker.popup = marker.popup.replace('120%">', '120%">★ ') // Prepend star indicating a capital
	if (curArchiveDate < 20220906) {
		marker.popup = marker.popup.replace(/">hasUpkeep:.+?(?<=<br \/>)/, '; white-space:pre">')
	}
	else marker.popup = marker.popup.replace('">pvp:', '; white-space:pre">pvp:')

	marker.popup = marker.popup
		.replace("Mayor", "Mayor:")
		.replace('Flags<br />', '<br>Flags<br>')
		.replace('>pvp:', '>PVP allowed:')
		.replace('>mobs:', '>Mob spawning:')
		.replace('>public:', '>Public status:')
		.replace('>explosion:', '>Explosions:&#9;')
		.replace('>fire:', '>Fire spread:&#9;')
		.replace(/<br \/>capital:.*<\/span>/, '</span>')
		.replaceAll('true<', '&#9;<span style="color:green">Yes</span><')
		.replaceAll('false<', '&#9;<span style="color:red">No</span><')
		.replace(`Members <span`, `Members <b>[${residentNum}]</b> <span`)
	if (area > 0) {
		marker.popup = marker.popup
		.replace(`</span><br /> Members`, `</span><br>Size:<span style="font-weight:bold"> ${area} chunks</span><br> Members`)
	}
	// Scrollable resident list
	if (residentNum > 50) {
		marker.popup = marker.popup
			.replace(`<b>[${residentNum}]</b> <span style="font-weight:bold">`,
				`<b>[${residentNum}]</b> <div id="scrollable-list"><span style="font-weight:bold">`)
			.replace('<br>Flags', '</div><br>Flags')
	}

	// Strip all HTML tags and leading star so we can get town and nation names.
	const clean = marker.popup.replace(/<[^>]+>/g, '').trim().replace(/^★\s*/, '')
	const [, town, nation] = (clean.match(/^(.+?)\s*\((.+?)\)/) || [])

	return {
		townName: town?.trim() || null,
		nationName: nation?.trim() || null,
		residentList, residentNum, 
		isCapital, area, ...location
	}
}

/** 
 * Sets the colours of a marker with optional weight and returns it back.
 * @param {Marker} marker 
 */
const colorMarker = (marker, fill, outline, weight=null) => {
	marker.fillColor = fill
	marker.color = outline
	if (weight) marker.weight = weight
}

const DEFAULT_BLUE = '#3fb4ff'
const DEFAULT_GREEN = '#89c500'

/**
 * @param {Marker} rawMarker
 * @param {ParsedMarker} parsedMarker
 * @param {MapMode} mapMode - The currently selected map mode.
 */
function colorTown(rawMarker, parsedMarker, mapMode) {
	const mayor = rawMarker.popup.match(/Mayor: <b>(.*)<\/b>/)?.[1]
	const isRuin = !!mayor?.match(/NPC[0-9]+/)
	if (isRuin) return colorMarker(rawMarker, '#000000', '#000000')

	const { nationName } = parsedMarker

	if (mapMode == 'meganations') {
		const isDefaultCol = rawMarker.color == DEFAULT_BLUE && rawMarker.fillColor == DEFAULT_BLUE
		rawMarker.color = isDefaultCol ? '#363636' : DEFAULT_GREEN
		rawMarker.fillColor = isDefaultCol ? hashCode(nationName) : rawMarker.fillColor
	}
	else if (mapMode == 'overclaim') {
		const nation = nationName ? cachedApiNations.get(nationName.toLowerCase()) : null
		const overclaimInfo = !nation
			? checkOverclaimedNationless(parsedMarker.area, parsedMarker.residentNum)
			: checkOverclaimed(parsedMarker.area, parsedMarker.residentNum, nation.stats.numResidents)

		const colour = overclaimInfo.isOverclaimed ? '#ff0000' : '#00ff00'
		colorMarker(rawMarker, colour, colour, overclaimInfo.isOverclaimed ? 2 : 0.5)
	}
	else colorMarker(rawMarker, '#000000', '#000000', 1) // 'alliances' mode

	// Properties for alliances and meganations
	const nationAlliances = getNationAlliances(nationName, mapMode)
	if (nationAlliances.length == 0) return
	
	const { colours } = nationAlliances[0] // First alliance in related alliances
	const newWeight = nationAlliances.length > 1 ? 1.5 : 0.75 // Use bolder weight if many related alliances
	return colorMarker(rawMarker, colours.fill, colours.outline, newWeight)
}

/**
 * @param {Marker} marker
 * @param {string} nationName
 * @param {Map<string|null, string|null>} claimsCustomizerInfo
 */
function colorTownNationClaims(marker, nationName, claimsCustomizerInfo, useOpaque, showExcluded) {
	//const strippedName = nationName?.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
	const nationColorInput = claimsCustomizerInfo.get(nationName?.toLowerCase())
	if (!nationColorInput) {
		if (useOpaque) marker.fillOpacity = marker.opacity = 0.5
		if (!showExcluded) marker.fillOpacity = marker.opacity = 0 // Make town invisible if not part of a nation in claims customizer.

		return colorMarker(marker, '#000000', '#000000', 1)
	}

	if (useOpaque) marker.fillOpacity = marker.opacity = 1 // 100% opacity similar to manual player drawn claim maps
	return colorMarker(marker, nationColorInput, nationColorInput, 1.5)
}

/**
 * @param {string} playerName
 * @param {boolean} showOnlineStatus 
 */
async function lookupPlayer(playerName, showOnlineStatus = true) {
	document.querySelector('#player-lookup')?.remove()
	document.querySelector('#player-lookup-loading')?.remove()
	
	const leafletTL = document.querySelector('.leaflet-top.leaflet-left')
	if (!leafletTL) return showAlert('Error selecting element required to show player info popup.')

	const loading = addElement(leafletTL, createElement('div', {
		id: 'player-lookup-loading',
		className: 'leaflet-control-layers leaflet-control',
		text: 'Loading...',
	}))
	const players = await postJSON(getCurrentOapiUrl('players'), { query: [playerName] })

	loading.remove()

	if (!players) return showAlert('Service is currently unavailable, please try later.', 5)
	if (players.length < 1) return showAlert(`Error looking up player: ${playerName}. They have possibly opted-out.`, 3)
	
	const player = players[0]
	const hasTown = player.town && player.town.uuid

	const lookup = addElement(leafletTL, createElement('div', {
		id: 'player-lookup',
		className: 'leaflet-control-layers leaflet-control',
	}))

	// Gather data
	const isOnline = player.status.isOnline
	const balance = player.stats.balance
	const town = player.town.name
	const nation = player.nation.name

	const registeredDate = new Date(player.timestamps.registered).toLocaleDateString()
	const townJoinDate = new Date(player.timestamps.joinedTownAt || 0).toLocaleDateString()
	const loDate = new Date(player.timestamps.lastOnline).toLocaleDateString()

	const about = (!player.about || player.about == '/res set about [msg]') ? '' : player.about
	let rank = 'Townless'
	if (player.status.hasTown) rank = 'Resident'
	if (player.ranks.townRanks.includes('Councillor')) rank = 'Councillor'
	if (player.status.isMayor) rank = 'Mayor'
	if (player.ranks.nationRanks.includes('Chancellor')) rank = 'Chancellor'
	if (player.status.isKing) rank = 'Leader'

	// Place data
	const playerAvatarURL = `https://mc-heads.net/avatar/${player.uuid.replaceAll('-', '')}`
	const closeButton = addElement(lookup, createElement('button', {
		className: 'close-container',
		text: 'Close',
		type: 'button',
	}))
	const top = addElement(lookup, createElement('div', { className: 'player-lookup-top' }))
	addElement(top, createElement('img', {
		id: 'player-lookup-avatar',
		src: playerAvatarURL,
	}))
	const identity = addElement(top, createElement('div', { className: 'player-lookup-identity' }))
	addElement(identity, createElement('b', {
		id: 'player-lookup-name',
		text: player.name || playerName,
	}))
	if (showOnlineStatus) {
		addElement(identity, createElement('span', {
			id: 'player-lookup-online',
			text: isOnline ? 'Online' : 'Offline',
			style: { color: isOnline ? 'var(--success-color)' : 'var(--danger-color)' },
		}))
	}
	if (about) {
		addElement(identity, createElement('p', {
			className: 'player-lookup-about',
			text: about,
		}))
	}
	const stats = addElement(lookup, createElement('div', { className: 'player-lookup-stats' }))
	const appendStat = (label, value) => addElement(stats, createElement('div', {
		className: 'player-lookup-stat',
	}, [
		createElement('span', {
			className: 'player-lookup-stat-label',
			text: label,
		}),
		createElement('strong', {
			className: 'player-lookup-stat-value',
			text: value,
		}),
	]))

	if (town) appendStat('Town', town)
	if (nation) appendStat('Nation', nation)
	appendStat('Rank', rank)
	appendStat('Balance', `${balance} gold`)

	const dates = addElement(lookup, createElement('div', { className: 'player-lookup-meta' }))
	const appendDateInfo = (label, dateText, relativeText) => addElement(dates, createElement('div', {
		className: 'player-lookup-meta-row',
	}, [
		createElement('span', {
			className: 'player-lookup-meta-label',
			text: label,
		}),
		createElement('strong', {
			className: 'player-lookup-meta-value',
			text: dateText,
		}),
		createElement('span', {
			className: 'player-lookup-meta-subtle',
			text: relativeText,
		}),
	]))

	appendDateInfo('Registered', registeredDate, timeAgo(player.timestamps.registered))
	if (hasTown) appendDateInfo('Joined town', townJoinDate, timeAgo(player.timestamps.joinedTownAt))
	if (!isOnline) appendDateInfo('Last online', loDate, timeAgo(player.timestamps.lastOnline))

	closeButton.addEventListener('click', event => { event.target.parentElement.remove() })
	return
	/* legacy placeholder rendering removed
	lookup.innerHTML = lookup.innerHTML
		.replace('{player}', player.name || playerName)
		.replace('{about}', about)
		.replace('{show-online-status}', showOnlineStatus ? onlineStatus : '')
		.replace('{online-color}', isOnline ? 'green' : 'red')
		.replace('{online}', isOnline ? '⚫︎ Online' : '○ Offline')
		.replace('{town}', town ? `Town: <b>${town}</b><br>` : '')
		.replace('{nation}', nation ? `Nation: <b>${nation}</b><br>` : '')
		.replace('{rank}', rank)
		.replace('{balance}', balance)
		.replace('{registered}', `Registered:<br><b>${registeredDate}</b> (${timeAgo(player.timestamps.registered)})`)

	if (hasTown) {
		const townJoinStr = `<br>Joined town:<br><b>${townJoinDate}</b> (${timeAgo(player.timestamps.joinedTownAt)})`
		lookup.innerHTML = lookup.innerHTML.replace('{town-join}', townJoinStr)
	}
	
	const onlineStr = !isOnline ? `<br>Last online:<br><b>${loDate}</b> (${timeAgo(player.timestamps.lastOnline)})` : ''
	lookup.innerHTML = lookup.innerHTML.replace('{last-online}', onlineStr)

	lookup.querySelector('.close-container').addEventListener('click', event => { event.target.parentElement.remove() })
	*/
}

const DAY_MS = 86400000

/**
 * Formats a timestamp into a string. Ex: "Today", "2 days ago", "3 months ago" or "1 year ago" 
 * @param {number} ts The UNIX timestamp to format 
 */
function timeAgo(ts) {
	const diff = Date.now() - ts
	const units = [['year', 365*DAY_MS], ['month', 30*DAY_MS], ['day', DAY_MS]]
	for (const [name, ms] of units) {
		const v = Math.floor(diff / ms)
		if (v >= 1) return `${v} ${name}${v > 1 ? 's' : ''} ago`
	}

	return 'Today'
}

/**
 * @param {AllianceColours} colours  
 */
function parseColours(colours) {
	if (!colours) return DEFAULT_ALLIANCE_COLOURS
	colours.fill = "#" + colours.fill.replaceAll("#", "")
	colours.outline = "#" + colours.outline.replaceAll("#", "")
	return colours
}

/**
 * @returns {Promise<Array<CachedAlliance>>}
 */
async function getAlliances() {
	const alliances = await fetchJSON(getCurrentCapiUrl('alliances'))
	if (!alliances) {
		const cache = JSON.parse(localStorage['emcdynmapplus-alliances'])
		if (cache == null) {
			showAlert('Service responsible for loading alliances will be available later.')
			return []
		}

		showAlert('Service responsible for loading alliances is unavailable, falling back to locally cached data.', 5)
		return cache
	}

	// Build map of parentAlliance (identifier) -> child alliances for O(1) lookup
	const childrenByParent = new Map()
	for (const a of alliances) {
		if (!a.parentAlliance) continue

		const arr = childrenByParent.get(a.parentAlliance) || []
		arr.push(a)
		childrenByParent.set(a.parentAlliance, arr)
	}

	const allianceData = []
	for (const alliance of alliances) {
		const allianceType = alliance.type?.toLowerCase() || 'mega'
		//if (alliance.parentAlliance) continue // this is a child alliance, skip it

		const children = childrenByParent.get(alliance.identifier) || []
		allianceData.push({
			name: alliance.label || alliance.identifier,
			modeType: allianceType == 'mega' ? 'meganations' : 'alliances',
			ownNations: alliance.ownNations || [],
			puppetNations: children.flatMap(a => a.ownNations || []),
			colours: parseColours(alliance.optional.colours)
		})
	}

	localStorage['emcdynmapplus-alliances'] = JSON.stringify(allianceData)
	return allianceData
}

/**
 * Gets all alliances the input nation exists within / is related to.
 * @param {string} nationName - The name of the nation to get related alliances.
 * @param {MapMode} mapMode - The currently selected map mode.
 */
function getNationAlliances(nationName, mapMode) {
	if (cachedAlliances == null) return []

	/** @type {Array<{name: string, colours: AllianceColours}>} */
	const nationAlliances = []
	for (const alliance of cachedAlliances) {
		if (alliance.modeType != mapMode) continue

		const nations = [...alliance.ownNations, ...alliance.puppetNations]
		if (!nations.includes(nationName)) continue

		nationAlliances.push({ name: alliance.name, colours: alliance.colours })
	}

	return nationAlliances
}

const getArchiveURL = (date, markersURL) => `https://web.archive.org/web/${date}id_/${markersURL}`

// Archive mode intentionally goes through the configured relay here. Direct
// Wayback fetches are not currently reliable enough in this runtime context,
// so preserve this behavior and keep it explicitly documented for maintainers.
/** @param {string} actualArchiveDate */
function updateArchiveModeLabel(actualArchiveDate) {
	const currentMapModeLabel = document.querySelector('#current-map-mode-label')
	if (currentMapModeLabel) {
		currentMapModeLabel.textContent = `Map Mode: archive (${actualArchiveDate})`
	}
}

function exitArchiveModeAfterFailure(message, timeout = 8) {
	try {
		localStorage['emcdynmapplus-mapmode'] = localStorage[MAIN_LAST_LIVE_MAP_MODE_KEY] || 'default'
		localStorage[MAIN_PENDING_UI_ALERT_KEY] = JSON.stringify({
			message,
			timeout,
		})
	} catch {}

	location.reload()
}

/**
 * @param {number} date
 * @param {MarkersResponse} data
 * @returns {Promise<{ data: MarkersResponse, actualArchiveDate: string } | null>}
 */
async function loadArchiveForDate(date, data) {
	const markersURL = getArchiveMarkersSourceUrl(date)

	const archive = await fetchJSON(PROXY_URL + getArchiveURL(date, markersURL))
	if (!archive) {
		console.warn(`${MARKERS_LOG_PREFIX}: archive fetch returned no data`, { requestedDate: date, markersURL })
		return null
	}

	let normalizedData = cloneSerializable(data)
	let actualArchiveDate // Structure of markers.json changed at some point
	if (date < 20240701) {
		if (!normalizedData?.[0]) return null
		normalizedData[0].markers = convertOldMarkersStructure(archive.sets['townyPlugin.markerset'])
		actualArchiveDate = archive.timestamp
	} else {
		normalizedData = cloneSerializable(archive)
		actualArchiveDate = archive[0]?.timestamp
	}

	if (!normalizedData || !actualArchiveDate) return null

	// THIS HAS TO BE EN-CA SO REPLACING DASHES WORKS TO MATCH STORED DATE
	const formattedArchiveDate = new Date(parseInt(actualArchiveDate)).toLocaleDateString('en-ca')
	return { data: normalizedData, actualArchiveDate: formattedArchiveDate }
}

/** @param {Object} markers - The old markers response JSON data */
async function getArchive(data) {
	const loadingAlert = showAlert('Loading archive, please wait...')
	const date = archiveDate()
	markersDebugInfo(`${MARKERS_LOG_PREFIX}: getArchive started`, { requestedDate: date })

	let archiveResult = cachedArchives.get(date) ?? null
	if (!archiveResult) {
		let pendingLoad = pendingArchiveLoads.get(date)
		if (!pendingLoad) {
			pendingLoad = loadArchiveForDate(date, data).finally(() => pendingArchiveLoads.delete(date))
			pendingArchiveLoads.set(date, pendingLoad)
		}

		archiveResult = await pendingLoad
		if (archiveResult) cachedArchives.set(date, archiveResult)
	}

	loadingAlert.remove()

	if (!archiveResult) {
		const cachedArchive = cachedArchives.get(date)
		if (cachedArchive) {
			updateArchiveModeLabel(cachedArchive.actualArchiveDate)
			console.warn(`${MARKERS_LOG_PREFIX}: reusing cached archive after fetch failure`, {
				requestedDate: date,
				actualArchiveDate: cachedArchive.actualArchiveDate,
			})
			return cloneSerializable(cachedArchive.data) || data
		}

		console.warn(`${MARKERS_LOG_PREFIX}: archive unavailable and no cached archive exists, returning original markers`, {
			requestedDate: date,
		})
		exitArchiveModeAfterFailure('Unable to communicate with the Wayback archive. Returned to the live map.')
		return data
	}

	updateArchiveModeLabel(archiveResult.actualArchiveDate)
	if (archiveResult.actualArchiveDate.replaceAll('-', '') != date) {
		showAlert(`The closest archive to your prompt comes from ${archiveResult.actualArchiveDate}.`)
	}

	const resultData = cloneSerializable(archiveResult.data) || data
	markersDebugInfo(`${MARKERS_LOG_PREFIX}: getArchive completed`, {
		requestedDate: date,
		actualArchiveDate: archiveResult.actualArchiveDate,
		markerCount: Array.isArray(resultData?.[0]?.markers) ? resultData[0].markers.length : null,
	})

	return resultData
}

/** @param {Object} markerset - The towny markerset of the old markers response JSON data */
function convertOldMarkersStructure(markerset) {
	return Object.entries(markerset.areas).filter(([key]) => !key.includes('_Shop')).map(([_, v]) => ({
		fillColor: v.fillcolor,
		color: v.color,
		popup: v.desc ?? `<div><b>${v.label}</b></div>`,
		weight: v.weight,
		opacity: v.opacity,
		type: 'polygon',
		points: v.x.map((x, i) => ({ x, z: v.z[i] }))
	}))
}

/**
 * Calculate the claim limit for an independent town and report overclaimed status.
 * @param {number} claimedChunks 
 * @param {number} numResidents 
 */
function checkOverclaimedNationless(claimedChunks, numResidents) {
    const resLimit = numResidents * CHUNKS_PER_RES
    const isOverclaimed = claimedChunks > resLimit

    // Calculate how much the town is overclaimed by, if applicable
    return { 
		isOverclaimed,
		chunksOverclaimed: isOverclaimed ? claimedChunks - resLimit : 0,
		resLimit
	}
}

/**
 * Calculate the claim limit for a town with a nation and report overclaimed status.
 * @param {number} claimedChunks
 * @param {number} numResidents
 * @param {number} numNationResidents
 */
function checkOverclaimed(claimedChunks, numResidents, numNationResidents) {
    const resLimit = numResidents * CHUNKS_PER_RES
	
	const bonus = getNationClaimBonus(numNationResidents)
    const totalClaimLimit = resLimit + bonus
    const isOverclaimed = claimedChunks > totalClaimLimit
	
	return { 
		isOverclaimed,
		chunksOverclaimed: isOverclaimed ? claimedChunks - totalClaimLimit : 0,
		nationBonus: bonus,
		resLimit, totalClaimLimit
	}
}

