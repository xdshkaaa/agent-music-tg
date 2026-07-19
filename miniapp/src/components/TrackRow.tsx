import type { CSSProperties, ReactNode } from "react";

/**
 * Shared visual shell for every clickable track/playlist/download row across
 * the app: artwork (or icon fallback) + title/meta block + a trailing slot
 * for whatever action buttons that screen needs. Each screen keeps its own
 * download/save/playlist-add logic — this only kills the repeated markup.
 */
export function TrackRow({
  onClick,
  className,
  style,
  artwork,
  fallbackIcon,
  title,
  meta,
  metaClassName = "fs-label",
  trailing,
  ariaExpanded,
}: {
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  artwork?: string | null;
  fallbackIcon?: ReactNode;
  title: ReactNode;
  meta: ReactNode;
  metaClassName?: string;
  trailing?: ReactNode;
  ariaExpanded?: boolean;
}) {
  return (
    <div
      className={["track-row", className].filter(Boolean).join(" ")}
      style={style}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {artwork ? (
        <img className="track-artwork" src={artwork} alt="" />
      ) : (
        <div className={fallbackIcon ? "track-artwork track-artwork--icon" : "track-artwork"}>{fallbackIcon}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="search-row-title">{title}</p>
        <p className={`text-muted ${metaClassName}`}>{meta}</p>
      </div>
      {trailing}
    </div>
  );
}
