/*
 * Settings — configuration for the Admin Panel itself (NOT player settings).
 *
 * Sections: admin account (real identity from the admin session),
 * session security info, and panel preferences (local UI state). Credential
 * management is intentionally absent: the single admin account is configured
 * through the backend environment, so there is nothing to edit here.
 */

import type { ReactNode } from "react";
import {
  Cookie,
  Fingerprint,
  KeyRound,
  LogOut,
  AlignJustify,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import { useAdminAuth } from "../hooks/useAdminAuth";
import {
  usePanelPreferences,
  setPanelPreference,
  resetPanelPreferences,
  type PanelPreferenceKey,
} from "../hooks/panelPreferences";
import AdminLayout from "../components/AdminLayout";
import { Avatar, Chip, Note, PageHeader, PageShell, Panel, Toggle } from "../components/AdminKit";
import { getAdminApiBaseUrl } from "../services/adminAuthService";
import { navigateTo, requestLoginOnNextMount } from "../../lib/navigation";
import "./AdminPages.css";

/* One settings line: icon tile, label + hint, then a value or a control. */
function SettingRow({
  icon,
  label,
  hint,
  children,
}: {
  icon: ReactNode;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="adp-setting">
      <span className="adp-setting__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="adp-setting__text">
        <span className="adp-setting__label">{label}</span>
        <span className="adp-setting__hint">{hint}</span>
      </div>
      <div className="adp-setting__control">{children}</div>
    </div>
  );
}

function SettingsPage() {
  const { admin, logout } = useAdminAuth();

  /*
   * Panel preferences live in a session-only store (see hooks/panelPreferences).
   * They are applied live: compactTables tightens list tables, and
   * showPreviewNotices toggles the sample-data banner on every preview page.
   */
  const preferences = usePanelPreferences();

  const toggle = (key: PanelPreferenceKey) => {
    setPanelPreference(key, !preferences[key]);
  };

  let apiOrigin: string;
  try {
    apiOrigin = getAdminApiBaseUrl();
  } catch {
    apiOrigin = "Not configured";
  }

  const username = admin?.username ?? "—";

  return (
    <AdminLayout activePage="settings">
      <PageShell>
        <PageHeader
          title="Settings"
          icon={<Settings />}
          subtitle="Admin Panel configuration. Player settings live on the Arcadia site itself, not here."
        />

        <div className="adp-settings-grid">
          <Panel className="adp-profile-panel">
            <div className="adp-profile">
              <Avatar name={username} size="xl" />
              <h3 className="adp-profile__name">{username}</h3>
              <div className="adp-profile__chips">
                <Chip tone="violet" icon={<ShieldCheck size={13} />}>
                  Super Admin
                </Chip>
                <Chip tone="green" dot>
                  Session active
                </Chip>
              </div>
              <p className="adp-profile__hint">
                Username is configured in backend/.env. This is a single-admin panel, so there is no
                role management.
              </p>
              <button
                type="button"
                className="adk-btn adk-btn--danger"
                onClick={() => {
                  void logout().then(() => {
                    // Land on the landing page with the shared login modal open —
                    // there is no dedicated admin login page.
                    requestLoginOnNextMount();
                    navigateTo("/");
                  });
                }}
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out now
              </button>
            </div>
          </Panel>

          <div className="adp-stack">
            <Panel
              title="Panel Preferences"
              subtitle="Display options for this console. Applied live and kept for this browser tab only."
              icon={<SlidersHorizontal size={18} />}
              action={
                <button type="button" className="adk-btn adk-btn--sm adk-btn--ghost" onClick={resetPanelPreferences}>
                  Reset to defaults
                </button>
              }
            >
              <SettingRow icon={<AlignJustify size={18} />} label="Compact tables" hint="Tighter row spacing on list pages">
                <Toggle
                  checked={preferences.compactTables}
                  onChange={() => toggle("compactTables")}
                  label="Compact tables"
                />
              </SettingRow>

              <SettingRow
                icon={<Sparkles size={18} />}
                label="Preview-data notices"
                hint="Show the sample-data banner on preview pages"
              >
                <Toggle
                  checked={preferences.showPreviewNotices}
                  onChange={() => toggle("showPreviewNotices")}
                  label="Preview-data notices"
                />
              </SettingRow>

              <Note tone="blue">
                Session-only — never synced to any backend and never touches the player site.
              </Note>
            </Panel>

            <Panel title="Security & System" subtitle="Session and backend connection details." icon={<Server size={18} />}>
              <SettingRow
                icon={<Fingerprint size={18} />}
                label="Session"
                hint="HTTP-only cookie, verified on every page load"
              >
                <span className="adp-setting__value">Active</span>
              </SettingRow>

              <SettingRow
                icon={<Cookie size={18} />}
                label="Authentication"
                hint="HTTP-only cookie · no tokens in web storage"
              >
                <span className="adp-setting__value">Cookie session</span>
              </SettingRow>

              <SettingRow
                icon={<KeyRound size={18} />}
                label="API origin"
                hint="Main Arcadia backend (VITE_API_URL)"
              >
                <span className="adp-setting__value adk-mono">{apiOrigin}</span>
              </SettingRow>

              <SettingRow
                icon={<Server size={18} />}
                label="Panel build"
                hint="Player-facing site is unaffected by this console"
              >
                <span className="adp-setting__value">Preview</span>
              </SettingRow>
            </Panel>
          </div>
        </div>
      </PageShell>
    </AdminLayout>
  );
}

export default SettingsPage;