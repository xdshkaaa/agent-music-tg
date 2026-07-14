## 1. Remove YouTube link from ResultsScreen

- [x] 1.1 Удалить блок `<a>` с `deepLink` и иконкой `ArrowSquareOut` (строки 63–73) в `miniapp/src/screens/ResultsScreen.tsx`
- [x] 1.2 Удалить импорт `ArrowSquareOut` из `phosphor-react` в `ResultsScreen.tsx` (только если он больше нигде не используется — проверить `grep -r ArrowSquareOut`)
- [x] 1.3 Проверить сборку Mini App (`bun run build:miniapp`)
