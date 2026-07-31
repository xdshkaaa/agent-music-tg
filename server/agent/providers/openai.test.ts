import { afterEach, describe, expect, mock, test } from "bun:test";
import { createOpenAIProvider } from "./openai";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
});

describe("OpenAI provider latency defaults", () => {
  test("uses the fast model and minimal reasoning for tool-routing turns", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "", tool_calls: [] } }] }));
    }) as unknown as typeof fetch;

    const provider = createOpenAIProvider("test-key");
    await provider.generateMessages("system", [{ role: "user", content: "рок для тренировки" }], []);

    expect(requestBody?.model).toBe("gpt-5-mini");
    expect(requestBody?.reasoning_effort).toBe("minimal");
  });

  test("does not send OpenAI-specific reasoning options to a custom compatible API", async () => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = mock(async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }));
    }) as unknown as typeof fetch;

    const provider = createOpenAIProvider("test-key", "custom-model", "https://llm.example/v1");
    await provider.generateMessages("system", [{ role: "user", content: "test" }], []);

    expect(requestBody).not.toHaveProperty("reasoning_effort");
  });
});
