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

/** A structured event emitted while the agent loop runs, for live progress UI. */
export type AgentEvent =
  | { kind: "reasoning"; delta: string }
  | { kind: "tool_call"; id: string; name: string; args: Record<string, unknown> }
  | { kind: "tool_result"; id: string; ok: boolean; result: unknown };
