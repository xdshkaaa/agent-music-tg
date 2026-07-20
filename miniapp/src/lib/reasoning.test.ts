import { describe, expect, test } from "bun:test";
import { argSummary, countTools, reduceEvents, resultSummary, toLines, type AgentEvent } from "./reasoning";

describe("reduceEvents", () => {
  test("coalesces consecutive reasoning deltas into one event", () => {
    const events: AgentEvent[] = [];
    const e1 = reduceEvents(events, { kind: "reasoning", delta: "Looking for" });
    const e2 = reduceEvents(e1, { kind: "reasoning", delta: " Burial tracks" });
    expect(e2).toEqual([{ kind: "reasoning", delta: "Looking for Burial tracks" }]);
  });

  test("does not coalesce a tool_call between two reasoning deltas", () => {
    const events: AgentEvent[] = [{ kind: "reasoning", delta: "a" }];
    const withCall = reduceEvents(events, { kind: "tool_call", id: "1", name: "search", args: {} });
    const withReasoning = reduceEvents(withCall, { kind: "reasoning", delta: "b" });
    expect(withReasoning).toEqual([
      { kind: "reasoning", delta: "a" },
      { kind: "tool_call", id: "1", name: "search", args: {} },
      { kind: "reasoning", delta: "b" },
    ]);
  });
});

describe("argSummary", () => {
  test("joins up to 3 string/number values, truncated at 40 chars", () => {
    expect(argSummary({ artist: "Burial", title: "Archangel" })).toBe("Burial, Archangel");
  });

  test("truncates long joins with an ellipsis", () => {
    const long = "x".repeat(50);
    expect(argSummary({ query: long })).toBe(`${"x".repeat(39)}…`);
  });
});

describe("resultSummary", () => {
  test("prefers artist – title over a raw uri", () => {
    expect(resultSummary({ artist: "Burial", title: "Archangel", uri: "ytm:xyz" })).toBe("Burial – Archangel");
  });

  test("falls back to error field when present", () => {
    expect(resultSummary({ error: "not found" })).toBe("not found");
  });

  test("falls back to JSON for opaque objects", () => {
    expect(resultSummary({ foo: "bar" })).toBe('{"foo":"bar"}');
  });
});

describe("toLines", () => {
  test("pairs a tool_call with its tool_result on one line", () => {
    const events: AgentEvent[] = [
      { kind: "tool_call", id: "1", name: "searchTrack", args: { query: "Burial" } },
      { kind: "tool_result", id: "1", ok: true, result: { artist: "Burial", title: "Archangel" } },
    ];
    const lines = toLines(events);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.marker).toBe("⏺");
    expect(lines[0]?.state).toBe("success");
    expect(lines[0]?.segments.map((s) => s.text).join("")).toContain("searchTrack");
    expect(lines[0]?.segments.map((s) => s.text).join("")).toContain("Burial – Archangel");
  });

  test("renders an unpaired tool_call (still in flight) with no trailing result", () => {
    const events: AgentEvent[] = [{ kind: "tool_call", id: "1", name: "finalize_playlist", args: { name: "Test" } }];
    const lines = toLines(events);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.state).toBe("pending");
    expect(lines[0]?.segments.map((s) => s.text).join("")).not.toContain("✓");
  });

  test("marks reasoning and failed tool results with their visual states", () => {
    const events: AgentEvent[] = [
      { kind: "reasoning", delta: "Проверяю настроение" },
      { kind: "tool_call", id: "1", name: "searchTrack", args: { query: "unknown" } },
      { kind: "tool_result", id: "1", ok: false, result: { error: "not found" } },
    ];
    const lines = toLines(events);
    expect(lines.map((line) => line.state)).toEqual(["thinking", "error"]);
  });

  test("collapses a run of 3+ same-name calls into one tally line", () => {
    const events: AgentEvent[] = [];
    for (let i = 0; i < 4; i++) {
      events.push({ kind: "tool_call", id: `${i}`, name: "searchTrack", args: { query: `q${i}` } });
      events.push({ kind: "tool_result", id: `${i}`, ok: true, result: { title: `t${i}`, artist: "a" } });
    }
    const lines = toLines(events);
    // First call keeps its own line, the remaining 3 fold into a tally line.
    expect(lines).toHaveLength(2);
    expect(lines[1]?.state).toBe("success");
    expect(lines[1]?.segments.map((s) => s.text).join("")).toContain("×3");
    expect(lines[1]?.segments.map((s) => s.text).join("")).toContain("✓ 3 ok");
  });

  test("keeps a partially completed call group pending", () => {
    const events: AgentEvent[] = [
      { kind: "tool_call", id: "1", name: "searchTrack", args: { query: "a" } },
      { kind: "tool_call", id: "2", name: "searchTrack", args: { query: "b" } },
      { kind: "tool_call", id: "3", name: "searchTrack", args: { query: "c" } },
      { kind: "tool_result", id: "1", ok: true, result: { title: "a" } },
    ];
    const lines = toLines(events);
    expect(lines).toHaveLength(2);
    expect(lines[0]?.state).toBe("success");
    expect(lines[1]?.state).toBe("pending");
    expect(lines[1]?.segments.map((s) => s.text).join("")).toContain("0/2 done");
  });

  test("caps rendered lines at MAX_LINES, keeping the tail", () => {
    const multi: AgentEvent = {
      kind: "reasoning",
      delta: Array.from({ length: 250 }, (_, i) => `line ${i}`).join("\n"),
    };
    const lines = toLines([multi]);
    expect(lines).toHaveLength(200);
    expect(lines.at(-1)?.segments[0]?.text).toBe("line 249");
  });
});

describe("countTools", () => {
  test("counts only tool_call events", () => {
    const events: AgentEvent[] = [
      { kind: "reasoning", delta: "x" },
      { kind: "tool_call", id: "1", name: "a", args: {} },
      { kind: "tool_result", id: "1", ok: true, result: {} },
      { kind: "tool_call", id: "2", name: "b", args: {} },
    ];
    expect(countTools(events)).toBe(2);
  });
});
