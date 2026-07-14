import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";

export function IconOrEmoji({ icon, size, fallback }: {
  icon?: string | null;
  size: number;
  fallback?: ReactNode;
}) {
  const [errored, setErrored] = useState(false);

  if (!icon || errored) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: "var(--accent)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {fallback}
      </span>
    );
  }

  const isUrl = icon.startsWith("http://") || icon.startsWith("https://");

  if (isUrl) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        } satisfies CSSProperties}
      >
        <img
          src={icon}
          alt=""
          loading="lazy"
          onError={() => setErrored(true)}
          style={{
            width: size,
            height: size,
            borderRadius: "50%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontSize: size * 0.6,
        lineHeight: 1,
        overflow: "hidden",
      }}
    >
      {icon}
    </span>
  );
}
