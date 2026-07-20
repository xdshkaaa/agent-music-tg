export const ONBOARDING_STORAGE_KEY = "miniapp-onboarding-v1";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

export function shouldShowOnboarding(storage?: ReadableStorage): boolean {
  try {
    const target = storage ?? localStorage;
    return target.getItem(ONBOARDING_STORAGE_KEY) !== "done";
  } catch {
    return true;
  }
}

export function completeOnboarding(storage?: WritableStorage): void {
  try {
    const target = storage ?? localStorage;
    target.setItem(ONBOARDING_STORAGE_KEY, "done");
  } catch {
    // A private or restricted WebView may not expose localStorage. The app
    // remains usable; onboarding can simply appear again on a later launch.
  }
}
