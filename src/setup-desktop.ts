#!/usr/bin/env node
// ── Setup script for Claude Desktop integration ────────────────────
//
// Adds teamcity-qa-mcp to Claude Desktop's config file.
//
// Usage:
//   npx -y git+https://github.com/kate-horshchar/teamcity-qa-mcp.git setup-desktop \
//     --url https://your-teamcity.com \
//     --token your-token \
//     --build-type Your_BuildConfig_Id

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

const PACKAGE_URL = "git+https://github.com/kate-horshchar/teamcity-qa-mcp.git";
const SERVER_NAME = "teamcity-qa-mcp";
const CONFIG_FILENAME = "claude_desktop_config.json";

interface DesktopConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Find Claude Desktop config path.
 * Checks standard install and Windows Store (UWP) locations.
 */
function getConfigPath(explicitPath?: string): string {
  if (explicitPath) return explicitPath;

  const os = platform();

  if (os === "win32") {
    const candidates: string[] = [];

    // Windows Store (UWP) — check first, most common on newer installs
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const packagesDir = join(localAppData, "Packages");
      if (existsSync(packagesDir)) {
        try {
          const dirs = readdirSync(packagesDir);
          for (const dir of dirs) {
            if (dir.startsWith("Claude_")) {
              candidates.push(
                join(packagesDir, dir, "LocalCache", "Roaming", "Claude", CONFIG_FILENAME),
              );
            }
          }
        } catch {
          // Permission denied — skip
        }
      }
    }

    // Standard install
    const appData = process.env.APPDATA;
    if (appData) {
      candidates.push(join(appData, "Claude", CONFIG_FILENAME));
    }

    // Return the first candidate where the config file exists, or the first candidate for creation
    const existing = candidates.find((p) => existsSync(p));
    if (existing) return existing;
    if (candidates.length > 0) return candidates[0];

    throw new Error("Could not determine Claude Desktop config path");
  }

  if (os === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude", CONFIG_FILENAME);
  }

  // Linux fallback
  return join(homedir(), ".config", "Claude", CONFIG_FILENAME);
}

function parseArgs(args: string[]): {
  url: string;
  token: string;
  buildType: string;
  configPath?: string;
} {
  let url = "";
  let token = "";
  let buildType = "";
  let configPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === "--url" && next) { url = next; i++; }
    else if (arg === "--token" && next) { token = next; i++; }
    else if (arg === "--build-type" && next) { buildType = next; i++; }
    else if (arg === "--config-path" && next) { configPath = next; i++; }
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
  }

  if (!url || !token || !buildType) {
    printUsage();
    process.exit(1);
  }

  return { url, token, buildType, configPath };
}

function printUsage(): void {
  console.log(`
Usage:
  npx -y ${PACKAGE_URL} setup-desktop \\
    --url <teamcity-url> \\
    --token <api-token> \\
    --build-type <build-config-id>

Options:
  --url           TeamCity server URL
  --token         Personal API token (Bearer)
  --build-type    Build configuration ID to monitor
  --config-path   Path to claude_desktop_config.json (auto-detected if omitted)
  --help          Show this help message
`);
}

function main(): void {
  const args = process.argv.slice(2);

  // Skip "setup-desktop" if it's the first arg (when called via bin dispatcher)
  const cleanArgs = args[0] === "setup-desktop" ? args.slice(1) : args;
  const { url, token, buildType, configPath: explicitPath } = parseArgs(cleanArgs);

  const configPath = getConfigPath(explicitPath);
  const configDir = join(configPath, "..");

  // Read existing config or create empty one
  let config: DesktopConfig = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      console.error(`Warning: Could not parse ${configPath}, creating new config`);
      config = {};
    }
  } else {
    mkdirSync(configDir, { recursive: true });
  }

  // Ensure mcpServers exists
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // Add or update the server entry
  (config.mcpServers as Record<string, unknown>)[SERVER_NAME] = {
    command: "npx",
    args: ["-y", PACKAGE_URL],
    env: {
      TEAMCITY_URL: url,
      TEAMCITY_TOKEN: token,
      TEAMCITY_BUILD_TYPE_ID: buildType,
    },
  };

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf-8");

  console.log(`
Added "${SERVER_NAME}" to Claude Desktop config.

Config file: ${configPath}

Restart Claude Desktop to activate the MCP server.
`);
}

main();
