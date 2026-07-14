import { useEffect, useRef, useState, type ReactNode } from "react";

export function ScreenTransition({
  kind,
  direction = "forward",
  children,
}: {
  kind: string;
  direction?: "forward" | "back";
  children: ReactNode;
}) {
  const [exiting, setExiting] = useState<{
    kind: string;
    content: ReactNode;
  } | null>(null);

  const prevKind = useRef(kind);
  const prevChildren = useRef<ReactNode>(null);

  if (kind !== prevKind.current) {
    setExiting({
      kind: prevKind.current,
      content: prevChildren.current,
    });
    prevKind.current = kind;
  }
  prevChildren.current = children;

  useEffect(() => {
    if (!exiting) return;
    const id = setTimeout(() => setExiting(null), 280);
    return () => clearTimeout(id);
  }, [exiting]);

  return (
    <div className="screen-stack">
      {exiting && (
        <div
          className={`screen-exit ${direction === "back" ? "screen-exit-back" : "screen-exit-forward"}`}
          key={`exit-${exiting.kind}`}
        >
          {exiting.content}
        </div>
      )}
      <div
        className={
          exiting
            ? `screen-enter ${direction === "back" ? "screen-enter-back" : "screen-enter-forward"}`
            : ""
        }
        key={kind}
      >
        {children}
      </div>
    </div>
  );
}
