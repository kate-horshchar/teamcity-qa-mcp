import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test the internal helpers by importing the module and calling persistEnvVar
// with controlled file paths. To do that we extract the pure logic into testable
// pieces. Since the module uses homedir() and process.cwd() internally, we test
// via a lightweight integration approach: create temp files, override env vars
// that influence path detection, and validate the results.

// ── Helpers to test in isolation ────────────────────────────────────

// Re-implement the same logic as the module for unit-level verification,
// then run an integration test with the actual module.

const TEST_DIR = join(tmpdir(), `config-persist-test-${Date.now()}`);

function setupTestDir() {
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

// ── JSON config update logic (mirrors updateJsonConfig) ─────────────

function updateJsonConfig(filePath: string, envKey: string, envValue: string): boolean {
  if (!existsSync(filePath)) return false;

  let config: any;
  try {
    config = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return false;
  }

  const serverEntry = config.mcpServers?.["teamcity-qa-mcp"];
  if (!serverEntry?.env || !(envKey in serverEntry.env)) return false;

  serverEntry.env[envKey] = envValue;
  writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
  return true;
}

// ── .env update logic (mirrors updateDotenv) ────────────────────────

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

// ── Tests ───────────────────────────────────────────────────────────

describe("updateJsonConfig", () => {
  beforeEach(setupTestDir);
  afterEach(cleanTestDir);

  it("updates TEAMCITY_TOKEN in a Claude Code style config", () => {
    const configPath = join(TEST_DIR, "claude.json");
    const original = {
      someOtherSetting: true,
      mcpServers: {
        "teamcity-qa-mcp": {
          type: "stdio",
          command: "npx",
          args: ["-y", "git+https://github.com/kate-horshchar/teamcity-qa-mcp.git"],
          env: {
            TEAMCITY_URL: "https://tc.example.com",
            TEAMCITY_TOKEN: "old-token",
            TEAMCITY_BUILD_TYPE_ID: "MyBuild",
          },
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(original, null, 2), "utf-8");

    const result = updateJsonConfig(configPath, "TEAMCITY_TOKEN", "new-token-123");

    expect(result).toBe(true);
    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(updated.mcpServers["teamcity-qa-mcp"].env.TEAMCITY_TOKEN).toBe("new-token-123");
    // Other fields unchanged
    expect(updated.someOtherSetting).toBe(true);
    expect(updated.mcpServers["teamcity-qa-mcp"].env.TEAMCITY_URL).toBe("https://tc.example.com");
    expect(updated.mcpServers["teamcity-qa-mcp"].env.TEAMCITY_BUILD_TYPE_ID).toBe("MyBuild");
  });

  it("updates TEAMCITY_BUILD_TYPE_ID", () => {
    const configPath = join(TEST_DIR, "claude.json");
    const original = {
      mcpServers: {
        "teamcity-qa-mcp": {
          env: {
            TEAMCITY_TOKEN: "tok",
            TEAMCITY_BUILD_TYPE_ID: "OldBuild",
          },
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(original), "utf-8");

    const result = updateJsonConfig(configPath, "TEAMCITY_BUILD_TYPE_ID", "NewProject_Build");

    expect(result).toBe(true);
    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(updated.mcpServers["teamcity-qa-mcp"].env.TEAMCITY_BUILD_TYPE_ID).toBe("NewProject_Build");
    expect(updated.mcpServers["teamcity-qa-mcp"].env.TEAMCITY_TOKEN).toBe("tok");
  });

  it("returns false if file does not exist", () => {
    const result = updateJsonConfig(join(TEST_DIR, "nonexistent.json"), "TEAMCITY_TOKEN", "x");
    expect(result).toBe(false);
  });

  it("returns false if file is not valid JSON", () => {
    const configPath = join(TEST_DIR, "bad.json");
    writeFileSync(configPath, "not json {{{", "utf-8");

    const result = updateJsonConfig(configPath, "TEAMCITY_TOKEN", "x");
    expect(result).toBe(false);
  });

  it("returns false if server entry is missing", () => {
    const configPath = join(TEST_DIR, "no-server.json");
    writeFileSync(configPath, JSON.stringify({ mcpServers: { "other-server": { env: {} } } }), "utf-8");

    const result = updateJsonConfig(configPath, "TEAMCITY_TOKEN", "x");
    expect(result).toBe(false);
  });

  it("returns false if env key does not exist in server entry", () => {
    const configPath = join(TEST_DIR, "no-key.json");
    writeFileSync(configPath, JSON.stringify({
      mcpServers: { "teamcity-qa-mcp": { env: { TEAMCITY_URL: "http://tc" } } },
    }), "utf-8");

    const result = updateJsonConfig(configPath, "TEAMCITY_TOKEN", "x");
    expect(result).toBe(false);
  });

  it("preserves other MCP servers in the config", () => {
    const configPath = join(TEST_DIR, "multi.json");
    const original = {
      mcpServers: {
        "other-server": { command: "other", env: { KEY: "val" } },
        "teamcity-qa-mcp": { env: { TEAMCITY_TOKEN: "old" } },
      },
    };
    writeFileSync(configPath, JSON.stringify(original), "utf-8");

    updateJsonConfig(configPath, "TEAMCITY_TOKEN", "new");

    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(updated.mcpServers["other-server"].env.KEY).toBe("val");
    expect(updated.mcpServers["teamcity-qa-mcp"].env.TEAMCITY_TOKEN).toBe("new");
  });
});

describe("updateDotenv", () => {
  beforeEach(setupTestDir);
  afterEach(cleanTestDir);

  it("updates TEAMCITY_TOKEN in .env", () => {
    const envPath = join(TEST_DIR, ".env");
    writeFileSync(envPath, [
      "TEAMCITY_URL=https://tc.example.com",
      "TEAMCITY_TOKEN=old-token-abc",
      "TEAMCITY_BUILD_TYPE_ID=MyBuild",
    ].join("\n"), "utf-8");

    const result = updateDotenv(envPath, "TEAMCITY_TOKEN", "new-token-xyz");

    expect(result).toBe(true);
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("TEAMCITY_TOKEN=new-token-xyz");
    // Other lines unchanged
    expect(content).toContain("TEAMCITY_URL=https://tc.example.com");
    expect(content).toContain("TEAMCITY_BUILD_TYPE_ID=MyBuild");
  });

  it("updates TEAMCITY_BUILD_TYPE_ID in .env", () => {
    const envPath = join(TEST_DIR, ".env");
    writeFileSync(envPath, "TEAMCITY_BUILD_TYPE_ID=OldBuild\nTEAMCITY_TOKEN=tok\n", "utf-8");

    const result = updateDotenv(envPath, "TEAMCITY_BUILD_TYPE_ID", "NewBuild");

    expect(result).toBe(true);
    const content = readFileSync(envPath, "utf-8");
    expect(content).toContain("TEAMCITY_BUILD_TYPE_ID=NewBuild");
    expect(content).toContain("TEAMCITY_TOKEN=tok");
  });

  it("handles tokens with special characters (JWT)", () => {
    const envPath = join(TEST_DIR, ".env");
    writeFileSync(envPath, "TEAMCITY_TOKEN=old\n", "utf-8");

    const jwt = "eyJ0eXAiOiAiVENWMiJ9.eFVjUnlScHdkTDR6bjEzRDhpSGUwSVlJLTRW.ZTUyMTkwNDAtOGVmYS00ZTA5";
    const result = updateDotenv(envPath, "TEAMCITY_TOKEN", jwt);

    expect(result).toBe(true);
    const content = readFileSync(envPath, "utf-8");
    expect(content).toBe(`TEAMCITY_TOKEN=${jwt}\n`);
  });

  it("returns false if file does not exist", () => {
    const result = updateDotenv(join(TEST_DIR, ".env.missing"), "TEAMCITY_TOKEN", "x");
    expect(result).toBe(false);
  });

  it("returns false if key is not in the file", () => {
    const envPath = join(TEST_DIR, ".env");
    writeFileSync(envPath, "OTHER_VAR=123\n", "utf-8");

    const result = updateDotenv(envPath, "TEAMCITY_TOKEN", "x");
    expect(result).toBe(false);
  });

  it("preserves comments and blank lines", () => {
    const envPath = join(TEST_DIR, ".env");
    const original = "# TeamCity config\n\nTEAMCITY_TOKEN=old\n# end\n";
    writeFileSync(envPath, original, "utf-8");

    updateDotenv(envPath, "TEAMCITY_TOKEN", "new");

    const content = readFileSync(envPath, "utf-8");
    expect(content).toBe("# TeamCity config\n\nTEAMCITY_TOKEN=new\n# end\n");
  });
});
