import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  FAQ_CATEGORY_MAP,
  FAQ_ITEMS,
  HELP_CATEGORIES,
  type FaqAnswerBlock,
  type FaqItem,
  type HelpCategory,
} from "./FAQdata";
import { SUPPORT_EMAIL } from "./Supportconfig";
import "./HelpSupportModal.css";

/* ===========================================================
   ICONS — inline SVGs, same stroke style as the other Arcadia modals.
   =========================================================== */

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3.5" y="13.5" width="4" height="6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="16.5" y="13.5" width="4" height="6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M18.5 19.5c0 1.4-1.6 2-4 2h-1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5 19 19M19 5 5 19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6 9.5 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.6 21 19.4H3L12 3.6Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 10v4.2M12 16.9v.1" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M4.5 19.5c1.6-3.4 4.6-5 7.5-5s5.9 1.6 7.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ControllerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.6" y="7.5" width="18.8" height="10" rx="5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 10.2v4M5 12.2h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="15.4" cy="10.8" r="1" fill="currentColor" />
      <circle cx="17.8" cy="13.2" r="1" fill="currentColor" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.2 19 6v6c0 4-3 7.2-7 8.8-4-1.6-7-4.8-7-8.8V6l7-2.8Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.2 12.1 11.3 14.2l3.6-3.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.6 6.2a4 4 0 0 0 4.9 4.9l-9.2 9.2a2.2 2.2 0 0 1-3.1-3.1l9.2-9.2a4 4 0 0 0-1.8-1.8Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m14.6 6.2 2.2-2.2 2.4 2.4-2.2 2.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function HelpSearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.4 9.6a1.7 1.7 0 1 1 2.4 1.5c-.5.3-.8.6-.8 1.2M11 14v.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5.5 12.5 4.2 4.2 8.8-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CATEGORY_ICONS: Record<HelpCategory, ComponentType> = {
  Account: UserIcon,
  Gameplay: ControllerIcon,
  Privacy: ShieldIcon,
  "Technical Issues": WrenchIcon,
};

function getAnswerSearchText(block: FaqAnswerBlock): string {
  return block.type === "paragraph" ? block.text : block.items.join(" ");
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m4.5 8 7.5 5.4L19.5 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ===========================================================
   TYPES AND RULES
   =========================================================== */

export const REPORT_CATEGORIES = ["Bug", "Login Issue", "Gameplay", "Account", "Other"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export type SupportReportPayload = {
  category: ReportCategory;
  subject: string;
  description: string;
};

const SUBJECT_MAX = 100;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 2000;

type FieldErrors = { subject?: string; description?: string };

function validate(subject: string, description: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!subject.trim()) errors.subject = "Enter a subject.";
  const trimmed = description.trim();
  if (!trimmed) errors.description = "Describe the problem.";
  else if (trimmed.length < DESCRIPTION_MIN)
    errors.description = `Add a little more detail (at least ${DESCRIPTION_MIN} characters).`;
  return errors;
}

/* ===========================================================
   CATEGORY DROPDOWN — the native <select> popup cannot be themed, so the
   Report a Problem category uses a small listbox in Arcadia's style.
   =========================================================== */

type CategoryDropdownProps = {
  id: string;
  value: ReportCategory | null;
  open: boolean;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: ReportCategory) => void;
};

