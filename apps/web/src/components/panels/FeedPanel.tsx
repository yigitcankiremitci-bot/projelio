import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Task, TaskComment, ProjectPost, ProjectMember, DepartmentMember, PostComment, Department } from "@projelio/shared";
import { api } from "../../api/client";
import { colors } from "../../theme/colors";
import { formatDateTime } from "../../lib/dates";
import { IconCheck, IconHeart, IconMessageCircle } from "../icons";

export interface FeedPanelHandle {
  openCreate: () => void;
}

interface Props {
  // Üçünden biri verilmeli: proje akışı için projectId, departman akışı için
  // departmentId, şirket/işletme anasayfasındaki toplu akış için organizationId
  // (bu durumda organizasyona bağlı TÜM departmanların akışları da içine karışır,
  // bkz. backend ProjectPostsService.findByOrganization).
  projectId?: string;
  departmentId?: string;
  organizationId?: string;
  tasks: Task[];
}

// Hem proje ekibinin hem departman kadrosunun @etiketleme için ortak, minimal görünümü.
interface FeedMember {
  userId: string;
  fullName?: string;
  username?: string;
}

type FeedComment = TaskComment & { taskTitle: string };
type FeedItem =
  | { kind: "post"; id: string; createdAt: string; post: ProjectPost }
  | { kind: "comment"; id: string; createdAt: string; authorName: string; body: string; taskTitle: string }
  // Tamamlanan görevler, tamamlanma saat ve tarihiyle birlikte akışta yayınlanır.
  | { kind: "taskDone"; id: string; createdAt: string; task: Task };

const MENTION_REGEX = /@[a-z0-9_.]{3,30}/gi;

// Metin içindeki "@kullaniciadi" etiketlerini renkli/kalın olarak vurgular.
function renderMentions(body: string, accentColor: string) {
  const parts: Array<string | { mention: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(body))) {
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index));
    parts.push({ mention: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex));

  return parts.map((part, i) =>
    typeof part === "string" ? (
      <span key={i}>{part}</span>
    ) : (
      <span key={i} style={{ color: accentColor, fontWeight: 500 }}>
        {part.mention}
      </span>
    )
  );
}

// İmleçten geriye doğru bakıp aktif olarak yazılmakta olan "@sorgu"yu bulur.
// "@" bir harf/rakamın hemen ardından geliyorsa (örn. bir e-posta içindeyse) yok sayılır.
function getMentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  const upToCursor = text.slice(0, cursor);
  const at = upToCursor.lastIndexOf("@");
  if (at === -1) return null;
  const before = upToCursor[at - 1];
  if (before && /[a-z0-9_]/i.test(before)) return null;
  const query = upToCursor.slice(at + 1);
  if (/\s/.test(query)) return null;
  return { start: at, query };
}

