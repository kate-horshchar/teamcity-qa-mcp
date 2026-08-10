import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { generatePromptFiles } from "../../scripts/build-prompts.js";

// prompts/ is generated from plugin/commands + plugin/skills (the single
// source of truth). This guard fails when someone edits the plugin without
// regenerating, or edits prompts/ by hand. Fix: npm run build:prompts

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const promptsDir = join(repoRoot, "prompts");

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

describe("prompts/ is in sync with the plugin", () => {
  const generated = generatePromptFiles(repoRoot);

  it("prompts/ exists", () => {
    expect(existsSync(promptsDir)).toBe(true);
  });

  it("contains exactly the generated set of files", () => {
    const onDisk = readdirSync(promptsDir).filter((f) => f.endsWith(".md")).sort();
    const expected = generated.map((f) => f.relPath.split("/").pop()!).sort();
    expect(onDisk).toEqual(expected);
  });

  for (const file of generatePromptFiles(repoRoot)) {
    it(`${file.relPath} matches its generated content`, () => {
      const onDisk = normalize(readFileSync(join(repoRoot, file.relPath), "utf-8"));
      expect(onDisk).toBe(normalize(file.content));
    });
  }

  it("every prompt is self-contained (inlines the qa-analysis skill)", () => {
    const commandPrompts = generated.filter((f) => !f.relPath.endsWith("README.md"));
    for (const file of commandPrompts) {
      expect(file.content, file.relPath).toContain("# Shared skill: qa-analysis");
    }
  });

  it("the generate-report prompt inlines the html-report skill and template", () => {
    const report = generated.find((f) => f.relPath === "prompts/generate-report.md")!;
    expect(report.content).toContain("# Shared skill: html-report");
    expect(report.content).toContain("# Report template (report-template.html)");
    expect(report.content).toContain("{{REPORT_TITLE}}");
  });
});
