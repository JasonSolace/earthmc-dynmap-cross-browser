/** ANY UI CODE OR DOM MANIPULATION NOT RELATING TO THE EXTENSION MENU BELONGS IN THIS FILE */
//console.log('emcdynmapplus: loaded dom')

const ARCHIVE_DATE = {
	MIN: "2022-05-01",
	MAX: new Date().toISOString().slice(0, 10)
}

const MAX_NATION_CLAIM_ENTRIES = 300

const SCROLL_BASE_ZOOM 	= 90
const SCROLL_LINE_DELTA = 30  // 1 scroll line = ~30 deltaY in windows
const SCROLL_THRESHOLD 	= 5	  // increase zoom by this many scroll lines

// TODO: Add sliders under a "Tile Filters" section and bind these variables to their respective values.
const BRIGHTNESS_PERCENTAGE = 60
const CONTRAST_PERCENTAGE = 105
const SATURATE_PERCENTAGE = 95
const getTilePaneFilter = () => /** @type {const} */ (
	`brightness(${BRIGHTNESS_PERCENTAGE}%) contrast(${CONTRAST_PERCENTAGE}%) saturate(${SATURATE_PERCENTAGE}%)`
)

const INSERTABLE_HTML = /** @type {const} */ ({
	// Used in dom.js
    buttons: {
        locate: '<button class="sidebar-button" id="locate-button">Locate</button>',
        searchArchive: '<button class="sidebar-button" id="archive-button">Search Archive</button>',
        switchMapMode: '<button class="sidebar-button" id="switch-map-mode">Switch Map Mode</button>',
        options: '<button class="sidebar-button" id="options-button">Options</button>',
    },
    options: {
        menu: '<div id="options-menu"></div>',
        option: '<div class="option"></div>',
        label: '<label for="{option}">{optionText}</label>',
        checkbox: '<input id="{option}" type="checkbox">'
    },
	nationClaims: '<div class="leaflet-control-layers leaflet-control" id="nation-claims"></div>',
	nationClaimsColorInput: '<input type="color" id="nation-color-entry{index}"></input>',
	nationClaimsTextInput: '<input type="text" id="nation-text-entry{index}" placeholder="Enter nation name..."></input>',
	nationClaimsTitlebar:
		'<div id="nation-claims-titlebar">' +
		'<p>Nation Claims Customizer</p>' +
		'<div class="leaflet-control-layers link leaflet-control"><a href=""><img class="crisp-edges" src="images/clear.png"></a></div>' +
		'</div>',
	serverInfo: '<div class="leaflet-control-layers leaflet-control" id="server-info"></div>',
    sidebar: '<div class="leaflet-control-layers leaflet-control" id="sidebar"></div>',
    sidebarOption: '<div class="sidebar-option"></div>',
    locateInput: '<input class="sidebar-input" id="locate-input" placeholder="London">',
    locateSelect: '<select class="sidebar-button" id="locate-select"><option>Town</option><option>Nation</option><option>Resident</option></select>',
    archiveInput: `<input class="sidebar-input" id="archive-input" type="date" min="${ARCHIVE_DATE.MIN}" max="${ARCHIVE_DATE.MAX}">`,
    currentMapModeLabel: '<div class="sidebar-option" id="current-map-mode-label">Map Mode: {currentMapMode}</div>',
    alertBox: '<div id="alert"><p id="alert-message">{message}</p><button id="alert-close">Dismiss</button></div>',
    // Used in main.js
    playerLookup: '<div class="leaflet-control-layers leaflet-control" id="player-lookup"></div>',
    playerLookupLoading: '<div class="leaflet-control-layers leaflet-control" id="player-lookup-loading">Loading...</button>',
    residentClickable: '<span class="resident-clickable">{player}</span>',
    residentList: '<span class="resident-list">\t{list}</span>',
    scrollableResidentList: '<div class="resident-list" id="scrollable-list">\t{list}</div>',
    partOfLabel: '<span id="part-of-label">Part of <b>{allianceList}</b></span>',
    alertMsg: '<div class="message" id="alert"><p id="alert-message">{message}</p></div>',
	darkMode: `<style id="dark-mode">
		.leaflet-control, #alert,
		.sidebar-button, .sidebar-input, .leaflet-bar > a,
		.leaflet-tooltip-top, .leaflet-popup-content-wrapper,
		.leaflet-popup-tip, .leaflet-bar > a.leaflet-disabled,
		#alert-close, #player-lookup > .close-container {
			background: #131313eb !important;
			color: #dedede !important;
			border-color: #4e4e4e !important;
		}
		.sidebar-button, .sidebar-input, #alert-close {
			color-scheme: dark;
		}
		.sidebar-input::placeholder {
			color: #a8a8a8 !important;
		}
		.sidebar-button option {
			background: #161616 !important;
			color: #dedede !important;
		}
		.leaflet-control.leaflet-control-layers,
		#sidebar, #server-info, #nation-claims,
		#player-lookup, #player-lookup-loading {
			background: #131313eb !important;
			border-color: #4e4e4e !important;
		}
		#current-map-mode-label, #options-menu, #options-menu label,
		#options-menu .option, #player-lookup, #player-lookup-loading,
		#server-info, #nation-claims, #nation-claims-titlebar,
		.leaflet-popup-content, .leaflet-popup-content * {
			color: #dedede !important;
		}
		div.leaflet-control-layers.link img {
			filter: invert(1);
		}
		</style>
	`,
})

