/** A JSON-schema parameter set describing a single tool the agent can call. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** One completed tool call a provider surfaced in its response. */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** Structured agent response: free-text (possibly empty) plus any tool calls. */
export interface AgentResult {
  text: string;
  toolCalls?: ToolCall[];
}

/** One turn in the multi-turn conversation the loop builds up, append-only. */
export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; callId: string; name: string; content: string; isError?: boolean };

export interface AgentProvider {
  id: string;
  generateMessages(system: string, messages: AgentMessage[], tools: ToolSpec[]): Promise<AgentResult>;
}

/**
 * Parses an ok (2xx) fetch Response body as JSON, labeling failures with the
 * provider name and diagnostic context instead of letting the runtime's bare
 * "Failed to parse JSON" (or similar) escape uncaught — that message reaches
 * end users verbatim since it matches no pattern in errorText.ts.
 *
 * Malformed bodies here are usually valid-looking JSON that breaks deep in a
 * long string field (e.g. a "reasoning_content" value with an unescaped
 * control character), so a fixed-length prefix preview rarely shows the
 * actual break. Instead we pull the position out of the parser's own error
 * message and preview the text around THAT position; the full raw body is
 * logged server-side (never sent to the client) for deeper diagnosis.
 */
export async function parseJsonResponse<T>(res: Response, providerLabel: string): Promise<T> {
  const raw = await res.text();
  return parseJsonText<T>(raw, providerLabel);
}

/**
 * Same as parseJsonResponse but takes already-read text, so callers can
 * sanitize known proxy quirks (e.g. a stray SSE "data: [DONE]" trailer on an
 * otherwise-complete non-streaming body) before parsing.
 */
export function parseJsonText<T>(raw: string, providerLabel: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    const parseError = e instanceof Error ? e.message : String(e);
    const posMatch = /position (\d+)/.exec(parseError);
    const pos = posMatch ? Number(posMatch[1]) : null;
    const context = pos !== null ? raw.slice(Math.max(0, pos - 150), pos + 150) : raw.slice(0, 300);
    console.error(`[${providerLabel}] non-JSON response body (${raw.length} bytes):`, raw);
    throw new Error(
      `${providerLabel} returned a non-JSON response body (${parseError}, length ${raw.length}): ...${context}...`,
    );
  }
}

/** A structured event emitted while the agent loop runs, for live progress UI. */
export type AgentEvent =
  | { kind: "reasoning"; delta: string }
  | { kind: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; id: string; ok: boolean; result: unknown };
