/*
 * Announcements — list, create/edit composer with a live preview, status and
 * publication dates.
 *
 * Everything here is a FRONTEND INTERACTION over preview data. Saving or
 * "publishing" updates only this page's in-memory state — nothing is sent to
 * any backend and nothing is delivered to players. The UI says so explicitly.
 */

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import AdminModal from "../components/AdminModal";
import { PreviewDataNotice, StatusBadge } from "../components/AdminDisplay";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { previewAnnouncements } from "../data/previewData";
import { formatDate, formatRelativeTime } from "../utils/formatters";
import type { PreviewAnnouncement, PreviewAnnouncementStatus } from "../types/adminTypes";

interface ComposerState {
  id: string | null;
  title: string;
  body: string;
  status: PreviewAnnouncementStatus;
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
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="adm-field">
          <label htmlFor="ann-title">Title</label>
          <input
            id="ann-title"
            className="adm-input"
            type="text"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            placeholder="Announcement title"
            maxLength={120}
          />
        </div>

        <div className="adm-field">
          <label htmlFor="ann-body">Body</label>
          <textarea
            id="ann-body"
            className="adm-textarea"
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setError(null);
            }}
            placeholder="What should players know?"
            rows={5}
          />
        </div>

        <div className="adm-field" style={{ maxWidth: 220 }}>
          <label htmlFor="ann-status">Status</label>
          <select
            id="ann-status"
            className="adm-select"
            value={status}
            onChange={(event) => setStatus(event.target.value as PreviewAnnouncementStatus)}
          >
            <option value="Draft">Draft</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Published">Published</option>
          </select>
        </div>

        <div className="adm-field">
          <label>Live preview</label>
          <div className="adm-ann-preview">
            <span className="adm-ann-preview__kicker">Arcadia announcement</span>
            <h4 className="adm-ann-preview__title">{title.trim() || "Untitled announcement"}</h4>
            <p className="adm-ann-preview__body">
              {body.trim() || "Your announcement body will appear here as you type."}
            </p>
          </div>
        </div>

        {error ? (
          <div className="adm-login__error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="adm-modal__footer" style={{ padding: 0, borderTop: "none" }}>
          <button type="button" className="adm-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="adm-btn adm-btn--primary">
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

  return (
    <AdminLayout activePage="announcements">
      <div className="adm-page-head">
        <div>
          <h2 className="adm-page-head__title">Announcements</h2>
          <p className="adm-page-head__sub">
            Draft, schedule and preview platform announcements. Saving here updates this page only —
            announcements are not actually published or delivered.
          </p>
        </div>
        <div className="adm-page-actions">
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            onClick={() => setComposer({ id: null, title: "", body: "", status: "Draft" })}
          >
            <Plus size={15} />
            Create Announcement
          </button>
        </div>
      </div>

      <PreviewDataNotice />

      <div className="adm-announcements-list">
        {announcements.map((announcement) => (
          <article key={announcement.id} className="adm-announcement">
            <div style={{ minWidth: 0 }}>
              <h3 className="adm-announcement__title">{announcement.title}</h3>
              <p className="adm-announcement__body">{announcement.body}</p>
              <div className="adm-announcement__meta">
                <StatusBadge status={announcement.status} />
                <span>
                  {announcement.publishedDate
                    ? `Published ${formatRelativeTime(announcement.publishedDate)}`
                    : `Created ${formatDate(announcement.createdDate)}`}
                </span>
                <span>by {announcement.author}</span>
              </div>
            </div>
            <div className="adm-announcement__actions">
              <button
                type="button"
                className="adm-btn adm-btn--sm"
                onClick={() => setPreviewItem(announcement)}
              >
                Preview
              </button>
              <button
                type="button"
                className="adm-btn adm-btn--sm"
                onClick={() =>
                  setComposer({
                    id: announcement.id,
                    title: announcement.title,
                    body: announcement.body,
                    status: announcement.status,
                  })
                }
              >
                Edit
              </button>
            </div>
          </article>
        ))}
      </div>

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
            <button type="button" className="adm-btn" onClick={() => setPreviewItem(null)}>
              Close
            </button>
          }
        >
          <div className="adm-ann-preview">
            <span className="adm-ann-preview__kicker">Arcadia announcement</span>
            <h4 className="adm-ann-preview__title">{previewItem.title}</h4>
            <p className="adm-ann-preview__body">{previewItem.body}</p>
          </div>
          <div className="adm-kv-grid" style={{ marginTop: 16 }}>
            <div className="adm-kv">
              <span className="adm-kv__label">Status</span>
              <span className="adm-kv__value">
                <StatusBadge status={previewItem.status} />
              </span>
            </div>
            <div className="adm-kv">
              <span className="adm-kv__label">Author</span>
              <span className="adm-kv__value">{previewItem.author}</span>
            </div>
            <div className="adm-kv">
              <span className="adm-kv__label">Created</span>
              <span className="adm-kv__value">{formatDate(previewItem.createdDate)}</span>
            </div>
            <div className="adm-kv">
              <span className="adm-kv__label">Published</span>
              <span className="adm-kv__value">
                {previewItem.publishedDate ? formatDate(previewItem.publishedDate) : "Not published"}
              </span>
            </div>
          </div>
        </AdminModal>
      ) : null}
    </AdminLayout>
  );
}

export default AnnouncementsPage;
