export const DEFAULTS = {
	lonMin: -180,
	lonMax: 180,
	latMin: -59.4,
	latMax: 83.1,
	xMin: -64512,
	xMax: 64512,
	zMin: -32256,
	zMax: 32256,
	simplifyTolerance: 8,
	decimals: 2,
}

export const NAME_KEYS = ['name', 'NAME', 'admin', 'ADMIN', 'country', 'COUNTRY', 'sovereignt', 'SOVEREIGNT', 'brk_name']

export function validateProjectionOptions(options, excludedKeys = []) {
	const excluded = new Set(excludedKeys)
	for (const [key, value] of Object.entries(options)) {
		if (excluded.has(key)) continue
		if (!Number.isFinite(value)) throw new Error(`Invalid numeric value for ${key}`)
	}

	if (options.lonMin >= options.lonMax) throw new Error('Longitude bounds must be increasing.')
	if (options.latMin >= options.latMax) throw new Error('Latitude bounds must be increasing.')
	if (options.xMin >= options.xMax) throw new Error('X bounds must be increasing.')
	if (options.zMin >= options.zMax) throw new Error('Z bounds must be increasing.')
}
