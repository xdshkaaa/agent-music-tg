import type { AgentProvider } from "../types";
import { openaiCompatChat } from "../openai-compat";

const PRIMARY_BASE_URL = "https://cheapvibecode.ru/v1";
const FALLBACK_BASE_URL = "https://ru.cheapvibecode.ru/v1";

export function createCheapVibeCodeProvider(apiKey: string, model = "gpt-5", baseUrl?: string): AgentProvider {
  const primary = baseUrl ?? PRIMARY_BASE_URL;
  return {
    id: "cheapvibecode",
    generateMessages: async (system, messages, tools) => {
      try {
        return await openaiCompatChat({ baseUrl: primary, apiKey, model }, system, messages, tools);
      } catch (err) {
        if (primary !== PRIMARY_BASE_URL) throw err;
        return openaiCompatChat({ baseUrl: FALLBACK_BASE_URL, apiKey, model }, system, messages, tools);
      }
    },
  };
}
