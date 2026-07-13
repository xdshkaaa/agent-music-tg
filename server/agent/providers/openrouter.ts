import type { AgentProvider } from "../types";
import { openaiCompatChat } from "../openai-compat";

export function createOpenRouterProvider(apiKey: string, model = "openrouter/auto"): AgentProvider {
  return {
    id: "openrouter",
    generateMessages: (system, messages, tools) =>
      openaiCompatChat({ baseUrl: "https://openrouter.ai/api/v1", apiKey, model }, system, messages, tools),
  };
}
