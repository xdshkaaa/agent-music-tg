import { parseJsonResponse, type AgentMessage, type AgentProvider, type AgentResult, type ToolCall, type ToolSpec } from "../types";
import { toolsForAnthropic } from "../tools";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

const CALL_TIMEOUT_MS = 90_000;

function toAnthropicMessages(messages: AgentMessage[]): Array<{ role: string; content: AnthropicContentBlock[] | string }> {
  const out: Array<{ role: string; content: AnthropicContentBlock[] | string }> = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
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

export function createAnthropicProvider(apiKey: string, model = DEFAULT_MODEL): AgentProvider {
  return {
    id: "anthropic",
    async generateMessages(system: string, messages: AgentMessage[], tools: ToolSpec[]): Promise<AgentResult> {
      // The system prompt and tool schema are identical on every turn of the
      // up-to-12-iteration agent loop — mark both cacheable so turns after
      // the first skip re-processing that static prefix (faster + cheaper).
      const anthropicTools = tools.length > 0 ? (toolsForAnthropic(tools) as Record<string, unknown>[]) : undefined;
      if (anthropicTools && anthropicTools.length > 0) {
        anthropicTools[anthropicTools.length - 1]!.cache_control = { type: "ephemeral" };
      }
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: toAnthropicMessages(messages),
          tools: anthropicTools,
        }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`anthropic API failed: ${res.status} ${await res.text()}`);
      }
      const data = await parseJsonResponse<{ content: AnthropicContentBlock[] }>(res, "anthropic");
      let text = "";
      const toolCalls: ToolCall[] = [];
      for (const block of data.content ?? []) {
        if (block.type === "text" && block.text) text += block.text;
        if (block.type === "tool_use" && block.id && block.name) {
          toolCalls.push({ id: block.id, name: block.name, args: block.input ?? {} });
        }
      }
      return { text, toolCalls: toolCalls.length > 0 ? toolCalls : undefined };
    },
  };
}
