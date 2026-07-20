import { CaretDown, ChatCircle, PlayCircle, Sparkle } from "@phosphor-icons/react";
import { GlassPanel } from "../components/GlassPanel";
import { openSupport } from "../lib/telegram";

const FAQ = [
  {
    question: "Как лучше сформулировать запрос?",
    answer: "Укажи настроение, ситуацию и один-два ориентира: жанр, темп, эпоху или язык. Например: «спокойный соул для поздней работы, без тяжёлого баса».",
  },
  {
    question: "Чем AI-подбор отличается от поиска?",
    answer: "AI-подбор собирает новый плейлист по свободному описанию. Поиск нужен, когда ты уже знаешь название трека, артиста или альбома.",
  },
  {
    question: "Откуда берутся треки?",
    answer: "Музыка приходит из YouTube Music или SoundCloud. Источник можно сменить в профиле — подключать музыкальный аккаунт не нужно.",
  },
  {
    question: "Где найти сохранённую музыку?",
    answer: "Плейлисты, избранные треки и загрузки собраны во вкладке «Музыка». Сохранённый плейлист можно открыть снова и продолжить слушать.",
  },
  {
    question: "Как скачать трек или плейлист?",
    answer: "Нажми кнопку загрузки рядом с треком или «Скачать» в готовом плейлисте. Аудио придёт сообщениями в чат с ботом; статус загрузки виден во вкладке «Музыка».",
  },
  {
    question: "Почему отдельный трек может не играть?",
    answer: "Источник иногда удаляет запись или ограничивает доступ. Приложение проверяет треки и скрывает недоступные; если воспроизведение всё же не началось, выбери соседний трек или создай подбор заново.",
  },
  {
    question: "Как работают генерации и подписка?",
    answer: "Один новый AI-плейлист расходует генерацию. Остаток виден в верхней панели и профиле. Пополнить баланс или оформить подписку можно во вкладке «Магазин».",
  },
];

const SUPPORT_URL = "https://t.me/litteralIy";

export default function HelpScreen({
  onReplayOnboarding,
  onStart,
}: {
  onReplayOnboarding: () => void;
  onStart: () => void;
}) {
  return (
    <div className="stack help-screen">
      <GlassPanel className="reveal help-intro">
        <span className="help-intro-icon" aria-hidden="true"><Sparkle size={24} weight="fill" /></span>
        <div>
          <h1 className="help-title">Помощь</h1>
          <p className="text-muted fs-label">Коротко о том, как быстрее перейти от идеи к музыке.</p>
        </div>
      </GlassPanel>

      <GlassPanel className="reveal">
        <h2 className="screen-title">Быстрый старт</h2>
        <ol className="help-steps">
          <li><span>1</span><p><strong>Опиши момент</strong><small>Настроение, занятие и музыкальные ориентиры.</small></p></li>
          <li><span>2</span><p><strong>Уточни, если попросит агент</strong><small>Один ответ помогает точнее собрать плейлист.</small></p></li>
          <li><span>3</span><p><strong>Слушай или отправь в Telegram</strong><small>Сохрани результат, скачай всё или отдельный трек.</small></p></li>
        </ol>
        <button type="button" className="glass-button primary help-start-button" onClick={onStart}>
          <Sparkle size={17} weight="fill" />
          Создать плейлист
        </button>
      </GlassPanel>

      <GlassPanel className="reveal">
        <h2 className="screen-title help-faq-title">Частые вопросы</h2>
        <div className="faq-list">
          {FAQ.map((item) => (
            <details key={item.question} className="faq-item">
              <summary>
                <span>{item.question}</span>
                <CaretDown size={18} weight="bold" aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </GlassPanel>

      <GlassPanel className="reveal help-actions-panel">
        <h2 className="screen-title">Нужна ещё помощь?</h2>
        <p className="text-muted fs-label">Знакомство можно пройти снова — или написать в поддержку, если вопрос не решился.</p>
        <div className="help-actions">
          <button type="button" className="glass-button" onClick={onReplayOnboarding}>
            <PlayCircle size={17} weight="bold" />
            Повторить знакомство
          </button>
          <button type="button" className="glass-button" onClick={() => openSupport(SUPPORT_URL)}>
            <ChatCircle size={17} weight="bold" />
            Написать в поддержку
          </button>
        </div>
      </GlassPanel>
    </div>
  );
}
