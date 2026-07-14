import type { ReactNode } from "react";

export function EmptyState({
  icon,
  label,
  action,
}: {
  icon: ReactNode;
  label: string;
  action?: { label: string; onClick: () => void } | null;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "16px 0" }}>
      <span className="chevron">{icon}</span>
      <p className="text-muted">{label}</p>
      {action && (
        <button type="button" className="glass-button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
