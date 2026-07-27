/**
 * Shared wire-shape helpers for the two providers that speak the Anthropic
 * Messages API (`providers/anthropic.ts` and Anthropic-family models on the
 * opencode Zen gateway).
 */

import type { AgentMessage } from "./types";

export interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  cache_control?: { type: "ephemeral" };
}

export interface AnthropicMessage {
  role: string;
  content: AnthropicContentBlock[];
}

/**
 * Anthropic caps a request at 4 cache_control breakpoints. The system prompt
 * and the tool schema take one each, which leaves two for the transcript.
 */
const HISTORY_BREAKPOINTS = 2;
/**
 * A breakpoint only searches back ~20 content blocks for an existing cache
 * entry. One agent turn emitting several tool calls plus their results can
 * exceed that on its own, which would silently drop the previous round's
 * entry out of range — so a second breakpoint is placed this many blocks
 * behind the newest one. It reads the older entry and writes a fresh one,
 * chaining the cache forward across rounds no matter how wide a turn was.
 */
const SECOND_BREAKPOINT_DISTANCE = 12;

/** Always block-array form (never a bare string) so cache_control can attach anywhere. */
export function toAnthropicMessages(messages: AgentMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: [{ type: "text", text: m.content }] });
    } else if (m.role === "assistant") {
      const blocks: AnthropicContentBlock[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const tc of m.toolCalls ?? []) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
      }
      out.push({ role: "assistant", content: blocks });
    } else {
      out.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: m.callId, content: m.content, is_error: m.isError }],
      });
    }
  }
  return out;
}

/**
 * Marks the transcript so each agent round reads the previous round's prompt
 * from cache instead of re-processing it.
 *
 * The agent loop re-sends the whole conversation every iteration, and tool
 * results here are full serialized track lists — by the later of up to 12
 * rounds that is the bulk of the prompt, and caching only the system prompt
 * and tool schema left all of it billed and re-processed at full rate every
 * round. Marking the newest turn makes the next round's prefix an exact
 * extension of what was just cached.
 */
export function markHistoryCacheBreakpoints(messages: AnthropicMessage[]): void {
  let placed = 0;
  let blocksBack = 0;
  for (let i = messages.length - 1; i >= 0 && placed < HISTORY_BREAKPOINTS; i--) {
    const blocks = messages[i]!.content;
    if (blocks.length === 0) continue;
    if (placed === 0 || blocksBack >= SECOND_BREAKPOINT_DISTANCE) {
      blocks[blocks.length - 1]!.cache_control = { type: "ephemeral" };
      placed++;
    }
    blocksBack += blocks.length;
  }
}
