import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const E2E_ENV_FILES = [
	path.resolve(".env.e2e.local"),
	path.resolve(".env.e2e"),
];
let e2eEnvLoaded = false;

export function pathIfExists(candidate) {
	return candidate && fs.existsSync(candidate) ? candidate : null;
}

export function findOnPath(executableNames) {
	const pathEntries = (process.env.PATH || "")
		.split(path.delimiter)
		.map((entry) => entry.trim())
		.filter(Boolean);

	for (const entry of pathEntries) {
		for (const executableName of executableNames) {
			const candidate = path.join(entry, executableName);
			if (fs.existsSync(candidate)) return candidate;
		}
	}

	return null;
}

export function findLatestDriverFromSeleniumCache(driverName) {
	const baseDir = path.join(os.homedir(), ".cache", "selenium", driverName);
	if (!fs.existsSync(baseDir)) return null;

	for (const platformEntry of fs.readdirSync(baseDir, { withFileTypes: true })) {
		if (!platformEntry.isDirectory()) continue;

		const platformDir = path.join(baseDir, platformEntry.name);
		const versionDirs = fs
			.readdirSync(platformDir, { withFileTypes: true })
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort((left, right) =>
				right.localeCompare(left, undefined, { numeric: true }),
			);

		for (const versionDir of versionDirs) {
			const candidates = [
				path.join(platformDir, versionDir, `${driverName}.exe`),
				path.join(platformDir, versionDir, driverName),
			];
			const match = candidates.map(pathIfExists).find(Boolean);
			if (match) return match;
		}
	}

	return null;
}

export function envFlagEnabled(value, defaultValue = true) {
	if (value == null) return defaultValue;
	return !["0", "false", "no", "off"].includes(String(value).toLowerCase());
}

function parseDotEnvContent(text) {
	const entries = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) continue;

		const key = line.slice(0, separatorIndex).trim();
		if (!key) continue;

		let value = line.slice(separatorIndex + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"'))
			|| (value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		entries.push([key, value]);
	}

	return entries;
}

function loadOptionalE2EEnvFiles() {
	if (e2eEnvLoaded) return;
	e2eEnvLoaded = true;

	for (const filePath of E2E_ENV_FILES) {
		if (!fs.existsSync(filePath)) continue;

		const entries = parseDotEnvContent(fs.readFileSync(filePath, "utf8"));
		for (const [key, value] of entries) {
			if (process.env[key] == null) process.env[key] = value;
		}
	}
}

export function getE2EConfigValue({ keys = [], defaultValue = null } = {}) {
	loadOptionalE2EEnvFiles();

	for (const key of keys) {
		const value = process.env[key];
		if (typeof value === "string" && value.trim().length > 0) return value.trim();
	}

	return defaultValue;
}

export function getE2EMapUrl({ testKey, defaultUrl }) {
	return getE2EConfigValue({
		keys: [
			testKey,
			"E2E_MAP_URL",
		],
		defaultValue: defaultUrl,
	});
}

export function assert(condition, message) {
	if (!condition) throw new Error(message);
}
