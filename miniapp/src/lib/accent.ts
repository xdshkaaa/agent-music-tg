export const ACCENT_PRESETS = [
  { id: "pink", label: "Розовый", value: "#e0367a" },
  { id: "violet", label: "Фиолетовый", value: "#8b5cf6" },
  { id: "blue", label: "Синий", value: "#3b82f6" },
  { id: "teal", label: "Бирюзовый", value: "#14b8a6" },
  { id: "green", label: "Зелёный", value: "#22c55e" },
  { id: "amber", label: "Янтарный", value: "#d97706" },
  { id: "red", label: "Красный", value: "#ef4444" },
] as const;

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].value;

const ACCENT_STORAGE_KEY = "miniapp-accent";

export function initialAccent(): string {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
    if (stored && ACCENT_PRESETS.some((p) => p.value === stored)) return stored;
  }
  return DEFAULT_ACCENT;
}

export function applyAccent(value: string) {
  document.documentElement.style.setProperty("--accent", value);
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, value);
  } catch {
    // ignore storage failures (private mode etc.)
  }
}
