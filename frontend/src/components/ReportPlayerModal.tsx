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
import { Check, ChevronDown, ShieldAlert, X } from "lucide-react";
import type { PublicPlayerProfile } from "../auth/authTypes";
import { getLocalAvatarOption, getSafeGoogleAvatarUrl } from "../auth/avatarCatalog";
import "./ReportPlayerModal.css";

type ReportPlayerModalProps = {
  profile: PublicPlayerProfile;
  onClose: () => void;
};

const REPORT_REASONS = [
  "Harassment or bullying",
  "Inappropriate username or avatar",
  "Cheating or unfair gameplay",
  "Impersonation",
  "Spam or suspicious activity",
  "Other",
] as const;

const MAX_DETAILS_LENGTH = 100;

type DropdownPosition = {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
};

function getInitials(username: string | null): string {
  const parts = (username ?? "Player").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function ReportPlayerModal({ profile, onClose }: ReportPlayerModalProps) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [activeReasonIndex, setActiveReasonIndex] = useState(0);
  const [keyboardReasonNavigation, setKeyboardReasonNavigation] = useState(false);
  const [reasonPosition, setReasonPosition] = useState<DropdownPosition | null>(null);
  const reasonTriggerRef = useRef<HTMLButtonElement>(null);
  const reasonListRef = useRef<HTMLUListElement>(null);
  const localAvatar = profile.avatar.type === "local"
    ? getLocalAvatarOption(profile.avatar.value)
    : null;
  const googleAvatarUrl = profile.avatar.type === "google"
    ? getSafeGoogleAvatarUrl(profile.avatarUrl)
    : null;
  const selectedReasonIndex = REPORT_REASONS.findIndex((option) => option === reason);
  const reasonListId = "report-player-reason-listbox";

  const closeReasonList = useCallback(() => {
    setReasonOpen(false);
    setReasonPosition(null);
  }, []);

  const chooseReason = useCallback((index: number) => {
    const selected = REPORT_REASONS[index];
    if (!selected) return;
    setReason(selected);
    setError(null);
    closeReasonList();
    reasonTriggerRef.current?.focus();
  }, [closeReasonList]);

  const openReasonList = useCallback(() => {
    setActiveReasonIndex(selectedReasonIndex >= 0 ? selectedReasonIndex : 0);
    setKeyboardReasonNavigation(false);
    setReasonOpen(true);
  }, [selectedReasonIndex]);

  useLayoutEffect(() => {
    if (!reasonOpen) return;

    const placeList = () => {
      const trigger = reasonTriggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const modalRect = trigger.closest(".report-player-modal")?.getBoundingClientRect();
      const gap = 6;
      const edge = 12;
      const desired = 202;
      const boundsTop = Math.max(edge, modalRect?.top ?? edge) + edge;
      const boundsBottom = Math.min(window.innerHeight - edge, modalRect?.bottom ?? window.innerHeight - edge) - edge;
      const boundsLeft = Math.max(edge, modalRect?.left ?? edge) + edge;
      const boundsRight = Math.min(window.innerWidth - edge, modalRect?.right ?? window.innerWidth - edge) - edge;
      const width = Math.min(Math.max(0, rect.width - 16), Math.max(0, boundsRight - boundsLeft));
      const left = Math.max(boundsLeft, Math.min(rect.left + 8, boundsRight - width));
      const below = boundsBottom - rect.bottom - gap;
      const above = rect.top - boundsTop - gap;
      const openUp = below < desired && above > below;
      const top = Math.max(boundsTop, Math.min(rect.bottom + gap, boundsBottom - desired));
      setReasonPosition(
        openUp
          ? { bottom: window.innerHeight - rect.top + gap, left, width }
          : { top, left, width },
      );
    };

    const onScroll = (event: Event) => {
      if (reasonListRef.current?.contains(event.target as Node)) return;
      placeList();
    };

    placeList();
    window.addEventListener("resize", placeList);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", placeList);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [reasonOpen]);

  useEffect(() => {
    if (!reasonOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (reasonTriggerRef.current?.contains(target) || reasonListRef.current?.contains(target)) return;
      closeReasonList();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeReasonList();
      reasonTriggerRef.current?.focus();
    };

    document.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [reasonOpen, closeReasonList]);

  useEffect(() => {
    if (!reasonOpen || !reasonPosition || activeReasonIndex < 0) return;
    const activeOption = reasonListRef.current?.children[activeReasonIndex] as HTMLElement | undefined;
    activeOption?.scrollIntoView({ block: "nearest" });
  }, [reasonOpen, reasonPosition, activeReasonIndex]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (reasonOpen) return;
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, reasonOpen]);

  function handleReasonKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!reasonOpen) openReasonList();
        else {
          setKeyboardReasonNavigation(true);
          setActiveReasonIndex((index) => Math.min(REPORT_REASONS.length - 1, index + 1));
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!reasonOpen) openReasonList();
        else {
          setKeyboardReasonNavigation(true);
          setActiveReasonIndex((index) => Math.max(0, index - 1));
        }
        break;
      case "Home":
        if (reasonOpen) {
          event.preventDefault();
          setKeyboardReasonNavigation(true);
          setActiveReasonIndex(0);
        }
        break;
      case "End":
        if (reasonOpen) {
          event.preventDefault();
          setKeyboardReasonNavigation(true);
          setActiveReasonIndex(REPORT_REASONS.length - 1);
        }
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!reasonOpen) openReasonList();
        else chooseReason(activeReasonIndex);
        break;
      case "Tab":
        if (reasonOpen) closeReasonList();
        break;
      default:
        break;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!REPORT_REASONS.some((option) => option === reason)) {
      setError("Choose a reason before submitting.");
      return;
    }

    setError("Reporting is not available yet. No report was submitted.");
  }

  return createPortal(
    <div
      className="report-player-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <section
        className="report-player-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-player-title"
        aria-describedby="report-player-subtitle"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="report-player-header">
          <div className="report-player-heading">
            <span className="report-player-heading-icon mpm-header-icon" aria-hidden="true">
              <ShieldAlert />
            </span>
            <div>
              <h2 id="report-player-title">Report Player</h2>
              <p id="report-player-subtitle">Help keep Arcadia safe and fair.</p>
            </div>
          </div>
          <button
            type="button"
            className="report-player-close mpm-close arcadia-modal-close"
            aria-label="Close report dialog"
            title="Close"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <form className="report-player-form" onSubmit={handleSubmit}>
          <div className="report-player-target">
            <span className="report-player-field-label">Reported player</span>
            <div className="report-player-target-card">
              <span
                className={`report-player-avatar${localAvatar ? ` ${localAvatar.className}` : ""}`}
                style={localAvatar ? { background: localAvatar.background } : undefined}
              >
                {googleAvatarUrl && !avatarFailed ? (
                  <img
                    src={googleAvatarUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  getInitials(profile.username)
                )}
              </span>
              <span className="report-player-target-identity">
                <strong>{profile.username ?? "Player"}</strong>
                <span>Player ID: {profile.playerId ?? "Unavailable"}</span>
              </span>
            </div>
          </div>

          <div className="report-player-field">
            <span id="report-player-reason-label">Why are you reporting this player?</span>
            <div className="report-player-reason-select">
              <button
                ref={reasonTriggerRef}
                id="report-player-reason"
                type="button"
                className={`report-player-reason-trigger${reasonOpen ? " report-player-reason-trigger--open" : ""}`}
                autoFocus
                aria-labelledby="report-player-reason-label"
                aria-haspopup="listbox"
                aria-expanded={reasonOpen}
                aria-controls={reasonListId}
                aria-activedescendant={reasonOpen ? `report-player-reason-option-${activeReasonIndex}` : undefined}
                aria-required="true"
                onClick={() => (reasonOpen ? closeReasonList() : openReasonList())}
                onKeyDown={handleReasonKeyDown}
                onKeyUp={(event) => {
                  if (event.key === " ") event.preventDefault();
                }}
              >
                <span className={reason ? "" : "report-player-reason-placeholder"}>
                  {reason || "Select a reason"}
                </span>
                <ChevronDown aria-hidden="true" />
              </button>
              {reasonOpen && reasonPosition && createPortal(
                <ul
                  ref={reasonListRef}
                  id={reasonListId}
                  role="listbox"
                  aria-labelledby="report-player-reason-label"
                  className={`report-player-reason-list${reasonPosition.bottom !== undefined ? " report-player-reason-list--up" : ""}`}
                  style={{
                    top: reasonPosition.top,
                    bottom: reasonPosition.bottom,
                    left: reasonPosition.left,
                    width: reasonPosition.width,
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {REPORT_REASONS.map((option, index) => (
                    <li
                      key={option}
                      id={`report-player-reason-option-${index}`}
                      role="option"
                      aria-selected={option === reason}
                      className={
                        "report-player-reason-option" +
                        (keyboardReasonNavigation && index === activeReasonIndex ? " report-player-reason-option--active" : "") +
                        (option === reason ? " report-player-reason-option--selected" : "")
                      }
                      onPointerEnter={() => setKeyboardReasonNavigation(false)}
                      onClick={() => chooseReason(index)}
                    >
                      <span>{option}</span>
                      {option === reason && <Check aria-hidden="true" />}
                    </li>
                  ))}
                </ul>,
                document.body,
              )}
            </div>
          </div>

          <label className="report-player-field" htmlFor="report-player-details">
            <span className="report-player-details-label">
              Additional details <span>(optional)</span>
            </span>
            <textarea
              id="report-player-details"
              name="details"
              value={details}
              maxLength={MAX_DETAILS_LENGTH}
              placeholder="Describe what happened (optional)..."
              rows={4}
              onChange={(event) => {
                setDetails(event.target.value);
                setError(null);
              }}
            />
            <span className="report-player-character-count">
              {details.length}/{MAX_DETAILS_LENGTH}
            </span>
          </label>

          {error && <p className="report-player-error" role="alert">{error}</p>}

          <footer className="report-player-footer">
            <button type="button" className="report-player-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="report-player-submit" disabled={!reason}>
              Submit Report
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  );
}

export default ReportPlayerModal;