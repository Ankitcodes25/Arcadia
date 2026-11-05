/*
 * AdminKit — small, self-contained building blocks for the Admin Panel pages.
 *
 * Everything here is styled by AdminKit.css under the `adk-` prefix, so the
 * pages look the same no matter what the older shared theme does. The older
 * components (AdminLayout, AdminModal, StatusBadge, TierBadge, PreviewDataNotice)
 * are still used as they are.
 */

import type { CSSProperties, ReactNode } from "react";
import { Inbox, Search, X } from "lucide-react";
import { usePanelPreferences } from "../hooks/panelPreferences";
import "./AdminKit.css";

/* ===========================================================
   TONES
   =========================================================== */

export type Tone = "violet" | "green" | "amber" | "rose" | "blue" | "neutral";

const TONE_COLORS: Record<Tone, string> = {
  violet: "#b45cff",
  green: "#4fe3a0",
  amber: "#ffc966",
  rose: "#ff6b8b",
  blue: "#7cc4ff",
  neutral: "#a99bc4",
};

export function toneStyle(tone: Tone): CSSProperties {
  return { "--tone": TONE_COLORS[tone] } as CSSProperties;
}

/* Colour for a status label. Unknown labels fall back to violet. */
export function toneForStatus(status: string): Tone {
  switch (status.toLowerCase()) {
    case "active":
    case "published":
    case "live":
    case "sent":
    case "resolved":
    case "completed":
      return "green";
    case "pending":
    case "scheduled":
    case "maintenance":
    case "under review":
    case "in progress":
      return "amber";
    case "suspended":
    case "failed":
    case "disabled":
      return "rose";
    case "open":
    case "new":
      return "blue";
    case "draft":
    case "dismissed":
    case "closed":
      return "neutral";
    default:
      return "violet";
  }
}

export function toneForPriority(priority: string): Tone {
  switch (priority.toLowerCase()) {
    case "high":
      return "rose";
    case "normal":
      return "blue";
    default:
      return "neutral";
  }
}

/* ===========================================================
   PAGE SHELL + HEADER
   =========================================================== */

/* Wraps a page: consistent spacing, fade-in, and the "Compact tables" setting. */
export function PageShell({ children }: { children: ReactNode }) {
  const preferences = usePanelPreferences();

  return (
    <div className={`adk-page${preferences.compactTables ? " adk-page--compact" : ""}`}>
      {children}
    </div>
  );
}

type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <header className="adk-header">
      {icon ? (
        <span className="adk-header__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="adk-header__text">
        <h2 className="adk-header__title">{title}</h2>
        {subtitle ? <p className="adk-header__sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="adk-header__actions">{actions}</div> : null}
    </header>
  );
}

/* ===========================================================
   METRIC CARD
   =========================================================== */

type MetricCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  tone?: Tone;
  /** 0-100. Draws a small progress bar under the number. */
  meter?: number;
};

export function MetricCard({ label, value, hint, icon, tone = "violet", meter }: MetricCardProps) {
  const percent = meter === undefined ? null : Math.max(0, Math.min(100, Math.round(meter)));

  return (
    <article className="adk-metric" style={toneStyle(tone)}>
      <span className="adk-metric__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="adk-metric__body">
        <span className="adk-metric__label">{label}</span>
        <strong className="adk-metric__value">{value}</strong>
        {hint ? <span className="adk-metric__hint">{hint}</span> : null}
      </div>
      {percent !== null ? (
        <div
          className="adk-metric__meter"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </article>
  );
}

/* ===========================================================
   PANEL
   =========================================================== */

type PanelProps = {
  title?: string;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  /** No inner padding: for tables and lists that go edge to edge. */
  flush?: boolean;
  className?: string;
  children: ReactNode;
};

export function Panel({ title, subtitle, icon, action, flush = false, className, children }: PanelProps) {
  return (
    <section className={`adk-panel${flush ? " adk-panel--flush" : ""}${className ? ` ${className}` : ""}`}>
      {title ? (
        <div className="adk-panel__head">
          {icon ? (
            <span className="adk-panel__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="adk-panel__heading">
            <h3 className="adk-panel__title">{title}</h3>
            {subtitle ? <p className="adk-panel__sub">{subtitle}</p> : null}
          </div>
          {action ? <div className="adk-panel__action">{action}</div> : null}
        </div>
      ) : null}
      <div className="adk-panel__body">{children}</div>
    </section>
  );
}

/* ===========================================================
   FILTER TABS  (replaces the plain status dropdowns)
   =========================================================== */

type FilterTabsProps<T extends string> = {
  label: string;
  options: Array<{ value: T; label: string; count?: number; tone?: Tone }>;
  value: T;
  onChange: (value: T) => void;
};

export function FilterTabs<T extends string>({ label, options, value, onChange }: FilterTabsProps<T>) {
  return (
    <div className="adk-tabs" role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`adk-tab${active ? " adk-tab--active" : ""}`}
            style={toneStyle(option.tone ?? "violet")}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined ? <span className="adk-tab__count">{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ===========================================================
   SEARCH FIELD
   =========================================================== */

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
};

export function SearchField({ value, onChange, placeholder, ariaLabel }: SearchFieldProps) {
  return (
    <label className="adk-search">
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className="adk-search__clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          <X size={13} aria-hidden="true" />
        </button>
      ) : null}
    </label>
  );
}

/* ===========================================================
   SMALL PIECES
   =========================================================== */

export function Chip({
  tone = "violet",
  dot = false,
  icon,
  children,
}: {
  tone?: Tone;
  dot?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="adk-chip" style={toneStyle(tone)}>
      {dot ? <span className="adk-chip__dot" aria-hidden="true" /> : null}
      {icon ? <span className="adk-chip__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/[\s_\-.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({
  name,
  tone = "violet",
  size = "md",
}: {
  name: string;
  tone?: Tone;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  return (
    <span className={`adk-avatar adk-avatar--${size}`} style={toneStyle(tone)} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

/* Avatar + name + a small line under it. */
export function Person({
  name,
  sub,
  tone,
  size = "md",
}: {
  name: string;
  sub?: ReactNode;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className="adk-person">
      <Avatar name={name} tone={tone} size={size} />
      <span className="adk-person__text">
        <span className="adk-person__name">{name}</span>
        {sub ? <span className="adk-person__sub">{sub}</span> : null}
      </span>
    </span>
  );
}

export function Note({ tone = "amber", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <p className="adk-note" style={toneStyle(tone)} role="note">
      {children}
    </p>
  );
}

export function DetailText({ children }: { children: ReactNode }) {
  return <p className="adk-detail">{children}</p>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="adk-section-title">{children}</h4>;
}

export function KeyValueGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="adk-kv-grid">
      {items.map((item) => (
        <div key={item.label} className="adk-kv">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="adk-empty">
      <span className="adk-empty__icon" aria-hidden="true">
        {icon ?? <Inbox size={24} />}
      </span>
      <strong className="adk-empty__title">{title}</strong>
      {hint ? <span className="adk-empty__hint">{hint}</span> : null}
      {action}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`adk-toggle${checked ? " adk-toggle--on" : ""}`}
      onClick={onChange}
    />
  );
}