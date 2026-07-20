import { describe, expect, test } from "bun:test";
import { createShutdownHandler } from "./lifecycle";

describe("createShutdownHandler", () => {
  test("stops pollers and long polling before exiting, once across repeated signals", async () => {
    const events: string[] = [];
    const shutdown = createShutdownHandler({
      stopPoller: () => events.push("poller"),
      stopPlategaPoller: () => events.push("platega"),
      stopBot: async () => {
        events.push("bot");
      },
      exit: (code) => events.push(`exit:${code}`),
    });

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);

    expect(events).toEqual(["poller", "platega", "bot", "exit:0"]);
  });

  test("still exits when bot shutdown rejects", async () => {
    const exits: number[] = [];
    const shutdown = createShutdownHandler({
      stopPoller: () => {},
      stopPlategaPoller: () => {},
      stopBot: async () => {
        throw new Error("Telegram unavailable");
      },
      exit: (code) => exits.push(code),
    });

    await shutdown("SIGTERM");

    expect(exits).toEqual([0]);
  });

  test("bounds a bot shutdown that never settles", async () => {
    const exits: number[] = [];
    const shutdown = createShutdownHandler({
      stopPoller: () => {},
      stopPlategaPoller: () => {},
      stopBot: () => new Promise(() => {}),
      exit: (code) => exits.push(code),
      botStopTimeoutMs: 5,
    });

    await shutdown("SIGINT");

    expect(exits).toEqual([0]);
  });
});
