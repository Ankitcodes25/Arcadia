/*
 * All Players — searchable, filterable table with a Player Details modal.
 *
 * The table stays clean (identity, id, username, level, XP, status, joined);
 * every other detail lives in the modal opened by clicking a row. Data is
 * development-preview only (see data/previewData.ts).
 *
 * Toolbar: search + Status + Level + Clear filters, all in ONE row, with
 * themed dropdowns. The page heading scrolls away; then the toolbar and the
 * column heading stay fixed and only the rows scroll (inside the list box).
 * Players are sorted A-Z by name.
 *
 * Player name: the name fetched from the player's Google login account
 * (`googleName`) is shown when present; otherwise it falls back to displayName.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  ArrowDownAZ,
  ArrowUpZA,
  Ban,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  Crown,
  Flame,
  RotateCcw,
  Search,
  X,
  Zap,
} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { StatusBadge, TierBadge } from "../components/AdminDisplay";
import { previewPlayers } from "../data/previewData";
import { formatDate, formatNumber, formatRelativeTime } from "../utils/formatters";
import type { PreviewPlayer } from "../types/adminTypes";
import "./PlayersPage.css";

/*
 * `googleName` = display name that came from the Google sign-in.
 * Best place for this field is PreviewPlayer in types/adminTypes.ts
 * (googleName?: string). Until then this local type keeps the page compiling.
 */
type AdminPlayer = PreviewPlayer & { googleName?: string };

function getPlayerName(player: AdminPlayer): string {
  return player.googleName?.trim() || player.displayName;
}

/* ---------------- Themed dropdown ---------------- */

/*
 * Dropdown me "All ..." option nahi hota, sirf asli options. Koi option select
 * hone par trigger ka icon + rang us option ka ho jata hai; same option par
 * dobara click karne se (ya Clear filters se) wapas default icon aa jata hai.
 */
type SelectOption = { value: string; label: string; icon: ReactNode; color: string };

type FilterSelectProps = {
  label: string;
  placeholder: string;
  defaultIcon: ReactNode;
  options: SelectOption[];
  value: string; // "all" = kuch select nahi
  onChange: (value: string) => void;
};