function CategoryDropdown({ id, value, open, disabled, onOpenChange, onChange }: CategoryDropdownProps) {
  const [active, setActive] = useState(0);
  const [keyboardActive, setKeyboardActive] = useState(false);
  const listId = `${id}-list`;

  const openList = () => {
    setActive(value ? REPORT_CATEGORIES.indexOf(value) : 0);
    setKeyboardActive(false);
    onOpenChange(true);
  };

  const choose = (option: ReportCategory) => {
    onChange(option);
    onOpenChange(false);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const last = REPORT_CATEGORIES.length - 1;
    if (event.key === "Escape" && open) {
      /* Closes the list only, not the whole dialog. */
      event.stopPropagation();
      onOpenChange(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openList();
        setKeyboardActive(true);
      } else {
        setKeyboardActive(true);
        setActive((index) => (event.key === "ArrowDown" ? (index === last ? 0 : index + 1) : index === 0 ? last : index - 1));
      }
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setKeyboardActive(true);
      setActive(0);
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setKeyboardActive(true);
      setActive(last);
    } else if ((event.key === "Enter" || event.key === " ") && open) {
      event.preventDefault();
      choose(REPORT_CATEGORIES[active]);
    } else if (event.key === "Tab") {
      onOpenChange(false);
    }
  };

  return (
    <div className={`hsm-dd${open ? " is-open" : ""}`}>
      <button
        type="button"
        id={id}
        className="hsm-dd-trigger"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${id}-opt-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? onOpenChange(false) : openList())}
        onKeyDown={handleKeyDown}
      >
        <span>{value ?? "Select category"}</span>
        <span className="hsm-chevron">
          <ChevronIcon />
        </span>
      </button>
      {open && (
        <ul className="hsm-dd-list" id={listId} role="listbox" aria-labelledby={`${id}-label`}>
          {REPORT_CATEGORIES.map((option, index) => (
            <li
              key={option}
              id={`${id}-opt-${index}`}
              role="option"
              aria-selected={option === value}
              className={`hsm-dd-option${keyboardActive && index === active ? " is-active" : ""}${option === value ? " is-selected" : ""}`}
              onMouseMove={() => setKeyboardActive(false)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span>{option}</span>
              {option === value && <CheckIcon />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ===========================================================
   PROPS

   `onSubmitReport` must send the report to the backend and resolve only once
   the backend has accepted it; a rejection is shown as the form error. When it
   is not provided nothing can be sent, so submitting shows an inline error
   instead of pretending to succeed.

   `supportEmail` overrides SUPPORT_EMAIL from ./supportConfig. The mail link is
   only rendered when a verified address is configured.
   =========================================================== */

type HelpSupportModalProps = {
  onClose: () => void;
  onSubmitReport?: (payload: SupportReportPayload) => Promise<unknown>;
  supportEmail?: string;
};

function HelpSupportModal({ onClose, onSubmitReport, supportEmail }: HelpSupportModalProps) {
  const email = (supportEmail ?? SUPPORT_EMAIL).trim();
  const uid = useId();
  const titleId = `${uid}-title`;

  /* ---------- FAQ: search + accordion ---------- */
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const questionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  /* Search and category are independent filters; an item must pass both. */
  const visibleItems: FaqItem[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (selectedCategory && !FAQ_CATEGORY_MAP[item.id]?.includes(selectedCategory)) return false;
      if (!needle) return true;
      return (
        item.question.toLowerCase().includes(needle) ||
        item.answer.some((block) => getAnswerSearchText(block).toLowerCase().includes(needle))
      );
    });
  }, [query, selectedCategory]);

  const filtersActive = query.trim() !== "" || selectedCategory !== null;

  const clearFilters = () => {
    setQuery("");
    setSelectedCategory(null);
  };

  const toggle = (id: string) => setOpenId((current) => (current === id ? null : id));

  /* An open answer closes as soon as the filters change, however they change
     (typing, category buttons, Clear filters, Clear Filters in the empty state). */
  useEffect(() => {
    setOpenId(null);
  }, [query, selectedCategory]);

  /* ...and when the user presses or moves focus anywhere outside the open
     question and its answer. Pressing another question is left to that
     question's own toggle, so switching between questions still works. */
  useEffect(() => {
    if (openId === null) return;
    const isInsideFaq = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(target.closest(".hsm-faq-item.is-open, .hsm-faq-question"));
    const closeIfOutside = (event: Event) => {
      if (!isInsideFaq(event.target)) setOpenId(null);
    };
    document.addEventListener("pointerdown", closeIfOutside, true);
    document.addEventListener("focusin", closeIfOutside, true);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside, true);
      document.removeEventListener("focusin", closeIfOutside, true);
    };
  }, [openId]);

  const handleQuestionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = visibleItems.length - 1;
    let next = -1;
    if (event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next < 0) return;
    event.preventDefault();
    questionRefs.current[visibleItems[next].id]?.focus();
  };

  /* ---------- Report form ---------- */
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const clearFeedback = () => {
    setSubmitError(null);
    setSubmitted(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !category) return;

    const nextErrors = validate(subject, description);
    setErrors(nextErrors);
    clearFeedback();
    if (nextErrors.subject || nextErrors.description) return;

    if (!onSubmitReport) {
      setSubmitError("Reporting isn't connected yet, so your report was not sent.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitReport({
        category,
        subject: subject.trim(),
        description: description.trim(),
      });
      setSubmitted(true);
      setSubject("");
      setDescription("");
      setCategory(null);
    } catch (error) {
      setSubmitError(
        error instanceof Error && error.message
          ? error.message
          : "We couldn't send your report. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Closing ---------- */
  const handleClose = useCallback(() => onClose(), [onClose]);

  /* Escape closes only this dialog; the Profile Popup underneath is untouched. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      handleClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  const resultsLabel =
    visibleItems.length === 0
      ? "No matching questions"
      : `${visibleItems.length} ${visibleItems.length === 1 ? "question" : "questions"} shown`;

  return createPortal(
    <div
      className="hsm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <section
        className="hsm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={() => {
          if (categoryDropdownOpen) setCategoryDropdownOpen(false);
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {/* ---------- Header ---------- */}
        <header className="hsm-header">
          <div className="hsm-header-title">
            <span className="hsm-header-icon">
              <HeadsetIcon />
            </span>
            <div>
              <h2 id={titleId}>Help &amp; Support</h2>
              <p className="hsm-subtitle">Need help? We're here to help you get back in the game.</p>
            </div>
          </div>
          <button
            type="button"
            className="hsm-close arcadia-modal-close"
            aria-label="Close Help & Support"
            onClick={handleClose}
          >
            <CloseIcon />
          </button>
        </header>

        <div className="hsm-body">
          {/* ---------- Welcome + search ---------- */}
          <div className="hsm-welcome">
            <h3>How can we help?</h3>
            <p>Find answers, solve issues, and get back to the game.</p>
            <div className="hsm-search">
              <span className="hsm-search-icon">
                <SearchIcon />
              </span>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for help..."
                aria-label="Search for help"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  className="hsm-search-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <div className="hsm-quick" role="group" aria-label="Quick help categories">
              {HELP_CATEGORIES.map((name) => {
                const Icon = CATEGORY_ICONS[name];
                const selected = selectedCategory === name;
                return (
                  <button
                    key={name}
                    type="button"
                    className={`hsm-quick-btn${selected ? " is-selected" : ""}`}
                    aria-pressed={selected}
                    onClick={() => setSelectedCategory(selected ? null : name)}
                  >
                    <span className="hsm-quick-icon">
                      <Icon />
                    </span>
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
            <span className="hsm-visually-hidden" role="status" aria-live="polite">
              {resultsLabel}
            </span>
          </div>

          {/* ---------- FAQ ---------- */}
          <section className="hsm-section" aria-labelledby={`${uid}-faq`}>
            <div className="hsm-section-head">
              <h3 className="hsm-section-title" id={`${uid}-faq`}>
                Frequently Asked Questions
              </h3>
              {filtersActive && visibleItems.length > 0 && (
                <button type="button" className="hsm-link-btn" onClick={clearFilters}>
                  Clear filters
                </button>
              )}
            </div>

            {visibleItems.length === 0 ? (
              <div className="hsm-empty">
                <span className="hsm-empty-icon">
                  <HelpSearchIcon />
                </span>
                <strong>No matching questions found</strong>
                <span>Try a different search or choose another category.</span>
                <button type="button" className="hsm-clear-btn" onClick={clearFilters}>
                  Clear Filters
                </button>
              </div>
            ) : (
              <ul className="hsm-faq">
                {visibleItems.map((item, index) => {
                  const open = openId === item.id;
                  const panelId = `${uid}-panel-${item.id}`;
                  const buttonId = `${uid}-q-${item.id}`;
                  return (
                    <li key={item.id} className={`hsm-faq-item${open ? " is-open" : ""}`}>
                      <h4>
                        <button
                          type="button"
                          id={buttonId}
                          ref={(node) => {
                            questionRefs.current[item.id] = node;
                          }}
                          className="hsm-faq-question"
                          aria-expanded={open}
                          aria-controls={panelId}
                          onClick={() => toggle(item.id)}
                          onKeyDown={(event) => handleQuestionKeyDown(event, index)}
                        >
                          <span>{item.question}</span>
                          <span className="hsm-chevron">
                            <ChevronIcon />
                          </span>
                        </button>
                      </h4>
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={buttonId}
                        className="hsm-faq-panel"
                        aria-hidden={!open}
                      >
                        <div className="hsm-faq-panel-inner">
                          {item.answer.map((block, blockIndex) => {
                            if (block.type === "paragraph") {
                              return <p key={blockIndex}>{block.text}</p>;
                            }
                            if (block.type === "ordered-list") {
                              return (
                                <ol className="hsm-faq-answer-list" key={blockIndex}>
                                  {block.items.map((text) => <li key={text}>{text}</li>)}
                                </ol>
                              );
                            }
                            return (
                              <ul className="hsm-faq-answer-list" key={blockIndex}>
                                {block.items.map((text) => <li key={text}>{text}</li>)}
                              </ul>
                            );
                          })}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ---------- Report a Problem ---------- */}
          <section className="hsm-section hsm-report" aria-labelledby={`${uid}-report`}>
            <h3 className="hsm-section-title hsm-with-icon" id={`${uid}-report`}>
              <span className="hsm-title-icon">
                <ReportIcon />
              </span>
              Report a Problem
            </h3>

            <form className="hsm-form" onSubmit={handleSubmit} noValidate>
              <div className="hsm-field">
                <label id={`${uid}-category-label`} htmlFor={`${uid}-category`}>Category</label>
                <CategoryDropdown
                  id={`${uid}-category`}
                  value={category}
                  open={categoryDropdownOpen}
                  disabled={submitting}
                  onOpenChange={setCategoryDropdownOpen}
                  onChange={(next) => {
                    setCategory(next);
                    clearFeedback();
                  }}
                />
              </div>

              <div className="hsm-field">
                <label htmlFor={`${uid}-subject`}>Subject</label>
                <input
                  id={`${uid}-subject`}
                  type="text"
                  value={subject}
                  maxLength={SUBJECT_MAX}
                  disabled={submitting}
                  placeholder="Briefly describe the issue"
                  aria-invalid={Boolean(errors.subject)}
                  aria-describedby={`${uid}-subject-err`}
                  onChange={(event) => {
                    setSubject(event.target.value);
                    if (errors.subject) setErrors((current) => ({ ...current, subject: undefined }));
                    clearFeedback();
                  }}
                />
                <span className="hsm-error" id={`${uid}-subject-err`} role={errors.subject ? "alert" : undefined}>
                  {errors.subject ?? ""}
                </span>
              </div>

              <div className="hsm-field">
                <label htmlFor={`${uid}-description`}>Description</label>
                <textarea
                  id={`${uid}-description`}
                  rows={4}
                  value={description}
                  maxLength={DESCRIPTION_MAX}
                  disabled={submitting}
                  placeholder="What happened, and what did you expect to happen?"
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={`${uid}-description-err`}
                  onChange={(event) => {
                    setDescription(event.target.value);
                    if (errors.description) setErrors((current) => ({ ...current, description: undefined }));
                    clearFeedback();
                  }}
                />
                <span className="hsm-error" id={`${uid}-description-err`} role={errors.description ? "alert" : undefined}>
                  {errors.description ?? ""}
                </span>
              </div>

              <div className="hsm-form-footer">
                <div className="hsm-status" aria-live="polite">
                  {submitError && <span className="hsm-status-error">{submitError}</span>}
                  {submitted && <span className="hsm-status-ok">Your report was submitted.</span>}
                </div>
                <button
                  type="submit"
                  className="hsm-submit"
                  disabled={submitting || !category}
                  aria-busy={submitting}
                >
                  {submitting ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          </section>

          {/* ---------- Contact Support ---------- */}
          <section className="hsm-section hsm-contact" aria-labelledby={`${uid}-contact`}>
            <span className="hsm-title-icon">
              <MailIcon />
            </span>
            <div className="hsm-contact-text">
              <h3 className="hsm-section-title" id={`${uid}-contact`}>
                Contact Support
              </h3>
              <p>Still need help? Get in touch with our support team.</p>
              {email && <a href={`mailto:${email}`}>{email}</a>}
            </div>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default HelpSupportModal;