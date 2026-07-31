/**
 * Decides whether a pointer's travel since the gesture started should engage
 * the player card's swipe-to-close (see PlayerScreen's onPointerDown/Move).
 *
 * Two guards, both required:
 * - `slop`: a few px of jitter — the initial touch/click settling — must not
 *   register as a gesture at all, or every tap would flicker the card.
 * - axis dominance (`|dy| > |dx|`): a mostly-horizontal drag (or a diagonal
 *   one) must not engage, so it can't fight a horizontal scroller/carousel
 *   nested inside the card, and a few stray vertical px during a horizontal
 *   drag can't nudge the card down.
 *
 * Pure so the threshold behaviour is testable without a DOM or real pointer
 * events — mirrors lib/keyboard.ts's keyboardOverlap/isKeyboardOpen split.
 */
export function shouldEngageVerticalSwipe(dx: number, dy: number, slop = 10): boolean {
  const distance = Math.max(Math.abs(dx), Math.abs(dy));
  if (distance < slop) return false;
  return Math.abs(dy) > Math.abs(dx);
}
