import { describe, expect, test } from "bun:test";
import { join } from "path";

const { buildMessage, listChanges, detectMetadata, listArtifacts } = await import("./openspec-commit");

const fixtures = join(import.meta.dir, "..", "openspec", "changes", "commit-openspec-to-git");

describe("buildMessage", () => {
  test("auto-generates subject with change name", () => {
    const msg = buildMessage("add-auth", { schema: "spec-driven", created: "2026-07-14" }, [
      "add-auth/proposal.md",
    ]);
    expect(msg).toStartWith("chore(openspec): add-auth");
  });

  test("includes schema and created in body", () => {
    const msg = buildMessage("add-auth", { schema: "spec-driven", created: "2026-07-14" }, [
      "add-auth/proposal.md",
    ]);
    expect(msg).toContain("Schema: spec-driven");
    expect(msg).toContain("Created: 2026-07-14");
  });

  test("lists artifact paths in body", () => {
    const artifacts = ["add-auth/proposal.md", "add-auth/design.md", "add-auth/specs/auth/spec.md"];
    const msg = buildMessage("add-auth", { schema: "spec-driven", created: "2026-07-14" }, artifacts);
    for (const a of artifacts) {
      expect(msg).toContain(a);
    }
  });

  test("returns custom message when provided", () => {
    const msg = buildMessage("add-auth", { schema: "spec-driven", created: "2026-07-14" }, [], "my custom message");
    expect(msg).toBe("my custom message");
  });

  test("uses unknown defaults when metadata missing", () => {
    const msg = buildMessage("test", { schema: "unknown", created: "unknown" }, []);
    expect(msg).toContain("Schema: unknown");
    expect(msg).toContain("Created: unknown");
  });
});

describe("listChanges", () => {
  test("returns commit-openspec-to-git as a known change", () => {
    const dir = join(import.meta.dir, "..", "openspec", "changes");
    const changes = listChanges(dir);
    expect(changes).toContain("commit-openspec-to-git");
  });

  test("returns empty array for nonexistent dir", () => {
    expect(listChanges("/nonexistent")).toEqual([]);
  });
});

describe("detectMetadata", () => {
  test("reads schema and created from .openspec.yaml", () => {
    const meta = detectMetadata(fixtures);
    expect(meta.schema).toBe("spec-driven");
    expect(meta.created).toBe("2026-07-14");
  });

  test("returns unknown for missing yaml", () => {
    const meta = detectMetadata("/nonexistent");
    expect(meta).toEqual({ schema: "unknown", created: "unknown" });
  });
});

describe("listArtifacts", () => {
  test("lists top-level .md files and spec files", () => {
    const artifacts = listArtifacts(fixtures, "commit-openspec-to-git");
    expect(artifacts).toContain("commit-openspec-to-git/proposal.md");
    expect(artifacts).toContain("commit-openspec-to-git/design.md");
    expect(artifacts).toContain("commit-openspec-to-git/tasks.md");
    expect(artifacts).toContain("commit-openspec-to-git/specs/git-commit/spec.md");
  });
});
