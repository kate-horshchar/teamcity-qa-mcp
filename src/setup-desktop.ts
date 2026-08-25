#!/usr/bin/env node
// ── Setup script for Claude Desktop integration ────────────────────
//
// Adds teamcity-qa-mcp to Claude Desktop's config file.
//
// Usage:
//   npx -y teamcity-qa-mcp setup-desktop \
//     --url https://your-teamcity.com \
//     --token your-token \
//     --build-type Your_BuildConfig_Id

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getDesktopConfigCandidates } from "./utils/config-persistence.js";

const PACKAGE_NAME = "teamcity-qa-mcp";
const SERVER_NAME = "teamcity-qa-mcp";

interface DesktopConfig {
  mcpServers?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Find Claude Desktop config path.
 * Uses shared candidate detection, returns first existing or first candidate for creation.
 */
function getConfigPath(explicitPath?: string): string {
  if (explicitPath) return explicitPath;

  const candidates = getDesktopConfigCandidates();
  const existing = candidates.find((p) => existsSync(p));
  if (existing) return existing;
  if (candidates.length > 0) return candidates[0];

  throw new Error("Could not determine Claude Desktop config path");
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
  npx -y ${PACKAGE_NAME} setup-desktop \\
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
    args: ["-y", PACKAGE_NAME],
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
