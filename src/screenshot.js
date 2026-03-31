const queryTileElements = () => document.querySelectorAll(".leaflet-tile-pane .leaflet-layer img.leaflet-tile")
const nextFrame = () => new Promise(r => requestAnimationFrame(r))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const canUseOffscreenCanvas = () => typeof OffscreenCanvas === 'function'
const canUseDomCanvas = () => {
	const canvas = document.createElement('canvas')
	return typeof canvas.getContext === 'function'
}
const canWriteScreenshotToClipboard = () =>
	typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function'
const canDownloadScreenshot = () =>
	typeof URL?.createObjectURL === 'function'
	&& typeof URL?.revokeObjectURL === 'function'
	&& typeof document?.createElement === 'function'

function createScreenshotCanvas(width, height) {
	if (canUseOffscreenCanvas()) return new OffscreenCanvas(width, height)

	const canvas = document.createElement('canvas')
	canvas.width = width
	canvas.height = height
	return canvas
}

async function screenshotCanvasToBlob(canvas) {
	if (typeof canvas?.convertToBlob === 'function') {
		return canvas.convertToBlob({ type: 'image/png', quality: 1 })
	}

	if (canvas instanceof HTMLCanvasElement) {
		return new Promise((resolve, reject) => {
			canvas.toBlob(blob => {
				if (blob) return resolve(blob)
				reject(new Error('Canvas export produced no blob'))
			}, 'image/png')
		})
	}

	throw new Error('Canvas blob export is unavailable in this browser.')
}

function downloadScreenshotBlob(blob, filename = `earthmc-map-${Date.now()}.png`) {
	const blobUrl = URL.createObjectURL(blob)
	const link = document.createElement('a')
	link.href = blobUrl
	link.download = filename
	link.rel = 'noopener'
	link.style.display = 'none'
	document.body.appendChild(link)
	link.click()
	link.remove()
	setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
}

function isScreenshotFeatureAvailable() {
	return (canUseOffscreenCanvas() || canUseDomCanvas())
		&& (canWriteScreenshotToClipboard() || canDownloadScreenshot())
}

/** @param {"low" | "medium" | "high" | null | undefined} antialiasing */
const screenshotViewport = async (antialiasing = null) => {
    showAlert("Waiting for viewport to stabilize...")
    await waitForStableViewport() // wait until map is no longer being panned

    const tileElements = queryTileElements()
    if (!tileElements.length) throw new Error('No tiles found')

    /** @type {Array<HTMLImageElement>} */
    const tiles = []
    for (const img of tileElements) {
        if (!img.parentElement) continue

        const style = getComputedStyle(img.parentElement)
        const scale = parseFloat(style.transform.match(/scale\(([^)]+)\)/)?.[1] || '1')
        if (scale < 1) continue

        if (!img.complete) {
            try { await img.decode() } catch {}
        }

        tiles.push(img)
    }

    const resScale = 1.5 // increase canvas resolution
    const canvas = createScreenshotCanvas(window.innerWidth * resScale, window.innerHeight * resScale)
    const ctx = canvas.getContext('2d', { alpha: false })
	if (!ctx) throw new Error('Failed to create a 2D canvas context for screenshot capture.')

    ctx.imageSmoothingEnabled = !!antialiasing
    ctx.imageSmoothingQuality = antialiasing || 'low'
    ctx.scale(resScale, resScale) // scale the coords to draw correctly with increased res

    showAlert('Waiting for markers to load...')
    await delay(300)
    for (let i = 0; i < 5; i++) {
        await nextFrame()
    }

    showAlert('Drawing layers...')
    await delay(150)

    await drawBackground(ctx)
    drawTiles(ctx, tiles)
    drawMarkers(ctx)

    return canvas
}

/** 
 * Draws the 'sky' background that is used to indicate an unplayble area past the world border.
 * In the case of missing tiles, this background will show up in their place as it lies underneath. 
 * @param {CanvasRenderingContext2D} ctx The canvas context on which to draw the background/sky on top.
 */
async function drawBackground(ctx) {
	const mapElement = document.querySelector('#map')
	if (!mapElement) return
	
	const bg = getComputedStyle(mapElement).backgroundImage
	if (bg && bg !== 'none') {
		const img = new Image()
		img.crossOrigin = "anonymous"
		img.src = bg.slice(5, -2)
		
		await img.decode()

		ctx.fillStyle = ctx.createPattern(img, 'repeat')
		ctx.fillRect(0, 0, window.innerWidth, window.innerHeight)
	}
}

/** 
 * Draws all tiles relative to the viewport, skipping any outside, onto the specified canvas given its context.
 * @param {CanvasRenderingContext2D} ctx The canvas context on which to draw the tiles on top.
 * @param {Array<HTMLImageElement>} tiles The array of tile image elements to be drawn.
 * @param {boolean} withFilter Whether to apply a CSS style `filter` to the tiles (decreased brightness etc).
 */
function drawTiles(ctx, tiles, withFilter = true) {
    if (withFilter) ctx.filter = getTilePaneFilter()
	for (const img of tiles) {
		const rect = img.getBoundingClientRect()

		// skip tiles fully outside viewport
		if (rect.right <= 0 || rect.bottom <= 0) continue
		if (rect.left >= ctx.canvas.width || rect.top >= ctx.canvas.height) continue

		ctx.drawImage(img, rect.left, rect.top, rect.width, rect.height)
	}
	ctx.filter = 'none'
}

/** 
 * Draws the overlay pane (including town markers) onto the specified canvas given its context.
 * @param {CanvasRenderingContext2D} ctx The canvas context on which to draw the markers on top.
 */
function drawMarkers(ctx) {
	const overlay = document.querySelector('.leaflet-overlay-pane canvas.leaflet-zoom-animated')
	if (!overlay) throw new Error('Cannot draw markers onto output image due to missing overlay pane element!')

	const rect = overlay.getBoundingClientRect()
	const x = Math.max(rect.left, 0)
	const y = Math.max(rect.top, 0)
	const width = Math.min(rect.right, ctx.canvas.width) - x
	const height = Math.min(rect.bottom, ctx.canvas.height) - y
	
	if (width > 0 && height > 0) {
		const scaleX = overlay.width / rect.width
		const scaleY = overlay.height / rect.height
		
		const dx = (x - rect.left) * scaleX
		const dy = (y - rect.top) * scaleY
		
		ctx.drawImage(overlay, dx, dy, width * scaleX, height * scaleY, x, y, width, height)
	}
}
