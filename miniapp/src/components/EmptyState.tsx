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
    <div className="empty-state">
      <span className="chevron" aria-hidden="true">{icon}</span>
      <p className="text-muted">{label}</p>
      {action && (
        <button type="button" className="glass-button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
