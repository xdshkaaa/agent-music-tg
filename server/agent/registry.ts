import type { AgentProvider } from "./types";
import { env } from "../env";
import { createAnthropicProvider } from "./providers/anthropic";
import { createOpenAIProvider } from "./providers/openai";
import { createOpenRouterProvider } from "./providers/openrouter";
import { createOllamaProvider } from "./providers/ollama";
import { createOpencodeProvider } from "./providers/opencode";
import type { ProviderOverrides } from "../lib/settings";

export const AVAILABLE_PROVIDERS = ["anthropic", "openai", "openrouter", "opencode", "ollama"] as const;
export type ProviderId = (typeof AVAILABLE_PROVIDERS)[number];

export function isProviderId(value: string): value is ProviderId {
  return (AVAILABLE_PROVIDERS as readonly string[]).includes(value);
}

export class MissingCredentialError extends Error {
  constructor(providerId: ProviderId, envVar: string) {
    super(`AI provider "${providerId}" is active but ${envVar} is not set on the server`);
  }
}

export interface ProviderDefaults {
  model: string;
  baseUrl: string | null;
  apiKeyConfigured: boolean;
}

export function getProviderDefaults(id: ProviderId): ProviderDefaults {
  switch (id) {
    case "anthropic":
      return { model: "claude-sonnet-5", baseUrl: null, apiKeyConfigured: !!env.anthropicApiKey };
    case "openai":
      return { model: "gpt-5", baseUrl: null, apiKeyConfigured: !!env.openaiApiKey };
    case "openrouter":
      return { model: "openrouter/auto", baseUrl: null, apiKeyConfigured: !!env.openrouterApiKey };
    case "opencode":
      return { model: env.opencodeModel, baseUrl: env.opencodeBaseUrl, apiKeyConfigured: !!env.opencodeApiKey };
    case "ollama":
      return { model: env.ollamaModel, baseUrl: env.ollamaUrl, apiKeyConfigured: true };
  }
}

/** Throws MissingCredentialError instead of ever making a call with an absent key. */
export function createProvider(id: ProviderId, overrides?: ProviderOverrides): AgentProvider {
  const model = overrides?.model ?? null;
  const baseUrl = overrides?.baseUrl ?? null;

  switch (id) {
    case "anthropic":
      if (!env.anthropicApiKey) throw new MissingCredentialError(id, "ANTHROPIC_API_KEY");
      return createAnthropicProvider(env.anthropicApiKey, model ?? undefined);
    case "openai":
      if (!env.openaiApiKey) throw new MissingCredentialError(id, "OPENAI_API_KEY");
      return createOpenAIProvider(env.openaiApiKey, model ?? undefined);
    case "openrouter":
      if (!env.openrouterApiKey) throw new MissingCredentialError(id, "OPENROUTER_API_KEY");
      return createOpenRouterProvider(env.openrouterApiKey, model ?? undefined);
    case "opencode":
      if (!env.opencodeApiKey) throw new MissingCredentialError(id, "OPENCODE_API_KEY");
      return createOpencodeProvider(env.opencodeApiKey, baseUrl ?? env.opencodeBaseUrl, model ?? env.opencodeModel);
    case "ollama":
      return createOllamaProvider(baseUrl ?? env.ollamaUrl, model ?? env.ollamaModel);
  }
}
