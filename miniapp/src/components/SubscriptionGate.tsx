import { useState } from "react";
import { api, type SubscriptionChannel } from "../lib/api";
import { getTelegramWebApp } from "../lib/telegram";

interface Props {
  channels: SubscriptionChannel[];
  onPassed: () => void;
}

/**
 * Full-screen gate shown when the user hasn't joined all required channels.
 * Matches the bot-side gate's UX: subscribe links + a manual recheck button.
 */
export function SubscriptionGate({ channels, onPassed }: Props) {
  const [checking, setChecking] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  function openChannel(ch: SubscriptionChannel) {
    const url = ch.inviteLink
      ? ch.inviteLink
      : ch.username
        ? `https://t.me/${ch.username}`
        : null;
    if (!url) return;

    const webApp = getTelegramWebApp();
    if (webApp?.openTelegramLink && /^https?:\/\/t\.me\//i.test(url)) {
      webApp.openTelegramLink(url);
    } else if (webApp?.openLink) {
      webApp.openLink(url);
    } else {
      window.open(url, "_blank");
    }
  }

  async function handleRecheck() {
    setChecking(true);
    setHint(null);
    try {
      const result = await api.recheckSubscription();
      if (result.ok) {
        onPassed();
      } else {
        setHint("Не все подписки подтверждены");
      }
    } catch {
      setHint("Не удалось проверить подписки");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="subscription-gate">
      <div className="subscription-gate-card">
        <h1 className="subscription-gate-title">Доступ ограничен</h1>
        <p className="subscription-gate-desc">
          Чтобы пользоваться приложением, подпишитесь на&nbsp;каналы:
        </p>

        <ul className="subscription-gate-list">
          {channels.map((ch) => {
            const label = ch.title || (ch.username ? `@${ch.username}` : "Канал");
            const hasLink = !!(ch.inviteLink || ch.username);
            return (
              <li key={ch.title} className="subscription-gate-item">
                <button
                  type="button"
                  className="subscription-gate-channel"
                  disabled={!hasLink}
                  onClick={() => openChannel(ch)}
                >
                  <span className="subscription-gate-channel-name">{label}</span>
                  {hasLink && (
                    <span className="subscription-gate-channel-arrow">→</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          className="subscription-gate-recheck"
          disabled={checking}
          onClick={handleRecheck}
        >
          {checking ? "Проверяю…" : "Я вступил"}
        </button>

        {hint && (
          <p className="subscription-gate-hint">{hint}</p>
        )}
      </div>
    </div>
  );
}
