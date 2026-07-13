import type { AgentProvider } from "../types";
import { openaiCompatChat } from "../openai-compat";

export function createOpenAIProvider(apiKey: string, model = "gpt-5"): AgentProvider {
  return {
    id: "openai",
    generateMessages: (system, messages, tools) =>
      openaiCompatChat({ baseUrl: "https://api.openai.com/v1", apiKey, model }, system, messages, tools),
  };
}
