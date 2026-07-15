# Design: `add_to_playlist` (расширение плейлиста)

## Обзор

«Плейлист» в системе — это локальный массив `Track[]`, который агент собирает
через инструменты и финализирует один раз. Расширение плейлиста = запуск новой
генерации в режиме `extend`, где базовые треки подаются агенту как read-only
контекст, а новые треки агент добавляет через инструмент `add_to_playlist`. Итог
= база ∪ добавления (с дедупликацией), резолвится в `Track[]` и сохраняется
поверх существующей записи `generations`.

## Поток данных

```
Mini App «Добавить треки» (generationId + prompt)
  → POST /api/generate/extend/stream
  → extendGeneration(db, chatId, generationId, prompt)
      → getGeneration(chatId, generationId)            // владение + tracks_json
      → generatePlaylist({ mode:"extend", baseTracks, baseName, systemPrompt })
          → агент: searchTracks / add_to_playlist* / finalize_playlist
          → resolveAndFinalize(base ∪ added)           // база резолвится повторно
      → appendTracksToGeneration(generationId, merged, name)
      → consumeAccess + fireVerification
  → SSE: agent_event* + outcome { status:"ok", playlist, generationId }
  → Mini App сливает playlist.tracks в отображаемый список
```

## Схема БД

Миграция в `server/db.ts` (в блок `try { ... } catch {}`, как соседние):

```sql
ALTER TABLE generations ADD COLUMN tracks_json TEXT;
```

`server/access/generations-store.ts`:
- `insertGeneration(...)` возвращает `number` (последний `lastInsertRowid`).
- `GenerationRow` + `GenerationRowRaw`: добавить `tracks: Track[]` (парсим
  `tracks_json`; пусто/невалидно → `[]`).
- `getGeneration(db, chatId, id): GenerationRow | null` — `WHERE id=? AND chat_id=?`.
- `appendTracksToGeneration(db, id, tracks: Track[], name?: string)` —
  перезаписывает `tracks_json` (полный объединённый список), `track_count`,
  опционально `playlist_name`.

Тип `Track` импортируется из `../music/types`.

## Агент-инструмент `add_to_playlist`

`server/agent/tools.ts`:

```ts
const addToPlaylistSpec: ToolSpec = {
  name: "add_to_playlist",
  description:
    "Append tracks to the playlist being extended. Call one or more times while " +
    "extending an existing playlist; each call queues the given tracks. Do NOT " +
    "include tracks already in the existing playlist (they are shown in the system " +
    "prompt). The harness merges these into the final playlist on finalize_playlist.",
  parameters: {
    type: "object",
    properties: {
      tracks: {
        type: "array",
        description: "Tracks to add. No more than 2-3 tracks per artist.",
        items: {
          type: "object",
          properties: { artist: { type: "string" }, title: { type: "string" } },
          required: ["artist", "title"],
        },
        minItems: 1,
      },
    },
    required: ["tracks"],
  },
};
```

Включить в `MUSIC_AGENT_TOOLS`. Обрабатывается в цикле как `clarify`/`finalize`
(не через сетевой `dispatchTool`): парсим треки, дедуплицируем против
`base + added`, добавляем в `addedTracks`, возвращаем tool-сообщение
`"Added N track(s). Playlist now has M track(s)."`.

## Цикл генерации (`generate-playlist.ts`)

`GeneratePlaylistOptions`:
```ts
mode?: "create" | "extend";          // default "create"
baseTracks?: { artist: string; title: string }[];
baseName?: string;
systemPrompt?: string;               // override PLAYLIST_SYSTEM_PROMPT
```

Состояние в `generatePlaylist`:
- `addedTracks: { artist: string; title: string }[] = []`.

Классификация вызовов (фаза 1, как `clarify`/`finalize`):
- `add_to_playlist` → парсим `tracks`, дедуп (по `artist|title` в lower-case)
  против `baseTracks` + `addedTracks`, добавляем, пушим tool-сообщение с
  прогрессом. Не помечаем как `finalizeCall`.

