import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Cross-fades between screens. Deliberately has no direction: a forward/back
 * horizontal slide reads as the whole app drifting sideways inside Telegram's
 * narrow viewport, so the outgoing screen only fades out under the incoming one.
 */
export function ScreenTransition({
  kind,
  children,
}: {
  kind: string;
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
        <div className="screen-exit" key={`exit-${exiting.kind}`}>
          {exiting.content}
        </div>
      )}
      <div className={exiting ? "screen-enter" : ""} key={kind}>
        {children}
      </div>
    </div>
  );
}
