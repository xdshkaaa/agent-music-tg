import { parseJsonResponse, type AgentMessage, type AgentProvider, type AgentResult, type ToolCall, type ToolSpec } from "../types";
import { toolsForAnthropic } from "../tools";
import { openaiCompatChat } from "../openai-compat";

const DEFAULT_BASE_URL = "https://opencode.ai/zen/v1";
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
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages: toAnthropicMessages(messages),
          tools: tools.length > 0 ? toolsForAnthropic(tools) : undefined,
        }),
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
