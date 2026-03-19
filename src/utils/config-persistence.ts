// ── Config Persistence ───────────────────────────────────────────────
//
// Finds and updates MCP server configuration across all supported
// config sources: Claude Code (~/.claude.json), Claude Desktop
// (claude_desktop_config.json), and local .env files.

import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, platform } from "node:os";

const SERVER_NAME = "teamcity-qa-mcp";
const DESKTOP_CONFIG_FILENAME = "claude_desktop_config.json";

// ── Config source types ─────────────────────────────────────────────

export type ConfigSource = "claude-code" | "claude-desktop" | "dotenv";

export interface PersistResult {
  persisted: boolean;
  source?: ConfigSource;
  path?: string;
  error?: string;
}

// ── Claude Desktop config path detection ────────────────────────────
// Shared with setup-desktop.ts

export function getDesktopConfigCandidates(): string[] {
  const os = platform();
  const candidates: string[] = [];

  if (os === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const packagesDir = join(localAppData, "Packages");
      if (existsSync(packagesDir)) {
        try {
          const dirs = readdirSync(packagesDir);
          for (const dir of dirs) {
            if (dir.startsWith("Claude_")) {
              candidates.push(
                join(packagesDir, dir, "LocalCache", "Roaming", "Claude", DESKTOP_CONFIG_FILENAME),
              );
            }
          }
        } catch {
          // Permission denied — skip
        }
      }
    }

    const appData = process.env.APPDATA;
    if (appData) {
      candidates.push(join(appData, "Claude", DESKTOP_CONFIG_FILENAME));
    }
  } else if (os === "darwin") {
    candidates.push(
      join(homedir(), "Library", "Application Support", "Claude", DESKTOP_CONFIG_FILENAME),
    );
  } else {
    candidates.push(join(homedir(), ".config", "Claude", DESKTOP_CONFIG_FILENAME));
  }

  return candidates;
}

/**
 * Find existing Claude Desktop config path (first candidate that exists).
 */
export function findDesktopConfigPath(): string | undefined {
  return getDesktopConfigCandidates().find((p) => existsSync(p));
}

// ── JSON config helpers ─────────────────────────────────────────────

interface McpJsonConfig {
  mcpServers?: Record<string, { env?: Record<string, string>; [k: string]: unknown }>;
  [k: string]: unknown;
}

/**
 * Try to update an env var in a JSON config file (Claude Code or Desktop).
 * Returns true if the file existed, contained the server entry, and was updated.
 */
function updateJsonConfig(filePath: string, envKey: string, envValue: string): boolean {
  if (!existsSync(filePath)) return false;

  let config: McpJsonConfig;
  try {
    config = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return false;
  }

  const serverEntry = config.mcpServers?.[SERVER_NAME];
  if (!serverEntry?.env || !(envKey in serverEntry.env)) return false;

  serverEntry.env[envKey] = envValue;
  writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return true;
}

// ── .env file helper ────────────────────────────────────────────────

/**
 * Try to update a key in a .env file.
 * Returns true if the file existed, contained the key, and was updated.
 */
function updateDotenv(filePath: string, key: string, value: string): boolean {
  if (!existsSync(filePath)) return false;

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return false;
  }

  const regex = new RegExp(`^(${key})=.*$`, "m");
  if (!regex.test(content)) return false;

  const updated = content.replace(regex, `$1=${value}`);
  writeFileSync(filePath, updated, "utf-8");
  return true;
}

// ── Main persist function ───────────────────────────────────────────

/**
 * Persist an env variable change to the config file that launched this server.
 * Searches Claude Code, Claude Desktop, and .env in order.
 */
export function persistEnvVar(envKey: string, envValue: string): PersistResult {
  // 1. Claude Code user config: ~/.claude.json
  const claudeCodePath = join(homedir(), ".claude.json");
  if (updateJsonConfig(claudeCodePath, envKey, envValue)) {
    return { persisted: true, source: "claude-code", path: claudeCodePath };
  }

  // 2. Claude Desktop config
  const desktopPath = findDesktopConfigPath();
  if (desktopPath && updateJsonConfig(desktopPath, envKey, envValue)) {
    return { persisted: true, source: "claude-desktop", path: desktopPath };
  }

  // 3. .env in current working directory
  const dotenvPath = join(process.cwd(), ".env");
  if (updateDotenv(dotenvPath, envKey, envValue)) {
    return { persisted: true, source: "dotenv", path: dotenvPath };
  }

  return {
    persisted: false,
    error: "No config file found with this server entry. Value updated in memory only (until restart).",
  };
}
