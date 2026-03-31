import { readFileSync, writeFileSync } from 'fs'
import path from 'path'

const DEFAULTS = {
	lonMin: -180,
	lonMax: 180,
	latMin: -59.3,
	latMax: 83,
	xMin: -64512,
	xMax: 64512,
	zMin: -32256,
	zMax: 32256,
	simplifyTolerance: 8,
	decimals: 2,
}

const NAME_KEYS = ['name', 'NAME', 'admin', 'ADMIN', 'country', 'COUNTRY', 'sovereignt', 'SOVEREIGNT', 'brk_name']
const usage = `Usage:
  node scripts/convert-borders-geojson.mjs <input.geojson> <output.json> [options]

Options:
  --name-property <key>      GeoJSON property to use as the country name
  --simplify <blocks>        Douglas-Peucker tolerance in world blocks (default: ${DEFAULTS.simplifyTolerance})
  --decimals <n>             Decimal places in output (default: ${DEFAULTS.decimals})
  --x-min <n>                World minimum X (default: ${DEFAULTS.xMin})
  --x-max <n>                World maximum X (default: ${DEFAULTS.xMax})
  --z-min <n>                World minimum Z (default: ${DEFAULTS.zMin})
  --z-max <n>                World maximum Z (default: ${DEFAULTS.zMax})
  --lat-min <n>              Southern crop latitude (default: ${DEFAULTS.latMin})
  --lat-max <n>              Northern crop latitude (default: ${DEFAULTS.latMax})
  --lon-min <n>              Western longitude bound (default: ${DEFAULTS.lonMin})
  --lon-max <n>              Eastern longitude bound (default: ${DEFAULTS.lonMax})

Notes:
  - Miller cylindrical forward projection:
      x = lambda
      y = 1.25 * ln(tan(pi/4 + 0.4 * phi))
    where lambda and phi are longitude/latitude in radians.
  - MultiPolygon countries are flattened into one entry using null separators
    between rings so the extension can render multiple disjoint polylines.`

function fail(message) {
	console.error(message)
	process.exit(1)
}

function parseArgs(argv) {
	const positional = []
	const opts = { ...DEFAULTS }

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (!arg.startsWith('--')) {
			positional.push(arg)
			continue
		}

		const key = arg.slice(2)
		if (key === 'help' || key === 'h') {
			console.log(usage)
			process.exit(0)
		}

		const value = argv[++i]
		if (value == null) fail(`Missing value for --${key}\n\n${usage}`)

		switch (key) {
			case 'name-property':
				opts.nameProperty = value
				break
			case 'simplify':
				opts.simplifyTolerance = Number(value)
				break
			case 'decimals':
				opts.decimals = Number(value)
				break
			case 'x-min':
				opts.xMin = Number(value)
				break
			case 'x-max':
				opts.xMax = Number(value)
				break
			case 'z-min':
				opts.zMin = Number(value)
				break
			case 'z-max':
				opts.zMax = Number(value)
				break
			case 'lat-min':
				opts.latMin = Number(value)
				break
			case 'lat-max':
				opts.latMax = Number(value)
				break
			case 'lon-min':
				opts.lonMin = Number(value)
				break
			case 'lon-max':
				opts.lonMax = Number(value)
				break
			default:
				fail(`Unknown option --${key}\n\n${usage}`)
		}
	}

	if (positional.length < 2) fail(usage)
	opts.inputPath = positional[0]
	opts.outputPath = positional[1]

	for (const [key, value] of Object.entries(opts)) {
		if (key.endsWith('Path') || key === 'nameProperty') continue
		if (!Number.isFinite(value)) fail(`Invalid numeric value for ${key}`)
	}

	if (opts.lonMin >= opts.lonMax) fail('Longitude bounds must be increasing.')
	if (opts.latMin >= opts.latMax) fail('Latitude bounds must be increasing.')
	if (opts.xMin >= opts.xMax) fail('X bounds must be increasing.')
	if (opts.zMin >= opts.zMax) fail('Z bounds must be increasing.')

	return opts
}

