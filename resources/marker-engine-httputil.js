(() => {
const HTTP_HELPERS_KEY = "__EMCDYNMAPPLUS_MARKER_ENGINE_HTTP__";
if (globalThis[HTTP_HELPERS_KEY]) return;

function createMarkerEngineHttp({
	parseStoredJson,
	oapiBase,
	oapiReqPerMin = 180,
	oapiItemsPerReq = 100,
	storageKey = "emcdynmapplus-oapi-bucket",
	logPrefix = "emcdynmapplus[page-markers]",
	fetchImpl = (...args) => fetch(...args),
	setTimeoutImpl = (callback, delay) => setTimeout(callback, delay),
} = {}) {
	if (typeof parseStoredJson !== "function") {
		throw new Error("marker-engine http helpers require parseStoredJson");
	}

	class TokenBucket {
		constructor(opts) {
			this.capacity = opts.capacity;
			this.refillRate = opts.refillRate;
			this.storageKey = opts.storageKey;

			const bucketData = parseStoredJson(this.storageKey, null);
			if (
				bucketData
				&& Number.isFinite(bucketData.tokens)
				&& Number.isFinite(bucketData.lastRefill)
			) {
				const elapsed = (Date.now() - bucketData.lastRefill) / 1000;
				const added = elapsed * opts.refillRate;
				this.tokens = Math.min(opts.capacity, bucketData.tokens + added);
			} else {
				this.tokens = opts.capacity;
			}

			this.lastRefill = Date.now();
		}

		save() {
			localStorage[this.storageKey] = JSON.stringify({
				tokens: this.tokens,
				lastRefill: this.lastRefill,
			});
		}

		refill() {
			const now = Date.now();
			const elapsed = (now - this.lastRefill) / 1000;
			if (elapsed <= 0) return;

			const added = elapsed * this.refillRate;
			this.tokens = Math.min(this.capacity, this.tokens + added);
			this.lastRefill = now;
			this.save();
		}

		take = async () => new Promise((resolve) => {
			const attempt = () => {
				this.refill();
				if (this.tokens >= 1) {
					this.tokens -= 1;
					this.save();
					resolve();
				} else {
					const msUntilNext = Math.ceil((1 - this.tokens) / this.refillRate * 1000);
					setTimeoutImpl(attempt, msUntilNext);
				}
			};

			attempt();
		});
	}

	const oapiBucket = new TokenBucket({
		capacity: oapiReqPerMin,
		refillRate: oapiReqPerMin / 60,
		storageKey,
	});

	async function fetchJSON(url, options = null) {
		if (url.includes(oapiBase)) await oapiBucket.take();

		const response = await fetchImpl(url, options);
		if (!response.ok && response.status !== 304) return null;

		try {
			return await response.json();
		} catch (err) {
			console.warn(`${logPrefix}: failed to parse JSON response`, { url, err });
			return null;
		}
	}

	const postJSON = (url, body) =>
		fetchJSON(url, { body: JSON.stringify(body), method: "POST" });

	function chunkArr(arr, chunkSize) {
		const chunks = [];
		for (let i = 0; i < arr.length; i += chunkSize) {
			chunks.push(arr.slice(i, i + chunkSize));
		}

		return chunks;
	}

	async function sendBatch(url, chunk) {
		return postJSON(url, { query: chunk.map((entry) => entry.uuid) }).catch((err) => {
			console.error(`${logPrefix}: error sending request`, err);
			return [];
		});
	}

	async function queryConcurrent(url, arr) {
		const chunks = chunkArr(arr, oapiItemsPerReq);
		const promises = chunks.map(async (chunk) => {
			await oapiBucket.take();
			return sendBatch(url, chunk);
		});

		const batchResults = await Promise.all(promises);
		return batchResults.flat();
	}

	return {
		TokenBucket,
		fetchJSON,
		postJSON,
		chunkArr,
		queryConcurrent,
	};
}

globalThis[HTTP_HELPERS_KEY] = Object.freeze({
	createMarkerEngineHttp,
});
})();
