## ADDED Requirements

### Requirement: Dock tab morphing

Нижняя навигация (dock) SHALL анимировать активный таб при переключении:
- Активный таб получает `background: var(--accent-bg)` и `color: var(--accent)`, неактивные — прозрачный фон с muted цветом
- Переход фона и цвета использует `--glass-transition-morph`
- При смене активного таба элементы dock-inner пересчитывают layout с CSS transition на группе

#### Scenario: Переключение таба dock
- **WHEN** пользователь нажимает на неактивный таб
- **THEN** предыдущий активный таб теряет accent-стили за `0.35s cubic-bezier(0.16,1,0.3,1)`, новый таб их получает за то же время
- **AND** вся группа `.dock-inner` не дёргается (фиксированная ширина)

### Requirement: Segmented control morphing

Компонент `Segmented` SHALL анимировать индикатор активной опции:
- `.segmented-indicator` использует `--glass-tinted` класс
- Позиция индикатора анимируется через `transform: translateX()` и `width`
- Transition: `--glass-transition-morph`

#### Scenario: Переключение сегмента
- **WHEN** пользователь нажимает на опцию в Segmented
- **THEN** позиция индикатора (translateX) и ширина (width) плавно меняются за `--glass-transition-morph`

### Requirement: Glass-эффект слияния

Dock-inner SHALL использовать групповой glass-эффект через единый `.glass-surface.glass-regular` на контейнере, а не на каждом табе. Это создаёт эффект единого стеклянного блока с "плавающими" табами внутри.

#### Scenario: Единый glass контейнер dock
- **WHEN** dock отображается
- **THEN** `.dock-inner` имеет `backdrop-filter` и border, а отдельные табы не имеют собственного glass-эффекта (только background для active)

### Requirement: Screen transition morphing

ScreenTransition SHALL поддерживать анимацию между glass-экранами:
- Exit-анимация: opacity 1→0, translateX 0→±20px
- Enter-анимация: opacity 0→1, translateX ±30px→0
- Оба используют `cubic-bezier(0.22, 1, 0.36, 1)` (уже реализовано)

#### Scenario: Переход между экранами
- **WHEN** пользователь открывает новый экран
- **THEN** старый экран анимируется с screen-exit, новый с screen-enter