`finalize_playlist`:
- create: как сейчас (`resolveAndFinalize(args.tracks)`).
- extend: `allRequested = dedupe([...baseTracks, ...addedTracks, ...finalize.tracks])`;
  `resolveAndFinalize(allRequested, { allowEmptyIfBase: true })`.
  Имя: `args.name || baseName`.

`resolveAndFinalize`:
- сигнатура `resolveAndFinalize(music, args, cache, opts?: { baseProvided?: boolean })`.
- `NoTracksResolvedError` бросаем только если итог пуст И (`!baseProvided` или
  base тоже не резолвилась). В extend-режиме, если резолвились только базовые
  треки — это успех.

Промпт: `opts.provider.generateMessages(opts.systemPrompt ?? PLAYLIST_SYSTEM_PROMPT, ...)`.

## Системный промпт расширения (`prompts.ts`)

```ts
export function buildExtendSystemPrompt(
  existingName: string,
  existingTracks: { artist: string; title: string }[],
): string {
  const list = existingTracks.map((t, i) => `${i + 1}. ${t.artist} — ${t.title}`).join("\n");
  return `${PLAYLIST_SYSTEM_PROMPT}\n\n` +
    `EXTEND MODE: you are adding tracks to an EXISTING playlist titled "${existingName}".\n` +
    `Current tracks (DO NOT re-add these, they are already in the playlist):\n${list}\n\n` +
    `Use add_to_playlist to queue new tracks, then call finalize_playlist once ` +
    `(its "tracks" may be empty if you already queued everything via add_to_playlist). ` +
    `Aim to add ~5 new tracks unless the user asked for a specific count.`;
}
```

## Точка входа и API

`run-generation.ts`:
- `startGeneration` / `resumeGeneration`: `insertGeneration` теперь возвращает id;
  пишем `tracks_json`; `outcome.ok` содержит `generationId`.
- `extendGeneration(db, chatId, generationId, prompt, onEvent?)`:
  - `hasAccess` → `needs_purchase`.
  - `getGeneration` → null/не владелец → `error`.
  - `buildRunInputs`; база = `row.tracks` → `{artist,title}[]`.
  - `generatePlaylist({ provider, music, prompt, mode:"extend", baseTracks, baseName: row.playlistName, systemPrompt: buildExtendSystemPrompt(...), onEvent })`.
  - ok → `appendTracksToGeneration(generationId, playlist.tracks, playlist.name)`,
    `consumeAccess`, `fireVerification`, возврат `outcome` с `generationId`.

  Расширение списывает кредит как обычная генерация (консистентно).

`routes.ts`:
- `POST /generate/extend` (body `{ generationId:number, prompt:string }`).
- `POST /generate/extend/stream` — SSE.
- `/generate`, `/generate/stream`, `/generate/resume`, `/generate/resume/stream`
  возвращают `generationId` в `outcome.ok`.

`GenerationOutcome`:
```ts
export type GenerationOutcome =
  | { status: "ok"; playlist: FinalizedPlaylist; generationId: number }
  | { status: "clarify"; question: string; options: string[]; messages: AgentMessage[] }
  | { status: "needs_purchase" }
  | { status: "error"; message: string };
```

## Mini App

`miniapp/src/lib/api.ts`:
- `GenerateOutcome.ok` → `generationId: number`.
- `extendStream(generationId, prompt, onEvent)` → `/api/generate/extend/stream`.

`miniapp/src/screens/ResultsScreen.tsx`:
- хранить `generationId` из ответа генерации;
- действие «Добавить треки»: открывает ввод запроса, стримит `extendStream`,
  по `outcome.ok` сливает `playlist.tracks` в отображаемый список (заменяет
  состояние плейлиста на возвращённый, т.к. он уже содержит базу+добавления).

## Тесты

- `generations-store.test.ts`: `getGeneration`, `appendTracksToGeneration`,
  парсинг `tracks_json`, возврат id из `insertGeneration`.
- `generate-playlist.test.ts`: extend-режим — `add_to_playlist` копит треки,
  финализация объединяет с базой, дедуп, не бросает ошибку если добавления не
  резолвились, но база есть.
- `server/api/generate-stream.test.ts`: добавить мок `extendGeneration`.
