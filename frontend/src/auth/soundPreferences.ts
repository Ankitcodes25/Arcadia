/*
 * Sound preference infrastructure.
 *
 * The Settings modal persists "Sound Effects" on/off and a 0–100 volume
 * through the backend, and this module is the single place those persisted
 * values are applied to the running app.
 *
 * HONEST STATE OF PLAY: Arcadia currently has NO audio playback anywhere —
 * no Web Audio, no HTMLAudioElement, no sound files. There is therefore
 * nothing to apply the preferences to yet. This module deliberately invents
 * no sounds and plays no music: it only holds the applied values behind one
 * accessor so that when a game or UI effect eventually produces audio, that
 * code reads its volume and mute state from here and cannot disagree with the
 * user's saved preference. Until then the values are inert.
 */

export type AppliedSoundPreferences = {
  /** Whether sound effects should play at all. */
  soundEffects: boolean;
  /** 0–100. Meaningful only while `soundEffects` is on. */
  soundVolume: number;
};

let applied: AppliedSoundPreferences = {
  soundEffects: true,
  soundVolume: 100,
};

/**
 * Applies the backend-confirmed preferences to the running app. Called by the
 * Settings modal with the exact object the server returned, never with a
 * locally guessed value.
 */
export function applySoundPreferences(preferences: {
  soundEffects: boolean;
  soundVolume: number;
}) {
  applied = {
    soundEffects: Boolean(preferences.soundEffects),
    soundVolume: clampVolume(preferences.soundVolume),
  };
}

/** The current applied sound preferences for playback code to read. */
export function getAppliedSoundPreferences(): AppliedSoundPreferences {
  return { ...applied };
}

/**
 * The effective volume any future playback should use: zero when effects are
 * off, otherwise the saved 0–100 level. This is the one rule for "what volume
 * should this sound play at", so it is decided here rather than per call site.
 */
export function getEffectiveVolume(): number {
  return applied.soundEffects ? clampVolume(applied.soundVolume) : 0;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(0, Math.round(value)));
}
