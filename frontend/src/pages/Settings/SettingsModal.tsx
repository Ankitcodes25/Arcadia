import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { authApi } from "../../auth/authApi";
import { useAuth } from "../../auth/AuthContext";
import { getAuthErrorMessage } from "../../auth/authUtils";
import { acquireModalScrollLock } from "../../auth/modalScrollLock";
import { applySoundPreferences } from "../../auth/soundPreferences";
import type {
  AccountPreferences,
  AccountPreferencesUpdate,
  LeaderboardVisibility,
  ProfileVisibility,
} from "../../auth/authTypes";
import "./SettingsModal.css";

/* ===========================================================
   ICONS — the same small inline SVG stroke style used by the
   other Arcadia modals.
   =========================================================== */

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5 19 19M19 5 5 19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4v-5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M15.4 9.4a3.6 3.6 0 0 1 0 5.2M17.9 7a7 7 0 0 1 0 10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3.2 19 6v6c0 3-2 7.2-7 8.8-4-1.6-7-4.8-7-8.8V6l7-2.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M9.2 12.1 11.3 14.2l3.6-3.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.6 12a7.4 7.4 0 1 0 2.2-5.3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.4 4.6v4.4h4.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="15" r="1.4" fill="currentColor" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6.5 9.5 5.5 5.5 5.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5.5 12.5 4.2 4.2L18.5 7.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.9" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9.9 6.1A9.6 9.6 0 0 1 12 5.8c5.8 0 9.2 6.2 9.2 6.2a16.4 16.4 0 0 1-2.6 3.4M6.4 7.6A16 16 0 0 0 2.8 12S6.2 18.2 12 18.2a9.4 9.4 0 0 0 4-.9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 10.2a2.9 2.9 0 0 0 3.8 3.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m4 4 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/* ===========================================================
   SETTINGS SELECT

   A themed replacement for the native <select>. The browser draws a native
   option list itself (system colours, hard edges, no arrow once
   `appearance: none` is set), and that list cannot be styled to match
   Arcadia. This is a small listbox instead.

   The list is rendered in a portal with `position: fixed`. The Settings
   dialog scrolls internally (`overflow-y: auto`), so an absolutely
   positioned list would be clipped by it or would grow its scroll area.
   The list is positioned from the trigger's bounding box, follows the
   trigger while the dialog scrolls, and opens upward when there is more
   room above than below.

   Escape closes only the list: the modal's own Escape handler listens on
   `window` in the bubble phase, and while the list is open this component
   intercepts Escape earlier, in the capture phase, and stops it there.
   =========================================================== */

type SelectOption = { value: string; label: string };

type SettingsSelectProps = {
  id: string;
  value: string;
  options: ReadonlyArray<SelectOption>;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

type ListPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
};

