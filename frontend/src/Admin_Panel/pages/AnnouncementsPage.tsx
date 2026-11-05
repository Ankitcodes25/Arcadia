/*
 * Announcements — list, create/edit composer with a live preview, status and
 * publication dates.
 *
 * Everything here is a FRONTEND INTERACTION over preview data. Saving or
 * "publishing" updates only this page's in-memory state — nothing is sent to
 * any backend and nothing is delivered to players. The UI says so explicitly.
 */

import { useMemo, useState, type FormEvent } from "react";
import { Eye, Megaphone, Pencil, Plus } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import {
  Chip,
  EmptyState,
  FilterTabs,
  KeyValueGrid,
  Note,
  PageHeader,
  PageShell,
  SectionTitle,
  toneForStatus,
} from "../components/AdminKit";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { previewAnnouncements } from "../data/previewData";
import { formatDate, formatRelativeTime } from "../utils/formatters";
import type { PreviewAnnouncement, PreviewAnnouncementStatus } from "../types/adminTypes";
import "./AdminPages.css";

type StatusFilter = "all" | PreviewAnnouncementStatus;

const STATUSES: PreviewAnnouncementStatus[] = ["Published", "Scheduled", "Draft"];
const TITLE_LIMIT = 120;

interface ComposerState {
  id: string | null;
  title: string;
  body: string;
  status: PreviewAnnouncementStatus;
}

/* What a player would see: reused by the composer and the Preview modal. */
function AnnouncementPreview({ title, body }: { title: string; body: string }) {
  return (
    <div className="adp-ann-preview">
      <span className="adp-ann-preview__kicker">
        <Megaphone size={13} aria-hidden="true" />
        Arcadia announcement
      </span>
      <h4 className="adp-ann-preview__title">{title}</h4>
      <p className="adp-ann-preview__body">{body}</p>
    </div>
  );
}

function ComposerModal({
  initial,
  adminUsername,
  onClose,
  onSave,
}: {
  initial: ComposerState;
  adminUsername: string;
  onClose: () => void;
  onSave: (announcement: PreviewAnnouncement) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [status, setStatus] = useState<PreviewAnnouncementStatus>(initial.status);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) {
      setError("Both a title and body are required.");
      return;
    }

    const nowIso = new Date().toISOString();
    onSave({
      id: initial.id ?? `A-${Math.floor(Math.random() * 900 + 100)}`,
      title: title.trim(),
      body: body.trim(),
      status,
      author: adminUsername,
      createdDate: nowIso,
      publishedDate: status === "Published" ? nowIso : null,
    });
  };

  return (
    <AdminModal
      title={initial.id ? "Edit announcement" : "Create announcement"}
      subtitle="Frontend preview — nothing is published or delivered to players."
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit} className="adp-composer">
        <div className="adp-composer__form">
          <div className="adk-field">
            <label className="adk-label" htmlFor="ann-title">
              Title
            </label>
            <input
              id="ann-title"
              className="adk-input"
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setError(null);
              }}
              placeholder="Announcement title"
              maxLength={TITLE_LIMIT}
            />
            <span className="adk-field__meta">
              <span />
              <span>
                {title.length}/{TITLE_LIMIT}
              </span>
            </span>
          </div>

          <div className="adk-field">
            <label className="adk-label" htmlFor="ann-body">
              Body
            </label>
            <textarea
              id="ann-body"
              className="adk-textarea"
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setError(null);
              }}
              placeholder="What should players know?"
              rows={6}
            />
          </div>

          <div className="adk-field adp-composer__status">
            <label className="adk-label" htmlFor="ann-status">
              Status
            </label>
            <select
              id="ann-status"
              className="adk-select"
              value={status}
              onChange={(event) => setStatus(event.target.value as PreviewAnnouncementStatus)}
            >
              <option value="Draft">Draft</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Published">Published</option>
            </select>
          </div>
        </div>

        <div className="adp-composer__preview">
          <span className="adk-label">Live preview</span>
          <AnnouncementPreview
            title={title.trim() || "Untitled announcement"}
            body={body.trim() || "Your announcement body will appear here as you type."}
          />
        </div>

        {error ? (
          <div className="adk-form-error adp-composer__error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="adk-modal-actions adp-composer__actions">
          <button type="button" className="adk-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="adk-btn adk-btn--primary">
            {initial.id ? "Save changes" : "Create announcement"}
          </button>
        </div>
      </form>
    </AdminModal>
  );
}

