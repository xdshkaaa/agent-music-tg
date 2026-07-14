## Why

Текущий хедер — сплошная чёрная полоса (`var(--bg)` при 82% непрозрачности). Эффект `backdrop-filter: blur` не виден, стеклянная эстетика Liquid Glass отсутствует. Хедер выглядит как чёрное полотно, а не как часть премиальной glass-системы.

## What Changes

- Снизить opacity фона хедера, чтобы `backdrop-filter: blur` стал видимым — фон должен просвечивать сквозь стекло
- Добавить нижнюю границу (hairline) для визуального отделения от контента
- Перевести фон хедера с `color-mix(in srgb, var(--bg) …)` на glass-токены (`--glass-bg-dark/light`, `--glass-border-dark/light`)
- Согласовать `.wallet-pill` с glass-стилистикой (уберется border в пользу inset shadow)
- Плавный transition при скролле (header становится плотнее при скролле вниз — опционально)
- Адаптировать AdminSettingsBar чтобы визуально состыковался с новым хедером

## Capabilities

### New Capabilities
- `glass-header`: Прозрачный стеклянный хедер с видимым blur, bottom hairline, и согласованными glass-токенами

### Modified Capabilities

Нет существующих спецификаций для изменения.

## Impact

- `miniapp/src/styles/glass.css` — переопределить `.top-bar`, `.logo-chip`, `.wallet-pill`
- `miniapp/src/App.tsx` — возможные минимальные изменения разметки (если потребуется wrapper для header + admin bar)
- `miniapp/src/components/AdminSettingsBar.tsx` — визуальная стыковка с новым хедером