function SettingsSelect({
  id,
  value,
  options,
  placeholder,
  disabled = false,
  onChange,
}: SettingsSelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<ListPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const listId = `${id}-listbox`;
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const openList = () => {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const closeList = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    closeList();
    triggerRef.current?.focus();
  };

  /* Position the list from the trigger, and keep it attached while the
     dialog scrolls or the window resizes. */
  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 6;
      const edge = 12;
      const desired = Math.min(240, options.length * 38 + 8);
      const below = window.innerHeight - rect.bottom - edge - gap;
      const above = rect.top - edge - gap;
      const openUp = below < desired && above > below;
      const maxHeight = Math.max(120, Math.min(desired, openUp ? above : below));
      setPosition(
        openUp
          ? { bottom: window.innerHeight - rect.top + gap, left: rect.left, width: rect.width, maxHeight }
          : { top: rect.bottom + gap, left: rect.left, width: rect.width, maxHeight },
      );
    };

    const onScroll = (event: Event) => {
      // Scrolling the list itself must not move it.
      if (listRef.current?.contains(event.target as Node)) return;
      place();
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, options.length]);

  /* Outside click and Escape. Both use the capture phase: the dialog stops
     mousedown from bubbling, and the modal's Escape handler is a bubbling
     window listener, so only capture sees these events first. */
  useEffect(() => {
    if (!open) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      closeList();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeList();
      triggerRef.current?.focus();
    };

    document.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, closeList]);

  /* Keep the keyboard-active option visible inside the list. */
  useEffect(() => {
    if (!open || !position || activeIndex < 0) return;
    const element = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    element?.scrollIntoView({ block: "nearest" });
  }, [open, position, activeIndex]);

  /* A disabled control (deletion in progress) cannot stay open. */
  useEffect(() => {
    if (disabled && open) closeList();
  }, [disabled, open, closeList]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) openList();
        else setActiveIndex((index) => Math.min(options.length - 1, index + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) openList();
        else setActiveIndex((index) => Math.max(0, index - 1));
        break;
      case "Home":
        if (open) {
          event.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          event.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) openList();
        else if (activeIndex >= 0) choose(activeIndex);
        break;
      case "Tab":
        if (open) closeList();
        break;
      default:
        break;
    }
  };

  return (
    <div className="settings-dropdown">
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`settings-dropdown-trigger${open ? " settings-dropdown-trigger--open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
        disabled={disabled}
        onClick={() => (open ? closeList() : openList())}
        onKeyDown={handleKeyDown}
        /* Space activates a button on keyup; the keydown handler already
           handled it, so the keyup must not click the button a second time. */
        onKeyUp={(event) => {
          if (event.key === " ") event.preventDefault();
        }}
      >
        <span className={selected ? "settings-dropdown-value" : "settings-dropdown-placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="settings-dropdown-chevron" aria-hidden="true">
          <ChevronDownIcon />
        </span>
      </button>

      {open && position &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            className={`settings-dropdown-list${position.bottom !== undefined ? " settings-dropdown-list--up" : ""}`}
            style={{
              top: position.top,
              bottom: position.bottom,
              left: position.left,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
            /* Keep focus on the trigger while the pointer works the list. */
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                className={
                  "settings-dropdown-option" +
                  (index === activeIndex ? " settings-dropdown-option--active" : "") +
                  (option.value === value ? " settings-dropdown-option--selected" : "")
                }
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <span className="settings-dropdown-check" aria-hidden="true">
                    <CheckIcon />
                  </span>
                )}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}

/* ===========================================================
   SETTINGS MODAL

   One dedicated modal for account preferences, opened from the Profile
   Popup's Settings item. It is a layer above that popup rather than an
   expansion of it, so it follows the same portal, backdrop and Escape
   conventions as My Profile and the Avatar Modal.

   Everything lives in this one view — sound, privacy, reset, and the
   whole Account & Security surface (change password and permanent
   deletion) — with no child modal, drawer or second page. The Settings
   modal stays open while any of it is used.

   Every preference rendered here comes from the backend: the modal
   loads the stored preferences on open, each control auto-saves through
   the preferences endpoint, and the UI is replaced by whatever the
   server confirms. Saves are silent by design: there is no success
   message, toast or helper text anywhere, so the modal never changes
   height in response to a save and never shifts under the user.
   =========================================================== */

const PROFILE_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: ProfileVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "PUBLIC",
    label: "Public",
    description: "Anyone on Arcadia can view your profile.",
  },
  {
    value: "FRIENDS",
    label: "Friends",
    description:
      "Only accounts you are friends with can view your profile. Friend requests must be accepted before either player can see a Friends-only profile.",
  },
  {
    value: "NO_ONE",
    label: "No one",
    description: "Nobody else can view your profile.",
  },
];

const LEADERBOARD_VISIBILITY_OPTIONS: ReadonlyArray<{
  value: LeaderboardVisibility;
  label: string;
  description: string;
}> = [
  {
    value: "SHOW",
    label: "Show",
    description: "Appear on public leaderboards.",
  },
  {
    value: "HIDE",
    label: "Hide",
    description:
      "Stay off public leaderboards. Your XP, level and progress are kept.",
  },
];

/*
 * Deletion reasons. These shape the confirmation UX only: the deletion
 * endpoint accepts just the confirmation word and (for password accounts)
 * the password, and rejects any other field, so the reason is deliberately
 * never sent over the wire.
 */
const DELETE_REASONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "NO_LONGER_USE", label: "I no longer use Arcadia" },
  { value: "PRIVACY_CONCERNS", label: "I have privacy concerns" },
  { value: "POOR_EXPERIENCE", label: "I had a poor experience" },
  { value: "SWITCHING_PLATFORM", label: "I am switching to another platform" },
  { value: "CREATING_NEW_ACCOUNT", label: "I am creating a new account" },
  { value: "OTHER", label: "Other" },
];

/* Matches the backend's minimum registration password length. */
const PASSWORD_MIN_LENGTH = 8;

/* How long a dragged volume must settle before it is sent. */
const VOLUME_DEBOUNCE_MS = 350;

const LOAD_FAILED_MESSAGE = "Unable to load settings.";

type SettingsModalProps = {
  onClose: () => void;
};

function SettingsModal({ onClose }: SettingsModalProps) {
  const { user, changePassword, deleteAccount } = useAuth();

  const [preferences, setPreferences] = useState<AccountPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  /*
   * The volume slider is always responsive: it shows the dragged value
   * immediately and the save happens in the background on a debounce,
   * flushed the moment the interaction ends. There is no busy state and no
   * helper text on this control, so dragging it can never resize or
   * reposition the modal.
   */
  const [volume, setVolume] = useState(100);

  /* Change password (password accounts only; Google accounts have none). */
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  /* Permanent account deletion, revealed in place by its trigger. */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteComment, setDeleteComment] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  /*
   * The password re-authentication the backend requires of password accounts
   * is a second step, shown only after "Yes, Proceed". It is deliberately not
   * part of the confirmation form (see renderDeletion for why).
   */
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);
  /*
   * The typed confirmation and the re-authentication password each start
   * read-only and unlock on first focus. Some browsers ignore
   * autocomplete="off" and fill a saved email / password into a field as soon
   * as its panel opens; a read-only field is never filled.
   */
  const [confirmationArmed, setConfirmationArmed] = useState(false);
  const [passwordArmed, setPasswordArmed] = useState(false);

  /*
   * Monotonic request id: a preference response is applied only if it is
   * the newest thing this modal asked for, so a slow save can never
   * overwrite the state set by a newer one.
   */
  const requestSeqRef = useRef(0);

  /*
   * Volume bookkeeping kept in refs so the debounced callbacks always see
   * the latest values without re-rendering on every pixel of a drag:
   *
   *  - volumeRef mirrors the displayed value.
   *  - pendingVolumeRef is the newest value not yet confirmed by the
   *    server; null once the slider matches the persisted value.
   *  - preferencesRef mirrors the last persisted set, used to revert a
   *    failed save silently.
   */
  const volumeRef = useRef(100);
  const pendingVolumeRef = useRef<number | null>(null);
  const lastSentVolumeRef = useRef<number | null>(null);
  const preferencesRef = useRef<AccountPreferences | null>(null);
  const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Applies a backend-confirmed preference set to every consumer. */
  const applyPreferences = useCallback((confirmed: AccountPreferences) => {
    preferencesRef.current = confirmed;
    setPreferences(confirmed);
    /*
     * The slider only follows the server when the user has no newer
     * unsaved value, so a response that lands mid-drag cannot yank the
     * thumb backwards.
     */
    if (pendingVolumeRef.current === null) {
      volumeRef.current = confirmed.soundVolume;
      setVolume(confirmed.soundVolume);
    }
    applySoundPreferences(confirmed);
  }, []);

  const loadPreferences = useCallback(async () => {
    const requestId = ++requestSeqRef.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await authApi.getPreferences();
      if (requestId !== requestSeqRef.current) return;
      pendingVolumeRef.current = null;
      applyPreferences(response.preferences);
    } catch (requestError) {
      if (requestId !== requestSeqRef.current) return;
      setLoadError(getAuthErrorMessage(requestError, LOAD_FAILED_MESSAGE));
    } finally {
      if (requestId === requestSeqRef.current) setIsLoading(false);
    }
  }, [applyPreferences]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  /*
   * Escape and the scroll lock follow the shared modal conventions. Escape
   * closes the whole modal; the backdrop and the X behave the same way, and a
   * press that starts inside the dialog never reaches the backdrop.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => acquireModalScrollLock(), []);

  /*
   * One silent write path for every preference control: no success message
   * and no error banner, so a save never changes the modal's height. A
   * rejected write is logged and the control quietly returns to the
   * persisted value, which keeps the screen honest without a layout shift.
   */
  const savePreferences = useCallback(async (changes: AccountPreferencesUpdate) => {
    const requestId = ++requestSeqRef.current;
    try {
      const response = await authApi.updatePreferences(changes);
      if (requestId !== requestSeqRef.current) return;
      applyPreferences(response.preferences);
    } catch (requestError) {
      if (requestId !== requestSeqRef.current) return;
      console.error("[arcadia] settings save failed", requestError);
      /*
       * Controls are driven by `preferences`, which only ever holds
       * confirmed values. Re-rendering with the same set snaps a checkbox
       * or radio back to the persisted state after a rejected click.
       */
      const persisted = preferencesRef.current;
      if (persisted) setPreferences({ ...persisted });
    }
  }, [applyPreferences]);

  /* Volume: drag updates the slider instantly, the save is debounced. */
  const sendVolume = useCallback(async (value: number) => {
    /*
     * A release can surface as pointerup and then blur, and the debounced
     * timer can also race a flush. This ref is written synchronously, so one
     * value is only ever sent once per gesture.
     */
    if (lastSentVolumeRef.current === value) return;
    lastSentVolumeRef.current = value;
    const requestId = ++requestSeqRef.current;
    try {
      const response = await authApi.updatePreferences({ soundVolume: value });
      if (requestId !== requestSeqRef.current) return;
      if (pendingVolumeRef.current === value) pendingVolumeRef.current = null;
      applyPreferences(response.preferences);
    } catch (requestError) {
      if (requestId !== requestSeqRef.current) return;
      console.error("[arcadia] volume save failed", requestError);
      if (pendingVolumeRef.current === value) {
        pendingVolumeRef.current = null;
        const persisted = preferencesRef.current?.soundVolume;
        if (persisted !== undefined) {
          volumeRef.current = persisted;
          setVolume(persisted);
        }
      }
    } finally {
      if (lastSentVolumeRef.current === value) lastSentVolumeRef.current = null;
    }
  }, [applyPreferences]);

  const handleVolumeInput = useCallback((raw: number) => {
    const value = Math.min(100, Math.max(0, Math.round(raw)));
    volumeRef.current = value;
    pendingVolumeRef.current = value;
    setVolume(value);
    if (volumeTimerRef.current !== null) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = setTimeout(() => {
      volumeTimerRef.current = null;
      void sendVolume(value);
    }, VOLUME_DEBOUNCE_MS);
  }, [sendVolume]);

  /* Releasing the slider flushes the pending value immediately. */
  const flushVolume = useCallback(() => {
    if (volumeTimerRef.current !== null) {
      clearTimeout(volumeTimerRef.current);
      volumeTimerRef.current = null;
    }
    const pending = pendingVolumeRef.current;
    if (pending !== null && pending !== preferencesRef.current?.soundVolume) {
      void sendVolume(pending);
    }
  }, [sendVolume]);

  /*
   * A half-dragged volume must not be lost when the modal closes, so the
   * pending value is flushed on unmount. The response is dropped rather
   * than applied, because the component is gone by then.
   */
  useEffect(() => () => {
    if (volumeTimerRef.current !== null) clearTimeout(volumeTimerRef.current);
    const pending = pendingVolumeRef.current;
    if (pending !== null && pending !== preferencesRef.current?.soundVolume) {
      void authApi.updatePreferences({ soundVolume: pending }).catch(() => undefined);
    }
  }, []);

  async function confirmReset() {
    const requestId = ++requestSeqRef.current;
    setIsResetting(true);
    try {
      const response = await authApi.resetPreferences();
      if (requestId !== requestSeqRef.current) return;
      // The reset screen is rebuilt from the backend's confirmation only.
      pendingVolumeRef.current = null;
      applyPreferences(response.preferences);
      setConfirmingReset(false);
    } catch (requestError) {
      if (requestId !== requestSeqRef.current) return;
      console.error("[arcadia] settings reset failed", requestError);
    } finally {
      if (requestId === requestSeqRef.current) setIsResetting(false);
    }
  }

  /*
   * Change password. The form validates the shape locally; the existing
   * secure endpoint re-checks everything, revokes the account's sessions
   * and bumps its token version, so a successful change signs the user
   * out through the normal session handling and lands them on the
   * logged-out screen. That sign-out is the outcome — there is no success
   * confirmation message here by design.
   */
  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    /*
     * A submit that arrives while the request is still in flight (Enter in a
     * field, a double click) must not reach the backend a second time. The
     * button is already disabled, so this only covers the paths that do not go
     * through it.
     */
    if (isChangingPassword) return;
    setPasswordError(null);

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setPasswordError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }

    setIsChangingPassword(true);
    try {
      const result = await changePassword(currentPassword, newPassword, confirmPassword);
      if (!result.success) {
        setPasswordError(result.message || "Password could not be changed. Please try again.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setIsChangingPassword(false);
    }
  }

  /*
   * Permanent account deletion, in two steps.
   *
   * Step 1 is the confirmation form: the reason, the optional comment and the
   * typed word. It holds no password field at all, so a browser cannot read
   * the form as a sign-in form — there is no credential for it to offer to
   * save, and nothing that pairs the typed DELETE with a password.
   *
   * Step 2 is the re-authentication the backend requires for password
   * accounts (accountActionService rejects a deletion that carries no
   * password). It is asked for only here, in its own group with no <form>
   * around it and no field that could be read as a username or an email. It
   * is a check that the account owner is performing the deletion — not a
   * sign-in, and never the user's Google/Gmail password. Google-only accounts
   * never see it: they have no Arcadia password to re-enter.
   *
   * The typed word and the password are both re-verified server-side, and a
   * failure is reported inline, so the account can never be destroyed on a
   * front-end-only judgement. The chosen reason and comment are confirmation
   * UX only and are never transmitted.
   */
  const canProceedDeletion =
    Boolean(deleteReason) && deleteConfirmation === "DELETE" && !isDeleting;
  const canConfirmDeletion = deletePassword.length > 0 && !isDeleting;
  const needsPasswordReauth = user?.authProvider === "PASSWORD";

  function collapseDeletion() {
    setDeleteOpen(false);
    setConfirmingDeletion(false);
    setDeleteReason("");
    setDeleteComment("");
    setDeleteConfirmation("");
    setDeletePassword("");
    setDeleteError(null);
    setShowDeletePassword(false);
    setConfirmationArmed(false);
    setPasswordArmed(false);
  }

  /*
   * "Yes, Proceed" only ever advances. A password account is taken to the
   * re-authentication step; a Google-only account has no Arcadia password, so
   * the typed word is its whole gate and the deletion is sent at once.
   */
  function handleProceed(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canProceedDeletion) return;
    setDeleteError(null);
    if (needsPasswordReauth) {
      setConfirmingDeletion(true);
      return;
    }
    void performDeletion();
  }

  async function performDeletion(password?: string) {
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deleteAccount({
      confirmation: deleteConfirmation,
      password,
    });
    setIsDeleting(false);
    /*
     * On success there is nothing left to render: the provider cleared local
     * auth, so every signed-in surface unmounts and the browser lands on the
     * logged-out screen. Only a failure needs reporting here.
     */
    if (!result.success) {
      setDeleteError(result.message || "Your account could not be deleted. Please try again.");
    }
  }

  function renderChangePassword() {
    if (user?.authProvider !== "PASSWORD") {
      return (
        <div className="settings-form">
          <strong className="settings-subheading">Change password</strong>
          <p className="settings-hint">
            This account signs in with Google, so there is no Arcadia password to change.
          </p>
        </div>
      );
    }

    return (
      <form className="settings-form" onSubmit={(event) => void handleChangePassword(event)}>
        <strong className="settings-subheading">Change password</strong>

        {passwordError && <p className="settings-error" role="alert">{passwordError}</p>}

        <label htmlFor="settings-current-password">Current password</label>
        <div className="settings-password-field">
          <input
            id="settings-current-password"
            type={showCurrentPassword ? "text" : "password"}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            required
            disabled={isChangingPassword}
          />
          <button
            type="button"
            className="settings-password-toggle"
            aria-label={showCurrentPassword ? "Hide current password" : "Show current password"}
            aria-pressed={showCurrentPassword}
            disabled={isChangingPassword}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setShowCurrentPassword((visible) => !visible)}
          >
            {showCurrentPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        <label htmlFor="settings-new-password">New password</label>
        <div className="settings-password-field">
          <input
            id="settings-new-password"
            type={showNewPassword ? "text" : "password"}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            required
            disabled={isChangingPassword}
          />
          <button
            type="button"
            className="settings-password-toggle"
            aria-label={showNewPassword ? "Hide new password" : "Show new password"}
            aria-pressed={showNewPassword}
            disabled={isChangingPassword}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setShowNewPassword((visible) => !visible)}
          >
            {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        <label htmlFor="settings-confirm-password">Confirm new password</label>
        <div className="settings-password-field">
          <input
            id="settings-confirm-password"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
            required
            disabled={isChangingPassword}
          />
          <button
            type="button"
            className="settings-password-toggle"
            aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}
            aria-pressed={showConfirmPassword}
            disabled={isChangingPassword}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setShowConfirmPassword((visible) => !visible)}
          >
            {showConfirmPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>

        <button
          type="submit"
          className="settings-secondary settings-submit-right"
          disabled={isChangingPassword}
        >
          {isChangingPassword ? "Updating…" : "Change password"}
        </button>
      </form>
    );
  }

  function renderDeletion() {
    if (!deleteOpen) {
      return (
        <button
          type="button"
          className="settings-danger"
          aria-expanded={false}
          aria-controls="settings-delete-panel"
          onClick={() => setDeleteOpen(true)}
        >
          Permanently Delete Your Account
        </button>
      );
    }

    return (
      <>
        <button
          type="button"
          className="settings-danger"
          aria-expanded={true}
          aria-controls={confirmingDeletion && needsPasswordReauth
            ? "settings-delete-reauth"
            : "settings-delete-panel"}
          onClick={collapseDeletion}
        >
          Permanently Delete Your Account
        </button>

        {/*
          -----------------------------------------------------------
          Step 2 — re-authentication (password accounts, after Proceed)
          -----------------------------------------------------------
          This is a plain group with no <form> element and a non-submit
          button, so the browser gets no form submission to answer with a
          "Save password?" prompt. The only field is the Arcadia password
          itself: there is no username, email or confirmation word next to
          it for a password manager to pair with it, so the section can no
          longer be mistaken for a sign-in form.
        */}
        {confirmingDeletion && needsPasswordReauth ? (
          <div
            id="settings-delete-reauth"
            className="settings-form settings-delete-panel settings-delete-group"
            role="group"
            aria-labelledby="settings-delete-reauth-title"
          >
            {deleteError && <p className="settings-error" role="alert">{deleteError}</p>}

            <strong id="settings-delete-reauth-title" className="settings-subheading">
              Confirm it’s you
            </strong>
            <p className="settings-hint">
              Re-enter your Arcadia password to finish deleting your account. The server checks
              it to confirm the account owner is doing this — it is not a sign-in, and it is
              never stored or shown anywhere.
            </p>

            <label htmlFor="settings-delete-password">Your Arcadia password</label>
            <div className="settings-password-field">
              <input
                id="settings-delete-password"
                name="arcadia-account-deletion-password"
                type={showDeletePassword ? "text" : "password"}
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
                /* "new-password" stops a browser filling a saved password here. */
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                readOnly={!passwordArmed}
                onFocus={() => setPasswordArmed(true)}
                disabled={isDeleting}
              />
              <button
                type="button"
                className="settings-password-toggle"
                aria-label={showDeletePassword ? "Hide password" : "Show password"}
                aria-pressed={showDeletePassword}
                disabled={isDeleting}
                /* Keeps the caret in the input while the eye is clicked. */
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setShowDeletePassword((visible) => !visible)}
              >
                {showDeletePassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>

            <div className="settings-confirm-actions">
              <button
                type="button"
                className="settings-secondary"
                disabled={isDeleting}
                onClick={() => {
                  setDeleteError(null);
                  setConfirmingDeletion(false);
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="settings-danger"
                disabled={!canConfirmDeletion}
                onClick={() => void performDeletion(deletePassword)}
              >
                {isDeleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </div>
        ) : (
          /*
            ---------------------------------------------------------
            Step 1 — the typed confirmation
            ---------------------------------------------------------
            The only text field in this form is the confirmation word, and
            the form contains no password field, so it cannot be read as a
            username + password pair. Nothing here is a credential.
          */
          <form
            id="settings-delete-panel"
            className="settings-form settings-delete-panel"
            autoComplete="off"
            onSubmit={handleProceed}
          >
            {deleteError && <p className="settings-error" role="alert">{deleteError}</p>}

            {/* ---- A. Reason ---- */}
            <label htmlFor="settings-delete-reason">Why are you deleting your account?</label>
            <SettingsSelect
              id="settings-delete-reason"
              value={deleteReason}
              options={DELETE_REASONS}
              placeholder="Select a reason…"
              disabled={isDeleting}
              onChange={(next) => {
                setDeleteReason(next);
                // A different reason discards any comment written for the old one.
                setDeleteComment("");
              }}
            />

            {deleteReason === "OTHER" && (
              <>
                <label htmlFor="settings-delete-comment">Please tell us more (optional)</label>
                <textarea
                  id="settings-delete-comment"
                  className="settings-textarea"
                  value={deleteComment}
                  onChange={(event) => setDeleteComment(event.target.value)}
                  maxLength={500}
                  rows={3}
                  disabled={isDeleting}
                />
              </>
            )}

            {/* ---- B. Type-to-confirm ---- */}
            <label htmlFor="settings-delete-confirmation">
              Type DELETE to permanently delete your account.
            </label>
            <input
              id="settings-delete-confirmation"
              name="arcadia-delete-confirmation"
              type="text"
              placeholder="Type DELETE here"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
              readOnly={!confirmationArmed}
              onFocus={() => setConfirmationArmed(true)}
              disabled={isDeleting}
            />

            {/* ---- C. Final decision ---- */}
            <p className="settings-confirm-question">
              Are you sure you want to permanently delete your account?
            </p>
            <div className="settings-confirm-actions">
              <button
                type="button"
                className="settings-secondary"
                disabled={isDeleting}
                onClick={collapseDeletion}
              >
                No, Cancel
              </button>
              <button type="submit" className="settings-danger" disabled={!canProceedDeletion}>
                {isDeleting ? "Deleting…" : "Yes, Proceed"}
              </button>
            </div>
          </form>
        )}
      </>
    );
  }

  return createPortal(
    <div
      className="settings-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <div className="settings-header-title">
            <span className="settings-header-icon" aria-hidden="true"><GearIcon /></span>
            <h2 id="settings-title">Settings</h2>
          </div>
          <button
            type="button"
            className="settings-close arcadia-modal-close"
            aria-label="Close settings"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>

        <div className="settings-body">
          {isLoading ? (
            <p className="settings-message" aria-busy="true">
              Loading settings…
            </p>
          ) : loadError || !preferences ? (
            <div className="settings-load-failed">
              <p className="settings-error" role="alert">
                {loadError || LOAD_FAILED_MESSAGE}
              </p>
              <button type="button" className="settings-secondary" onClick={() => void loadPreferences()}>
                Retry
              </button>
            </div>
          ) : (
            <>
              {/* ---------------- Sound ---------------- */}
              <section className="settings-section" aria-labelledby="settings-sound-title">
                <div className="settings-section-heading">
                  <span className="settings-section-icon" aria-hidden="true"><SpeakerIcon /></span>
                  <div>
                    <strong id="settings-sound-title">Sound</strong>
                    <p className="settings-hint">
                      Applies to Arcadia sound effects. There is no audio playback in the app yet, so
                      these values are saved for when effects are added.
                    </p>
                  </div>
                  <label className="settings-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={preferences.soundEffects}
                      onChange={(event) =>
                        void savePreferences({ soundEffects: event.target.checked })}
                    />
                    <span aria-hidden="true" />
                    <span className="settings-visually-hidden">Sound effects</span>
                  </label>
                </div>

                <div className="settings-volume">
                  <label htmlFor="settings-volume">Volume</label>
                  <input
                    id="settings-volume"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={volume}
                    disabled={!preferences.soundEffects}
                    aria-valuetext={`${volume} percent`}
                    onChange={(event) => handleVolumeInput(Number(event.target.value))}
                    onPointerUp={flushVolume}
                    onKeyUp={flushVolume}
                    onBlur={flushVolume}
                  />
                  <span className="settings-volume-value">{volume}%</span>
                </div>
              </section>

              {/* ---------------- Privacy ---------------- */}
              <section className="settings-section" aria-labelledby="settings-privacy-title">
                <div className="settings-section-heading">
                  <span className="settings-section-icon" aria-hidden="true"><ShieldIcon /></span>
                  <div>
                    <strong id="settings-privacy-title">Privacy</strong>
                    <p className="settings-hint">
                      Enforced by Arcadia's servers, not just this screen.
                    </p>
                  </div>
                </div>

                <fieldset className="settings-options">
                  <legend>Who can view your profile</legend>
                  {PROFILE_VISIBILITY_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`settings-option${preferences.profileVisibility === option.value ? " settings-option--selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="profile-visibility"
                        value={option.value}
                        checked={preferences.profileVisibility === option.value}
                        onChange={() =>
                          void savePreferences({ profileVisibility: option.value })}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <fieldset className="settings-options">
                  <legend>Leaderboard visibility</legend>
                  {LEADERBOARD_VISIBILITY_OPTIONS.map((option) => (
                    <label
                      key={option.value}
                      className={`settings-option${preferences.leaderboardVisibility === option.value ? " settings-option--selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="leaderboard-visibility"
                        value={option.value}
                        checked={preferences.leaderboardVisibility === option.value}
                        onChange={() =>
                          void savePreferences({ leaderboardVisibility: option.value })}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </section>

              {/* ---------------- Reset ---------------- */}
              <section className="settings-section" aria-labelledby="settings-reset-title">
                <div className="settings-section-heading settings-section-heading--center">
                  <span className="settings-section-icon" aria-hidden="true"><ResetIcon /></span>
                  <div>
                    <strong id="settings-reset-title">Reset settings</strong>
                    <p className="settings-hint">
                      Restores every preference on this screen to its default. Your profile, XP and
                      matches are not affected.
                    </p>
                  </div>
                  {!confirmingReset && (
                    <button
                      type="button"
                      className="settings-secondary settings-heading-action"
                      onClick={() => setConfirmingReset(true)}
                    >
                      Reset
                    </button>
                  )}
                </div>

                {confirmingReset ? (
                  <div className="settings-confirm-row">
                    <span>Reset all settings to defaults?</span>
                    <div className="settings-confirm-actions">
                      <button
                        type="button"
                        className="settings-secondary"
                        disabled={isResetting}
                        onClick={() => setConfirmingReset(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="settings-danger"
                        disabled={isResetting}
                        onClick={() => void confirmReset()}
                      >
                        {isResetting ? "Resetting…" : "Yes, reset"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>

              {/* ---------------- Account & Security ---------------- */}
              <section className="settings-section" aria-labelledby="settings-account-title">
                <div className="settings-section-heading settings-section-heading--center">
                  <span className="settings-section-icon" aria-hidden="true"><LockIcon /></span>
                  <div>
                    <strong id="settings-account-title">Account &amp; Security</strong>
                  </div>
                </div>

                {renderChangePassword()}

                <div
                  className="settings-delete-group"
                  role="group"
                  aria-labelledby="settings-delete-title"
                >
                  <strong id="settings-delete-title" className="settings-subheading">
                    Delete account
                  </strong>
                  <p className="settings-hint">
                    Deleting your account permanently removes your profile, username and Player ID,
                    your XP, level and badges, your match history, and every signed-in session. This
                    cannot be undone.
                  </p>
                  {renderDeletion()}
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default SettingsModal;