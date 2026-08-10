// ── Plugin Packager ─────────────────────────────────────────────────
//
// Zips the plugin/ folder into teamcity-qa.zip (repo root, gitignored)
// for manual upload in Claude Cowork: Organization settings → Plugins →
// Add plugin → Upload. GitHub-synced org marketplaces require a private
// repository, so a zip is the distribution path for this public repo.
//
// Usage: npm run pack-plugin

import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { statSync } from "node:fs";
import AdmZip from "adm-zip";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = join(repoRoot, "plugin");
const outPath = join(repoRoot, "teamcity-qa.zip");

const zip = new AdmZip();
zip.addLocalFolder(pluginDir); // plugin contents at the zip root (.claude-plugin/, commands/, skills/, README.md)
zip.writeZip(outPath);

const sizeKb = Math.round(statSync(outPath).size / 1024);
console.log(`wrote teamcity-qa.zip (${sizeKb} KB) from plugin/`);
console.log("Upload it in Cowork: Organization settings → Plugins → Add plugin → Upload.");
