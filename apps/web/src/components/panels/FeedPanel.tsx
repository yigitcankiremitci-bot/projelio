import { useEffect, useState } from "react";
import type { Task, TaskComment, ProjectPost } from "@projelio/shared";
import { api } from "../../api/client";
import { colors } from "../../theme/colors";
import { IconCheck } from "../icons";

interface Props {
  projectId: string;
  tasks: Task[];
}

type FeedComment = TaskComment & { taskTitle: string };
type FeedItem =
  | { kind: "post"; id: string; createdAt: string; authorName: string; body: string }
  | { kind: "comment"; id: string; createdAt: string; authorName: string; body: string; taskTitle: string };

export default function FeedPanel({ projectId, tasks }: Props) {
  const c = colors.light;
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [posts, setPosts] = useState<ProjectPost[]>([]);
  const [postBody, setPostBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<FeedComment[]>(`/projects/${projectId}/comments`).catch(() => []),
      api.get<ProjectPost[]>(`/projects/${projectId}/posts`).catch(() => []),
    ]).then(([c, p]) => {
      setComments(c);
      setPosts(p);
      setLoading(false);
    });
  }, [projectId]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = postBody.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      const created = await api.post<ProjectPost>(`/projects/${projectId}/posts`, { body: trimmed });
      setPosts((prev) => [created, ...prev]);
      setPostBody("");
    } catch {
      // paylaşım gönderilemedi, kullanıcı tekrar deneyebilir
    } finally {
      setPosting(false);
    }
  };

  const items: FeedItem[] = [
    ...posts.map((p) => ({ kind: "post" as const, id: p.id, createdAt: p.createdAt, authorName: p.authorName, body: p.body })),
    ...comments.map((cm) => ({
      kind: "comment" as const,
      id: cm.id,
      createdAt: cm.createdAt,
      authorName: cm.authorName,
      body: cm.body,
      taskTitle: cm.taskTitle,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const completedTasks = tasks.filter((t) => t.status === "completed" && !t.parentTaskId);

  const remaining = 140 - postBody.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form
        onSubmit={handlePost}
        style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12 }}
      >
        <textarea
          value={postBody}
          onChange={(e) => setPostBody(e.target.value.slice(0, 140))}
          placeholder="Ekiple bir şey paylaş… (140 karakter)"
          rows={2}
          style={{ width: "100%", resize: "none", fontSize: 13, border: "none", outline: "none", background: "transparent", color: c.textPrimary }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 11, color: remaining < 20 ? c.danger : c.textSecondary }}>{remaining}</span>
          <button
            type="submit"
            disabled={posting || !postBody.trim()}
            style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: c.primary, color: "#fff", fontSize: 12, fontWeight: 500 }}
          >
            Paylaş
          </button>
        </div>
      </form>

      {completedTasks.length > 0 && (
        <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12 }}>
          <h4 style={{ fontSize: 12, fontWeight: 500, color: c.textSecondary, margin: "0 0 8px" }}>Tamamlanan görevler</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {completedTasks.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: c.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <IconCheck size={9} color="#fff" />
                </span>
                <span style={{ fontSize: 12, color: c.textPrimary }}>{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <p style={{ fontSize: 12, color: c.textSecondary }}>Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 12, color: c.textSecondary }}>Henüz bir paylaşım veya yorum yok.</p>
        ) : (
          items.map((item) => (
            <div key={`${item.kind}-${item.id}`} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: c.textPrimary }}>{item.authorName}</span>
                <span style={{ fontSize: 11, color: c.textSecondary }}>{new Date(item.createdAt).toLocaleDateString("tr-TR")}</span>
              </div>
              {item.kind === "comment" && (
                <p style={{ fontSize: 11, color: c.accentDark, margin: "0 0 4px" }}>"{item.taskTitle}" görevine yorum yaptı</p>
              )}
              <p style={{ fontSize: 13, color: c.textPrimary, margin: 0, lineHeight: 1.45 }}>{item.body}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
