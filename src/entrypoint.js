/** @returns {boolean} */
function isUserscript() {
	return typeof IS_USERSCRIPT !== 'undefined' && IS_USERSCRIPT
}

const CONTENT_LOG_PREFIX = 'emcdynmapplus[content]'
const INIT_GUARD_ATTR = 'data-emcdynmapplus-initialized'
const PAGE_CONTEXT_GUARD_ATTR = 'data-emcdynmapplus-page-context-injected'
const ENTRYPOINT_PENDING_UI_ALERT_KEY = 'emcdynmapplus-pending-ui-alert'
let pendingArchiveModeLabelDate = null

function isContentDebugLoggingEnabled() {
	try {
		return localStorage['emcdynmapplus-debug'] === 'true'
	} catch {
		return false
	}
}

const contentDebugInfo = (...args) => {
	if (isContentDebugLoggingEnabled()) console.info(...args)
}

/** @param {string} resource */
function isPageContextScriptResource(resource) {
	return /\.c?js$/i.test(String(resource || ''))
}

function consumePendingUiAlert() {
	try {
		const rawAlert = localStorage[ENTRYPOINT_PENDING_UI_ALERT_KEY]
		if (!rawAlert) return

		delete localStorage[ENTRYPOINT_PENDING_UI_ALERT_KEY]
		const parsedAlert = JSON.parse(rawAlert)
		if (!parsedAlert?.message) return

		showAlert(parsedAlert.message, parsedAlert.timeout ?? null)
	} catch (err) {
		console.warn(`${CONTENT_LOG_PREFIX}: failed to consume pending ui alert`, err)
		try {
			delete localStorage[ENTRYPOINT_PENDING_UI_ALERT_KEY]
		} catch {}
	}
}

/** @param {string | null} actualArchiveDate */
function applyArchiveModeLabel(actualArchiveDate) {
	if (!actualArchiveDate) return false

	const currentMapModeLabel = document.querySelector('#current-map-mode-label')
	const archiveStatusTitle = document.querySelector('#archive-status-title')
	const archiveStatusEyebrow = document.querySelector('#archive-status-eyebrow')
	const archiveStatusCopy = document.querySelector('#archive-status-copy')
	const sidebarSummaryMode = document.querySelector('#sidebar-summary-mode')
	if (!currentMapModeLabel) {
		pendingArchiveModeLabelDate = actualArchiveDate
		return false
	}

	currentMapModeLabel.textContent = `Archive Snapshot: ${actualArchiveDate}`
	if (archiveStatusTitle) archiveStatusTitle.textContent = actualArchiveDate
	if (archiveStatusEyebrow) archiveStatusEyebrow.textContent = 'Archive Active'
	if (archiveStatusCopy) archiveStatusCopy.textContent = 'You are viewing the closest historical snapshot currently available. Choose another date below or return to the live map.'
	if (sidebarSummaryMode) sidebarSummaryMode.textContent = 'Archive Snapshot'
	pendingArchiveModeLabelDate = null
	return true
}

function parseEventDetail(detail) {
	if (typeof detail === 'string') {
		try {
			return JSON.parse(detail)
		} catch (err) {
			console.warn(`${CONTENT_LOG_PREFIX}: failed to parse string event detail`, err)
			return null
		}
	}

	return cloneSerializable(detail)
}

/** THIS FILE IS RUN FIRST, ANY SETUP/INIT REQUIRED BELONGS HERE */
;
(async function entrypoint() {
	const manifest = getExtensionManifest()
	const root = document.documentElement
	contentDebugInfo(`${CONTENT_LOG_PREFIX}: entrypoint started`, {
		isUserscript: isUserscript(),
		version: manifest?.version,
	})

	document.addEventListener('EMCDYNMAPPLUS_SYNC_PARSED_MARKERS', e => {
		const detail = parseEventDetail(e.detail)
		if (!Array.isArray(detail?.parsedMarkers)) {
			console.warn(`${CONTENT_LOG_PREFIX}: received parsed markers event without marker array`, e.detail)
			return
		}

		parsedMarkers = detail.parsedMarkers
		contentDebugInfo(`${CONTENT_LOG_PREFIX}: synced parsed markers from page`, {
			count: parsedMarkers.length,
		})
	})

	document.addEventListener('EMCDYNMAPPLUS_SHOW_ALERT', e => {
		const detail = parseEventDetail(e.detail)
		if (!detail?.message) {
			console.warn(`${CONTENT_LOG_PREFIX}: received alert event without message`, e.detail)
			return
		}

		showAlert(detail.message, detail.timeout ?? null)
	})

	document.addEventListener('EMCDYNMAPPLUS_UPDATE_ARCHIVE_LABEL', e => {
		const detail = parseEventDetail(e.detail)
		if (!detail?.actualArchiveDate) {
			console.warn(`${CONTENT_LOG_PREFIX}: received archive label event without date`, e.detail)
			return
		}

		const applied = applyArchiveModeLabel(detail.actualArchiveDate)

		contentDebugInfo(`${CONTENT_LOG_PREFIX}: updated archive label from page`, {
			actualArchiveDate: detail.actualArchiveDate,
			applied,
		})
	})

	if (!isUserscript()) {
		// Any scripts that need to be injected into the page context should be specified in manifest.json 
		// under web_accessible_resources in order of least-dependent first.
		if (root?.getAttribute(PAGE_CONTEXT_GUARD_ATTR) === 'true') {
			contentDebugInfo(`${CONTENT_LOG_PREFIX}: skipping page-context injection because resources are already injected`)
		} else {
			root?.setAttribute(PAGE_CONTEXT_GUARD_ATTR, 'true')
			const resources = getWebAccessibleResourceList(manifest)
			const jsFiles = resources.filter(isPageContextScriptResource)
			contentDebugInfo(`${CONTENT_LOG_PREFIX}: injecting page-context resources`, { resources: jsFiles })
			for (const file of jsFiles) {
				await injectScript(file)
			}
		}
	}

	// If not 'complete' or 'interactive', defer init until DOM is ready.
    if (document.readyState !== 'loading') init(manifest)
    else document.addEventListener('DOMContentLoaded', _ => init(manifest))
})()

