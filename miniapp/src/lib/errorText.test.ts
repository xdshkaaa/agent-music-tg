import { describe, expect, test } from "bun:test";
import { humanizeError } from "./errorText";

describe("humanizeError", () => {
  test("keeps unauthenticated backend details out of the user-facing message", () => {
    const friendly = humanizeError("unauthenticated");

    expect(friendly.message).toBe("Сервис временно недоступен. Попробуйте позже или напишите в поддержку.");
    expect(friendly.detail).toBe("unauthenticated");
  });

  test("classifies Safari WebView's Load failed exception as a connection error", () => {
    expect(humanizeError("Load failed").message).toBe(
      "Произошла ошибка подключения. Проверьте соединение и попробуйте ещё раз.",
    );
  });
});