let alertTimeout = null

/**
 * Appends nodes or strings to a parent element.
 * @param {Node} parent
 * @param {Node | string | number | boolean | null | undefined | Array<Node | string | number | boolean | null | undefined>} children
 */
function appendChildren(parent, children) {
	if (Array.isArray(children)) {
		children.forEach(child => appendChildren(parent, child))
		return parent
	}

	if (children == null || children === false) return parent
	parent.append(children instanceof Node ? children : document.createTextNode(String(children)))
	return parent
}

/**
 * Creates a DOM element using safe node APIs.
 * @template {keyof HTMLElementTagNameMap} T
 * @param {T} tagName
 * @param {Object} [options]
 * @param {string} [options.id]
 * @param {string} [options.className]
 * @param {string} [options.text]
 * @param {string} [options.type]
 * @param {string} [options.placeholder]
 * @param {string} [options.value]
 * @param {string} [options.htmlFor]
 * @param {string} [options.href]
 * @param {string} [options.rel]
 * @param {string} [options.target]
 * @param {string} [options.src]
 * @param {boolean} [options.checked]
 * @param {Record<string, string>} [options.attrs]
 * @param {Partial<CSSStyleDeclaration>} [options.style]
 * @param {Array<Node | string | number | boolean | null | undefined> | Node | string | number | boolean | null | undefined} [children]
 * @returns {HTMLElementTagNameMap[T]}
 */
function createElement(tagName, options = {}, children = []) {
	const element = document.createElement(tagName)
	const {
		id,
		className,
		text,
		type,
		placeholder,
		value,
		htmlFor,
		href,
		rel,
		target,
		src,
		checked,
		attrs = {},
		style = {},
	} = options

	if (id) element.id = id
	if (className) element.className = className
	if (text != null) element.textContent = text
	if (type != null && 'type' in element) element.type = type
	if (placeholder != null && 'placeholder' in element) element.placeholder = placeholder
	if (value != null && 'value' in element) element.value = value
	if (htmlFor != null && 'htmlFor' in element) element.htmlFor = htmlFor
	if (href != null && 'href' in element) element.href = href
	if (rel != null && 'rel' in element) element.rel = rel
	if (target != null && 'target' in element) element.target = target
	if (src != null && 'src' in element) element.src = src
	if (checked != null && 'checked' in element) element.checked = checked

	Object.entries(attrs).forEach(([key, val]) => {
		if (val != null) element.setAttribute(key, val)
	})
	Object.assign(element.style, style)
	appendChildren(element, children)

	return element
}

/**
 * Appends an element to a parent and returns it.
 * @template {Node} T
 * @param {Node} parent
 * @param {T} element
 * @returns {T}
 */
function addElement(parent, element) {
	parent.appendChild(element)
	return element
}

/**
 * Replaces all children on an element using safe node APIs.
 * @param {Element} element
 * @param {Node | string | number | boolean | null | undefined | Array<Node | string | number | boolean | null | undefined>} children
 */
function replaceChildrenSafe(element, children) {
	element.replaceChildren()
	appendChildren(element, children)
	return element
}