const degToRad = degrees => degrees * Math.PI / 180
const roundTo = (value, decimals) => Number(value.toFixed(decimals))

function millerForward(lonDeg, latDeg) {
	const lambda = degToRad(lonDeg)
	const phi = degToRad(latDeg)
	return {
		x: lambda,
		y: 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * phi)),
	}
}

function samePoint(a, b) {
	return a && b && a[0] === b[0] && a[1] === b[1]
}

function normalizeRing(ring) {
	if (!Array.isArray(ring) || ring.length < 4) return []
	const points = ring
		.map(point => [Number(point[0]), Number(point[1])])
		.filter(point => Number.isFinite(point[0]) && Number.isFinite(point[1]))

	if (points.length < 4) return []
	if (samePoint(points[0], points.at(-1))) points.pop()
	return points
}

function clipPolygon(points, isInside, intersect) {
	if (points.length === 0) return []

	const output = []
	let previous = points.at(-1)
	for (const current of points) {
		const currentInside = isInside(current)
		const previousInside = isInside(previous)

		if (currentInside) {
			if (!previousInside) output.push(intersect(previous, current))
			output.push(current)
		} else if (previousInside) {
			output.push(intersect(previous, current))
		}

		previous = current
	}

	return output
}

function intersectVertical(a, b, lon) {
	const delta = b[0] - a[0]
	if (delta === 0) return [lon, a[1]]
	const t = (lon - a[0]) / delta
	return [lon, a[1] + (b[1] - a[1]) * t]
}

function intersectHorizontal(a, b, lat) {
	const delta = b[1] - a[1]
	if (delta === 0) return [a[0], lat]
	const t = (lat - a[1]) / delta
	return [a[0] + (b[0] - a[0]) * t, lat]
}

function clipRingToBounds(ring, bounds) {
	let points = normalizeRing(ring)
	if (points.length < 3) return []

	points = clipPolygon(points, point => point[0] >= bounds.lonMin, (a, b) => intersectVertical(a, b, bounds.lonMin))
	points = clipPolygon(points, point => point[0] <= bounds.lonMax, (a, b) => intersectVertical(a, b, bounds.lonMax))
	points = clipPolygon(points, point => point[1] >= bounds.latMin, (a, b) => intersectHorizontal(a, b, bounds.latMin))
	points = clipPolygon(points, point => point[1] <= bounds.latMax, (a, b) => intersectHorizontal(a, b, bounds.latMax))

	if (points.length < 3) return []
	if (!samePoint(points[0], points.at(-1))) points.push([...points[0]])
	return points
}

function scaleProjectedPoint(point, options, projectedBounds) {
	const xRatio = (point.x - projectedBounds.xMin) / (projectedBounds.xMax - projectedBounds.xMin)
	const yRatio = (projectedBounds.yMax - point.y) / (projectedBounds.yMax - projectedBounds.yMin)

	return {
		x: options.xMin + xRatio * (options.xMax - options.xMin),
		z: options.zMin + yRatio * (options.zMax - options.zMin),
	}
}

function dedupeSequential(points) {
	if (points.length === 0) return points

	const deduped = [points[0]]
	for (let i = 1; i < points.length; i++) {
		const previous = deduped.at(-1)
		const current = points[i]
		if (previous.x === current.x && previous.z === current.z) continue
		deduped.push(current)
	}

	return deduped
}

function distanceToSegment(point, start, end) {
	const dx = end.x - start.x
	const dz = end.z - start.z
	if (dx === 0 && dz === 0) {
		return Math.hypot(point.x - start.x, point.z - start.z)
	}

	const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz)))
	const projX = start.x + t * dx
	const projZ = start.z + t * dz
	return Math.hypot(point.x - projX, point.z - projZ)
}

