import {
	copyFileSync,
	createWriteStream,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'fs'
import * as path from 'path'
import archiver from 'archiver'
import { gzipSync } from 'zlib'

const EXT_NAME = 'emc-dynmapplus'
const DIST_DIR = 'dist'
const ROOT_MANIFEST = JSON.parse(readFileSync('manifest.json', 'utf8'))
const FIREFOX_JSON_PARSE_LIMIT_BYTES = 5 * 1024 * 1024
const FIREFOX_COMPRESSIBLE_BORDER_RESOURCE = /^borders\..+\.json$/
const requestedTarget = process.argv[2]
const targets =
	requestedTarget === 'chromium' || requestedTarget === 'firefox'
		? [requestedTarget]
		: ['chromium', 'firefox']

/**
 * Adds a directory to the archive recursively, skipping ignored files.
 * Archive paths always use forward slashes regardless of host platform.
 */
function addDirIgnore(archive, srcDir, destDir = '', ignore = []) {
	const dirContents = readdirSync(srcDir)
	for (const file of dirContents) {
		if (ignore.includes(file)) continue

		const fullPath = path.join(srcDir, file)
		const destPath = destDir ? path.posix.join(destDir, file) : file
		const stat = statSync(fullPath)
		if (stat.isDirectory()) {
			addDirIgnore(archive, fullPath, destPath, ignore)
		} else {
			archive.file(fullPath, { name: destPath })
		}
	}
}

/** Copies a directory recursively, skipping ignored files. */
function copyDirIgnore(srcDir, destDir, ignore = []) {
	mkdirSync(destDir, { recursive: true })
	const dirContents = readdirSync(srcDir)
	for (const file of dirContents) {
		if (ignore.includes(file)) continue

		const fullPath = path.join(srcDir, file)
		const destPath = path.join(destDir, file)
		const stat = statSync(fullPath)
		if (stat.isDirectory()) {
			copyDirIgnore(fullPath, destPath, ignore)
		} else {
			copyFileSync(fullPath, destPath)
		}
	}
}

function getTargetManifest(target) {
	const manifest = structuredClone(ROOT_MANIFEST)
	if (target === 'firefox') {
		const gecko = manifest.browser_specific_settings?.gecko || {}
		manifest.browser_specific_settings = {
			...manifest.browser_specific_settings,
			gecko: {
				...gecko,
				id: 'earthmc-dynmapplus@jasonsolace',
			},
		}
	}

	return manifest
}

function rewriteTextFile(filePath, replacements) {
	let content = readFileSync(filePath, 'utf8')
	for (const [before, after] of replacements) {
		content = content.split(before).join(after)
	}
	writeFileSync(filePath, content)
}

function applyFirefoxLargeResourcePackaging(outdir) {
	const resourcesDir = path.join(outdir, 'resources')
	const renames = []

	for (const file of readdirSync(resourcesDir)) {
		if (!FIREFOX_COMPRESSIBLE_BORDER_RESOURCE.test(file)) continue

		const fullPath = path.join(resourcesDir, file)
		const size = statSync(fullPath).size
		if (size <= FIREFOX_JSON_PARSE_LIMIT_BYTES) continue

		const compressedPath = `${fullPath}.gz`
		writeFileSync(compressedPath, gzipSync(readFileSync(fullPath), { level: 9 }))
		rmSync(fullPath)
		renames.push([`resources/${file}`, `resources/${file}.gz`])
	}

	if (!renames.length) return

	rewriteTextFile(path.join(outdir, 'resources', 'map-config.js'), renames)

	const manifestPath = path.join(outdir, 'manifest.json')
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
	manifest.web_accessible_resources = manifest.web_accessible_resources.map(entry => ({
		...entry,
		resources: entry.resources.map(resource =>
			renames.find(([before]) => before === resource)?.[1] ?? resource
		),
	}))
	writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n')
}

function stageTargetDir(target) {
	const outdir = path.join(DIST_DIR, target)
	rmSync(outdir, { recursive: true, force: true })
	mkdirSync(outdir, { recursive: true })

	copyDirIgnore('src', path.join(outdir, 'src'), ['types.d.ts'])
	copyDirIgnore('resources', path.join(outdir, 'resources'))
	copyFileSync('README.md', path.join(outdir, 'README.md'))
	writeFileSync(
		path.join(outdir, 'manifest.json'),
		JSON.stringify(getTargetManifest(target), null, '\t') + '\n'
	)
	if (target === 'firefox') applyFirefoxLargeResourcePackaging(outdir)

	return outdir
}

async function archiveTarget(target, sourceDir) {
	const extension = target === 'firefox' ? 'xpi' : 'zip'
	const outfile = path.join(DIST_DIR, `${EXT_NAME}-${target}.${extension}`)

	await new Promise((resolve, reject) => {
		const output = createWriteStream(outfile)
		const archive = archiver.create('zip', { zlib: { level: 9 } })

		output.on('close', resolve)
		output.on('error', err => {
			const details = err?.code ? `${err.code}: ${err.message}` : (err?.message || String(err))
			reject(new Error(
				`Could not write ${outfile}. The output file is likely locked by another program (commonly Firefox if the XPI is in use). Close any app using that file and try again.\nUnderlying error: ${details}`
			))
		})
		archive.on('error', reject)

		archive.pipe(output)
		addDirIgnore(archive, sourceDir)
		archive.finalize()
	})

	return outfile
}

const start = performance.now()
Promise.all(targets.map(async target => {
	const sourceDir = stageTargetDir(target)
	const outfile = await archiveTarget(target, sourceDir)
	return { target, sourceDir, outfile }
})).then(results => {
	const elapsed = (performance.now() - start).toFixed(2)
	const outputLines = results.map(({ target, sourceDir, outfile }) =>
		`${target}:\n  Directory: .${path.sep}${path.relative(process.cwd(), sourceDir)}\n  Package: .${path.sep}${path.relative(process.cwd(), outfile)}`
	).join('\n')

	console.log(`Successfully generated extension packages.\n${outputLines}\nTook: ${elapsed}ms\n`)
}).catch(error => {
	console.error(error?.stack || error?.message || String(error))
	process.exitCode = 1
})