function createAlertElement() {
	const alertMessage = createElement('p', { id: 'alert-message' })
	const alert = addElement(document.body, createElement('div', { id: 'alert' }, [
		alertMessage,
		createElement('button', { id: 'alert-close', text: 'Dismiss' }),
	]))

	alert.querySelector('#alert-close').addEventListener('click', () => {
		clearTimeout(alertTimeout)
		alert.remove()
	})

	return alert
}

/**
 * Shows an alert message in a box at the center of the screen.
 * @param {Node | string | number | boolean | null | undefined | Array<Node | string | number | boolean | null | undefined>} message
 * @param {number} timeout - The time (in sec) until the alert box is auto closed. null = manual dismiss
 */
function showAlert(message, timeout = null) {
	let alert = document.querySelector('#alert')
	if (!alert) alert = createAlertElement()

	replaceChildrenSafe(alert.querySelector('#alert-message'), message)

	clearTimeout(alertTimeout)
	if (timeout) alertTimeout = setTimeout(() => alert.remove(), timeout*1000)

	return alert
}

/**
 * @param {string} selector
 * @returns {Promise<HTMLElement | null>}
 */
const waitForElement = selector => new Promise(resolve => {
    const selected = document.querySelector(selector)
    if (selected) return resolve(selected)

	const observeTarget = document.body ?? document.documentElement
	if (!(observeTarget instanceof Node)) return resolve(null)

    const observer = new MutationObserver(() => {
        const selected = document.querySelector(selector)
        if (selected) {
            resolve(selected)
            observer.disconnect()
        }
    })
    observer.observe(observeTarget, { childList: true, subtree: true })
})

/**
 * Calls `callback` whenever the element's href changes.
 * @param {HTMLElement} anchorParent
 * @param {() => HTMLElement} getAnchor
 * @param {(newHref: string, lastHref: string) => void} callback
 */
function onAnchorUpdate(anchorParent, getAnchor, callback) {
	if (!(anchorParent instanceof Node)) return null

	let lastHref = null
	const check = () => {
		const anchor = getAnchor()
		if (!anchor) return

		const href = anchor.href
		if (href !== lastHref) {
			callback(href, lastHref)
			lastHref = href
		}
	}

	const observer = new MutationObserver(check)
	observer.observe(anchorParent, { childList: true, subtree: true, attributes: true })

	check()
	return observer
}

function initToggleOptions() {
	const darkened = localStorage['emcdynmapplus-darkened'] == 'true' ? true : false
	waitForElement('.leaflet-tile-pane').then(_ => toggleDarkened(darkened))

    const darkPref = localStorage['emcdynmapplus-darkmode']
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches
    if (darkPref === 'true' || (!darkPref && systemDark)) {
        localStorage['emcdynmapplus-darkmode'] = 'true'
        loadDarkMode()
    }

	const showServerInfo = localStorage['emcdynmapplus-serverinfo'] == 'true' ? true : false
	waitForElement('#server-info').then(_ => toggleServerInfo(showServerInfo))

	// Initialize date input from stored date. 20260801 -> 2026-08-01
	const storedArchiveDate = localStorage['emcdynmapplus-archive-date']
	const formattedDate = typeof storedArchiveDate === 'string' && storedArchiveDate.length === 8
		? `${storedArchiveDate.slice(0, 4)}-${storedArchiveDate.slice(4, 6)}-${storedArchiveDate.slice(6, 8)}`
		: ''
	waitForElement('#archive-input').then(dateInputEl => {
		if (dateInputEl && formattedDate) dateInputEl.value = formattedDate
	})

	const showCapitalStars = localStorage['emcdynmapplus-capital-stars'] == 'true' ? true : false
	waitForElement('.leaflet-pane.leaflet-marker-pane').then(_ => toggleShowCapitalStars(showCapitalStars))
	
	const normalizeScroll = localStorage['emcdynmapplus-normalize-scroll'] == 'true' ? true : false
	toggleScrollNormalize(normalizeScroll)
}

