import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

// HTML reports (the reference template and the sample) must be fully
// self-contained: opened from file:// and embedded in restrictive iframes
// (auto-loaded external resources would 403 or simply fail to load).
//
// Note: an <a href="https://..."> hyperlink is fine — it does not trigger a
// network request until clicked, unlike src= (script/img/iframe) or a
// stylesheet <link>. Only resource-loading references are forbidden here.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const files = {
  "plugin/skills/html-report/report-template.html": readFileSync(
    join(repoRoot, "plugin", "skills", "html-report", "report-template.html"),
    "utf-8",
  ),
  "examples/sample-report.html": readFileSync(
    join(repoRoot, "examples", "sample-report.html"),
    "utf-8",
  ),
};

describe.each(Object.entries(files))("%s self-containment", (_name, html) => {
  it("does not load external resources (src=, stylesheet <link>)", () => {
    const externalSrc = html.match(/\bsrc\s*=\s*["']https?:\/\/[^"']+["']/gi) ?? [];
    expect(externalSrc).toEqual([]);
    expect(html).not.toMatch(/<link[^>]+rel\s*=\s*["']?stylesheet/i);
  });

  it("does not import external CSS or fonts", () => {
    expect(html).not.toMatch(/@import\s/i);
    expect(html).not.toMatch(/url\(\s*["']?https?:\/\//i);
  });

  it("contains no JavaScript at all", () => {
    expect(html).not.toMatch(/<script/i);
  });
});

describe("report-template.html placeholders", () => {
  const html = files["plugin/skills/html-report/report-template.html"];

  it("keeps the placeholder skeleton the skill relies on", () => {
    for (const placeholder of [
      "{{REPORT_TITLE}}", "{{BADGE_CLASS}}", "{{BADGE_LABEL}}",
      "{{WINDOW_FROM}}", "{{WINDOW_TO}}", "{{GENERATED_AT}}",
      "{{CLUSTER_LABEL}}", "{{TAKEAWAY}}",
    ]) {
      expect(html).toContain(placeholder);
    }
  });
});

describe("examples/sample-report.html", () => {
  const html = files["examples/sample-report.html"];

  it("is filled in — no leftover template placeholders", () => {
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
  });

  it("may contain plain <a href> links (not a resource load)", () => {
    expect(html).toMatch(/<a href="https?:\/\/[^"]+">/);
  });
});
