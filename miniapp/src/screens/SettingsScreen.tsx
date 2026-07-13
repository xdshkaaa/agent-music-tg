import { useEffect, useState } from "react";
import { GlassPanel } from "../components/GlassPanel";
import { api, type AdminSettings } from "../lib/api";

/**
 * Admin-only screen. Loaded via React.lazy from App.tsx only when /api/me
 * reports isAdmin — the server independently 403s these endpoints for
 * non-admins regardless, so this is defense in depth, not the boundary.
 */
export default function SettingsScreen() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.adminSettings().then(setSettings).catch((e) => setError(e.message));
  }, []);

  if (error) return <GlassPanel>{error}</GlassPanel>;
  if (!settings) return <GlassPanel>Loading…</GlassPanel>;

  return (
    <GlassPanel>
      <h1>Admin settings</h1>
      <div className="stack" style={{ marginTop: 12 }}>
        <div>
          <h2>AI provider</h2>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {settings.availableProviders.map((id) => (
              <button
                key={id}
                className={`glass-button${id === settings.activeProvider ? " primary" : ""}`}
                onClick={() => api.setActiveProvider(id).then(() => setSettings({ ...settings, activeProvider: id }))}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2>Music backend</h2>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {settings.availableBackends.map((id) => (
              <button
                key={id}
                className={`glass-button${id === settings.activeBackend ? " primary" : ""}`}
                onClick={() => api.setActiveBackend(id).then(() => setSettings({ ...settings, activeBackend: id }))}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      </div>
    </GlassPanel>
  );
}
