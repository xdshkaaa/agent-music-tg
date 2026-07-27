import { parseJsonResponse, type AgentMessage, type AgentProvider, type AgentResult, type ToolCall, type ToolSpec } from "../types";
import { toolsForAnthropic } from "../tools";
import { markHistoryCacheBreakpoints, toAnthropicMessages, type AnthropicContentBlock } from "../anthropic-messages";
import { openaiCompatChat } from "../openai-compat";

const DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";
const DEFAULT_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;
const CALL_TIMEOUT_MS = 90_000;

// Anthropic-family models on opencode Zen speak the Messages API wire shape;
// every other model on the gateway (DeepSeek, GLM, Kimi, gpt-oss, ...) speaks
// the OpenAI Chat Completions-compat dialect instead.
const ANTHROPIC_FAMILY_MODEL = /^claude-/i;

/**
 * opencode's hosted Zen gateway proxies many model families behind one API
 * key, but the two dialects need different transports: Anthropic-family
 * models use the Messages API shape (below), everything else uses the shared
 * OpenAI-compat chat-completions transport. Both authenticate with a plain
 * `Authorization: Bearer <key>` — see https://opencode.ai/zen.
 */
export function createOpencodeProvider(apiKey: string, baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL): AgentProvider {
  if (!ANTHROPIC_FAMILY_MODEL.test(model)) {
    return {
      id: "opencode",
      generateMessages: (system, messages, tools) => openaiCompatChat({ baseUrl, apiKey, model }, system, messages, tools),
    };
  }

  return {
    id: "opencode",
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
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
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
        throw new Error(`opencode API failed: ${res.status} ${await res.text()}`);
      }
      const data = await parseJsonResponse<{ content: AnthropicContentBlock[] }>(res, "opencode");
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