async function insertScreenshotBtn() {
	if (!isScreenshotFeatureAvailable()) return

	const linkBtn = await waitForElement(".leaflet-control-layers.link")
	if (!linkBtn?.parentElement) return

	const linkBtnCloned = linkBtn?.cloneNode(true)
	if (!(linkBtnCloned instanceof HTMLElement)) return

	linkBtnCloned.className = 'leaflet-control-layers link screenshot leaflet-control'

	const screenshotBtn = linkBtn?.parentElement?.insertBefore(linkBtnCloned, linkBtn.parentElement.children[0])
	const screenshotLink = screenshotBtn?.querySelector('a')
	screenshotLink?.setAttribute("href", "")
	screenshotBtn?.addEventListener('click', async e => {
		e.preventDefault() // stop blank href from refreshing as we are adding our own button behaviour

		try {
			const canvas = await withInteractionBlocked(screenshotViewport)
			const blob = await screenshotCanvasToBlob(canvas)
			let clipboardError = null

			if (canWriteScreenshotToClipboard()) {
				try {
					await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
					showAlert('Screenshot successful. Copied to clipboard!', 5)
					return
				} catch (error) {
					clipboardError = error
					console.warn('Clipboard image write failed, falling back to download.', error)
				}
			}

			if (canDownloadScreenshot()) {
				downloadScreenshotBlob(blob)
				showAlert(
					clipboardError
						? 'Screenshot captured. Clipboard copy failed, so the image was downloaded instead.'
						: 'Screenshot successful. Download started.',
					5
				)
				return
			}

			throw clipboardError || new Error('No screenshot output path is available in this browser.')
		} catch (e) {
			console.error(e)
			showAlert('Failed to screenshot/copy to clipboard. Check the console.')
		}
	})
}

/**
 * Temporarily blocks mouse/keyboard interaction while running `fn`.
 * @template T
 * @param {() => Promise<T>} fn - Async function to run while blocked.
 * @returns {Promise<T>} Resolves with whatever the callback returns.
 */
const withInteractionBlocked = async (fn) => {
	const blocker = document.createElement('div')
	blocker.style.position = 'fixed'
	blocker.style.top = '0'
	blocker.style.left = '0'
	blocker.style.width = '100vw'
	blocker.style.height = '100vh'
	blocker.style.zIndex = '999999'
	blocker.style.cursor = 'wait'
	document.body.appendChild(blocker)

	try {
		return await fn()
	} finally {
		blocker.remove()
	}
}

/** Waits until the Leaflet map stops being panned or updated. Resolves once DOM is stable for 50ms. */
const waitForStableViewport = () => new Promise(resolve => {
	const pane = document.querySelector('.leaflet-map-pane')
	if (!(pane instanceof Node)) return resolve()
	
	let timer
	const observer = new MutationObserver(() => {
		clearTimeout(timer)
		timer = setTimeout(() => {
			observer.disconnect()
			resolve()
		}, 50)
	})

	observer.observe(pane, { attributes: true, childList: true, subtree: true, characterData: true })
})

async function editUILayout() {
    const coordinates = await waitForElement('.leaflet-control-layers.coordinates')
	const link = await waitForElement('.leaflet-control-layers.link')

	// Change the link/anchor coords button so that it doesn't 
	// reload the page and just updates the address bar.
	onAnchorUpdate(link, () => link?.querySelector('a'), (newHref, _) => {
		link.onclick = e => {
			e.preventDefault()
			e.stopPropagation()
			
			history.replaceState(null, '', newHref)
			showAlert('Updated URL with current camera coordinates. Next refresh will navigate there automatically.', 4)
		}
	})

	// move the +- zoom control buttons to the bottom instead of top
    // and make sure the link and coordinates buttons align with it
	const bottomLeft = document.querySelector(".leaflet-bottom.leaflet-left")
	if (link || coordinates) {
		const wrapper = document.createElement('div')
		wrapper.id = 'coords-container'
 		
		// place link btn and coords in same div under bottom left panel
		if (link) wrapper.appendChild(link)
		if (coordinates) wrapper.appendChild(coordinates)
		bottomLeft.appendChild(wrapper)
	}

	const zoomControl = await waitForElement('.leaflet-control-zoom')
	if (zoomControl) bottomLeft.insertBefore(zoomControl, bottomLeft.firstChild)

    // Fix nameplates appearing over popups
    waitForElement('.leaflet-nameplate-pane').then(el => el.style = '')

}

/** 
 * Inserts the claim color customizer only if the active map mode matches mapMode.
 * @param {string} mapMode - The name of the map mode required to insert the claims panel.
 * @returns {Promise<Element | null>} The "#nation-claims" element. 
 */
