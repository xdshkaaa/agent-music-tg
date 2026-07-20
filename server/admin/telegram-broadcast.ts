import { Bot, InlineKeyboard, InputFile } from "grammy";
import type { InputFile as InputFileType } from "grammy";
import type {
  BroadcastButtonPreset,
  BroadcastMedia,
  BroadcastMessage,
  BroadcastSendFn,
} from "./broadcast";
import type { BotContext } from "../bot/context";
import { btnText } from "../bot/emoji";

interface SentMediaMessage {
  photo?: Array<{ file_id: string }>;
  animation?: { file_id: string };
  video?: { file_id: string };
  document?: { file_id: string };
}

const BUTTONS: Record<BroadcastButtonPreset, { label: string; symbol: string; query: string }> = {
  open_app: { label: "Открыть приложение", symbol: "app", query: "" },
  search: { label: "Поиск", symbol: "search", query: "?tab=create&mode=search" },
  playlists: { label: "Мои плейлисты", symbol: "music", query: "?tab=playlists" },
  profile: { label: "Профиль", symbol: "profile", query: "?tab=profile" },
};

export function buildBroadcastKeyboard(
  buttons: readonly BroadcastButtonPreset[],
  publicOrigin: string,
): InlineKeyboard | undefined {
  if (buttons.length === 0) return undefined;
  const keyboard = new InlineKeyboard();
  buttons.forEach((preset, index) => {
    const button = BUTTONS[preset];
    keyboard.webApp(btnText(button.label, button.symbol), `${publicOrigin}${button.query}`);
    if (index < buttons.length - 1) keyboard.row();
  });
  return keyboard;
}

function uploadedFileId(message: SentMediaMessage, kind: BroadcastMedia["kind"]): string | undefined {
  switch (kind) {
    case "photo":
      return message.photo?.at(-1)?.file_id;
    case "animation":
      return message.animation?.file_id;
    case "video":
      return message.video?.file_id;
    case "document":
      return message.document?.file_id;
  }
}

/**
 * Builds the transport used by both bot-admin and Mini App broadcasts.
 * Once the first recipient accepts an upload, later recipients reuse its
 * Telegram file_id instead of uploading the same bytes for every user.
 */
export function createTelegramBroadcastSender(bot: Bot<BotContext>, publicOrigin: string): BroadcastSendFn {
  const uploadedMedia = new WeakMap<BroadcastMedia, string>();

  return async (chatId: number, message: BroadcastMessage): Promise<void> => {
    const replyMarkup = buildBroadcastKeyboard(message.buttons, publicOrigin);
    if (!message.media) {
      await bot.api.sendMessage(chatId, message.text, {
        ...(message.parseMode === "HTML" ? { parse_mode: "HTML" as const } : {}),
        reply_markup: replyMarkup,
      });
      return;
    }

    const media = message.media;
    const cachedFileId = uploadedMedia.get(media);
    const source: string | InputFileType = cachedFileId ?? new InputFile(media.data, media.filename);
    const options = {
      caption: message.text || undefined,
      ...(message.parseMode === "HTML" ? { parse_mode: "HTML" as const } : {}),
      reply_markup: replyMarkup,
    };
    let sent: SentMediaMessage;
    switch (media.kind) {
      case "photo":
        sent = await bot.api.sendPhoto(chatId, source, options);
        break;
      case "animation":
        sent = await bot.api.sendAnimation(chatId, source, options);
        break;
      case "video":
        sent = await bot.api.sendVideo(chatId, source, options);
        break;
      case "document":
        sent = await bot.api.sendDocument(chatId, source, options);
        break;
    }

    const fileId = uploadedFileId(sent, media.kind);
    if (fileId) uploadedMedia.set(media, fileId);
  };
}
