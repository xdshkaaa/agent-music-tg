import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { DotsThreeVertical } from "@phosphor-icons/react";

export interface TrackMenuAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

/** Kebab menu holding a track row's secondary actions (download, add to playlist, remove…). */
export function TrackOverflowMenu({ actions, ariaLabel = "Действия с треком" }: { actions: TrackMenuAction[]; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  itemRefs.current.length = actions.length;

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDocPointer);
    return () => document.removeEventListener("pointerdown", onDocPointer);
  }, [open]);

  useEffect(() => {
    if (!open || !ref.current) return;
    // Estimate popover height (44px per row + 12px padding) so it can flip
    // upward instead of spilling over the rows/player bar below it.
    const estimatedHeight = actions.length * 44 + 12;
    const spaceBelow = window.innerHeight - ref.current.getBoundingClientRect().bottom;
    setOpenUpward(spaceBelow < estimatedHeight + 16);
  }, [open, actions.length]);

  // APG menu-button pattern: opening moves focus to the first enabled item.
  useEffect(() => {
    if (!open) return;
    const firstEnabled = actions.findIndex((a) => !a.disabled);
    itemRefs.current[firstEnabled < 0 ? 0 : firstEnabled]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close(restoreFocus: boolean) {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }

  /** Moves focus from `from` in `delta` steps, skipping disabled items, with wraparound. */
  function moveFocus(from: number, delta: 1 | -1) {
    const count = actions.length;
    if (count === 0) return;
    let i = from;
    for (let step = 0; step < count; step++) {
      i = (i + delta + count) % count;
      if (!actions[i]!.disabled) {
        itemRefs.current[i]?.focus();
        return;
      }
    }
  }

  function onItemKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveFocus(index, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(index, -1);
        break;
      case "Home":
        e.preventDefault();
        moveFocus(-1, 1);
        break;
      case "End":
        e.preventDefault();
        moveFocus(0, -1);
        break;
      case "Escape":
        // No natural focus target opens here (unlike a dialog), so — unlike
        // the outside-pointer dismissal below — Escape restores focus itself.
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case "Tab":
        // Let Tab continue to whatever's next in the page's own order.
        setOpen(false);
        break;
    }
  }

  return (
    <div className="track-menu" ref={ref}>
      <button
        type="button"
        ref={triggerRef}
        className="icon-btn"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <DotsThreeVertical size={18} weight="bold" />
      </button>
      {open && (
        <div
          className={`track-menu-popover glass-surface glass-regular${openUpward ? " track-menu-popover--up" : ""}`}
          role="menu"
          aria-label={ariaLabel}
        >
          {actions.map((a, i) => (
            <button
              key={a.key}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className={`track-menu-item${a.destructive ? " destructive" : ""}`}
              disabled={a.disabled}
              onKeyDown={(e) => onItemKeyDown(e, i)}
              onClick={(e) => {
                e.stopPropagation();
                close(true);
                a.onClick();
              }}
            >
              {a.icon}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
