import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MagnifyingGlass,
  MusicNotes,
  Sparkle,
} from "@phosphor-icons/react";

const EXAMPLES = [
  "Спокойный инди-поп для вечерней прогулки",
  "Энергичный рэп для тренировки",
  "Неоновая электроника для ночной дороги",
];

export function Onboarding({
  onSkip,
  onStart,
}: {
  onSkip: () => void;
  onStart: (prompt: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [example, setExample] = useState(EXAMPLES[0]);
  const lastStep = step === 2;

  return (
    <main className="onboarding-screen">
      <div className="onboarding-shell">
        <header className="onboarding-topbar">
          <span className="onboarding-progress" aria-label={`Шаг ${step + 1} из 3`}>
            {step + 1} из 3
          </span>
          <button type="button" className="onboarding-skip" onClick={onSkip}>
            Пропустить
          </button>
        </header>

        <div className="onboarding-dots" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span key={index} className={index <= step ? "is-active" : undefined} />
          ))}
        </div>

        <section className="onboarding-content" aria-live="polite">
          {step === 0 && (
            <div className="onboarding-step" key="welcome">
              <span className="onboarding-icon" aria-hidden="true">
                <MusicNotes size={30} weight="fill" />
              </span>
              <div>
                <h1>Музыка под твой момент</h1>
                <p className="onboarding-lead">
                  Опиши настроение или занятие одной фразой — агент соберёт плейлист, который можно сразу слушать.
                </p>
              </div>
              <div className="onboarding-prompt-preview" aria-label="Пример запроса">
                <span>Музыка для неспешного утра без вокала</span>
                <span className="onboarding-send-preview" aria-hidden="true">
                  <ArrowRight size={18} weight="bold" />
                </span>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="onboarding-step" key="modes">
              <span className="onboarding-icon" aria-hidden="true">
                <Sparkle size={30} weight="fill" />
              </span>
              <div>
                <h1>Два способа найти музыку</h1>
                <p className="onboarding-lead">Начни с того, что уже знаешь. Переключиться можно в любой момент.</p>
              </div>
              <div className="onboarding-mode-list">
                <div className="onboarding-mode-row">
                  <Sparkle size={22} weight="fill" aria-hidden="true" />
                  <span><strong>AI-подбор</strong><small>Для настроения, ситуации или нового звучания</small></span>
                </div>
                <div className="onboarding-mode-row">
                  <MagnifyingGlass size={22} weight="bold" aria-hidden="true" />
                  <span><strong>Поиск</strong><small>Для конкретного трека, артиста или альбома</small></span>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="onboarding-step" key="first-prompt">
              <span className="onboarding-icon" aria-hidden="true">
                <Check size={30} weight="bold" />
              </span>
              <div>
                <h1>Начнём с готового запроса</h1>
                <p className="onboarding-lead">Выбери вариант — он появится в поле ввода, и его можно будет изменить.</p>
              </div>
              <div className="onboarding-examples" role="radiogroup" aria-label="Пример первого запроса">
                {EXAMPLES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="radio"
                    aria-checked={example === item}
                    className={`onboarding-example${example === item ? " is-selected" : ""}`}
                    onClick={() => setExample(item)}
                  >
                    <span>{item}</span>
                    <Check size={17} weight="bold" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <footer className="onboarding-actions">
          {step > 0 && (
            <button type="button" className="glass-button onboarding-back" onClick={() => setStep((value) => value - 1)}>
              <ArrowLeft size={17} weight="bold" />
              Назад
            </button>
          )}
          <button
            type="button"
            className="glass-button primary onboarding-next"
            onClick={() => lastStep ? onStart(example) : setStep((value) => value + 1)}
          >
            {lastStep ? "Попробовать" : "Продолжить"}
            <ArrowRight size={17} weight="bold" />
          </button>
        </footer>
      </div>
    </main>
  );
}
