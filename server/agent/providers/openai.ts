import type { AgentProvider } from "../types";
import { openaiCompatChat } from "../openai-compat";

export function createOpenAIProvider(apiKey: string, model = "gpt-5-mini", baseUrl?: string): AgentProvider {
  const officialBaseUrl = "https://api.openai.com/v1";
  const supportsMinimalReasoning = model === "gpt-5" || model.startsWith("gpt-5-mini");
  return {
    id: "openai",
    generateMessages: (system, messages, tools) =>
      openaiCompatChat(
        {
          baseUrl: baseUrl ?? officialBaseUrl,
          apiKey,
          model,
          // Playlist curation is a tightly specified tool-routing task. Keep
          // reasoning bounded so both mandatory agent rounds return quickly.
          reasoningEffort: !baseUrl && supportsMinimalReasoning ? "minimal" : undefined,
        },
        system,
        messages,
        tools,
      ),
  };
}
