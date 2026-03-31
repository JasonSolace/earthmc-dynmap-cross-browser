/** Browser extension compatibility helpers shared by Chromium and Firefox. */
const extensionRuntime = globalThis.browser?.runtime ?? globalThis.chrome?.runtime ?? null

const USERSCRIPT_UI_ASSET_URLS =
	typeof USERSCRIPT_ASSET_URLS !== 'undefined' && USERSCRIPT_ASSET_URLS
		? USERSCRIPT_ASSET_URLS
		: {}

function isFirefoxBrowser() {
	return /Firefox\//.test(globalThis.navigator?.userAgent || '')
}

/** @returns {Manifest} */
function getExtensionManifest() {
	if (isUserscript()) return MANIFEST
	if (!extensionRuntime?.getManifest) throw new Error('Extension runtime manifest API is unavailable.')

	return extensionRuntime.getManifest()
}

/** @param {string} resource */
function getExtensionURL(resource) {
	if (isUserscript()) return resource
	if (!extensionRuntime?.getURL) throw new Error('Extension runtime URL API is unavailable.')

	return extensionRuntime.getURL(resource)
}

/** @param {string} resource */
function getPackagedAssetURL(resource) {
	if (isUserscript()) return USERSCRIPT_UI_ASSET_URLS[resource] || resource
	return getExtensionURL(resource)
}

/** @param {string} value */
function escapeCssUrl(value) {
	return `url("${String(value).replace(/["\\\n\r\f]/g, '\\$&')}")`
}

function applyPackagedUiAssetUrls() {
	const root = document.documentElement
	if (!root) return

	root.style.setProperty('--screenshot-bg-image', escapeCssUrl(getPackagedAssetURL('resources/icon-screenshot.png')))
	root.style.setProperty('--show-icon', escapeCssUrl(getPackagedAssetURL('resources/icon-show.png')))
	root.style.setProperty('--hide-icon', escapeCssUrl(getPackagedAssetURL('resources/icon-hide.png')))
}

/** @param {Manifest} manifest */
function getWebAccessibleResourceList(manifest) {
	const [firstEntry] = manifest.web_accessible_resources || []
	if (Array.isArray(firstEntry)) return firstEntry

	return firstEntry?.resources || []
}

function cloneSerializable(value) {
	if (typeof value === 'undefined') return undefined

	try {
		return JSON.parse(JSON.stringify(value))
	} catch {
		try {
			if (typeof structuredClone === 'function') return structuredClone(value)
		} catch {}

		return null
	}
}
