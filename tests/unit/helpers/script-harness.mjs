import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const helperDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(helperDir, "..", "..", "..");

function createStyle() {
	return {
		setProperty(name, value) {
			this[name] = value;
		},
		removeProperty(name) {
			delete this[name];
		},
	};
}

function createClassList(element) {
	const read = () =>
		new Set(
			String(element.className || "")
				.split(/\s+/)
				.filter(Boolean),
		);
	const write = (values) => {
		element.className = [...values].join(" ");
	};

	return {
		add(...names) {
			const values = read();
			names.forEach((name) => values.add(name));
			write(values);
		},
		remove(...names) {
			const values = read();
			names.forEach((name) => values.delete(name));
			write(values);
		},
		toggle(name) {
			const values = read();
			if (values.has(name)) values.delete(name);
			else values.add(name);
			write(values);
			return values.has(name);
		},
		contains(name) {
			return read().has(name);
		},
	};
}

class FakeNode {}

class FakeTextNode extends FakeNode {
	constructor(text) {
		super();
		this.textContent = String(text);
	}
}

class FakeElement extends FakeNode {
	constructor(tagName = "div") {
		super();
		this.tagName = String(tagName).toUpperCase();
		this.children = [];
		this.parentElement = null;
		this.attributes = new Map();
		this.style = createStyle();
		this.dataset = {};
		this.className = "";
		this.classList = createClassList(this);
		this.textContent = "";
		this.innerHTML = "";
		this.id = "";
		this.hidden = false;
		this.disabled = false;
		this.value = "";
		this.checked = false;
		this.href = "";
		this.src = "";
		this.rel = "";
		this.target = "";
		this.type = "";
		this.placeholder = "";
		this.open = false;
		this.__listeners = new Map();
		this.__queryMap = new Map();
		this.__queryAllMap = new Map();
		this.__closestMap = new Map();
		this.__rect = {
			left: 0,
			top: 0,
			right: 0,
			bottom: 0,
			width: 0,
			height: 0,
		};
	}

	appendChild(child) {
		const nextChild =
			child instanceof FakeNode ? child : new FakeTextNode(String(child));
		nextChild.parentElement = this;
		this.children.push(nextChild);
		return nextChild;
	}

	append(...items) {
		items.flat().forEach((item) => {
			if (item == null || item === false) return;
			this.appendChild(item);
		});
	}

	remove() {
		if (!this.parentElement) return;
		this.parentElement.children = this.parentElement.children.filter(
			(child) => child !== this,
		);
		this.parentElement = null;
	}

	setAttribute(name, value) {
		const normalizedValue = String(value);
		this.attributes.set(name, normalizedValue);
		if (name === "id") this.id = normalizedValue;
		if (name === "class") this.className = normalizedValue;
	}

	getAttribute(name) {
		return this.attributes.has(name) ? this.attributes.get(name) : null;
	}

	removeAttribute(name) {
		this.attributes.delete(name);
		if (name === "id") this.id = "";
		if (name === "class") this.className = "";
	}

	querySelector(selector) {
		return this.__queryMap.get(selector) ?? null;
	}

	querySelectorAll(selector) {
		return this.__queryAllMap.get(selector) ?? [];
	}

	closest(selector) {
		return this.__closestMap.get(selector) ?? null;
	}

	replaceChildren(...items) {
		this.children = [];
		this.append(...items);
	}

	insertBefore(newNode, referenceNode) {
		const nextChild =
			newNode instanceof FakeNode ? newNode : new FakeTextNode(String(newNode));
		nextChild.parentElement = this;
		const index = this.children.indexOf(referenceNode);
		if (index === -1) {
			this.children.push(nextChild);
			return nextChild;
		}

		this.children.splice(index, 0, nextChild);
		return nextChild;
	}

	addEventListener(type, listener) {
		const existing = this.__listeners.get(type) ?? [];
		existing.push(listener);
		this.__listeners.set(type, existing);
	}

	removeEventListener(type, listener) {
		const existing = this.__listeners.get(type) ?? [];
		this.__listeners.set(
			type,
			existing.filter((candidate) => candidate !== listener),
		);
	}

	dispatchEvent(event) {
		const existing = this.__listeners.get(event.type) ?? [];
		existing.forEach((listener) => listener(event));
		return true;
	}

	getBoundingClientRect() {
		return { ...this.__rect };
	}

	setBoundingClientRect(rect) {
		this.__rect = { ...this.__rect, ...rect };
	}
}

class FakeHTMLElement extends FakeElement {}

class FakeHTMLLabelElement extends FakeHTMLElement {}

class FakeHTMLImageElement extends FakeHTMLElement {
	constructor() {
		super("img");
		this.currentSrc = "";
		this.complete = true;
	}

	async decode() {}
}

