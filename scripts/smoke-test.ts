// ── Smoke test: verify TeamCity API connection ─────────────────────
//
// Usage: npx tsx scripts/smoke-test.ts

import "dotenv/config";
import { loadConfig } from "../src/schemas/common.js";
import { TeamCityClient } from "../src/client.js";

async function main() {
  console.log("Loading config...");
  const config = loadConfig();
  console.log(`  URL:          ${config.teamcityUrl}`);
  console.log(`  Build type:   ${config.buildTypeId}`);
  console.log(`  Token:        ${config.teamcityToken.slice(0, 20)}...`);
  console.log("");

  const client = new TeamCityClient(config);

  // Test 1: list recent builds
  console.log("1. Fetching recent builds (limit 3)...");
  try {
    const builds = await client.getBuilds(3);
    console.log(`   OK — got ${builds.length} builds`);
    for (const b of builds as any[]) {
      console.log(`   #${b.number}  status=${b.status}  state=${b.state}`);
    }
  } catch (err) {
    console.error(`   FAILED:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // Test 2: list failed builds
  console.log("\n2. Fetching recent failed builds (limit 3)...");
  try {
    const failed = await client.getBuilds(3, "FAILURE");
    console.log(`   OK — got ${failed.length} failed builds`);
    for (const b of failed as any[]) {
      console.log(`   #${b.number}  status=${b.status}  statusText=${b.statusText ?? "—"}`);
    }
  } catch (err) {
    console.error(`   FAILED:`, err instanceof Error ? err.message : err);
  }

  console.log("\nSmoke test passed!");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
