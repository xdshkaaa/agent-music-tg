import { readdirSync, existsSync, readFileSync } from "fs";
import { join, relative } from "path";
import { parseArgs } from "util";

const CHANGES_DIR = join(import.meta.dir, "..", "openspec", "changes");

interface Args {
  change: string;
  message?: string;
  amend: boolean;
  dryRun: boolean;
}

function parse(): Args {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      change: { type: "string", short: "c" },
      message: { type: "string", short: "m" },
      amend: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
    strict: true,
    allowPositionals: true,
  });

  const change = values.change ?? positionals[0];
  if (!change) {
    console.error("Usage: openspec-commit --change <name> [--message <msg>] [--amend] [--dry-run]");
    console.error("       openspec-commit <name> [--message <msg>] [--amend] [--dry-run]");
    process.exit(1);
  }

  return {
    change,
    message: values.message,
    amend: values.amend ?? false,
    dryRun: values["dry-run"] ?? false,
  };
}

export function listChanges(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((entry) => {
    const yaml = join(dir, entry, ".openspec.yaml");
    return existsSync(yaml);
  });
}

function resolveChange(changeName: string): string {
  const changeDir = join(CHANGES_DIR, changeName);
  if (!existsSync(changeDir)) {
    const available = listChanges(CHANGES_DIR);
    console.error(`Change "${changeName}" not found.`);
    if (available.length > 0) {
      console.error(`Available changes:\n  ${available.join("\n  ")}`);
    }
    process.exit(1);
  }
  return changeDir;
}

export function detectMetadata(changeDir: string) {
  const yamlPath = join(changeDir, ".openspec.yaml");
  if (!existsSync(yamlPath)) return { schema: "unknown", created: "unknown" };

  const raw = readFileSync(yamlPath, "utf-8");
  const schema = raw.match(/schema:\s*(\S+)/)?.[1] ?? "unknown";
  const created = raw.match(/created:\s*(\S+)/)?.[1] ?? "unknown";
  return { schema, created };
}

export function listArtifacts(changeDir: string, changeName: string): string[] {
  const top = readdirSync(changeDir).filter(
    (f) => f.endsWith(".md") && f !== ".openspec.yaml",
  );
  const specsDir = join(changeDir, "specs");
  const specs: string[] = [];
  if (existsSync(specsDir)) {
    for (const cap of readdirSync(specsDir)) {
      const specFile = join(specsDir, cap, "spec.md");
      if (existsSync(specFile)) specs.push(relative(CHANGES_DIR, specFile));
    }
  }
  return [...top.map((f) => `${changeName}/${f}`), ...specs];
}

export function buildMessage(
  changeName: string,
  metadata: { schema: string; created: string },
  artifactPaths: string[],
  customMessage?: string,
): string {
  if (customMessage) return customMessage;

  const subject = `chore(openspec): ${changeName}`;
  const body = [
    `Schema: ${metadata.schema}`,
    `Created: ${metadata.created}`,
    "",
    "Artifacts:",
    ...artifactPaths.map((p) => `  - ${p}`),
  ].join("\n");

  return `${subject}\n\n${body}`;
}

function printSummary(files: string[], message: string) {
  console.log(`\nFiles staged:\n${files.map((f) => `  ${f}`).join("\n")}`);
  console.log(`\nCommit message:\n${message}\n`);
}

async function runGit(args: string[], dryRun: boolean) {
  const cmd = ["git", ...args];

  if (dryRun) {
    console.log(`[dry-run] Would run: ${cmd.join(" ")}`);
    return { stdout: "", stderr: "", exitCode: 0 };
  }

  const proc = Bun.spawnSync(cmd);
  return {
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
    exitCode: proc.exitCode,
  };
}

async function checkGitRepo(dryRun: boolean): Promise<void> {
  const { exitCode, stderr } = await runGit(["rev-parse", "--is-inside-work-tree"], dryRun);
  if (exitCode !== 0) {
    console.error(stderr || "Not inside a git repository.");
    process.exit(1);
  }
}

async function main() {
  const args = parse();

  const changeDir = resolveChange(args.change);
  const metadata = detectMetadata(changeDir);

  await checkGitRepo(args.dryRun);

  const entryPath = (entry: { parentPath: string; name: string }) => join(entry.parentPath, entry.name);

  const allFiles = readdirSync(changeDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map(entryPath)
    .filter((f) => !f.endsWith(".openspec.yaml"))
    .map((f) => relative(changeDir, f));

  if (allFiles.length === 0) {
    console.error(`Change "${args.change}" has no files to commit.`);
    process.exit(1);
  }

  const stagedFiles = allFiles.map((f) => join(relative(process.cwd(), changeDir), f));

  const artifactPaths = listArtifacts(changeDir, args.change);
  const message = buildMessage(args.change, metadata, artifactPaths, args.message);

  if (args.dryRun) {
    printSummary(stagedFiles, message);
    return;
  }

  const addResult = await runGit(["add", ...stagedFiles], false);
  if (addResult.exitCode !== 0) {
    console.error(`git add failed:\n${addResult.stderr}`);
    process.exit(addResult.exitCode);
  }

  const commitArgs = ["commit", "--message", message];
  if (args.amend) commitArgs.push("--amend");

  const commitResult = await runGit(commitArgs, false);
  if (commitResult.exitCode !== 0) {
    console.error(`git commit failed:\n${commitResult.stderr}`);
    process.exit(commitResult.exitCode);
  }

  console.log(commitResult.stdout);

  const diffStat = await runGit(["diff", "--stat", "--cached"], false);
  if (diffStat.stdout) console.log(diffStat.stdout);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
}
