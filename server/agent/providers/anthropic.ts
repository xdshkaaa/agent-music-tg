import { parseJsonResponse, type AgentMessage, type AgentProvider, type AgentResult, type ToolCall, type ToolSpec } from "../types";
import { toolsForAnthropic } from "../tools";
import { markHistoryCacheBreakpoints, toAnthropicMessages, type AnthropicContentBlock } from "../anthropic-messages";

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;

const CALL_TIMEOUT_MS = 90_000;

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
      // The transcript grows every round and is re-sent in full, so mark it too
      // — otherwise only the static prefix was cached and the (much larger)
      // accumulated tool results were re-processed at full rate each round.
      const anthropicMessages = toAnthropicMessages(messages);
      markHistoryCacheBreakpoints(anthropicMessages);
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
          messages: anthropicMessages,
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
