import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { AccountProfileUser, AuthAvatar } from "../../auth/authTypes";
import logo from "../../assets/ArcadialogoA.png";
import AvatarPreview from "./AvatarPreview";
import { getAuthErrorMessage } from "../../auth/authUtils";
import { acquireModalScrollLock } from "../../auth/modalScrollLock";
import {
  GOOGLE_AVATAR_ID,
  LEVEL_AVATARS,
  LOCAL_AVATARS,
  getSafeGoogleAvatarUrl,
  levelAvatarPreviewUrl,
  type LevelAvatarOption,
  type LocalAvatarOption,
} from "../../auth/avatarCatalog";
import { isTierEarned, readEligibilitySource } from "../../auth/tierEligibility";
import "./AvatarsModal.css";

/* ===========================================================
   ICONS
   =========================================================== */

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5 19 19M19 5 5 19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" />
    </svg>
  );
}

const AVATAR_SAVE_FAILED_MESSAGE = "Your avatar could not be saved. Please try again.";

/* ===========================================================
   ROOKIE UNLOCK

   The unlock rule itself is not decided here. `auth/tierEligibility.ts` holds
   it once, and this modal and the badge in My Profile both read it, so an avatar
   and a badge can never disagree about whether a tier has been earned.

   IMPORTANT: the backend does not persist a match or game-history record yet,
   so `gamingStats.gamesPlayed` is always 0 and Rookie stays locked. That is
   deliberate. An unlock has to come from a genuine completed match recorded by
   the trusted game-result flow, never from signing up, logging in, opening a
   game or starting an unfinished one. When that flow exists it writes the
   count, and Rookie unlocks on its own with no change here.
   =========================================================== */

/* ===========================================================
   AVATARS MODAL

   A child layer above My Profile, which stays mounted underneath and is
   blurred by the caller. The caller owns the state: this modal never closes
   My Profile, only itself, and the X is the single way out.

   Every avatar is one continuous grid in a fixed order: the Google picture,
   then the free catalogue, then the level tiers the account has reached, then
   the tiers still to come. Nothing is sectioned, so an avatar simply changes
   place when the level reaches it, and a level avatar never precedes a free one.

   Which side of that line a tier falls on is read from the authoritative
   progression the backend already sent, never from a value chosen here.
   =========================================================== */

type AvatarsModalProps = {
  profile: AccountProfileUser;
  onClose: () => void;
  /**
   * Persists the chosen avatar through the existing account profile write. The
   * modal closes only once it resolves, and a rejection is reported in place
   * so the choice is never presented as saved.
   */
  onSaveAvatar: (avatar: AuthAvatar) => Promise<unknown>;
};

function isSameAvatar(current: AuthAvatar, next: AuthAvatar) {
  return current.type === next.type && (next.type === "google" || current.value === next.value);
}