function AnnouncementsPage() {
  const { admin } = useAdminAuth();
  const [announcements, setAnnouncements] = useState<PreviewAnnouncement[]>(previewAnnouncements);
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [previewItem, setPreviewItem] = useState<PreviewAnnouncement | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const handleSave = (saved: PreviewAnnouncement) => {
    // Local state only — explicitly NOT a backend write.
    setAnnouncements((items) => {
      const exists = items.some((item) => item.id === saved.id);
      if (exists) {
        return items.map((item) => (item.id === saved.id ? saved : item));
      }
      return [saved, ...items];
    });
    setComposer(null);
  };

  const counts = useMemo(() => {
    const result: Record<string, number> = { all: announcements.length };
    STATUSES.forEach((status) => {
      result[status] = announcements.filter((item) => item.status === status).length;
    });
    return result;
  }, [announcements]);

  const visible = announcements.filter((item) => filter === "all" || item.status === filter);

  return (
    <AdminLayout activePage="announcements">
      <PageShell>
        <PageHeader
          title="Announcements"
          icon={<Megaphone />}
          subtitle="Draft, schedule and preview platform announcements. Saving here updates this page only — announcements are not actually published or delivered."
          actions={
            <button
              type="button"
              className="adk-btn adk-btn--primary"
              onClick={() => setComposer({ id: null, title: "", body: "", status: "Draft" })}
            >
              <Plus size={16} aria-hidden="true" />
              Create Announcement
            </button>
          }
        />

        <PreviewDataNotice />

        <FilterTabs<StatusFilter>
          label="Filter announcements by status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            ...STATUSES.map((status) => ({
              value: status as StatusFilter,
              label: status,
              count: counts[status],
              tone: toneForStatus(status),
            })),
          ]}
        />

        {visible.length === 0 ? (
          <EmptyState
            icon={<Megaphone size={24} />}
            title="No announcements here"
            hint="Nothing matches this filter yet."
          />
        ) : (
          <div className="adp-announcements">
            {visible.map((announcement) => (
              <article
                key={announcement.id}
                className={`adp-announcement adp-tone-${toneForStatus(announcement.status)}`}
              >
                <div className="adp-announcement__main">
                  <div className="adp-announcement__top">
                    <h3 className="adp-announcement__title">{announcement.title}</h3>
                    <StatusBadge status={announcement.status} />
                  </div>
                  <p className="adp-announcement__body">{announcement.body}</p>
                  <div className="adp-announcement__meta">
                    <span>
                      {announcement.publishedDate
                        ? `Published ${formatRelativeTime(announcement.publishedDate)}`
                        : `Created ${formatDate(announcement.createdDate)}`}
                    </span>
                    <span className="adp-dot" aria-hidden="true" />
                    <span>by {announcement.author}</span>
                    <Chip tone="neutral">{announcement.id}</Chip>
                  </div>
                </div>
                <div className="adp-announcement__actions">
                  <button
                    type="button"
                    className="adk-btn adk-btn--sm"
                    onClick={() => setPreviewItem(announcement)}
                  >
                    <Eye size={14} aria-hidden="true" />
                    Preview
                  </button>
                  <button
                    type="button"
                    className="adk-btn adk-btn--sm"
                    onClick={() =>
                      setComposer({
                        id: announcement.id,
                        title: announcement.title,
                        body: announcement.body,
                        status: announcement.status,
                      })
                    }
                  >
                    <Pencil size={14} aria-hidden="true" />
                    Edit
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {composer ? (
          <ComposerModal
            initial={composer}
            adminUsername={admin?.username ?? "admin"}
            onClose={() => setComposer(null)}
            onSave={handleSave}
          />
        ) : null}

        {previewItem ? (
          <AdminModal
            title="Announcement preview"
            subtitle="How this announcement would appear to players."
            onClose={() => setPreviewItem(null)}
            footer={
              <button type="button" className="adk-btn" onClick={() => setPreviewItem(null)}>
                Close
              </button>
            }
          >
            <AnnouncementPreview title={previewItem.title} body={previewItem.body} />

            <SectionTitle>Details</SectionTitle>
            <KeyValueGrid
              items={[
                { label: "Status", value: <StatusBadge status={previewItem.status} /> },
                { label: "Author", value: previewItem.author },
                { label: "Created", value: formatDate(previewItem.createdDate) },
                {
                  label: "Published",
                  value: previewItem.publishedDate ? formatDate(previewItem.publishedDate) : "Not published",
                },
              ]}
            />
            <Note tone="blue">This is a preview only. Nothing has been sent to players.</Note>
          </AdminModal>
        ) : null}
      </PageShell>
    </AdminLayout>
  );
}

export default AnnouncementsPage;