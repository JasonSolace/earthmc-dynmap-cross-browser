(() => {
	if (globalThis.EMCDYNMAPPLUS_MAP) return

	const normalizeBaseUrl = (baseUrl) => String(baseUrl).replace(/\/+$/, '')
	const normalizeResourcePath = (resourcePath) => String(resourcePath ?? '').replace(/^\/+/, '')

	// Preserve current overclaim behavior by keeping the existing Aurora-era bonus tiers
	// in one place. If Aurora support is dropped later, this table is the safe place to
	// simplify or replace those legacy thresholds.
	const LEGACY_AURORA_NATION_BONUS_TIERS = Object.freeze([
		Object.freeze({ minResidents: 200, bonus: 100 }),
		Object.freeze({ minResidents: 120, bonus: 80 }),
		Object.freeze({ minResidents: 80, bonus: 60 }),
		Object.freeze({ minResidents: 60, bonus: 50 }),
		Object.freeze({ minResidents: 40, bonus: 30 }),
		Object.freeze({ minResidents: 20, bonus: 10 }),
	])

	// Archive replay still depends on Aurora historical marker URLs because the archived
	// payloads and timeline changes were captured under those endpoints. If Aurora support
	// is removed later, revisit this list before deleting or simplifying archive mode.
	const LEGACY_AURORA_ARCHIVE_MARKER_SOURCES = Object.freeze([
		Object.freeze({
			untilExclusive: 20230212,
			url: 'https://earthmc.net/map/aurora/tiles/_markers_/marker_earth.json',
		}),
		Object.freeze({
			untilExclusive: 20240701,
			url: 'https://earthmc.net/map/aurora/standalone/MySQL_markers.php?marker=_markers_/marker_earth.json',
		}),
		Object.freeze({
			untilExclusive: null,
			url: 'https://map.earthmc.net/tiles/minecraft_overworld/markers.json',
		}),
	])

	const MAP_RUNTIME_CONFIG = Object.freeze({
		defaultMapType: 'aurora',
		maps: Object.freeze({
			aurora: Object.freeze({
				apiSegment: 'aurora',
				hosts: Object.freeze([
					'map.earthmc.net',
				]),
				borderResources: Object.freeze({
					country: 'resources/borders.aurora.json',
				}),
				injectDynmapPlusChunksLayer: true,
				chunkBounds: Object.freeze({
					L: -33280,
					R: 33088,
					U: -16640,
					D: 16512,
				}),
				nationBonusTiers: LEGACY_AURORA_NATION_BONUS_TIERS,
			}),
			nostra: Object.freeze({
				apiSegment: 'nostra',
				hosts: Object.freeze([
					'nostra.earthmc.net',
				]),
				borderResources: Object.freeze({
					country: 'resources/borders.nostra.countries.json',
					state: 'resources/borders.nostra.states-and-countries.json',
				}),
				injectDynmapPlusChunksLayer: false,
				chunkBounds: Object.freeze({
					L: -64512,
					R: 64512,
					U: -32256,
					D: 32256,
				}),
				nationBonusTiers: LEGACY_AURORA_NATION_BONUS_TIERS,
			}),
		}),
		legacyAuroraArchiveMarkerSources: LEGACY_AURORA_ARCHIVE_MARKER_SOURCES,
	})

	const getMapConfig = (mapType = MAP_RUNTIME_CONFIG.defaultMapType) =>
		MAP_RUNTIME_CONFIG.maps[mapType] ?? MAP_RUNTIME_CONFIG.maps[MAP_RUNTIME_CONFIG.defaultMapType]

	const detectMapTypeFromHostname = (hostname = globalThis.location?.hostname ?? '') => {
		const normalizedHostname = String(hostname).trim().toLowerCase()
		for (const [mapType, mapConfig] of Object.entries(MAP_RUNTIME_CONFIG.maps)) {
			if (mapConfig.hosts.includes(normalizedHostname)) return mapType
		}

		return null
	}

	const getCurrentMapType = (hostname = globalThis.location?.hostname ?? '') =>
		detectMapTypeFromHostname(hostname) ?? MAP_RUNTIME_CONFIG.defaultMapType

	const getBorderResourcePaths = (mapType = getCurrentMapType()) =>
		getMapConfig(mapType).borderResources

	const getBorderResourcePath = (mapType = getCurrentMapType(), borderLevel = 'country') =>
		getBorderResourcePaths(mapType)?.[borderLevel]
		?? getBorderResourcePaths(mapType)?.country
		?? ''

	const getChunkBounds = (mapType = getCurrentMapType()) =>
		getMapConfig(mapType).chunkBounds

	const shouldInjectDynmapPlusChunksLayer = (mapType = getCurrentMapType()) =>
		getMapConfig(mapType).injectDynmapPlusChunksLayer !== false

	const getMapApiUrl = (baseUrl, resourcePath = '', mapType = getCurrentMapType()) => {
		const mapConfig = getMapConfig(mapType)
		const parts = [normalizeBaseUrl(baseUrl), mapConfig.apiSegment]
		const normalizedResourcePath = normalizeResourcePath(resourcePath)
		if (normalizedResourcePath) parts.push(normalizedResourcePath)

		return parts.join('/')
	}

	const getNationClaimBonus = (numNationResidents, mapType = getCurrentMapType()) => {
		const tiers = getMapConfig(mapType).nationBonusTiers || []
		for (const tier of tiers) {
			if (numNationResidents >= tier.minResidents) return tier.bonus
		}

		return 0
	}

	const getArchiveMarkersSourceUrl = (date) => {
		for (const entry of MAP_RUNTIME_CONFIG.legacyAuroraArchiveMarkerSources) {
			if (entry.untilExclusive == null || date < entry.untilExclusive) return entry.url
		}

		return MAP_RUNTIME_CONFIG.legacyAuroraArchiveMarkerSources.at(-1)?.url ?? ''
	}

	globalThis.EMCDYNMAPPLUS_MAP = Object.freeze({
		config: MAP_RUNTIME_CONFIG,
		getMapConfig,
		detectMapTypeFromHostname,
		getCurrentMapType,
		getBorderResourcePaths,
		getBorderResourcePath,
		getChunkBounds,
		shouldInjectDynmapPlusChunksLayer,
		getMapApiUrl,
		getNationClaimBonus,
		getArchiveMarkersSourceUrl,
	})
})()
