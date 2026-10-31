/*
 * Settings — configuration for the Admin Panel itself (NOT player settings).
 *
 * Sections: admin account (real identity from the Admin Backend session),
 * session security info, and panel preferences (local UI state). Credential
 * management is intentionally absent: the single admin account is configured
 * through the backend environment, so there is nothing to edit here.
 */

import { useAdminAuth } from "../hooks/useAdminAuth";
import {
  usePanelPreferences,
  setPanelPreference,
  resetPanelPreferences,
  type PanelPreferenceKey,
} from "../hooks/panelPreferences";
import AdminLayout from "../components/AdminLayout";
import { getAdminApiBaseUrl } from "../services/adminAuthService";
import { navigateTo, requestLoginOnNextMount } from "../../lib/navigation";
import "./SettingsPage.css";

function SettingsPage() {
  const { admin, logout } = useAdminAuth();

  /*
   * Panel preferences live in a session-only store (see hooks/panelPreferences).
   * They are applied live: compactTables tightens list tables via AdminLayout,
   * and showPreviewNotices toggles the sample-data banner on every preview page.
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

  return (
    <AdminLayout activePage="settings">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">Settings</h2>
          <p className="adm-page-head__sub">
            Admin Panel configuration. Player settings live on the Arcadia site itself, not here.
          </p>
        </div>
      </div>

      <div className="adm-settings-grid">
        <section className="adm-card">
          <h3 className="adm-card__title">Admin Account</h3>
          <p className="adm-card__subtitle">The signed-in administrator (from the admin session).</p>

          <div className="adm-settings-row">
            <div className="adm-settings-row__text">
              <span className="adm-settings-row__label">Username</span>
              <span className="adm-settings-row__hint">Configured via the admin backend environment</span>
            </div>
            <span className="adm-settings-row__value">{admin?.username ?? "—"}</span>
          </div>

          <div className="adm-settings-row">
            <div className="adm-settings-row__text">
              <span className="adm-settings-row__label">Role</span>
              <span className="adm-settings-row__hint">Single-admin model — no role management</span>
            </div>
            <span className="adm-settings-row__value">Super Admin</span>
          </div>

          <div className="adm-settings-row">
            <div className="adm-settings-row__text">
              <span className="adm-settings-row__label">Session</span>
              <span className="adm-settings-row__hint">HTTP-only cookie, verified on every page load</span>
            </div>
            <span className="adm-settings-row__value">Active</span>
          </div>

          <button
            type="button"
            className="adm-btn adm-btn--danger"
            style={{ marginTop: 14 }}
            onClick={() => {
              void logout().then(() => {
                // Land on the landing page with the shared login modal open —
                // there is no dedicated admin login page.
                requestLoginOnNextMount();
                navigateTo("/");
              });
            }}
          >
            Sign out now
          </button>
        </section>

        <section className="adm-card">
          <h3 className="adm-card__title">Panel Preferences</h3>
          <p className="adm-card__subtitle">
            Display options for this console. Applied live and kept for this browser tab only.
          </p>

          <div className="adm-settings-row">
            <div className="adm-settings-row__text">
              <span className="adm-settings-row__label">Compact tables</span>
              <span className="adm-settings-row__hint">Tighter row spacing on list pages</span>
            </div>
            <button
              type="button"
              className={`adm-toggle${preferences.compactTables ? " adm-toggle--on" : ""}`}
              role="switch"
              aria-checked={preferences.compactTables}
              aria-label="Compact tables"
              onClick={() => toggle("compactTables")}
            />
          </div>

          <div className="adm-settings-row">
            <div className="adm-settings-row__text">
              <span className="adm-settings-row__label">Preview-data notices</span>
              <span className="adm-settings-row__hint">Show the sample-data banner on preview pages</span>
            </div>
            <button
              type="button"
              className={`adm-toggle${preferences.showPreviewNotices ? " adm-toggle--on" : ""}`}
              role="switch"
              aria-checked={preferences.showPreviewNotices}
              aria-label="Preview-data notices"
              onClick={() => toggle("showPreviewNotices")}
            />
          </div>

          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            style={{ marginTop: 14 }}
            onClick={resetPanelPreferences}
          >
            Reset to defaults
          </button>
          <p className="adm-settings-hint" role="note">
            Session-only — never synced to any backend and never touches the player site.
          </p>
        </section>

        <section className="adm-card">
          <h3 className="adm-card__title">System</h3>
          <p className="adm-card__subtitle">Admin service connection details.</p>

          <div className="adm-settings-row">
            <div className="adm-settings-row__text">
              <span className="adm-settings-row__label">Admin API origin</span>
              <span className="adm-settings-row__hint">Separate from the player backend (port 4000)</span>
            </div>
            <span className="adm-settings-row__value adm-mono">{apiOrigin}</span>
          </div>

          <div className="adm-settings-row">
            <div className="adm-settings-row__text">
              <span className="adm-settings-row__label">Authentication</span>
              <span className="adm-settings-row__hint">HTTP-only cookie · no tokens in web storage</span>
            </div>
            <span className="adm-settings-row__value">Cookie session</span>
          </div>

          <div className="adm-settings-row">
            <div className="adm-settings-row__text">
              <span className="adm-settings-row__label">Panel build</span>
              <span className="adm-settings-row__hint">Player-facing site is unaffected by this console</span>
            </div>
            <span className="adm-settings-row__value">Preview</span>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}

export default SettingsPage;