const FeedPanel = forwardRef<FeedPanelHandle, Props>(function FeedPanel({ projectId, departmentId, organizationId, tasks }, ref) {
  const c = colors.light;
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [posts, setPosts] = useState<ProjectPost[]>([]);
  const [members, setMembers] = useState<FeedMember[]>([]);
  const [postBody, setPostBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mentionQuery, setMentionQuery] = useState<{ start: number; query: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const postsPath = organizationId
    ? `/organizations/${organizationId}/posts`
    : departmentId
    ? `/departments/${departmentId}/posts`
    : `/projects/${projectId}/posts`;
  const membersPath = departmentId ? `/departments/${departmentId}/members` : `/projects/${projectId}/members`;

  useImperativeHandle(ref, () => ({
    openCreate: () => {
      textareaRef.current?.focus();
      textareaRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  }));

  useEffect(() => {
    setLoading(true);

    // @etiketleme önerileri: organizasyon akışında organizasyona bağlı TÜM
    // departmanların kadrosu birleştirilir (N+1 ama departman sayısı küçük);
    // proje/departman akışında zaten tek bir üye listesi var.
    const loadMembers = (): Promise<FeedMember[]> => {
      if (organizationId) {
        return api
          .get<Department[]>(`/organizations/${organizationId}/departments`)
          .then((depts) =>
            Promise.all(depts.map((d) => api.get<DepartmentMember[]>(`/departments/${d.id}/members`).catch(() => [])))
          )
          .then((lists) =>
            lists
              .flat()
              .filter((m) => m.status === "approved" && m.userId)
              .map((m): FeedMember => ({ userId: m.userId as string, fullName: m.fullName, username: m.username }))
          )
          .catch(() => []);
      }
      if (departmentId) {
        return api
          .get<DepartmentMember[]>(membersPath)
          .then((list) =>
            list
              .filter((m) => m.status === "approved" && m.userId)
              .map((m): FeedMember => ({ userId: m.userId as string, fullName: m.fullName, username: m.username }))
          )
          .catch(() => []);
      }
      return api
        .get<ProjectMember[]>(membersPath)
        .then((list) =>
          list
            .filter((m) => m.status === "approved")
            .map((m): FeedMember => ({ userId: m.userId, fullName: m.fullName, username: m.username }))
        )
        .catch(() => []);
    };

    Promise.all([
      // Görev yorumlarını akışa karıştırma özelliği şimdilik yalnızca projelerde var
      // (departman/organizasyon akışları için henüz toplu bir yorum uç noktası yok).
      projectId ? api.get<FeedComment[]>(`/projects/${projectId}/comments`).catch(() => []) : Promise.resolve([]),
      api.get<ProjectPost[]>(postsPath).catch(() => []),
      loadMembers(),
    ]).then(([cm, p, m]) => {
      setComments(cm);
      setPosts(p);
      setMembers(m);
      setLoading(false);
    });
  }, [projectId, departmentId, organizationId]);

  const mentionResults = mentionQuery
    ? members
        .filter((m) => {
          const q = mentionQuery.query.toLowerCase();
          return (m.username ?? "").toLowerCase().startsWith(q) || (m.fullName ?? "").toLowerCase().includes(q);
        })
        .slice(0, 6)
    : [];

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value.slice(0, 140);
    setPostBody(value);
    const cursor = Math.min(e.target.selectionStart ?? value.length, value.length);
    setMentionQuery(getMentionQuery(value, cursor));
  };

  const selectMention = (member: FeedMember) => {
    if (!mentionQuery || !member.username) return;
    const cursorNow = textareaRef.current?.selectionStart ?? postBody.length;
    const before = postBody.slice(0, mentionQuery.start);
    const after = postBody.slice(cursorNow);
    const inserted = `@${member.username} `;
    const next = (before + inserted + after).slice(0, 140);
    setPostBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = postBody.trim();
    if (!trimmed) return;
    setPosting(true);
    try {
      const created = await api.post<ProjectPost>(postsPath, { body: trimmed });
      setPosts((prev) => [created, ...prev]);
      setPostBody("");
      setMentionQuery(null);
    } catch {
      // paylaşım gönderilemedi, kullanıcı tekrar deneyebilir
    } finally {
      setPosting(false);
    }
  };

  const handleLikeToggled = (postId: string, liked: boolean, likeCount: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likedByMe: liked, likeCount } : p)));
  };

  const handleCommentCountChanged = (postId: string, delta: number) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: p.commentCount + delta } : p)));
  };

  const completedTasks = tasks.filter((t) => t.status === "completed" && !t.parentTaskId);

  const items: FeedItem[] = [
    ...posts.map((p) => ({ kind: "post" as const, id: p.id, createdAt: p.createdAt, post: p })),
    ...comments.map((cm) => ({
      kind: "comment" as const,
      id: cm.id,
      createdAt: cm.createdAt,
      authorName: cm.authorName,
      body: cm.body,
      taskTitle: cm.taskTitle,
    })),
    ...completedTasks.map((t) => ({
      kind: "taskDone" as const,
      id: t.id,
      createdAt: t.completedAt ?? t.createdAt,
      task: t,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const remaining = 140 - postBody.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form
        onSubmit={handlePost}
        style={{ position: "relative", background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: 12 }}
      >
        <textarea
          ref={textareaRef}
          value={postBody}
          onChange={handleBodyChange}
          placeholder={
            organizationId
              ? "Şirketle bir şey paylaş… @ ile herhangi bir departman kadrosundan birini etiketleyebilirsin (140 karakter)"
              : departmentId
              ? "Departmanla bir şey paylaş… @ ile kadrodan birini etiketleyebilirsin (140 karakter)"
              : "Ekiple bir şey paylaş… @ ile ekipten birini etiketleyebilirsin (140 karakter)"
          }
          rows={2}
          style={{ width: "100%", resize: "none", fontSize: 16, border: "none", outline: "none", background: "transparent", color: c.textPrimary }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span style={{ fontSize: 13, color: remaining < 20 ? c.danger : c.textSecondary }}>{remaining}</span>
          <button
            type="submit"
            disabled={posting || !postBody.trim()}
            style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: c.primary, color: "#fff", fontSize: 15, fontWeight: 500 }}
          >
            Paylaş
          </button>
        </div>

        {mentionQuery && mentionResults.length > 0 && (
          <div
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              top: "100%",
              marginTop: 4,
              background: c.surface,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              boxShadow: "0 8px 20px rgba(26,31,41,0.14)",
              zIndex: 20,
              overflow: "hidden",
            }}
          >
            {mentionResults.map((m) => (
              <button
                key={m.userId}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectMention(m);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `1px solid ${c.border}`,
                }}
              >
                <span style={{ fontSize: 15, color: c.textPrimary }}>{m.fullName ?? "Bilinmeyen kullanıcı"}</span>
                <span style={{ fontSize: 13, color: c.textSecondary }}>@{m.username}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Tamamlanan görevler artık aşağıdaki akışta, tamamlanma saat/tarihiyle birlikte gösteriliyor. */}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <p style={{ fontSize: 15, color: c.textSecondary }}>Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p style={{ fontSize: 15, color: c.textSecondary }}>Henüz bir paylaşım veya yorum yok.</p>
        ) : (
          items.map((item) =>
            item.kind === "post" ? (
              <PostCard
                key={`post-${item.id}`}
                post={item.post}
                onLikeToggled={handleLikeToggled}
                onCommentCountChanged={handleCommentCountChanged}
              />
            ) : item.kind === "taskDone" ? (
              <div
                key={`done-${item.id}`}
                style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: c.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <IconCheck size={10} color="#fff" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 15, color: c.textPrimary }}>
                    {item.task.completedByName ? `${item.task.completedByName}, ` : ""}
                    <strong style={{ fontWeight: 500 }}>"{item.task.title}"</strong> görevini tamamladı
                  </span>
                </div>
                <span style={{ fontSize: 12, color: c.textSecondary, flexShrink: 0 }}>
                  {formatDateTime(item.createdAt)}
                </span>
              </div>
            ) : (
              <div key={`comment-${item.id}`} style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{item.authorName}</span>
                  <span style={{ fontSize: 13, color: c.textSecondary }}>{new Date(item.createdAt).toLocaleDateString("tr-TR")}</span>
                </div>
                <p style={{ fontSize: 13, color: c.accentDark, margin: "0 0 4px" }}>"{item.taskTitle}" görevine yorum yaptı</p>
                <p style={{ fontSize: 16, color: c.textPrimary, margin: 0, lineHeight: 1.45 }}>{item.body}</p>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
});

export default FeedPanel;

interface PostCardProps {
  post: ProjectPost;
  onLikeToggled: (postId: string, liked: boolean, likeCount: number) => void;
  onCommentCountChanged: (postId: string, delta: number) => void;
}

function PostCard({ post, onLikeToggled, onCommentCountChanged }: PostCardProps) {
  const c = colors.light;
  const [expanded, setExpanded] = useState(false);
  const [postComments, setPostComments] = useState<PostComment[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentPosting, setCommentPosting] = useState(false);
  const [liking, setLiking] = useState(false);

  const toggleExpanded = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && postComments === null) {
      setLoadingComments(true);
      try {
        const data = await api.get<PostComment[]>(`/posts/${post.id}/comments`);
        setPostComments(data);
      } catch {
        setPostComments([]);
      } finally {
        setLoadingComments(false);
      }
    }
  };

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    const optimisticLiked = !post.likedByMe;
    const optimisticCount = Math.max(0, post.likeCount + (optimisticLiked ? 1 : -1));
    onLikeToggled(post.id, optimisticLiked, optimisticCount);
    try {
      const res = await api.post<{ liked: boolean; likeCount: number }>(`/posts/${post.id}/like`, {});
      onLikeToggled(post.id, res.liked, res.likeCount);
    } catch {
      onLikeToggled(post.id, post.likedByMe, post.likeCount);
    } finally {
      setLiking(false);
    }
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentDraft.trim();
    if (!trimmed) return;
    setCommentPosting(true);
    try {
      const created = await api.post<PostComment>(`/posts/${post.id}/comments`, { body: trimmed });
      setPostComments((prev) => [...(prev ?? []), created]);
      onCommentCountChanged(post.id, 1);
      setCommentDraft("");
    } catch {
      // yorum gönderilemedi
    } finally {
      setCommentPosting(false);
    }
  };

  return (
    <div style={{ background: c.surface, border: `1px solid ${c.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {post.authorName}
          </span>
          {/* Şirket akışında (organizasyon aggregate görünümü) hangi departmandan
              geldiğini gösteren rozet — organizasyona doğrudan yapılmış bir
              paylaşımda bu alan boş olduğu için rozet gösterilmez. */}
          {post.sourceDepartmentName && (
            <span
              style={{
                fontSize: 12,
                color: c.accentDark,
                background: `${c.accent}22`,
                borderRadius: 20,
                padding: "1px 8px",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {post.sourceDepartmentName}
            </span>
          )}
        </div>
        <span style={{ fontSize: 13, color: c.textSecondary, flexShrink: 0 }}>{new Date(post.createdAt).toLocaleDateString("tr-TR")}</span>
      </div>
      <p style={{ fontSize: 16, color: c.textPrimary, margin: "0 0 8px", lineHeight: 1.45 }}>{renderMentions(post.body, c.primary)}</p>

      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <button
          onClick={handleLike}
          aria-label="Beğen"
          style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", padding: 0 }}
        >
          <IconHeart size={16} color={post.likedByMe ? c.accentDark : c.textSecondary} filled={post.likedByMe} />
          <span style={{ fontSize: 13, color: post.likedByMe ? c.accentDark : c.textSecondary }}>
            {post.likeCount > 0 ? post.likeCount : "Beğen"}
          </span>
        </button>
        <button
          onClick={toggleExpanded}
          aria-label="Yorumlar"
          style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", border: "none", padding: 0 }}
        >
          <IconMessageCircle size={16} color={c.textSecondary} />
          <span style={{ fontSize: 13, color: c.textSecondary }}>{post.commentCount > 0 ? post.commentCount : "Yorum yap"}</span>
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${c.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
          {loadingComments ? (
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Yükleniyor…</p>
          ) : postComments && postComments.length > 0 ? (
            postComments.map((cm) => (
              <CommentRow
                key={cm.id}
                comment={cm}
                onLikeToggled={(commentId, liked, likeCount) =>
                  setPostComments((prev) =>
                    (prev ?? []).map((p) => (p.id === commentId ? { ...p, likedByMe: liked, likeCount } : p))
                  )
                }
              />
            ))
          ) : (
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>Henüz yorum yok.</p>
          )}

          <form onSubmit={handleCommentSubmit} style={{ display: "flex", gap: 6 }}>
            <input
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Yorum yaz…"
              style={{ flex: 1, fontSize: 14 }}
            />
            <button
              type="submit"
              disabled={commentPosting || !commentDraft.trim()}
              style={{ fontSize: 13, padding: "0 12px", borderRadius: 7, border: "none", background: c.primary, color: "#fff" }}
            >
              Gönder
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

interface CommentRowProps {
  comment: PostComment;
  onLikeToggled: (commentId: string, liked: boolean, likeCount: number) => void;
}

function CommentRow({ comment, onLikeToggled }: CommentRowProps) {
  const c = colors.light;
  const [liking, setLiking] = useState(false);

  const handleLike = async () => {
    if (liking) return;
    setLiking(true);
    const optimisticLiked = !comment.likedByMe;
    const optimisticCount = Math.max(0, comment.likeCount + (optimisticLiked ? 1 : -1));
    onLikeToggled(comment.id, optimisticLiked, optimisticCount);
    try {
      const res = await api.post<{ liked: boolean; likeCount: number }>(`/comments/${comment.id}/like`, {});
      onLikeToggled(comment.id, res.liked, res.likeCount);
    } catch {
      onLikeToggled(comment.id, comment.likedByMe, comment.likeCount);
    } finally {
      setLiking(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary }}>{comment.authorName}</span>
        <span style={{ fontSize: 12, color: c.textSecondary }}>{new Date(comment.createdAt).toLocaleDateString("tr-TR")}</span>
      </div>
      <p style={{ fontSize: 14, color: c.textPrimary, margin: "0 0 3px" }}>{renderMentions(comment.body, c.primary)}</p>
      <button
        onClick={handleLike}
        aria-label="Yorumu beğen"
        style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", padding: 0, alignSelf: "flex-start" }}
      >
        <IconHeart size={13} color={comment.likedByMe ? c.accentDark : c.textSecondary} filled={comment.likedByMe} />
        <span style={{ fontSize: 12, color: comment.likedByMe ? c.accentDark : c.textSecondary }}>
          {comment.likeCount > 0 ? comment.likeCount : "Beğen"}
        </span>
      </button>
    </div>
  );
}
