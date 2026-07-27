import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const { buildMessage, listChanges, detectMetadata, listArtifacts } = await import("./openspec-commit");

/**
 * A change directory built on disk for the test, so these cases don't depend
 * on any particular change still living in openspec/changes.
 */
const CHANGE = "commit-openspec-to-git";
const changesRoot = mkdtempSync(join(tmpdir(), "openspec-changes-"));
const fixtures = join(changesRoot, CHANGE);

mkdirSync(join(fixtures, "specs", "git-commit"), { recursive: true });
writeFileSync(join(fixtures, ".openspec.yaml"), "schema: spec-driven\ncreated: 2026-07-14\n");
for (const f of ["proposal.md", "design.md", "tasks.md"]) writeFileSync(join(fixtures, f), `# ${f}\n`);
writeFileSync(join(fixtures, "specs", "git-commit", "spec.md"), "# spec\n");
// A sibling without .openspec.yaml — listChanges must skip it.
mkdirSync(join(changesRoot, "not-a-change"), { recursive: true });

afterAll(() => rmSync(changesRoot, { recursive: true, force: true }));

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
  test("lists directories that carry an .openspec.yaml", () => {
    expect(listChanges(changesRoot)).toEqual([CHANGE]);
  });

  test("skips directories without an .openspec.yaml", () => {
    expect(listChanges(changesRoot)).not.toContain("not-a-change");
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
