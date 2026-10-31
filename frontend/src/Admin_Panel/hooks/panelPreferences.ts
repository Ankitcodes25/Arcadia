/*
 * Panel preferences — session-only display options for the Admin Panel.
 *
 * Deliberately in-memory (never localStorage/sessionStorage): these are UI
 * preferences with no persistence requirement, and the settings page states
 * they last for the session. Uses useSyncExternalStore so the sidebar shell
 * and the preview-data notices react to changes made on the Settings page.
 */

import { useSyncExternalStore } from "react";

export interface PanelPreferences {
  compactTables: boolean;
  showPreviewNotices: boolean;
}

const initialState: PanelPreferences = {
  compactTables: false,
  showPreviewNotices: true,
};

let state: PanelPreferences = { ...initialState };
const listeners = new Set<() => void>();

export function getPanelPreferences(): PanelPreferences {
  return state;
}

/** Union of preference keys — keeps Settings toggles type-safe. */
export type PanelPreferenceKey = keyof PanelPreferences;

export function setPanelPreference<Key extends PanelPreferenceKey>(
  key: Key,
  value: PanelPreferences[Key],
): void {
  if (state[key] === value) return;
  state = { ...state, [key]: value };
  for (const listener of listeners) listener();
}

/** Restore both toggles to their defaults (session-only; no backend call). */
export function resetPanelPreferences(): void {
  state = { ...initialState };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Live view of the preferences; re-renders on any change. */
export function usePanelPreferences(): PanelPreferences {
  return useSyncExternalStore(subscribe, getPanelPreferences, getPanelPreferences);
}
