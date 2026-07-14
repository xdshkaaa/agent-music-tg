## ADDED Requirements

### Requirement: Data-атрибут `[data-interactive]`

Любой glass-элемент SHALL поддерживать data-атрибут `[data-interactive]`, который добавляет:
- `cursor: pointer`
- `transition` всех glass-свойств (background, box-shadow, transform, border-color)
- Hover: `background` светлеет на 10%, `transform: scale(1.02)`, `box-shadow` усиливается
- Active: `transform: scale(0.97)`, `box-shadow` становится более плоским (`--glass-shadow-sm`)
- `prefers-reduced-motion`: отключение transform-анимаций

#### Scenario: Hover на interactive glass
- **WHEN** пользователь наводит курсор на элемент с `[data-interactive]`
- **AND** `@media (hover: hover)` активен
- **THEN** элемент масштабируется до 1.02, background становится светлее, тень глубже

#### Scenario: Active на interactive glass
- **WHEN** пользователь нажимает на элемент с `[data-interactive]`
- **THEN** элемент масштабируется до 0.97, box-shadow меняется на `--glass-shadow-sm`

#### Scenario: Reduced motion
- **WHEN** пользователь предпочитает `prefers-reduced-motion: reduce`
- **THEN** transform-анимации отключены, transition-duration = 0.01ms

### Requirement: Interactive GlassPanel

Компонент `GlassPanel` SHALL принимать проп `interactive?: boolean`. Когда `interactive` равен `true`, компонент рендерит `data-interactive` и может рендериться как `<button>` при пропе `as="button"`.

#### Scenario: GlassPanel interactive как button
- **WHEN** `<GlassPanel interactive as="button" onClick={fn}>` рендерится
- **THEN** это `<button type="button" class="glass-surface glass-regular" data-interactive>`

#### Scenario: GlassPanel interactive как div
- **WHEN** `<GlassPanel interactive>` рендерится
- **THEN** это `<div class="glass-surface glass-regular" data-interactive role="button" tabIndex={0}>`

### Requirement: Glass-кнопки с интерактивностью

Классы `.glass-button` и `.action-btn` SHALL использовать `[data-interactive]`-подобные состояния через существующие CSS-правила (:hover, :active). Primary-кнопки с tint сохраняют accent-градиент, добавляют свечение при hover (box-shadow с tint-цветом).

#### Scenario: Primary button hover
- **WHEN** `.glass-button.primary` наведён
- **THEN** добавляется внешняя тень `0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)`

### Requirement: Glass инпуты

Класс `.glass-input` SHALL использовать `--glass-blur-subtle` и при `:focus-visible` получать tinted border (уже реализовано). Добавить glow-эффект при фокусе (box-shadow с tint-цветом).

#### Scenario: Input focus glow
- **WHEN** `.glass-input` в фокусе
- **THEN** border становится `var(--accent)`, box-shadow: `0 0 0 3px var(--accent-bg)`