function simplifyDouglasPeucker(points, tolerance) {
	if (points.length <= 2 || tolerance <= 0) return points.slice()

	let maxDistance = 0
	let index = -1
	const start = points[0]
	const end = points.at(-1)
	for (let i = 1; i < points.length - 1; i++) {
		const distance = distanceToSegment(points[i], start, end)
		if (distance > maxDistance) {
			maxDistance = distance
			index = i
		}
	}

	if (maxDistance <= tolerance || index === -1) return [start, end]

	const left = simplifyDouglasPeucker(points.slice(0, index + 1), tolerance)
	const right = simplifyDouglasPeucker(points.slice(index), tolerance)
	return [...left.slice(0, -1), ...right]
}

function simplifyClosedRing(points, tolerance) {
	if (points.length < 4 || tolerance <= 0) return points

	const open = points.slice(0, -1)
	const simplifiedOpen = simplifyDouglasPeucker(open, tolerance)
	let closed = [...simplifiedOpen, simplifiedOpen[0]]
	closed = dedupeSequential(closed)

	if (closed.length < 4) return points
	if (!samePoint([closed[0].x, closed[0].z], [closed.at(-1).x, closed.at(-1).z])) {
		closed.push({ ...closed[0] })
	}

	return closed
}

function findCountryName(properties = {}, explicitNameProperty) {
	if (explicitNameProperty && properties[explicitNameProperty] != null) {
		return String(properties[explicitNameProperty]).trim()
	}

	for (const key of NAME_KEYS) {
		if (properties[key] != null) return String(properties[key]).trim()
	}

	return ''
}

function toPolygons(geometry) {
	if (!geometry) return []
	if (geometry.type === 'Polygon') return [geometry.coordinates]
	if (geometry.type === 'MultiPolygon') return geometry.coordinates
	return []
}

function appendRing(target, ring, decimals) {
	if (!target.x) target.x = []
	if (!target.z) target.z = []

	if (target.x.length > 0) {
		target.x.push(null)
		target.z.push(null)
	}

	for (const point of ring) {
		target.x.push(roundTo(point.x, decimals))
		target.z.push(roundTo(point.z, decimals))
	}
}

function main() {
	const options = parseArgs(process.argv.slice(2))
	const raw = readFileSync(options.inputPath, 'utf8')
	const geojson = JSON.parse(raw)

	if (geojson.type !== 'FeatureCollection') {
		fail('Input must be a GeoJSON FeatureCollection.')
	}

	const projectedBounds = {
		xMin: millerForward(options.lonMin, 0).x,
		xMax: millerForward(options.lonMax, 0).x,
		yMin: millerForward(0, options.latMin).y,
		yMax: millerForward(0, options.latMax).y,
	}

	const output = {}
	let keptCountries = 0
	let keptRings = 0
	let skippedFeatures = 0

	for (const feature of geojson.features || []) {
		const countryName = findCountryName(feature?.properties, options.nameProperty)
		const polygons = toPolygons(feature?.geometry)
		if (!countryName || polygons.length === 0) {
			skippedFeatures += 1
			continue
		}

		let countryHadRing = false
		const target = output[countryName] ?? { x: [], z: [] }
		for (const polygon of polygons) {
			const outerRing = polygon?.[0]
			const clipped = clipRingToBounds(outerRing, options)
			if (clipped.length < 4) continue

			const projected = clipped.map(([lon, lat]) => {
				const projectedPoint = millerForward(lon, lat)
				return scaleProjectedPoint(projectedPoint, options, projectedBounds)
			})
			const simplified = simplifyClosedRing(dedupeSequential(projected), options.simplifyTolerance)
			if (simplified.length < 4) continue

			appendRing(target, simplified, options.decimals)
			countryHadRing = true
			keptRings += 1
		}

		if (!countryHadRing) continue
		if (!output[countryName]) keptCountries += 1
		output[countryName] = target
	}

	const ordered = Object.fromEntries(Object.keys(output).sort((a, b) => a.localeCompare(b)).map(key => [key, output[key]]))
	writeFileSync(options.outputPath, JSON.stringify(ordered, null, 2) + '\n')

	console.log(`Converted ${keptCountries} countries across ${keptRings} polygon rings.`)
	console.log(`Skipped ${skippedFeatures} unsupported or unnamed features.`)
	console.log(`Wrote ${path.resolve(options.outputPath)}`)
}

main()
