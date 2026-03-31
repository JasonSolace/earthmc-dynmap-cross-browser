import { readFileSync } from 'fs'
import path from 'path'

const DEFAULT_INPUT = 'resources/borders.nostra.json'

function usage() {
	console.log(`Usage:
  node scripts/check-borders-duplicates.mjs [input.json]

Reports:
  - exact duplicate border entries
  - duplicate undirected border edges
`)
}

function toPointKey(x, z) {
	return `${Number(x)},${Number(z)}`
}

function splitIntoSegments(border) {
	const segments = []
	let current = []
	const length = Math.max(border?.x?.length ?? 0, border?.z?.length ?? 0)

	for (let i = 0; i < length; i++) {
		const x = border?.x?.[i]
		const z = border?.z?.[i]
		if (x == null || z == null || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) {
			if (current.length > 1) segments.push(current)
			current = []
			continue
		}

		current.push([Number(x), Number(z)])
	}

	if (current.length > 1) segments.push(current)
	return segments
}

function isClosed(points) {
	if (points.length < 3) return false
	const first = points[0]
	const last = points.at(-1)
	return first[0] === last[0] && first[1] === last[1]
}

function rotate(arr, start) {
	return [...arr.slice(start), ...arr.slice(0, start)]
}

function lexicographicallySmallestRotation(keys) {
	if (keys.length <= 1) return keys

	let minKey = keys[0]
	for (let i = 1; i < keys.length; i++) {
		if (keys[i] < minKey) minKey = keys[i]
	}

	const candidates = []
	for (let i = 0; i < keys.length; i++) {
		if (keys[i] === minKey) candidates.push(rotate(keys, i))
	}

	candidates.sort((a, b) => a.join('|').localeCompare(b.join('|')))
	return candidates[0]
}

function canonicalizeSegment(points) {
	const keys = points.map(([x, z]) => toPointKey(x, z))
	if (keys.length === 0) return ''

	if (isClosed(points)) {
		const open = keys.slice(0, -1)
		const forward = lexicographicallySmallestRotation(open)
		const reversed = lexicographicallySmallestRotation([...open].reverse())
		const best = forward.join('|').localeCompare(reversed.join('|')) <= 0 ? forward : reversed
		return `closed:${best.join('|')}`
	}

	const forward = keys.join('|')
	const reversed = [...keys].reverse().join('|')
	return `open:${forward.localeCompare(reversed) <= 0 ? forward : reversed}`
}

function canonicalizeEntry(border) {
	const segments = splitIntoSegments(border).map(canonicalizeSegment).sort()
	return segments.join('||')
}

function comparePointKeys(a, b) {
	return a.localeCompare(b)
}

function normalizeUndirectedEdge(a, b) {
	const aKey = toPointKey(a[0], a[1])
	const bKey = toPointKey(b[0], b[1])
	return comparePointKeys(aKey, bKey) <= 0 ? `${aKey}->${bKey}` : `${bKey}->${aKey}`
}

function main() {
	const argv = process.argv.slice(2)
	if (argv.includes('--help') || argv.includes('-h')) {
		usage()
		process.exit(0)
	}

	const inputPath = argv[0] || DEFAULT_INPUT
	const absolutePath = path.resolve(inputPath)
	const data = JSON.parse(readFileSync(inputPath, 'utf8'))

	const exactDuplicateMap = new Map()
	const edgeMap = new Map()

	for (const [name, border] of Object.entries(data)) {
		const entryKey = canonicalizeEntry(border)
		if (!exactDuplicateMap.has(entryKey)) exactDuplicateMap.set(entryKey, [])
		exactDuplicateMap.get(entryKey).push(name)

		const segments = splitIntoSegments(border)
		for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
			const points = segments[segmentIndex]
			for (let i = 1; i < points.length; i++) {
				const edgeKey = normalizeUndirectedEdge(points[i - 1], points[i])
				if (!edgeMap.has(edgeKey)) edgeMap.set(edgeKey, [])
				edgeMap.get(edgeKey).push({
					entry: name,
					segmentIndex,
				})
			}
		}
	}

	const exactDuplicates = [...exactDuplicateMap.values()].filter(group => group.length > 1)
	const duplicateEdges = [...edgeMap.entries()]
		.map(([edge, occurrences]) => ({
			edge,
			occurrences,
			uniqueEntries: [...new Set(occurrences.map(item => item.entry))],
		}))
		.filter(item => item.uniqueEntries.length > 1)
		.sort((a, b) => b.uniqueEntries.length - a.uniqueEntries.length || a.edge.localeCompare(b.edge))

	console.log(`Checked ${Object.keys(data).length} border entries from ${absolutePath}`)
	console.log(`Exact duplicate entries: ${exactDuplicates.length}`)
	if (exactDuplicates.length > 0) {
		for (const group of exactDuplicates) console.log(`  - ${group.join(' | ')}`)
	}

	console.log(`Duplicate undirected edges across different entries: ${duplicateEdges.length}`)
	for (const item of duplicateEdges.slice(0, 25)) {
		console.log(`  - ${item.uniqueEntries.length} entries share ${item.edge}`)
		console.log(`    ${item.uniqueEntries.join(' | ')}`)
	}

	if (duplicateEdges.length > 25) {
		console.log(`  ... ${duplicateEdges.length - 25} more duplicate edges not shown`)
	}
}

main()
