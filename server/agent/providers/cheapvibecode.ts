import type { AgentProvider } from "../types";
import { openaiCompatChat } from "../openai-compat";

export function createCheapVibeCodeProvider(apiKey: string, model = "gpt-5", baseUrl?: string): AgentProvider {
  return {
    id: "cheapvibecode",
    generateMessages: (system, messages, tools) =>
      openaiCompatChat({ baseUrl: baseUrl ?? "https://cheapvibecode.ru/v1", apiKey, model }, system, messages, tools),
  };
}
