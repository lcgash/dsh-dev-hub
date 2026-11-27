import { access, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
//#region src/core/paths.mjs
/** Expand a leading ~ to the current user's home. */
function expandHome(input) {
	const value = String(input ?? "").trim();
	if (value === "~") return homedir();
	if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
	return value;
}
/** Resolve one user-entered path to an absolute path (does not require existence). */
function absPath(input, cwd = process.cwd()) {
	const expanded = expandHome(input);
	return isAbsolute(expanded) ? resolve(expanded) : resolve(cwd, expanded);
}
/** Check whether a path exists. */
async function exists(path) {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
/** Resolve a path to its canonical realpath when it exists, otherwise normalize it. */
async function canonical(path) {
	const absolute = absPath(path);
	try {
		return await realpath(absolute);
	} catch {
		return absolute;
	}
}
/** True when child is the same as parent or a descendant of parent. */
function isUnder(child, parent) {
	const rel = relative(resolve(parent), resolve(child));
	return rel === "" || rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel);
}
/** Walk upward from a file or directory until .git is found; returns null when absent. */
async function findRepoRoot(start) {
	let current = absPath(start);
	try {
		if ((await stat(current)).isFile()) current = dirname(current);
	} catch {
		return null;
	}
	for (;;) {
		if (await exists(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}
/** Slug suitable for an item id. */
function safeId(input, fallback = "item") {
	return String(input ?? "").trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || fallback;
}
/** Path relative to a repository, using forward slashes on every OS. */
function repoRelative(repo, path) {
	return relative(resolve(repo), resolve(path)).split(sep).join("/");
}
//#endregion
export { findRepoRoot as a, safeId as c, expandHome as i, canonical as n, isUnder as o, exists as r, repoRelative as s, absPath as t };
