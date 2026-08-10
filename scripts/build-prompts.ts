// ── Prompt Generator ────────────────────────────────────────────────
//
// Generates the prompts/ folder from the plugin: each plugin command
// becomes a standalone prompt with the referenced skills (and the HTML
// report template) inlined, so it works with any MCP-compatible AI
// client — no plugin mechanism required.
//
// The plugin is the single source of truth. Never edit prompts/ by hand:
//   npm run build:prompts
// A vitest guard (prompts-sync.test.ts) fails when prompts/ is stale.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export interface GeneratedFile {
  /** Path relative to the repo root, POSIX-style (e.g. "prompts/analyze-failed-build.md"). */
  relPath: string;
  content: string;
}

// ── Markdown source parsing ─────────────────────────────────────────

function readNormalized(path: string): string {
  return readFileSync(path, "utf-8").replace(/\r\n/g, "\n");
}

function stripFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { frontmatter: "", body: raw };
  return { frontmatter: match[1], body: raw.slice(match[0].length).replace(/^\n+/, "") };
}

function extractDescription(frontmatter: string): string {
  const lines = frontmatter.split("\n");
  const idx = lines.findIndex((l) => /^description:/.test(l));
  if (idx === -1) return "";
  const inline = lines[idx].replace(/^description:\s*/, "").trim();
  if (inline && inline !== ">" && inline !== "|") return inline;
  // Folded multi-line value: collect indented continuation lines
  const parts: string[] = [];
  for (let i = idx + 1; i < lines.length && /^\s+\S/.test(lines[i]); i++) {
    parts.push(lines[i].trim());
  }
  return parts.join(" ");
}

function extractTitle(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

// ── Generation ──────────────────────────────────────────────────────

const PROMPT_HEADER = (sourceRelPath: string) => `<!--
  GENERATED FILE — do not edit. Source of truth: ${sourceRelPath}
  (plus the inlined skills). Regenerate with: npm run build:prompts
-->

> **Standalone prompt** for any MCP-compatible AI client connected to the
> [teamcity-qa-mcp](../README.md) server. Copy this entire file into the chat
> as your message. Pass optional parameters by mentioning them in the same
> message (e.g. "BUILD_ID: 12345").

`;

export function generatePromptFiles(repoRoot: string): GeneratedFile[] {
  const commandsDir = join(repoRoot, "plugin", "commands");
  const skillsDir = join(repoRoot, "plugin", "skills");

  // Load skills: directory name → body
  const skills = new Map<string, string>();
  for (const dir of readdirSync(skillsDir).sort()) {
    const skillPath = join(skillsDir, dir, "SKILL.md");
    if (existsSync(skillPath)) {
      skills.set(dir, stripFrontmatter(readNormalized(skillPath)).body);
    }
  }

  const templatePath = join(skillsDir, "html-report", "report-template.html");
  const templateHtml = existsSync(templatePath) ? readNormalized(templatePath).trimEnd() : null;

  const files: GeneratedFile[] = [];
  const index: Array<{ file: string; title: string; description: string }> = [];

  const commandFiles = readdirSync(commandsDir).filter((f) => f.endsWith(".md")).sort();
  for (const commandFile of commandFiles) {
    const raw = readNormalized(join(commandsDir, commandFile));
    const { frontmatter, body } = stripFrontmatter(raw);
    const description = extractDescription(frontmatter);
    const title = extractTitle(body) || commandFile.replace(/\.md$/, "");

    let content = PROMPT_HEADER(`plugin/commands/${commandFile}`) + body.trimEnd() + "\n";

    // Inline every skill the command references, in stable (sorted) order
    for (const [skillName, skillBody] of skills) {
      if (body.includes(skillName)) {
        content += `\n---\n\n# Shared skill: ${skillName}\n\n${skillBody.trimEnd()}\n`;

        // The html-report skill relies on a template file — inline it too
        if (skillName === "html-report" && templateHtml) {
          content +=
            `\n---\n\n# Report template (report-template.html)\n\n` +
            `The html-report skill references this file; it is inlined here so the prompt is self-contained. Use it as the base skeleton for the generated report.\n\n` +
            "```html\n" + templateHtml + "\n```\n";
        }
      }
    }

    files.push({ relPath: `prompts/${commandFile}`, content });
    index.push({ file: commandFile, title, description });
  }

  // prompts/README.md — usage guide + index (generated too, so it never drifts)
  const readme =
    `<!--\n  GENERATED FILE — do not edit. Regenerate with: npm run build:prompts\n-->\n\n` +
    `# Prompts for any MCP-compatible AI\n\n` +
    `Ready-to-use prompts mirroring the [Claude plugin](../plugin/README.md) commands. ` +
    `Use them with any MCP-compatible AI client (Cursor, VS Code Copilot, JetBrains AI, a plain Claude chat, etc.) — no plugin mechanism required.\n\n` +
    `## How to use\n\n` +
    `1. Connect the [teamcity-qa-mcp](../README.md) server to your AI client.\n` +
    `2. Open a prompt file below and copy its entire contents into the chat.\n` +
    `3. Add parameters in the same message if needed (each prompt lists its inputs).\n\n` +
    `## Available prompts\n\n` +
    `| Prompt | What it does |\n|---|---|\n` +
    index.map((e) => `| [${e.title}](${e.file}) | ${e.description} |`).join("\n") +
    `\n\nThese files are generated from \`plugin/commands/\` and \`plugin/skills/\` — the plugin is the single source of truth. To change a prompt, edit the plugin and run \`npm run build:prompts\`.\n`;

  files.push({ relPath: "prompts/README.md", content: readme });

  return files;
}

// ── CLI entry ───────────────────────────────────────────────────────

const isDirectRun = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const promptsDir = join(repoRoot, "prompts");

  const files = generatePromptFiles(repoRoot);

  // Remove stale generated files, then write fresh ones
  if (existsSync(promptsDir)) {
    const expected = new Set(files.map((f) => f.relPath.split("/").pop()));
    for (const existing of readdirSync(promptsDir)) {
      if (existing.endsWith(".md") && !expected.has(existing)) {
        rmSync(join(promptsDir, existing));
        console.log(`removed stale prompts/${existing}`);
      }
    }
  } else {
    mkdirSync(promptsDir);
  }

  for (const file of files) {
    writeFileSync(join(repoRoot, file.relPath), file.content, "utf-8");
    console.log(`wrote ${file.relPath}`);
  }
  console.log(`\n${files.length} files generated.`);
}