/** 
 * Injects a file into the page context given the path to it. 
 * This is similar to adding \<script src="main.js"></script> to an HTML file.
 * @param {string} resource - The path/filename to/of the file to inject.
 * @param {string} local - Whether the file should be injected locally (text) or external (src).
 * @returns {Promise<void>}
 */
function injectScript(resource) {
	return new Promise(resolve => {
		const script = document.createElement('script')
		script.src = getExtensionURL(resource)
		script.onload = () => { script.remove(); resolve() }
		(document.head || document.documentElement).appendChild(script)
	})
}

/** @param {Manifest} manifest */
async function init(manifest) {
	const root = document.documentElement
	if (root?.getAttribute(INIT_GUARD_ATTR) === 'true') {
		contentDebugInfo(`${CONTENT_LOG_PREFIX}: init skipped because UI is already initialized`)
		return
	}
	root?.setAttribute(INIT_GUARD_ATTR, 'true')

	const isUserscript = typeof IS_USERSCRIPT !== 'undefined' && IS_USERSCRIPT
	if (isUserscript) {
		GM_addStyle(STYLE_CSS)
	}
	applyPackagedUiAssetUrls()

    localStorage['emcdynmapplus-mapmode'] ??= 'default'
	localStorage['emcdynmapplus-last-live-mapmode'] ??=
		localStorage['emcdynmapplus-mapmode'] !== 'archive'
			? localStorage['emcdynmapplus-mapmode']
			: 'default'
	localStorage['emcdynmapplus-archive-date'] ??= new Date().toISOString().slice(0, 10).replaceAll('-', '')
	localStorage['emcdynmapplus-normalize-scroll'] ??= 'true'
    localStorage['emcdynmapplus-darkened'] ??= 'true'
	localStorage['emcdynmapplus-serverinfo'] ??= 'true'
	localStorage['emcdynmapplus-capital-stars'] ??= 'true'

	localStorage['emcdynmapplus-nation-claims-opaque-colors'] ??= 'true'
	localStorage['emcdynmapplus-nation-claims-show-excluded'] ??= 'true'

	contentDebugInfo(`${CONTENT_LOG_PREFIX}: initializing UI elements`, {
		mapMode: localStorage['emcdynmapplus-mapmode'],
		archiveDate: localStorage['emcdynmapplus-archive-date'],
	})

	insertCustomStylesheets()
    
	await insertSidebarMenu()
	applyArchiveModeLabel(pendingArchiveModeLabelDate)
	await insertLayerOptionsMenu()
	updateServerInfo(await insertServerInfoPanel())
    await editUILayout()
	await insertScreenshotBtn()
	
	const insertedPanel = await tryInsertNationClaimsPanel('nationclaims')
	if (insertedPanel) loadNationClaims(insertedPanel)

	initToggleOptions()
	consumePendingUiAlert()
	checkForUpdate(manifest)
}

/** @param {Manifest} manifest */
function checkForUpdate(manifest) {
    const cachedVer = localStorage['emcdynmapplus-version']
    const latestVer = manifest.version
    contentDebugInfo(`${CONTENT_LOG_PREFIX}: current version`, { latestVer, cachedVer })

    if (!cachedVer) return localStorage['emcdynmapplus-version'] = latestVer
    if (cachedVer != latestVer) {
        const changelogURL = `${PROJECT_URL}/releases/tag/v${latestVer}`
        showAlert([
            `Extension has been automatically updated from ${cachedVer} to ${latestVer}. Read what has been changed `,
            createElement('a', {
                href: changelogURL,
                target: '_blank',
                rel: 'noopener noreferrer',
                text: 'here',
            }),
            '.',
        ])
    }

    return localStorage['emcdynmapplus-version'] = latestVer
}
