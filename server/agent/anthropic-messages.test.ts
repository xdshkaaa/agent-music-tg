import { describe, expect, test } from "bun:test";
import type { AgentMessage } from "./types";
import { markHistoryCacheBreakpoints, toAnthropicMessages } from "./anthropic-messages";

function breakpointCount(messages: ReturnType<typeof toAnthropicMessages>): number {
  return messages.reduce((n, m) => n + m.content.filter((b) => b.cache_control).length, 0);
}

/** Index of every message carrying a breakpoint, oldest first. */
function markedMessageIndexes(messages: ReturnType<typeof toAnthropicMessages>): number[] {
  return messages.flatMap((m, i) => (m.content.some((b) => b.cache_control) ? [i] : []));
}

function toolRound(round: number, calls: number): AgentMessage[] {
  const toolCalls = Array.from({ length: calls }, (_, i) => ({
    id: `r${round}-c${i}`,
    name: "searchTracks",
    args: { query: `q${i}` },
  }));
  return [
    { role: "assistant", content: "thinking", toolCalls },
    ...toolCalls.map((tc) => ({ role: "tool" as const, callId: tc.id, name: tc.name, content: "[]" })),
    { role: "user", content: "Continue." },
  ];
}

describe("toAnthropicMessages", () => {
  test("renders every role as a content-block array so breakpoints can attach", () => {
    const out = toAnthropicMessages([
      { role: "user", content: "hi" },
      { role: "assistant", content: "sure", toolCalls: [{ id: "c1", name: "searchTracks", args: { query: "x" } }] },
      { role: "tool", callId: "c1", name: "searchTracks", content: "[]" },
    ]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out.every((m) => Array.isArray(m.content))).toBe(true);
    expect(out[0]!.content).toEqual([{ type: "text", text: "hi" }]);
    expect(out[1]!.content.map((b) => b.type)).toEqual(["text", "tool_use"]);
    expect(out[2]!.content[0]!.type).toBe("tool_result");
  });

  test("an assistant turn with no text carries only its tool_use blocks", () => {
    const out = toAnthropicMessages([
      { role: "assistant", content: "", toolCalls: [{ id: "c1", name: "searchTracks", args: {} }] },
    ]);
    expect(out[0]!.content.map((b) => b.type)).toEqual(["tool_use"]);
  });
});

describe("markHistoryCacheBreakpoints", () => {
  test("marks the newest turn so the next round reads it back from cache", () => {
    const out = toAnthropicMessages([{ role: "user", content: "hi" }]);
    markHistoryCacheBreakpoints(out);
    expect(out[0]!.content.at(-1)!.cache_control).toEqual({ type: "ephemeral" });
  });

  test("never exceeds the two breakpoints left over from system and tools", () => {
    const out = toAnthropicMessages([...toolRound(1, 4), ...toolRound(2, 4), ...toolRound(3, 4)]);
    markHistoryCacheBreakpoints(out);
    expect(breakpointCount(out)).toBe(2);
  });

  test("places the second breakpoint far enough back to survive a wide turn", () => {
    // 12 tool calls in one round is 25 blocks — past the ~20-block window a
    // single breakpoint can look back through, which is exactly the case the
    // older breakpoint exists to bridge.
    const out = toAnthropicMessages([...toolRound(1, 2), ...toolRound(2, 12)]);
    markHistoryCacheBreakpoints(out);
    const marked = markedMessageIndexes(out);
    expect(marked).toHaveLength(2);
    expect(marked.at(-1)).toBe(out.length - 1);
    // Count the blocks between the two marks: far enough to chain, close
    // enough that the older entry stays inside the lookback window.
    const blocksBetween = out
      .slice(marked[0]!, out.length - 1)
      .reduce((n, m) => n + m.content.length, 0);
    expect(blocksBetween).toBeGreaterThanOrEqual(12);
    expect(blocksBetween).toBeLessThanOrEqual(20);
  });

  test("marks the last block of a turn, not an earlier one", () => {
    const out = toAnthropicMessages([
      { role: "assistant", content: "text", toolCalls: [{ id: "c1", name: "searchTracks", args: {} }] },
    ]);
    markHistoryCacheBreakpoints(out);
    expect(out[0]!.content[0]!.cache_control).toBeUndefined();
    expect(out[0]!.content[1]!.cache_control).toEqual({ type: "ephemeral" });
  });

  test("an empty transcript is left alone", () => {
    const out = toAnthropicMessages([]);
    markHistoryCacheBreakpoints(out);
    expect(out).toEqual([]);
  });
});
