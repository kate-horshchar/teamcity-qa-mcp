import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// README's tool list must cover every tool registered in the code.
// Tool names are extracted from src/tools/*.ts (the source of truth),
// so adding a tool without documenting it fails this test.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const toolsDir = join(repoRoot, "src", "tools");

function registeredToolNames(): string[] {
  const names: string[] = [];
  for (const file of readdirSync(toolsDir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
    const source = readFileSync(join(toolsDir, file), "utf-8");
    for (const match of source.matchAll(/server\.tool\(\s*"([^"]+)"/g)) {
      names.push(match[1]);
    }
  }
  return names;
}

describe("README is in sync with registered tools", () => {
  const tools = registeredToolNames();
  const readme = readFileSync(join(repoRoot, "README.md"), "utf-8");

  it("finds a plausible number of registered tools", () => {
    expect(tools.length).toBeGreaterThanOrEqual(15);
    expect(new Set(tools).size).toBe(tools.length); // no duplicate registrations
  });

  for (const tool of registeredToolNames()) {
    it(`README mentions \`${tool}\``, () => {
      expect(readme).toContain(`\`${tool}\``);
    });
  }

  it("README does not hardcode the tool count", () => {
    // The count changes as tools are added; the list itself is the contract.
    expect(readme).not.toMatch(/\b\d+\s+tools\b/i);
  });
});
