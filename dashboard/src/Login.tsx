import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, string | number>) => void;
  }
}

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .config()
      .then((c) => setBotUsername(c.botUsername || null))
      .catch(() => setBotUsername(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!botUsername || !slotRef.current) return;

    window.onTelegramAuth = (user) => {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(user)) payload[k] = String(v);
      api
        .loginWithWidget(payload)
        .then(() => onLoggedIn())
        .catch((e) => setError(e instanceof ApiError ? e.message : "Не удалось войти"));
    };

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");
    slotRef.current.innerHTML = "";
    slotRef.current.appendChild(script);
  }, [botUsername, onLoggedIn]);

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-title">Операторская панель</div>
        <div className="login-sub">Вход через Telegram — доступ только у администраторов</div>
        {loading && <div className="state-block"><div className="spinner" /></div>}
        {!loading && !botUsername && (
          <div className="error-block">
            TELEGRAM_BOT_USERNAME не задан на сервере дашборда — виджет входа недоступен. См. .env.example.
          </div>
        )}
        {!loading && botUsername && <div className="login-widget-slot" ref={slotRef} />}
        {error && <div className="error-block" style={{ marginTop: 14 }}>{error}</div>}
      </div>
    </div>
  );
}