function tryInsertNationClaimsPanel(mapMode) {
	const mode = localStorage['emcdynmapplus-mapmode']
	if (mode != mapMode) return null

	return waitForElement('.leaflet-control-container').then(el => {
		disablePanAndZoom(el)
		return addNationClaimsPanel(el)
	})
}

/** @returns {Promise<Element | null>} The "#server-info" element. */
function insertServerInfoPanel() {
	return waitForElement('.leaflet-top.leaflet-right').then(el => {
		disablePanAndZoom(el)
		return addServerInfoPanel(el)
	})
}

/** @returns {Promise<Element | null>} The "#sidebar" element. */
function insertSidebarMenu() {
    return waitForElement('.leaflet-top.leaflet-left').then(el => {
        disablePanAndZoom(el)
        return addMainMenu(el)
    })
}

/** @returns {Promise<Element | null>} The Dynmap+ options block inside the Leaflet layers control. */
function insertLayerOptionsMenu() {
	return waitForElement('.leaflet-control-layers-list').then(el => {
		const control = el.closest('.leaflet-control-layers')
		if (control instanceof HTMLElement) disablePanAndZoom(control)
		const mapMode = localStorage['emcdynmapplus-mapmode'] ?? 'meganations'
		return addOptions(el, mapMode)
	})
}

/** @param {HTMLElement} element - The element to prevent Leaflet pan/zoom interactions on. */
function disablePanAndZoom(element) {
	// Prevents panning the map when on this element by
	// stopping the mouse event from propogating to Leaflet.
	element.addEventListener('mousedown', e => e.stopPropagation())
	element.addEventListener('wheel', e => e.stopPropagation(), { passive: true })

	// blocks the map (Leaflet) from zooming when 
	// double clicking in the sidebar main menu.
	element.addEventListener('dblclick', e => {
		e.stopPropagation()
		e.preventDefault()
	})
}

/** @param {HTMLElement} panel - The "#nation-claims" element. */
function loadNationClaims(panel) {
	/** @type {Array<{color: string|null, input: string|null>}} */
	const entries = JSON.parse(localStorage['emcdynmapplus-nation-claims-info'] || '[]')
	entries.forEach((entry, i) => {
		const color = panel.querySelector(`#nation-color-entry${i+1}`)
		const text = panel.querySelector(`#nation-text-entry${i+1}`)
		if (color) color.value = entry.color || ''
		if (text) text.value = entry.input || ''
	})
}

