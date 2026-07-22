import { parseJsonText, type AgentMessage, type AgentResult, type ToolCall, type ToolSpec } from "./types";
import { toolsForOpenAIChat } from "./tools";

interface OpenAIChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

function toOpenAIMessages(system: string, messages: AgentMessage[]): OpenAIChatMessage[] {
  const out: OpenAIChatMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.content,
        tool_calls: m.toolCalls?.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });
    } else {
      out.push({ role: "tool", tool_call_id: m.callId, content: m.content });
    }
  }
  return out;
}

export interface OpenAICompatConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Shared OpenAI Chat Completions-compatible transport (OpenAI, CheapVibeCode, Ollama). */
export async function openaiCompatChat(
  config: OpenAICompatConfig,
  system: string,
  messages: AgentMessage[],
  tools: ToolSpec[],
): Promise<AgentResult> {
  const res = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: toOpenAIMessages(system, messages),
      tools: tools.length > 0 ? toolsForOpenAIChat(tools) : undefined,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`${config.baseUrl} chat completion failed: ${res.status} ${await res.text()}`);
  }
  // Some OpenAI-compatible proxies (observed on ru.cheapvibecode.ru) tack a
  // stray SSE "data: [DONE]" terminator onto an otherwise-complete
  // non-streaming JSON body — strip it before parsing rather than fail.
  const rawBody = (await res.text()).replace(/\s*data:\s*\[DONE\]\s*$/, "");
  const data = parseJsonText<{
    choices: Array<{ message: { content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }>;
  }>(rawBody, config.baseUrl);
  const message = data.choices[0]?.message;
  const toolCalls: ToolCall[] | undefined = message?.tool_calls?.map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function.arguments);
    } catch {
      args = { _raw: tc.function.arguments };
    }
    return { id: tc.id, name: tc.function.name, args };
  });
  return { text: message?.content ?? "", toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined };
}