function AvatarsModal({ profile, onClose, onSaveAvatar }: AvatarsModalProps) {
  // The selection starts at the avatar the profile already stores, so the modal
  // always opens with the current avatar marked as selected.
  const [selected, setSelected] = useState<AuthAvatar>(profile.avatar);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The single unlock rule, shared with the badge in My Profile.
  const { progression, completedMatches } = readEligibilitySource(profile);
  const isTierReached = (tier: LevelAvatarOption) =>
    isTierEarned(tier, progression, completedMatches).isEarned;

  const unlockedTiers = LEVEL_AVATARS.filter(isTierReached);
  const lockedTiers = LEVEL_AVATARS.filter((tier) => !isTierReached(tier));

  /*
   * The Google option is only offered when the account can actually use it: a
   * Google account that already owns a trusted picture. A password account, or
   * a Google account whose picture URL fails the shared rules, never sees a
   * Google tile at all, so no untrusted or invented image can be rendered.
   */
  const googlePictureUrl = getSafeGoogleAvatarUrl(profile.googleAvatarUrl);
  const canUseGoogle = profile.authProvider === "GOOGLE" && Boolean(googlePictureUrl);

  const hasChanges = !isSameAvatar(profile.avatar, selected);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  /*
   * The shared, reference counted lock. It keeps the page behind still, and
   * because it is counted, opening this layer on top of My Profile does not
   * lock or unlock the document again, so the centred parent does not move.
   */
  useEffect(() => acquireModalScrollLock(), []);

  const googlePreviewUser = useMemo<AccountProfileUser>(
    () => ({ ...profile, avatar: { type: "google", value: GOOGLE_AVATAR_ID } }),
    [profile],
  );

  function previewUserForLocal(avatar: LocalAvatarOption): AccountProfileUser {
    return { ...profile, avatar: { type: "local", value: avatar.id } };
  }

  async function handleConfirm() {
    if (!hasChanges || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      // The backend is the authority: AuthContext and this profile only change
      // once it has confirmed the write.
      await onSaveAvatar(selected);
      onClose();
    } catch (error) {
      setSaveError(getAuthErrorMessage(error, AVATAR_SAVE_FAILED_MESSAGE));
    } finally {
      setIsSaving(false);
    }
  }

  function renderSelectableTile(avatar: AuthAvatar, name: string, preview: AccountProfileUser) {
    const isSelected = isSameAvatar(selected, avatar);
    return (
      <button
        key={`${avatar.type}-${avatar.value ?? ""}`}
        type="button"
        className={`avm-tile${isSelected ? " avm-tile--selected" : ""}`}
        onClick={() => setSelected(avatar)}
        aria-pressed={isSelected}
        aria-label={isSelected ? `${name} — current avatar` : `Use ${name} avatar`}
      >
        <span className="avm-tile-avatar">
          <AvatarPreview user={preview} className="avm-tile-img" />
          {isSelected && (
            <span className="avm-tile-check" aria-hidden="true">
              <CheckIcon />
            </span>
          )}
        </span>
        <span className="avm-tile-name">{name}</span>
      </button>
    );
  }

  /*
   * What a tier actually needs, from the shared rule, so the label and the
   * accessible name can never claim a requirement that is not the real one.
   */
  function requirementFor(tier: LevelAvatarOption): string {
    return isTierEarned(tier, progression, completedMatches).requirement;
  }

  function renderTierTile(tier: LevelAvatarOption) {
    const isLocked = !isTierReached(tier);
    const artwork = (
      <span className="avm-tile-avatar">
        <img src={levelAvatarPreviewUrl(tier)} alt="" className="avm-tile-img" />
        {/* The lock appears only while the tier is still out of reach. */}
        {isLocked && (
          <span className="avm-tile-lock" aria-hidden="true">
            <LockIcon />
          </span>
        )}
      </span>
    );
    const name = <span className="avm-tile-name">{tier.label}</span>;

    if (!isLocked) {
      /*
       * A reached tier is shown as unlocked: no lock and no requirement. It is
       * still not selectable, because the backend allowlists only the free
       * catalogue ids, so there is no id a tier could be stored under yet. The
       * accessible name carries that, and the control takes a normal cursor
       * with no hover reaction rather than a blocking one.
       */
      return (
        <span
          key={tier.id}
          className="avm-tile avm-tile--tier avm-tile--unavailable"
          role="img"
          aria-label={`${tier.label} — available at ${requirementFor(tier)}`}
        >
          {artwork}
          {name}
        </span>
      );
    }

    return (
      <span
        key={tier.id}
        className="avm-tile avm-tile--tier avm-tile--locked"
        role="img"
        aria-label={`${tier.label} — locked, unlocks at ${requirementFor(tier)}`}
      >
        {artwork}
        {name}
        <span className="avm-tile-req">Unlocks at {requirementFor(tier)}</span>
      </span>
    );
  }

  return createPortal(
    <div
      className="avm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="avm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="avm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="avm-header">
          <div className="avm-header-title">
            {/* The existing Arcadia brand mark, reused rather than redrawn. */}
            <img className="avm-header-logo" src={logo} alt="" />
            <h2 id="avm-title">Choose Your Avatar</h2>
          </div>
          <button
            type="button"
            className="avm-close arcadia-modal-close"
            aria-label="Close avatar selection"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        {/*
          One continuous grid, in a fixed order: the Google picture, then the
          free catalogue, then the level tiers the account has reached, then the
          tiers still locked. A tier never precedes a free avatar; unlocking one
          only moves it from the last group into the third.
        */}
        <div className="avm-body">
          <div className="avm-grid">
            {canUseGoogle && renderSelectableTile(
              { type: "google", value: GOOGLE_AVATAR_ID },
              "Google Photo",
              googlePreviewUser,
            )}
            {LOCAL_AVATARS.map((avatar) =>
              renderSelectableTile(
                { type: "local", value: avatar.id },
                avatar.label,
                previewUserForLocal(avatar),
              ),
            )}
            {unlockedTiers.map(renderTierTile)}
            {lockedTiers.map(renderTierTile)}
          </div>
        </div>

        {saveError && (
          <p className="avm-error" role="alert">{saveError}</p>
        )}

        <div className="avm-footer">
          <button
            type="button"
            className="avm-confirm"
            disabled={!hasChanges || isSaving}
            onClick={() => void handleConfirm()}
          >
            {isSaving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default AvatarsModal;
