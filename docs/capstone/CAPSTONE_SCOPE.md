# Capstone Scope and Timeline

## 1. Project summary

TeamCity QA Intelligence (`teamcity-qa-mcp`) is a read-only MCP server that gives AI assistants
structured access to TeamCity build data, so they can find why a CI build failed. The server
collects and normalizes the evidence (build problems, failed tests, logs, changes, history), and
the AI client does the reasoning.

My MSSE Capstone deliverable is the evolution of this tool into a released, documented and
validated product: multi-configuration analysis, a Claude plugin with HTML reporting, CI, a
public npm release, and a realistic demo environment where the tool was tested against
failures with known root causes.

## 2. Timeline and context

- **Capstone start:** 6 April 2026.
- I started the first version of the tool in March 2026, before the Capstone began. At that
  time I did not know the exact Capstone requirements, but I expected the final project to be
  a useful, real product, so I chose to build a tool that solves a problem from my own QA work.
  Once I received the Capstone assignment, it was clear that this tool fits it, and I continued
  developing it as my Capstone project.
- I later continued in a different cohort, where the Capstone assignment opened in July. This
  is why most development commits start in July. I had access to the Capstone materials from
  April, so I count the Capstone period from 6 April.

## 3. Pre-Capstone baseline (March 2026)

The following already existed when the Capstone started:

| Version | Date | Content |
|---|---|---|
| v1.0.0 | 9 Mar 2026 | Read-only MCP server (stdio), TeamCity REST client, Claude Desktop setup script, live smoke test |
| v1.1.0–v1.1.2 | 19 Mar 2026 | Runtime configuration tools with config persistence (+ unit tests), green build diff, full-log regex search, test browsing |

17 tools existed at the end of this period:
- **Build discovery:** `list_recent_builds`, `get_build_by_id`, `get_build_tests`
- **Failure investigation:** `get_build_problems`, `get_failed_tests`, `get_test_failure_details`,
  `get_build_log_excerpt`, `get_build_changes`
- **History and patterns:** `get_test_history`, `cluster_build_failures`, `find_failure_across_builds`
- **Aggregated contexts:** `get_build_summary`, `compare_builds`,
  `get_failed_build_analysis_context`, `get_green_build_diff_context`
- **Runtime configuration:** `set_build_type_id`, `set_auth_token`

## 4. Capstone work by sprint

The work was done in four sprints. Each sprint ended with a concrete increment: a tagged
release or a working environment. As a solo project, planning and review were done by me.

| Sprint | Completed | Increment |
|---|---|---|
| 1. Multi-configuration analysis | July 2026 | Release v1.2.0 |
| 2. Reporting, plugin and CI | 10 Aug 2026 | Release v1.3.0, GitHub Actions CI |
| 3. Release for external users | 24 Aug 2026 | Release v1.3.1, npm package |
| 4. Demo environment and validation | 12–13 Sep 2026 | Demo app, local TeamCity, failure scenarios, validation reports |

### Sprint 1 — Multi-configuration analysis (v1.2.0)
Goal: analyze failures across many build configurations, not just one.
- New tool `get_multi_config_failure_summary`: one summary across a configuration, a list or a
  whole project, with cross-config root-cause clusters as an infrastructure signal.
- New tool `list_project_build_configs` (nested subprojects included).
- Flexible targeting for existing tools (`buildTypeId`, `buildTypeIds`, `projectId`).
- Cost controls for large projects: time window, builds per config, new failures only.
- Unit tests for target resolution and multi-config aggregation.
- Fixed tests being shipped in the package; resolved dependency security advisories.

### Sprint 2 — Reporting, plugin and CI (v1.3.0)
Goal: turn the raw tools into ready workflows and add automated quality checks.
- Claude plugin added to the repository and installable from a plugin marketplace: 7 slash
  commands (failed build triage, build comparison, change impact review, flaky test review,
  recent builds summary, test count stability, report generation) and 2 skills.
- `/generate-report` command and `html-report` skill: a self-contained HTML build-health report.
- `prompts/` for any MCP client, generated from the plugin, with a test that fails when they drift.
- Documentation: README, getting started, root-cause detection, multi-config guide, anonymized examples.
- `CHANGELOG.md`, `RELEASING.md`, semantic versioning with tags.
- GitHub Actions CI: build and tests on Node.js 20 and 22 for every push and pull request.

### Sprint 3 — Release for external users (v1.3.1)
Goal: make the tool usable by people other than me.
- Published to npm: install with one `npx -y teamcity-qa-mcp` command.
- MPL-2.0 license and package metadata.
- README rewritten for first-time users, including a "Data, permissions & scope" section
  (what is read, what reaches the AI provider, where the token is stored).
- Corrected the token guidance: TeamCity tokens inherit the account's permissions.
- Issue templates for feedback; the roadmap moved to GitHub Issues.

### Sprint 4 — Demo environment and validation
Goal: show and check the tool on a realistic CI setup with known root causes.
- **Demo application** ([found-outside](https://github.com/kate-horshchar/found-outside)):
  a small React + Spring Boot store used as a test target.
- **Automated tests:** 13 API integration tests (JUnit 5, REST Assured).
- **Docker:** multi-stage image that runs the tests during the build, plus Compose with a healthcheck.
- **CI:** local TeamCity Server and Agent in Docker; "API Tests" build configuration with a VCS
  trigger and JUnit report import; a second "Smoke Tests" configuration for multi-config analysis.
- **Security:** the MCP connects with a separate view-only TeamCity account.
- **Failure scenarios:** a green baseline and controlled failures of different types
  (code regression, dependency upgrade that breaks compilation, configuration drift across two
  build configurations), each with a documented expected root cause.
- **Validation:** for each failure, an AI client with only the MCP tools investigated the build
  without access to the code or scenario notes. Each report was compared with the expected root
  cause. See [DEMO_SCENARIOS.md](DEMO_SCENARIOS.md).

## 5. Final submission phase

Capstone documentation, the agile task board, the recorded presentation and the submission.

## 6. Course knowledge applied

- **Software architecture and design:** layered MCP server, read-only adapter over the TeamCity
  REST API, clear split between data collection (server) and reasoning (AI client).
- **Software testing:** unit tests, API integration tests, validation against known root causes.
- **CI/CD:** GitHub Actions for the MCP; TeamCity for the demo application.
- **Containerization:** Docker images and Docker Compose for the application and the TeamCity stack.
- **Agile:** sprint-based delivery with a task board and a release at the end of each increment.

## 7. AI tooling

### Tools used
- **Claude Code** — my main AI assistant while I developed the MCP server and part of the demo
  application; also the AI client in the validation runs.
- **ChatGPT Work** — organizing and preparing the demo application work (plan and phase prompts).
- **Codex** with GPT Astra, then GPT Luna — the first phases of the demo application.
- **ChatGPT** — product images for the demo store.

### How AI was used
1. I described the requirements in my own words and got a step-by-step plan.
2. I asked the AI to implement one step at a time.
3. After each step I tested the result, described problems in plain language and applied the fixes.

### What worked well
- Splitting the work into phases made it easy to verify each step.
- Describing bugs in plain language gave targeted fixes.

### What did not work well
- I sometimes had to re-prompt with more context when the code did not match the existing structure.
- The output was often longer than I asked for.
- GPT Astra used tokens very quickly. I switched to GPT Luna, which used fewer tokens with no
  big difference in quality for this simple project.
- GPT Luna could not fix one UI problem, the scroll position when switching between catalogue
  categories, after two attempts. I switched to Claude Code with Claude Opus 5, which fixed it,
  and continued the demo application work there.
