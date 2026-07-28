import { accent, heading } from "./emoji";

/** Escapes dynamic values before they are inserted into Telegram HTML. */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Consistent first line for user-facing bot messages. */
export function messageTitle(symbol: string, title: string): string {
  return `<b>${heading(symbol, escapeHtml(title))}</b>`;
}

/** Quiet supporting copy below a title. */
export function messageHint(text: string): string {
  return `<i>${escapeHtml(text)}</i>`;
}

/** Visually groups related facts without turning them into a dense paragraph. */
export function detailBlock(lines: string[]): string {
  return `<blockquote>${lines.join("\n")}</blockquote>`;
}

/** One icon + bold label + value row for profile/stat messages. */
export function detailRow(symbol: string, label: string, value: unknown): string {
  const icon = accent(symbol);
  return `${icon ? icon + " " : ""}<b>${escapeHtml(label)}</b>  ${escapeHtml(value)}`;
}

/** "1 трек" / "2 трека" / "5 треков" — Russian counts read wrong without this. */
export function formatTrackCount(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const form = mod100 >= 11 && mod100 <= 14
    ? "треков"
    : mod10 === 1
      ? "трек"
      : mod10 >= 2 && mod10 <= 4
        ? "трека"
        : "треков";
  return `${count} ${form}`;
}

/** Short status message with a strong outcome and optional explanation. */
export function statusMessage(symbol: string, title: string, body?: string): string {
  return [messageTitle(symbol, title), body ? `\n${escapeHtml(body)}` : ""].join("");
}
