# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [1.3.0] — 2026-07-07

### Added
- Claude plugin in the repository (`plugin/`): 7 commands and 2 skills; the
  repo root `.claude-plugin/marketplace.json` makes it installable via
  `/plugin marketplace add kate-horshchar/teamcity-qa-mcp`.
- `/generate-report` command and `html-report` skill: self-contained HTML
  build-health reports (inline CSS, no JavaScript, zero external requests)
  with a reference template; works for a config, a list, or a whole project,
  and is autonomous enough for scheduled daily health checks.
- `prompts/` — standalone prompts for any MCP-compatible AI client, generated
  from the plugin (`npm run build:prompts`) with skills and the report
  template inlined; a vitest guard fails when prompts drift out of sync.
- `npm run pack-plugin` — builds `teamcity-qa.zip` for Claude Cowork
  organization upload.
- Documentation: rewritten README (problem → solution → features → tools →
  roadmap), `docs/` (getting started, root cause detection, multi-config,
  plugin), anonymized `examples/` including a sample HTML report.
- `RELEASING.md` and this changelog.

### Changed
- The MCP server version is now read from `package.json` (single source)
  instead of being hardcoded.
- `get_multi_config_failure_summary` per-config entries now return compact
  `buildsInWindow` counts (total/passed/failed/running) instead of the full
  build list, keeping project-wide responses small; use `list_recent_builds`
  for a single configuration's build list.
- Plugin README: corrected the environment variable name to `TEAMCITY_URL`.

### Fixed
- Resolved dependency security advisories (`npm audit fix` plus an `esbuild`
  override); all flagged packages were dev/test-only and never shipped.

## [1.2.0] — 2026-07-07

### Added
- `get_multi_config_failure_summary` — aggregate failure analysis across a
  build configuration, an explicit list, or a whole project (nested
  subprojects included): one overall summary, cross-config root-cause
  clusters (infrastructure signal), and a per-config breakdown with isolated
  per-config errors. Cost controls: `sinceHours` (default 24),
  `maxBuildsPerConfig` (default 10), optional `newFailuresOnly`.
- `list_project_build_configs` — list all build configurations of a project,
  including nested subprojects.
- Flexible targeting for existing tools: `list_recent_builds` and
  `find_failure_across_builds` accept optional `buildTypeId`, `buildTypeIds`,
  or `projectId` (at most one); without a target their behavior is unchanged.
- Build cards now include `buildTypeId`.

### Fixed
- Tests are no longer compiled into `dist/` (they were shipped in the
  published package and executed twice by vitest).

## [1.1.2] — 2026-03-19

### Fixed
- MCP server name in `.mcp.json` so runtime config persistence finds the
  project-scope entry.

## [1.1.1] — 2026-03-19

### Changed
- Runtime config changes (`set_build_type_id`, `set_auth_token`) persist to
  all config files found (Claude Code, Claude Desktop, `.env`), not only the
  first one.

## [1.1.0] — 2026-03-19

### Added
- Runtime configuration tools: `set_build_type_id`, `set_auth_token`, with
  persistence to Claude Code / Claude Desktop / `.env` config files.
- `get_green_build_diff_context` — one-call context for comparing green
  builds, with class-grouped diff and neighboring-build validation.
- `get_build_tests` — browse tests of any build with filters and pagination.
- Regex search across the full build log in `get_build_log_excerpt`.

## [1.0.0] — 2026-03-09

### Added
- Initial release: read-only TeamCity MCP server (stdio) with build
  discovery, failure investigation, test history, root-cause clustering,
  build comparison, and aggregated analysis contexts; Claude Desktop setup
  script and live smoke test.

[1.3.0]: https://github.com/kate-horshchar/teamcity-qa-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/kate-horshchar/teamcity-qa-mcp/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/kate-horshchar/teamcity-qa-mcp/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/kate-horshchar/teamcity-qa-mcp/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/kate-horshchar/teamcity-qa-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/kate-horshchar/teamcity-qa-mcp/releases/tag/v1.0.0
