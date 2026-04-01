import { readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { DEFAULTS, NAME_KEYS, validateProjectionOptions } from './borders-geojson-shared.mjs'

const usage = `Usage:
  node scripts/build-deduped-borders-geojson.mjs <output.json> [options]

Options:
  --input <file.geojson>      Add one explicit input file (repeatable, required)
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
`

function fail(message) {
	console.error(message)
	process.exit(1)
}

function parseArgs(argv) {
	if (argv.includes('--help') || argv.includes('-h')) {
		console.log(usage)
		process.exit(0)
	}

	const opts = {
		...DEFAULTS,
		inputs: [],
	}

	const positional = []
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (!arg.startsWith('--')) {
			positional.push(arg)
			continue
		}

		const key = arg.slice(2)
		const value = argv[++i]
		if (value == null) fail(`Missing value for --${key}\n\n${usage}`)

		switch (key) {
			case 'input':
				opts.inputs.push(value)
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

	if (positional.length !== 1) fail(usage)
	opts.outputPath = positional[0]
	if (opts.inputs.length === 0) fail(`At least one --input value is required.\n\n${usage}`)

	try {
		validateProjectionOptions(opts, ['inputs', 'outputPath'])
	} catch (error) {
		fail(error.message)
	}

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

function normalizeRawPoint(point) {
	return [
		Number(Number(point[0]).toFixed(12)),
		Number(Number(point[1]).toFixed(12)),
	]
}

function normalizeRing(ring) {
	if (!Array.isArray(ring) || ring.length < 4) return []
	const points = ring
		.map(normalizeRawPoint)
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
	return points.map(normalizeRawPoint)
}

function scaleProjectedPointFixed(point, options, projectedBounds) {
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

function isClosedProjectedPath(points) {
	if (points.length < 3) return false
	const first = points[0]
	const last = points.at(-1)
	return first.x === last.x && first.z === last.z
}

function findFeatureName(properties = {}) {
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

function toPointKey([lon, lat]) {
	return `${lon},${lat}`
}

function normalizeUndirectedEdge(aKey, bKey) {
	return aKey <= bKey ? `${aKey}->${bKey}` : `${bKey}->${aKey}`
}

function parsePointKey(pointKey) {
	const [lon, lat] = pointKey.split(',').map(Number)
	return [lon, lat]
}

function buildUniqueRawEdges(features, options) {
	const uniqueEdges = new Map()
	let sourceEdgeCount = 0

	for (const feature of features) {
		const name = findFeatureName(feature?.properties)
		if (!name) continue

		const polygons = toPolygons(feature?.geometry)
		for (const polygon of polygons) {
			const outerRing = polygon?.[0]
			const clipped = clipRingToBounds(outerRing, options)
			if (clipped.length < 4) continue

			for (let i = 1; i < clipped.length; i++) {
				const previousKey = toPointKey(clipped[i - 1])
				const currentKey = toPointKey(clipped[i])
				if (previousKey === currentKey) continue

				const edgeKey = normalizeUndirectedEdge(previousKey, currentKey)
				sourceEdgeCount += 1
				if (!uniqueEdges.has(edgeKey)) {
					uniqueEdges.set(edgeKey, { aKey: previousKey, bKey: currentKey, sources: new Set([name]) })
				} else {
					uniqueEdges.get(edgeKey).sources.add(name)
				}
			}
		}
	}

	const adjacency = new Map()
	for (const { aKey, bKey } of uniqueEdges.values()) {
		if (!adjacency.has(aKey)) adjacency.set(aKey, new Set())
		if (!adjacency.has(bKey)) adjacency.set(bKey, new Set())
		adjacency.get(aKey).add(bKey)
		adjacency.get(bKey).add(aKey)
	}

	return {
		uniqueEdges,
		adjacency,
		collapsedDuplicateEdgeOccurrences: sourceEdgeCount - uniqueEdges.size,
	}
}

function walkOpenPath(startKey, nextKey, adjacency, visitedEdges) {
	const path = [startKey, nextKey]
	let previousKey = startKey
	let currentKey = nextKey
	visitedEdges.add(normalizeUndirectedEdge(startKey, nextKey))

	while (true) {
		const neighbors = [...(adjacency.get(currentKey) ?? [])]
		if (neighbors.length !== 2) break

		const candidate = neighbors.find(neighborKey => neighborKey !== previousKey && !visitedEdges.has(normalizeUndirectedEdge(currentKey, neighborKey)))
		if (!candidate) break

		path.push(candidate)
		visitedEdges.add(normalizeUndirectedEdge(currentKey, candidate))
		previousKey = currentKey
		currentKey = candidate
	}

	return path
}

function walkClosedCycle(startEdgeKey, adjacency, visitedEdges) {
	const [aKey, bKey] = startEdgeKey.split('->')
	const path = [aKey, bKey]
	let previousKey = aKey
	let currentKey = bKey
	visitedEdges.add(startEdgeKey)

	while (true) {
		const neighbors = [...(adjacency.get(currentKey) ?? [])]
		const candidate = neighbors.find(neighborKey => neighborKey !== previousKey && !visitedEdges.has(normalizeUndirectedEdge(currentKey, neighborKey)))
		if (!candidate) break

		path.push(candidate)
		const edgeKey = normalizeUndirectedEdge(currentKey, candidate)
		visitedEdges.add(edgeKey)
		previousKey = currentKey
		currentKey = candidate
		if (currentKey === aKey) break
	}

	return path
}

function buildRawPaths(adjacency, uniqueEdges) {
	const visitedEdges = new Set()
	const paths = []

	for (const [vertexKey, neighbors] of adjacency.entries()) {
		if (neighbors.size === 2) continue
		for (const neighborKey of neighbors) {
			const edgeKey = normalizeUndirectedEdge(vertexKey, neighborKey)
			if (visitedEdges.has(edgeKey)) continue
			paths.push(walkOpenPath(vertexKey, neighborKey, adjacency, visitedEdges))
		}
	}

	for (const edgeKey of uniqueEdges.keys()) {
		if (visitedEdges.has(edgeKey)) continue
		paths.push(walkClosedCycle(edgeKey, adjacency, visitedEdges))
	}

	return paths
}

function canonicalizeProjectedLine(points, decimals) {
	const forward = points.map(point => `${roundTo(point.x, decimals)},${roundTo(point.z, decimals)}`).join('|')
	const reversed = [...points]
		.reverse()
		.map(point => `${roundTo(point.x, decimals)},${roundTo(point.z, decimals)}`)
		.join('|')
	return forward.localeCompare(reversed) <= 0 ? forward : reversed
}

function resolveInputPaths(options) {
	const seen = new Set()
	const inputs = []
	for (const inputPath of options.inputs) {
		const normalized = path.normalize(inputPath)
		if (seen.has(normalized)) continue
		seen.add(normalized)
		inputs.push(inputPath)
	}

	if (inputs.length === 0) fail(`No input GeoJSON files found for explicit --input values.`)
	return inputs
}

function main() {
	const options = parseArgs(process.argv.slice(2))
	const inputPaths = resolveInputPaths(options)
	const allFeatures = []

	for (const inputPath of inputPaths) {
		const raw = readFileSync(inputPath, 'utf8')
		const geojson = JSON.parse(raw)
		if (geojson.type !== 'FeatureCollection') fail(`Input must be a GeoJSON FeatureCollection: ${inputPath}`)
		allFeatures.push(...(geojson.features || []))
	}

	const projectedBounds = {
		xMin: millerForward(options.lonMin, 0).x,
		xMax: millerForward(options.lonMax, 0).x,
		yMin: millerForward(0, options.latMin).y,
		yMax: millerForward(0, options.latMax).y,
	}

	const { uniqueEdges, adjacency, collapsedDuplicateEdgeOccurrences } = buildUniqueRawEdges(allFeatures, options)
	const rawPaths = buildRawPaths(adjacency, uniqueEdges)

	const output = {}
	const seenLineKeys = new Set()
	let skippedExactDuplicateLines = 0
	for (let i = 0; i < rawPaths.length; i++) {
		const projected = rawPaths[i].map(pointKey => {
			const [lon, lat] = parsePointKey(pointKey)
			return scaleProjectedPointFixed(millerForward(lon, lat), options, projectedBounds)
		})

		const deduped = dedupeSequential(projected)
		let simplified = isClosedProjectedPath(deduped)
			? simplifyClosedRing(deduped, options.simplifyTolerance)
			: simplifyDouglasPeucker(deduped, options.simplifyTolerance)

		simplified = dedupeSequential(simplified)
		if (simplified.length < 2) continue

		const canonicalLineKey = canonicalizeProjectedLine(simplified, options.decimals)
		if (seenLineKeys.has(canonicalLineKey)) {
			skippedExactDuplicateLines += 1
			continue
		}
		seenLineKeys.add(canonicalLineKey)

		output[`line_${String(Object.keys(output).length + 1).padStart(6, '0')}`] = {
			x: simplified.map(point => roundTo(point.x, options.decimals)),
			z: simplified.map(point => roundTo(point.z, options.decimals)),
		}
	}

	const ordered = Object.fromEntries(Object.entries(output).sort(([a], [b]) => a.localeCompare(b)))
	writeFileSync(options.outputPath, JSON.stringify(ordered, null, 2) + '\n')

	console.log(`Loaded ${allFeatures.length} source features from ${inputPaths.length} GeoJSON files.`)
	console.log(`Unique raw edges: ${uniqueEdges.size}`)
	console.log(`Collapsed duplicate raw edge occurrences: ${collapsedDuplicateEdgeOccurrences}`)
	console.log(`Skipped exact duplicate generated lines: ${skippedExactDuplicateLines}`)
	console.log(`Wrote ${Object.keys(ordered).length} deduped line entries to ${path.resolve(options.outputPath)}`)
}

main()