/** @param {HTMLElement} parent - The "leaflet-bottom leaflet-right" element. */
function addNationClaimsPanel(parent) {
	const existingPanel = parent.querySelector('#nation-claims')
	if (existingPanel) return existingPanel

	const panel = addElement(parent, createElement('div', {
		id: 'nation-claims',
		className: 'leaflet-control-layers leaflet-control',
	}))
	panel.addEventListener('wheel', e => e.stopPropagation()) // stop squaremap overtaking scroll, we need to scroll the inputs

	const toggleShowBtn = createElement('a', { href: '' }, createElement('img', {
		className: 'crisp-edges',
		src: 'images/clear.png',
	}))
	const titlebar = addElement(panel, createElement('div', { id: 'nation-claims-titlebar' }, [
		createElement('p', { text: 'Nation Claims Customizer' }),
		createElement('div', {
			className: 'leaflet-control-layers link leaflet-control',
		}, toggleShowBtn),
	]))
	const btnImg = toggleShowBtn.querySelector('img')
	toggleShowBtn.addEventListener('click', e => {
		e.preventDefault()

		const contentContainer = panel.querySelector('#nation-claims-content')
		contentContainer.style.display = contentContainer.style.display == 'none' ? '' : 'none'
		btnImg.classList.toggle('active') // toggles the appropriate show or hide icon
	})

	// Container for everything except the titlebar. This container is hidden by clicking the eye icon.
	const contentContainer = addElement(panel, createElement('div', { id: 'nation-claims-content' }))
	contentContainer.style.display = 'none'

	const entriesContainer = addElement(contentContainer, createElement('div', { id: 'nation-claims-entry-container' }))
	
	for (let i = 1; i <= MAX_NATION_CLAIM_ENTRIES; i++) {
		const entry = addElement(entriesContainer, createElement('div', {
			id: `nation-claims-entry${i}`,
			className: 'nation-claims-entry',
		}))
		addElement(entry, createElement('input', {
			id: `nation-color-entry${i}`,
			type: 'color',
		}))
		addElement(entry, createElement('input', {
			id: `nation-text-entry${i}`,
			type: 'text',
			placeholder: 'Enter nation name...',
		}))
	}

	const optDiv1 = addElement(contentContainer, createElement('div', { className: 'nation-claims-checkbox-option' }))
	const optDiv2 = addElement(contentContainer, createElement('div', { className: 'nation-claims-checkbox-option' }))

	const showExcludedCheckbox = addElement(optDiv1, createElement('input', {
		id: 'show-excluded',
		type: 'checkbox',
	}))
	addElement(optDiv1, createElement('label', {
		htmlFor: 'show-excluded',
		text: 'Show irrelevant towns',
	}))
	showExcludedCheckbox.checked = localStorage['emcdynmapplus-nation-claims-show-excluded'] == 'true' ? true : false
	showExcludedCheckbox.addEventListener('change', e =>
		localStorage['emcdynmapplus-nation-claims-show-excluded'] = e.target.checked
	)

	const useOpaqueCheckbox = addElement(optDiv2, createElement('input', {
		id: 'use-opaque-colors',
		type: 'checkbox',
	}))
	addElement(optDiv2, createElement('label', {
		htmlFor: 'use-opaque-colors',
		text: 'Use opaque colors',
	}))
	useOpaqueCheckbox.checked = localStorage['emcdynmapplus-nation-claims-opaque-colors'] == 'true' ? true : false
	useOpaqueCheckbox.addEventListener('change', e =>
		localStorage['emcdynmapplus-nation-claims-opaque-colors'] = e.target.checked
	)

	const div = addElement(contentContainer, createElement('div', { id: 'nation-claims-btn-container' }))

	const applyBtn = addElement(div, createElement('button', {
		id: 'nation-claims-apply',
		className: 'sidebar-button',
		text: 'Apply',
	}))
	applyBtn.addEventListener('click', () => {
		const colorInputs = entriesContainer.querySelectorAll('[id^="nation-color-entry"]')
		const textInputs  = entriesContainer.querySelectorAll('[id^="nation-text-entry"]')
		const entries = Array.from({ length: MAX_NATION_CLAIM_ENTRIES }, (_, i) => ({
			color: colorInputs[i]?.value ?? null,
			input: textInputs[i]?.value ?? null,
		}))

		localStorage['emcdynmapplus-nation-claims-info'] = JSON.stringify(entries)
		location.reload()
	})

	const resetAllBtn = addElement(div, createElement('button', {
		id: 'nation-claims-reset-all',
		className: 'sidebar-button',
		text: 'Reset All',
	}))
	resetAllBtn.addEventListener('click', () => {
		const entries = Array.from({ length: MAX_NATION_CLAIM_ENTRIES }, () => ({ color: null, input: null }))
		localStorage['emcdynmapplus-nation-claims-info'] = JSON.stringify(entries)
		loadNationClaims(panel)
		showAlert("Set all nation claim inputs to default.", 2)
	})

	return panel
}

/** @param {HTMLElement} parent - The "leaflet-top leaflet-right" element. */
function addServerInfoPanel(parent) {
	const existingPanel = parent.querySelector('#server-info')
	if (existingPanel) return existingPanel

	const panel = addElement(parent, createElement('div', {
		id: 'server-info',
		className: 'leaflet-control-layers leaflet-control',
	}))
	addElement(panel, createElement('div', { id: 'server-info-title', text: 'Server Info' }))
	addServerInfoPlaceholder(panel, 'vote-party', 'Votes until VP')
	addElement(panel, createElement('br'))
	addServerInfoPlaceholder(panel, 'online-players-count', 'Online Players')
	addServerInfoPlaceholder(panel, 'online-nomads-count', 'Online Townless')
	addElement(panel, createElement('br'))
	addServerInfoPlaceholder(panel, 'server-time', 'Server Time')
	addServerInfoPlaceholder(panel, 'new-day-in', 'New Day In')
	addElement(panel, createElement('br'))
	addServerInfoPlaceholder(panel, 'storm', '\u26A1 Storm')
	addServerInfoPlaceholder(panel, 'thunder', '\u26C8\uFE0F Thunder')

	return panel
}

/**
 * @param {HTMLElement} parent
 * @param {string} id
 * @param {string} label
 */