class FakeHTMLCanvasElement extends FakeHTMLElement {
	constructor() {
		super("canvas");
		this.width = 0;
		this.height = 0;
		this.__context = {
			canvas: this,
			filter: "none",
			fillStyle: "",
			imageSmoothingEnabled: false,
			imageSmoothingQuality: "low",
			drawImage() {},
			fillRect() {},
			scale() {},
			createPattern() {
				return "pattern";
			},
			getImageData: () => ({
				data: new Uint8ClampedArray(this.width * this.height * 4),
			}),
		};
	}

	getContext() {
		return this.__context;
	}

	toBlob(callback) {
		callback({ type: "image/png" });
	}
}

class FakeMutationObserver {
	constructor(callback) {
		this.callback = callback;
	}

	observe() {}

	disconnect() {}
}

class FakeCustomEvent {
	constructor(type, init = {}) {
		this.type = type;
		this.detail = init.detail;
	}
}

class FakeDOMMatrixReadOnly {
	constructor(transform) {
		const matrixMatch = String(transform).match(
			/matrix\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)/i,
		);
		if (matrixMatch) {
			this.a = Number(matrixMatch[1]);
			this.b = Number(matrixMatch[2]);
			this.c = Number(matrixMatch[3]);
			this.d = Number(matrixMatch[4]);
			return;
		}

		this.a = 1;
		this.b = 0;
		this.c = 0;
		this.d = 1;
	}
}

function createLocalStorage(initial = {}) {
	const target = {};
	for (const [key, value] of Object.entries(initial)) {
		target[key] = String(value);
	}

	const api = {
		getItem(key) {
			return Object.prototype.hasOwnProperty.call(target, key)
				? target[key]
				: null;
		},
		setItem(key, value) {
			target[key] = String(value);
		},
		removeItem(key) {
			delete target[key];
		},
		clear() {
			Object.keys(target).forEach((key) => delete target[key]);
		},
	};

	return new Proxy(target, {
		get(object, prop) {
			if (prop in api) return api[prop];
			return object[prop];
		},
		set(object, prop, value) {
			object[prop] = String(value);
			return true;
		},
		deleteProperty(object, prop) {
			delete object[prop];
			return true;
		},
	});
}

function createDocumentEnvironment() {
	const queryMap = new Map();
	const queryAllMap = new Map();
	const listeners = new Map();

	const documentElement = new FakeHTMLElement("html");
	const head = new FakeHTMLElement("head");
	const body = new FakeHTMLElement("body");

	const document = {
		documentElement,
		head,
		body,
		readyState: "complete",
		currentScript: {
			src: "https://map.earthmc.net/resources/marker-engine.js",
		},
		createElement(tagName) {
			switch (String(tagName).toLowerCase()) {
				case "img":
					return new FakeHTMLImageElement();
				case "canvas":
					return new FakeHTMLCanvasElement();
				case "label":
					return new FakeHTMLLabelElement("label");
				default:
					return new FakeHTMLElement(tagName);
			}
		},
		createElementNS(_namespace, tagName) {
			return this.createElement(tagName);
		},
		createTextNode(text) {
			return new FakeTextNode(text);
		},
		querySelector(selector) {
			if (selector === "html") return documentElement;
			if (selector === "head") return head;
			if (selector === "body") return body;
			return queryMap.get(selector) ?? null;
		},
		querySelectorAll(selector) {
			return queryAllMap.get(selector) ?? [];
		},
		addEventListener(type, listener) {
			const existing = listeners.get(type) ?? [];
			existing.push(listener);
			listeners.set(type, existing);
		},
		removeEventListener(type, listener) {
			const existing = listeners.get(type) ?? [];
			listeners.set(
				type,
				existing.filter((candidate) => candidate !== listener),
			);
		},
		dispatchEvent(event) {
			const existing = listeners.get(event.type) ?? [];
			existing.forEach((listener) => listener(event));
			return true;
		},
		__setQuery(selector, value) {
			queryMap.set(selector, value);
		},
		__setQueryAll(selector, value) {
			queryAllMap.set(selector, value);
		},
		__listeners: listeners,
	};

	return document;
}

function createLeafletStub() {
	function FakeLeafletMap() {}
	FakeLeafletMap.addInitHook = () => {};
	FakeLeafletMap.mergeOptions = () => {};

	function createLabel() {
		const label = new FakeHTMLLabelElement("label");
		const input = new FakeHTMLElement("input");
		input.className = "leaflet-control-layers-selector";
		label.__queryMap.set("input.leaflet-control-layers-selector", input);
		return label;
	}

	const layerPrototype = {
		_addLayer(layer, name, overlay) {
			this._layers = this._layers ?? [];
			this._layers.push({ layer, name, overlay });
			return { layer, name, overlay };
		},
		_addItem() {
			return createLabel();
		},
		_update() {},
	};

	return {
		Map: FakeLeafletMap,
		map() {
			return {
				getContainer() {
					return new FakeHTMLElement("div");
				},
				getZoom() {
					return 0;
				},
				on() {},
				getPane() {
					return new FakeHTMLElement("div");
				},
			};
		},
		Control: {
			Layers: {
				prototype: layerPrototype,
			},
		},
	};
}

