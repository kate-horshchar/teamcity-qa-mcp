import { describe, it, expect } from "vitest";
import {
  validateTarget,
  resolveTarget,
  singleConfigLocatorPart,
  projectLocatorPart,
  buildsLocator,
  type ProjectBuildTypesSource,
} from "./target-resolution.js";

// ── validateTarget ───────────────────────────────────────────────────

describe("validateTarget", () => {
  it("accepts no target (default config applies)", () => {
    expect(validateTarget({})).toBeNull();
  });

  it("accepts exactly one target dimension", () => {
    expect(validateTarget({ buildTypeId: "Cfg_A" })).toBeNull();
    expect(validateTarget({ buildTypeIds: ["Cfg_A", "Cfg_B"] })).toBeNull();
    expect(validateTarget({ projectId: "Proj" })).toBeNull();
  });

  it("rejects more than one target dimension", () => {
    expect(validateTarget({ buildTypeId: "Cfg_A", projectId: "Proj" })).toMatch(/at most one/);
    expect(validateTarget({ buildTypeId: "Cfg_A", buildTypeIds: ["Cfg_B"] })).toMatch(/at most one/);
    expect(
      validateTarget({ buildTypeId: "A", buildTypeIds: ["B"], projectId: "P" }),
    ).toMatch(/at most one/);
  });

  it("rejects empty values", () => {
    expect(validateTarget({ buildTypeId: "  " })).toMatch(/must not be empty/);
    expect(validateTarget({ buildTypeIds: [] })).toMatch(/must not be empty/);
    expect(validateTarget({ buildTypeIds: ["Cfg_A", " "] })).toMatch(/empty values/);
    expect(validateTarget({ projectId: "" })).toMatch(/must not be empty/);
  });
});

// ── resolveTarget ────────────────────────────────────────────────────

const noProjectClient: ProjectBuildTypesSource = {
  getProjectBuildTypes: async () => {
    throw new Error("should not be called");
  },
};

describe("resolveTarget", () => {
  const config = { buildTypeId: "Default_Cfg" };

  it("falls back to the configured build type when no target is given", async () => {
    const resolved = await resolveTarget(noProjectClient, config, {});
    expect(resolved).toEqual({ kind: "default", configs: [{ buildTypeId: "Default_Cfg" }] });
  });

  it("resolves a single config target", async () => {
    const resolved = await resolveTarget(noProjectClient, config, { buildTypeId: "Cfg_A" });
    expect(resolved).toEqual({ kind: "config", configs: [{ buildTypeId: "Cfg_A" }] });
  });

  it("resolves a config list, de-duplicating while preserving order", async () => {
    const resolved = await resolveTarget(noProjectClient, config, {
      buildTypeIds: ["Cfg_B", "Cfg_A", "Cfg_B"],
    });
    expect(resolved.kind).toBe("configList");
    expect(resolved.configs.map((c) => c.buildTypeId)).toEqual(["Cfg_B", "Cfg_A"]);
  });

  it("expands a project target via the client, keeping config names", async () => {
    const client: ProjectBuildTypesSource = {
      getProjectBuildTypes: async (projectId, includeSubprojects) => {
        expect(projectId).toBe("Proj");
        expect(includeSubprojects).toBe(true);
        return [
          { id: "Proj_Api", name: "API Tests", projectId: "Proj" },
          { id: "Proj_Sub_Ui", name: "UI Tests", projectId: "Proj_Sub" },
          { name: "malformed entry without id" },
        ];
      },
    };

    const resolved = await resolveTarget(client, config, { projectId: "Proj" });
    expect(resolved.kind).toBe("project");
    expect(resolved.configs).toEqual([
      { buildTypeId: "Proj_Api", name: "API Tests" },
      { buildTypeId: "Proj_Sub_Ui", name: "UI Tests" },
    ]);
  });

  it("throws when a project has no build configurations", async () => {
    const client: ProjectBuildTypesSource = {
      getProjectBuildTypes: async () => [],
    };
    await expect(resolveTarget(client, config, { projectId: "Empty" })).rejects.toThrow(
      /No build configurations found in project 'Empty'/,
    );
  });
});

// ── Locator helpers ──────────────────────────────────────────────────

describe("locator helpers", () => {
  it("builds single-config and project locator parts", () => {
    expect(singleConfigLocatorPart("Cfg_A")).toBe("buildType:(id:Cfg_A)");
    expect(projectLocatorPart("Proj")).toBe("affectedProject:(id:Proj)");
  });

  it("keeps the legacy locator byte-identical for the default path", () => {
    // Pre-existing getBuilds() behavior: buildType:X,count:N,defaultFilter:false[,status:S]
    expect(buildsLocator("buildType:Default_Cfg", { count: 20 })).toBe(
      "buildType:Default_Cfg,count:20,defaultFilter:false",
    );
    expect(buildsLocator("buildType:Default_Cfg", { count: 3, status: "FAILURE" })).toBe(
      "buildType:Default_Cfg,count:3,defaultFilter:false,status:FAILURE",
    );
  });

  it("appends a startDate window when sinceDate is set", () => {
    expect(
      buildsLocator("affectedProject:(id:Proj)", { count: 10, sinceDate: "20260706T120000+0000" }),
    ).toBe(
      "affectedProject:(id:Proj),count:10,defaultFilter:false,startDate:(date:20260706T120000+0000,condition:after)",
    );
  });
});