function addServerInfoPlaceholder(parent, id, label) {
	const entry = addElement(parent, createElement('div', {
		id,
		className: 'server-info-entry',
	}))
	renderServerInfoEntry(entry, label, 'Loading...')
	return entry
}

/**
 * @param {HTMLElement | null} element
 * @param {string} name
 * @param {string | number} value
 */
function renderServerInfoEntry(element, name, value) {
	if (!element) return

	const colour = value == 'Yes'
		? 'var(--success-color)'
		: value == 'No'
			? 'var(--danger-color)'
			: 'var(--text-strong)'
	replaceChildrenSafe(element, [
		createElement('span', {
			className: 'server-info-label',
			text: name,
		}),
		createElement('strong', {
			className: 'server-info-value',
			text: String(value),
			style: { color: colour },
		}),
	])
}

/**
 * @param {string} name 
 * @param {string} value 
 */
const serverInfoEntry = (name, value) => {
	const colour = value == 'Yes' ? 'green' : value == 'No' ? 'red' : 'white'
	return `<p style="margin: 0;">${name}: <b style="color: ${colour};">${value}</b></p>`
}

/**
 * @param {HTMLElement} element - The "#server-info" element.
 * @param {ServerInfo} info - The object containing server info.
 */
function renderServerInfo(element, info) {
	const vpRemaining = info.voteParty.numRemaining
	const { numOnlinePlayers, numOnlineNomads } = info.stats
	const { newDayTime, serverTimeOfDay } = info.timestamps

	// Server Time
	const hours = Math.floor(serverTimeOfDay / 3600)
	const minutes = Math.floor((serverTimeOfDay % 3600) / 60)

	const displayHour = hours % 12 || 12
	const displayMin = minutes.toString().padStart(2, '0')
	const timeStr = `${displayHour}:${displayMin} ${hours >= 12 ? 'PM' : 'AM'}`

	// New Day In
	let delta = newDayTime - serverTimeOfDay
	if (delta < 0) delta += 86_400 // 24hr
	const newDayHr = Math.floor(delta / 3600)
	const newDayMin = Math.floor((delta % 3600) / 60)

	renderServerInfoEntry(element.querySelector('#vote-party'), 'Votes until VP', vpRemaining > 0 ? vpRemaining : 0)
	renderServerInfoEntry(element.querySelector('#online-players-count'), 'Online Players', numOnlinePlayers || 0)
	renderServerInfoEntry(element.querySelector('#online-nomads-count'), 'Online Townless', numOnlineNomads || 0)
	renderServerInfoEntry(element.querySelector('#server-time'), 'Server Time', timeStr)
	renderServerInfoEntry(element.querySelector('#new-day-in'), 'New Day In', `${newDayHr}hrs ${newDayMin}m`)
	renderServerInfoEntry(element.querySelector('#storm'), '\u26A1 Storm', info.status.hasStorm ? 'Yes' : 'No')
	renderServerInfoEntry(element.querySelector('#thunder'), '\u26C8\uFE0F Thunder', info.status.isThundering ? 'Yes' : 'No')
	return

}

/** @param {number} deltaY */
function triggerScrollEvent(deltaY) {
    // Calculate how many sets of SCROLL_THRESHOLD lines the user scrolled
    const zoomMultiplier = Math.floor(Math.abs(deltaY) / (SCROLL_LINE_DELTA * SCROLL_THRESHOLD))
    const pxPerZoomLevel = SCROLL_BASE_ZOOM + (zoomMultiplier * 30)

	const adjustedZoom = deltaY < 0 ? pxPerZoomLevel : -pxPerZoomLevel
    document.dispatchEvent(new CustomEvent('EMCDYNMAPPLUS_ADJUST_SCROLL', { detail: adjustedZoom }))
}

const SERVERINFO_INTERVAL = 5*1000
let serverInfoScheduler = null

/** @param {HTMLElement} element - The "#server-info" element. */
async function updateServerInfo(element) {
	const info = await fetchServerInfo()
	if (info) renderServerInfo(element, info)

	// schedule next only if still enabled
	const enabled = localStorage['emcdynmapplus-serverinfo'] === 'true' ? true : false
	if (!enabled) serverInfoScheduler = null
	else serverInfoScheduler = setTimeout(() => updateServerInfo(element), SERVERINFO_INTERVAL)
}
