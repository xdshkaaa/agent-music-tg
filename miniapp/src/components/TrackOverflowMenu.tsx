import { useEffect, useRef, useState } from "react";
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

  return (
    <div className="track-menu" ref={ref}>
      <button
        type="button"
        className="icon-btn track-menu-btn"
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
        >
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className={`track-menu-item${a.destructive ? " destructive" : ""}`}
              disabled={a.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
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
