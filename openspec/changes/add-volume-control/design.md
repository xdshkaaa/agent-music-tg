## Context

Плеер использует общий `HTMLAudioElement` в `PlayerProvider` (`player.tsx`). Сейчас `audio.volume` не трогается (всегда 1). UI — `PlayerBar` с кнопкой play/pause, информацией о треке и прогресс-баром. Ползунка громкости нет.

Громкость нужно добавить как в API контекста, так и в UI. Уровень должен сохраняться между сессиями через `localStorage`.

## Goals / Non-Goals

**Goals:**
- `setVolume(v: number)` (0–1) и `toggleMute()` в `PlayerApi`
- Ползунок громкости в `PlayerBar` с иконкой динамика (меняется: `SpeakerHigh` / `SpeakerLow` / `SpeakerX`)
- Mute-toggle по клику на иконку
- Персистентность громкости в `localStorage`
- Кастомный стиль range input в glass-стилистике

**Non-Goals:**
- Не меняем логику работы `seek` / `toggle` / `progress`
- Не добавляем отдельный экран настроек громкости
- Не добавляем音量控制 в отдельные треки (глобальная громкость плеера)
- Не добавляем crossfade или эквалайзер

## Decisions

**1. Хранить volume и muted в состоянии PlayerProvider, синхронизировать с `<audio>`.**
`volume` (0–1) и `muted` (boolean) в `PlayerState`. `setVolume` меняет `audio.volume` и `localStorage`. `toggleMute` запоминает предыдущий уровень в `prevVolume` (в `useRef`), чтобы при unmute восстановить его, а не прыгать на 1.
*Альтернатива:* хранить в отдельном контексте — отклонено: громкость — часть плеера, незачем плодить контексты.

**2. UI: иконка динамика слева, ползунок справа от неё, между player-info и player-progress.**
В `PlayerBar` добавить ряд: `SpeakerX`/`SpeakerLow`/`SpeakerHigh` + `<input type="range">`. Иконка показывает состояние (muted / low / high). Ползунок управляет `player.setVolume()`. Ширина ползунка ~80px.
При маленьких экранах (ширина < 360px) ползунок скрывается, остаётся только иконка (toggle mute). Реализовать через CSS media query.

**3. Персистентность через localStorage с ключом `player:volume`.**
Читать при монтировании `PlayerProvider` (один раз, в `useEffect` с `[]`). Писать при каждом вызове `setVolume`. Если в хранилище нет значения — default 0.7 (умеренная громкость).

**4. Кастомный range input в стиле glass.**
Стандартный `<input type="range">` стилизуется через `-webkit-appearance: none` с кастомным треком и ползунком, используя цвета `--accent` и `--hairline`.

**5. Иконки из @phosphor-icons/react уже подключены.**
Использовать `SpeakerHigh`, `SpeakerLow`, `SpeakerX` (все `size={18}`). Выбор иконки: `muted` → `SpeakerX`; `volume > 0.5` → `SpeakerHigh`; иначе `SpeakerLow`.

## Risks / Trade-offs

- **localStorage может быть недоступен (Telegram WebView в iOS)** → обернуть в try/catch, при ошибке игнорировать
- **Кастомный range input может выглядеть по-разному на разных платформах** → используем `-webkit-slider-*` псевдоэлементы, для Android Telegram WebView WebKit-based — ок.
- **Слишком мелкий ползунок на мобильных** → touch-target минимум 32px по высоте (через padding на треке)
- **Громкость не синхронизируется между вкладками / устройствами** → non-goal, плеер живёт в одной вкладке