function FilterSelect({ label, placeholder, defaultIcon, options, value, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="plp-select" ref={rootRef}>
      <button
        type="button"
        className={`plp-select__trigger${open ? " plp-select__trigger--open" : ""}${
          current ? " plp-select__trigger--active" : ""
        }`}
        style={current ? ({ "--plp-accent": current.color } as CSSProperties) : undefined}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <span className="plp-select__icon">{current ? current.icon : defaultIcon}</span>
        <span className="plp-select__value">{current ? current.label : placeholder}</span>
        <span className="plp-select__chevron">
          <ChevronDown size={16} aria-hidden="true" />
        </span>
      </button>

      {open ? (
        <ul className="plp-select__menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const selected = option.value === value;

            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`plp-select__option${selected ? " plp-select__option--selected" : ""}`}
                  style={{ "--plp-accent": option.color } as CSSProperties}
                  onClick={() => {
                    onChange(selected ? "all" : option.value);
                    setOpen(false);
                  }}
                >
                  <span className="plp-select__option-icon">{option.icon}</span>
                  <span className="plp-select__option-label">{option.label}</span>
                  {selected ? <span className="plp-select__check" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: "Active", label: "Active", color: "#4fe3a0", icon: <CheckCircle2 size={16} aria-hidden="true" /> },
  { value: "Suspended", label: "Suspended", color: "#ff6b8b", icon: <Ban size={16} aria-hidden="true" /> },
  { value: "Pending", label: "Pending", color: "#ffc966", icon: <Clock size={16} aria-hidden="true" /> },
];

const LEVEL_OPTIONS: SelectOption[] = [
  { value: "beginner", label: "Beginner (1–9)", color: "#6ee7b7", icon: <Zap size={16} aria-hidden="true" /> },
  { value: "intermediate", label: "Intermediate (10–39)", color: "#7cc4ff", icon: <Flame size={16} aria-hidden="true" /> },
  { value: "advanced", label: "Advanced (40+)", color: "#e08bff", icon: <Crown size={16} aria-hidden="true" /> },
];

/* ---------------- Details modal ---------------- */

function PlayerDetailsModal({ player, onClose }: { player: AdminPlayer; onClose: () => void }) {
  const xpPercent = Math.min(100, Math.round((player.xpIntoLevel / player.xpPerLevel) * 100));
  const name = getPlayerName(player);

  return (
    <AdminModal
      title={name}
      subtitle={`@${player.username} · ${player.playerId}`}
      onClose={onClose}
      wide
      footer={
        <button type="button" className="adm-btn" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="plm-identity">
        <span className="adm-avatar plm-identity__avatar" aria-hidden="true">
          {player.avatar}
        </span>
        <div>
          <div className="plm-identity__row">
            <strong>{name}</strong>
            <TierBadge badge={player.badge} />
            <StatusBadge status={player.status} />
          </div>
          <span className="plm-identity__meta">
            @{player.username} · <span className="adm-mono">{player.playerId}</span>
          </span>
        </div>
      </div>

      <h4 className="adm-modal__section-title">Progression</h4>
      <div className="adm-xp-row">
        <span>
          Level <strong>{player.level}</strong>
        </span>
        <span>
          <strong>{formatNumber(player.xpIntoLevel)}</strong> / {formatNumber(player.xpPerLevel)} XP to next level
        </span>
      </div>
      <div className="adm-progress" role="progressbar" aria-valuenow={xpPercent} aria-valuemin={0} aria-valuemax={100}>
        <div className="adm-progress__fill" style={{ width: `${xpPercent}%` }} />
      </div>
      <div className="adm-xp-row" style={{ marginTop: 6 }}>
        <span>
          Total XP: <strong>{formatNumber(player.totalXp)}</strong>
        </span>
      </div>

      <h4 className="adm-modal__section-title">Gaming statistics</h4>
      <div className="adm-mini-stats">
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Matches</span>
          <span className="adm-mini-stat__value">{formatNumber(player.stats.matchesPlayed)}</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Wins</span>
          <span className="adm-mini-stat__value">{formatNumber(player.stats.wins)}</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Losses</span>
          <span className="adm-mini-stat__value">{formatNumber(player.stats.losses)}</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Draws</span>
          <span className="adm-mini-stat__value">{formatNumber(player.stats.draws)}</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Win rate</span>
          <span className="adm-mini-stat__value">{player.stats.winRate}%</span>
        </div>
        <div className="adm-mini-stat">
          <span className="adm-mini-stat__label">Favourite</span>
          <span className="adm-mini-stat__value">{player.stats.favoriteGame}</span>
        </div>
      </div>

      <h4 className="adm-modal__section-title">Account</h4>
      <div className="adm-kv-grid">
        <div className="adm-kv">
          <span className="adm-kv__label">Status</span>
          <span className="adm-kv__value">
            <StatusBadge status={player.status} />
          </span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Joined</span>
          <span className="adm-kv__value">{formatDate(player.joinedDate)}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Last active</span>
          <span className="adm-kv__value">{formatRelativeTime(player.lastActive)}</span>
        </div>
      </div>

      <h4 className="adm-modal__section-title">Moderation</h4>
      <div className="adm-kv-grid">
        <div className="adm-kv">
          <span className="adm-kv__label">Warnings</span>
          <span className="adm-kv__value">{player.moderation.warnings}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Reports against</span>
          <span className="adm-kv__value">{player.moderation.reportsAgainst}</span>
        </div>
        <div className="adm-kv">
          <span className="adm-kv__label">Last action</span>
          <span className="adm-kv__value">{player.moderation.lastAction ?? "None"}</span>
        </div>
      </div>
      <p className="plm-note">
        Moderation actions are display-only in this preview. Suspension, deletion or banning requires
        a future backend integration and explicit authorization.
      </p>
    </AdminModal>
  );
}

/* ---------------- Page ---------------- */

function PlayersPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sortAsc, setSortAsc] = useState(true); // A-Z by default
  const [selectedPlayer, setSelectedPlayer] = useState<AdminPlayer | null>(null);

  /* "All Players" wali heading page ke saath scroll hoke chali jaati hai. Uske
     baad filter bar upar chipak jaata hai (CSS sticky) aur uske neeche list ka
     box poori bachi hui screen bharta hai. Rows box ke andar scroll hoti hain,
     isliye browser khud unhe heading ke neeche wale edge par kaat deta hai. */
  const toolbarRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const list = listRef.current;
    if (!toolbar || !list) return;

    const stickyTop = () => parseFloat(window.getComputedStyle(toolbar).top) || 0;

    // Filter chipka ho tab list ki height = screen ki baaki jagah (scroll position par nirbhar nahi)
    const fitList = () => {
      const marginBottom = parseFloat(window.getComputedStyle(toolbar).marginBottom) || 0;
      const bottomGap = 24;
      const height = window.innerHeight - stickyTop() - toolbar.offsetHeight - marginBottom - bottomGap;
      list.style.height = `${Math.max(260, height)}px`;
    };

    // Jab tak filter chipka nahi hai, neeche scroll karne par pehle PAGE scroll ho
    // (heading hate), phir rows. Warna mouse list ke upar ho to heading kabhi na jaati.
    const findScrollParent = (node: HTMLElement | null): HTMLElement | Window => {
      let current = node?.parentElement ?? null;
      while (current) {
        const overflowY = window.getComputedStyle(current).overflowY;
        if ((overflowY === "auto" || overflowY === "scroll") && current.scrollHeight > current.clientHeight) {
          return current;
        }
        current = current.parentElement;
      }
      return window;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.deltaY <= 0 || event.ctrlKey) return;

      const notStuckYet = toolbar.getBoundingClientRect().top > stickyTop() + 1;
      if (!notStuckYet) return;

      const parent = findScrollParent(list);
      const before = parent instanceof Window ? window.scrollY : parent.scrollTop;
      parent.scrollBy({ top: event.deltaY });
      const after = parent instanceof Window ? window.scrollY : parent.scrollTop;

      if (after !== before) event.preventDefault();
    };

    fitList();
    window.addEventListener("resize", fitList);
    list.addEventListener("wheel", onWheel, { passive: false });

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(fitList) : null;
    resizeObserver?.observe(toolbar);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", fitList);
      list.removeEventListener("wheel", onWheel);
    };
  }, []);

  const hasFilters = search.trim() !== "" || statusFilter !== "all" || levelFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setLevelFilter("all");
  };

  const filteredPlayers = useMemo(() => {
    const query = search.trim().toLowerCase();

    const matched = (previewPlayers as AdminPlayer[]).filter((player) => {
      const matchesSearch =
        !query
        || getPlayerName(player).toLowerCase().includes(query)
        || player.displayName.toLowerCase().includes(query)
        || player.username.toLowerCase().includes(query)
        || player.playerId.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "all" || player.status === statusFilter;
      const matchesLevel =
        levelFilter === "all"
        || (levelFilter === "beginner" && player.level < 10)
        || (levelFilter === "intermediate" && player.level >= 10 && player.level < 40)
        || (levelFilter === "advanced" && player.level >= 40);
      return matchesSearch && matchesStatus && matchesLevel;
    });

    // Naam ke hisaab se alphabetical (A-Z ya Z-A)
    return matched.sort((a, b) => {
      const order = getPlayerName(a).localeCompare(getPlayerName(b), undefined, { sensitivity: "base" });
      return sortAsc ? order : -order;
    });
  }, [search, statusFilter, levelFilter, sortAsc]);

  return (
    <AdminLayout activePage="players">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">All Players</h2>
          <p className="adm-page-head__sub">
            Search and review Arcadia player accounts. Click a row to open full player details.
          </p>
        </div>
      </div>

      {/* Search + both filters + Clear: ek hi line me */}
      <div className="plp-toolbar" role="search" ref={toolbarRef}>
        <label className="plp-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by name, username or player ID…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search players"
            autoComplete="off"
            spellCheck={false}
          />
          {search ? (
            <button
              type="button"
              className="plp-search__clear"
              onClick={() => setSearch("")}
              aria-label="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <FilterSelect
          label="Filter by account status"
          placeholder="All statuses"
          defaultIcon={<Activity size={16} aria-hidden="true" />}
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={setStatusFilter}
        />

        <FilterSelect
          label="Filter by level range"
          placeholder="All levels"
          defaultIcon={<BarChart3 size={16} aria-hidden="true" />}
          options={LEVEL_OPTIONS}
          value={levelFilter}
          onChange={setLevelFilter}
        />

        <button type="button" className="plp-clear" onClick={clearFilters} disabled={!hasFilters}>
          <RotateCcw size={15} aria-hidden="true" />
          Clear filters
        </button>
      </div>

      <div className="adm-table-wrap plp-list" ref={listRef}>
        <table className="adm-table">
          <thead>
            <tr>
              <th aria-sort={sortAsc ? "ascending" : "descending"}>
                <button
                  type="button"
                  className="plp-sort"
                  onClick={() => setSortAsc((asc) => !asc)}
                  aria-label={sortAsc ? "Sorted A to Z. Click to sort Z to A" : "Sorted Z to A. Click to sort A to Z"}
                >
                  Player
                  {sortAsc ? <ArrowDownAZ size={15} aria-hidden="true" /> : <ArrowUpZA size={15} aria-hidden="true" />}
                </button>
              </th>
              <th>Player ID</th>
              <th>Username</th>
              <th>Level</th>
              <th>Total XP</th>
              <th>Account Status</th>
              <th>Joined Date</th>
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.map((player) => (
              <tr
                key={player.id}
                className="adm-table__row--interactive"
                tabIndex={0}
                role="button"
                aria-label={`Open details for ${getPlayerName(player)}`}
                onClick={() => setSelectedPlayer(player)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPlayer(player);
                  }
                }}
              >
                <td>
                  <span className="adm-identity">
                    <span className="adm-avatar" aria-hidden="true">
                      {player.avatar}
                    </span>
                    <span className="adm-identity__names">
                      {/* Google account se aaya hua naam */}
                      <span className="adm-identity__name">{getPlayerName(player)}</span>
                      <span className="adm-identity__sub">
                        <TierBadge badge={player.badge} />
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  <span className="adm-mono">{player.playerId}</span>
                </td>
                <td>{player.username}</td>
                <td>{player.level}</td>
                <td>{formatNumber(player.totalXp)}</td>
                <td>
                  <StatusBadge status={player.status} />
                </td>
                 <td>{formatDate(player.joinedDate)}</td>
              </tr>
            ))}
            {filteredPlayers.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="adm-empty">No players match the current filters.</div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedPlayer ? (
        <PlayerDetailsModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      ) : null}
    </AdminLayout>
  );
}

export default PlayersPage;