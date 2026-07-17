/** Maps raw technical error strings to a short, human-readable message.
 *  The original (technical) text is preserved as `detail` for an optional
 *  developer-facing "Подробнее" disclosure — it must never reach the user
 *  as the primary message. */

export interface FriendlyError {
  /** Short heading shown above the body (optional). */
  title?: string;
  /** Short, non-technical message shown to the user. */
  message: string;
  /** Raw technical text, shown only inside the collapsible details. */
  detail?: string;
}

export function humanizeError(raw: string): FriendlyError {
  const text = (raw ?? "").trim();
  if (!text) {
    return { message: "Не удалось выполнить действие. Попробуйте ещё раз." };
  }

  const lower = text.toLowerCase();

  if (/401|missing authentication|unauthorized|invalid api key|api[_ -]?key/i.test(lower)) {
    return {
      message: "Сервис временно недоступен. Попробуйте позже или напишите в поддержку.",
      detail: text,
    };
  }
  if (/403|forbidden/i.test(lower)) {
    return {
      message: "Нет доступа к выбранной модели. Попробуйте позже.",
      detail: text,
    };
  }
  if (/429|rate limit|too many requests/i.test(lower)) {
    return {
      message: "Слишком много запросов. Подождите немного и попробуйте снова.",
      detail: text,
    };
  }
  if (/5\d{2}|bad gateway|service unavailable|gateway timeout|upstream/i.test(lower)) {
    return {
      message: "Сервис недоступен. Попробуйте повторить действие через минуту.",
      detail: text,
    };
  }
  if (/timeout|timed out|econn|enotfound|fetch failed|network|no route|connection/i.test(lower)) {
    return {
      message: "Произошла ошибка подключения. Проверьте соединение и попробуйте ещё раз.",
      detail: text,
    };
  }
  if (/completion failed|chat completion|could not parse|tool call|invalid json/i.test(lower)) {
    return {
      message: "Не удалось собрать плейлист. Попробуйте ещё раз.",
      detail: text,
    };
  }
  if (/crypto asset unsupported|unsupported asset|unsupported_crypto_asset|unsupported asset/i.test(lower)) {
    return {
      title: "Способ оплаты недоступен",
      message: "Сейчас метод недоступен, ожидается подключение платёжного метода",
      detail: text,
    };
  }

  return { message: "Не удалось выполнить действие. Попробуйте ещё раз.", detail: text };
}
