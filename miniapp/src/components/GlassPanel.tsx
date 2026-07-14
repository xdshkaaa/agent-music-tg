import type { ReactNode } from "react";

type GlassTone = "regular" | "subtle" | "prominent" | "tinted";

export function GlassPanel({
  children,
  className,
  role,
  tone = "regular",
  interactive,
  as,
  style,
}: {
  children: ReactNode;
  className?: string;
  role?: string;
  tone?: GlassTone;
  interactive?: boolean;
  as?: "div" | "button";
  style?: React.CSSProperties;
}) {
  const cls = [
    "glass-surface",
    `glass-${tone}`,
    interactive ? "glass-interactive" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const commonProps = {
    className: cls,
    role: role ?? (interactive ? "button" : undefined),
    tabIndex: interactive ? 0 : undefined,
    "data-interactive": interactive ? "" : undefined,
    style,
  } as Record<string, unknown>;

  if (as === "button") {
    return (
      <button type="button" {...commonProps}>
        {children}
      </button>
    );
  }

  return <div {...commonProps}>{children}</div>;
}
