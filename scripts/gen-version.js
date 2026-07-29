#!/usr/bin/env node
/**
 * Generate static/version.json from git metadata and VERSION file.
 * Run on the host before `docker compose build`.
 *
 * Usage: node scripts/gen-version.js [project-root]
 *   project-root defaults to the parent of this script's directory.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.resolve(process.argv[2] || path.join(__dirname, ".."));

// ── Base version from VERSION file ──
const versionPath = path.join(root, "VERSION");
let base = "0.0.0";
try {
  base = fs.readFileSync(versionPath, "utf8").trim();
} catch (err) {
  console.warn("VERSION file not found — using fallback 0.0.0");
}

// ── Git metadata ──
function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { cwd: root, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim();
  } catch (err) {
    return null;
  }
}

const branch = git("rev-parse --abbrev-ref HEAD") || base;
const commit = git("rev-parse --short HEAD") || "0000000";
const count = git("rev-list --count HEAD") || "0";

// ── Compose full version ──
const full = `V${base}.${count}-[${branch}]-(${commit})`;

const payload = {
  version: full,
  display: `V${base}.${count}`,
  base,
  build: Number(count),
  branch,
  commit,
};

const outDir = path.join(root, "static");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "version.json");
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

console.log(`Generated ${outPath}`);
console.log(`Version: ${full}`);
