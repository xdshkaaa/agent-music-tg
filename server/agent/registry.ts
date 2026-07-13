import type { AgentProvider } from "./types";
import { env } from "../env";
import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAIProvider } from "./providers/openai";
import { createOpenRouterProvider } from "./providers/openrouter";
import { createOllamaProvider } from "./providers/ollama";

export const AVAILABLE_PROVIDERS = ["anthropic", "openai", "openrouter", "ollama"] as const;
export type ProviderId = (typeof AVAILABLE_PROVIDERS)[number];

export function isProviderId(value: string): value is ProviderId {
  return (AVAILABLE_PROVIDERS as readonly string[]).includes(value);
}

export class MissingCredentialError extends Error {
  constructor(providerId: ProviderId, envVar: string) {
    super(`AI provider "${providerId}" is active but ${envVar} is not set on the server`);
  }
}

/** Throws MissingCredentialError instead of ever making a call with an absent key. */
export function createProvider(id: ProviderId): AgentProvider {
  switch (id) {
    case "anthropic":
      if (!env.anthropicApiKey) throw new MissingCredentialError(id, "ANTHROPIC_API_KEY");
      return createAnthropicProvider(env.anthropicApiKey);
    case "openai":
      if (!env.openaiApiKey) throw new MissingCredentialError(id, "OPENAI_API_KEY");
      return createOpenAIProvider(env.openaiApiKey);
    case "openrouter":
      if (!env.openrouterApiKey) throw new MissingCredentialError(id, "OPENROUTER_API_KEY");
      return createOpenRouterProvider(env.openrouterApiKey);
    case "ollama":
      // Local daemon, no cloud credential required.
      return createOllamaProvider(env.ollamaUrl, env.ollamaModel);
  }
}
