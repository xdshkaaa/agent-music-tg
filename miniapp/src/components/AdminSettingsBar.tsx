import { GlassPanel } from "./GlassPanel";
import { Segmented } from "./Segmented";
import type { AdminSettings } from "../lib/api";

export function AdminSettingsBar({
  settings,
  onChange,
}: {
  settings: AdminSettings | null;
  onChange: (key: "activeProvider" | "activeBackend", value: string) => void;
}) {
  if (!settings) return null;

  return (
    <GlassPanel className="admin-settings-bar">
      <div className="admin-settings-bar-item">
        <span className="admin-settings-bar-label">ИИ</span>
        <Segmented
          ariaLabel="Провайдер ИИ"
          options={settings.availableProviders}
          value={settings.activeProvider}
          onChange={(id) => onChange("activeProvider", id)}
        />
      </div>
      <div className="admin-settings-bar-item">
        <span className="admin-settings-bar-label">Музыка</span>
        <Segmented
          ariaLabel="Источник музыки"
          options={settings.availableBackends}
          value={settings.activeBackend}
          onChange={(id) => onChange("activeBackend", id)}
        />
      </div>
    </GlassPanel>
  );
}