export function createScriptContext({
	locationHref = "https://map.earthmc.net/?zoom=1",
	localStorageSeed = {},
	fetchImpl = null,
	now = Date.now(),
	extraGlobals = {},
} = {}) {
	const document = createDocumentEnvironment();
	const localStorage = createLocalStorage(localStorageSeed);
	const location = {
		href: locationHref,
		hostname: new URL(locationHref).hostname,
		reloadCalled: 0,
		reload() {
			this.reloadCalled += 1;
		},
	};

	class FakeDate extends Date {
		static now() {
			return FakeDate.__now;
		}
	}
	FakeDate.__now = now;

	const contextSetTimeout = (callback, delay, ...args) => {
		const handle = setTimeout(callback, delay, ...args);
		handle?.unref?.();
		return handle;
	};

	const contextSetInterval = (callback, delay, ...args) => {
		const handle = setInterval(callback, delay, ...args);
		handle?.unref?.();
		return handle;
	};

	const context = {
		console,
		JSON,
		Math,
		Number,
		String,
		Boolean,
		Array,
		Object,
		RegExp,
		Map,
		Set,
		WeakMap,
		Promise,
		URL,
		URLSearchParams,
		Response,
		Request,
		Headers,
		structuredClone,
		performance,
		Date: FakeDate,
		setTimeout: contextSetTimeout,
		clearTimeout,
		setInterval: contextSetInterval,
		clearInterval,
		queueMicrotask,
		document,
		localStorage,
		location,
		navigator: {
			userAgent: "Mozilla/5.0 Chrome/123.0.0.0",
			clipboard: {},
		},
		fetch:
			fetchImpl ??
			(async (url) => ({
				ok: true,
				status: 200,
				url: String(url),
				clone() {
					return this;
				},
				async json() {
					return {};
				},
			})),
		MutationObserver: FakeMutationObserver,
		CustomEvent: FakeCustomEvent,
		DOMMatrixReadOnly: FakeDOMMatrixReadOnly,
		Node: FakeNode,
		Element: FakeElement,
		HTMLElement: FakeHTMLElement,
		HTMLLabelElement: FakeHTMLLabelElement,
		HTMLImageElement: FakeHTMLImageElement,
		HTMLCanvasElement: FakeHTMLCanvasElement,
		Image: FakeHTMLImageElement,
		OffscreenCanvas: class FakeOffscreenCanvas {
			constructor(width, height) {
				this.width = width;
				this.height = height;
			}

			getContext() {
				return new FakeHTMLCanvasElement().__context;
			}

			async convertToBlob() {
				return { type: "image/png" };
			}
		},
		ClipboardItem: class ClipboardItem {
			constructor(parts) {
				this.parts = parts;
			}
		},
		getComputedStyle(element) {
			return {
				transform: element?.style?.transform ?? "none",
				backgroundImage: element?.style?.backgroundImage ?? "none",
			};
		},
		requestAnimationFrame(callback) {
			return contextSetTimeout(() => callback(FakeDate.now()), 0);
		},
		cancelAnimationFrame(handle) {
			clearTimeout(handle);
		},
		L: createLeafletStub(),
	};

	context.window = context;
	context.globalThis = context;

	Object.assign(context, extraGlobals);
	vm.createContext(context);

	return { context, document, localStorage, location };
}

export function evaluate(context, expression) {
	return vm.runInContext(expression, context);
}

export function loadPlainScript(relativePath, exportNames, options = {}) {
	return loadPlainScripts([relativePath], exportNames, options);
}

export function loadPlainScripts(relativePaths, exportNames, options = {}) {
	const env = createScriptContext(options);
	relativePaths.forEach((relativePath) => {
		const filename = path.join(repoRoot, relativePath);
		const source = fs.readFileSync(filename, "utf8");
		vm.runInContext(source, env.context, { filename });
	});

	const exports =
		exportNames && exportNames.length > 0
			? evaluate(env.context, `({ ${exportNames.join(", ")} })`)
			: {};
	return { ...env, exports };
}

export function loadIifeScript(relativePath, exportNames = [], options = {}) {
	return loadIifeScripts([relativePath], exportNames, options);
}

export function loadIifeScripts(relativePaths, exportNames = [], options = {}) {
	const env = createScriptContext(options);
	relativePaths.forEach((relativePath, index) => {
		const filename = path.join(repoRoot, relativePath);
		let source = fs.readFileSync(filename, "utf8");

		if (index === relativePaths.length - 1 && exportNames.length > 0) {
			source = source.replace(
				/\}\)\(\);\s*$/,
				`globalThis.__TEST_EXPORTS__ = { ${exportNames.join(", ")} };})();`,
			);
		}

		vm.runInContext(source, env.context, { filename });
	});

	const exports = env.context.__TEST_EXPORTS__ ?? {};
	return { ...env, exports };
}
