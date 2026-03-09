#!/usr/bin/env node
// ── TeamCity QA MCP — entry point ───────────────────────────────────
//
// Dispatches based on CLI argument:
//   setup-desktop  → Claude Desktop config setup
//   (no args)      → MCP server (stdio)

const command = process.argv[2];

if (command === "setup-desktop") {
  import("./setup-desktop.js");
} else {
  import("dotenv/config").then(() => startServer());
}

async function startServer() {
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { loadConfig } = await import("./schemas/common.js");
  const { TeamCityClient } = await import("./client.js");
  const { registerBuildDiscoveryTools } = await import("./tools/build-discovery.js");
  const { registerFailureInvestigationTools } = await import("./tools/failure-investigation.js");
  const { registerDebuggingContextTools } = await import("./tools/debugging-context.js");
  const { registerHistoryTools } = await import("./tools/history-tools.js");
  const { registerAggregateTools } = await import("./tools/aggregate-tools.js");

  const config = loadConfig();
  const client = new TeamCityClient(config);

  const server = new McpServer({
    name: "teamcity-qa-mcp",
    version: "1.0.0",
  });

  registerBuildDiscoveryTools(server, client);
  registerFailureInvestigationTools(server, client, config);
  registerDebuggingContextTools(server, client);
  registerHistoryTools(server, client, config);
  registerAggregateTools(server, client, config);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("TeamCity MCP server running (stdio)");
}
