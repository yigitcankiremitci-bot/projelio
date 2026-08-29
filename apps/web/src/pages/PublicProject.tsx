import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PublicProjectView, TaskStatus } from "@projelio/shared";
import { projectSharesApi } from "../api/projectShares";
import { ApiError } from "../api/client";
import { parseServerDate } from "../lib/dates";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_STYLE } from "../lib/projectStatus";
import { useThemeColors } from "../theme/useThemeColors";
import { useIsDesktop } from "../lib/useIsDesktop";

/**
 * Paylaşım linkinin açtığı sayfa — ÜYELİK GEREKTİRMEZ.
 *
 * Buraya gelen kişinin Projelio hesabı yok: uygulama kabuğu (kenar çubuğu,
 * bildirim çanı, Lio) hiç kurulmaz. App.tsx'teki `isAuthScreen` listesinde
 * olmasının sebebi bu — gizlilik/sözleşme sayfalarıyla aynı desen.
 *
 * NE GÖSTERİLECEĞİNE SUNUCU KARAR VERİR. Burada "şu bölümü gizle" diye bir
 * mantık YOK: kapalı bölümler yanıtta hiç gelmiyor. Görünürlüğü ön yüzde
 * uygulamak, veriyi tarayıcıya gönderip sonra saklamak demek olurdu.
 */
export default function PublicProject() {
  const { token } = useParams();
  const c = useThemeColors();
  const isDesktop = useIsDesktop();
  const [view, setView] = useState<PublicProjectView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "gone" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setState("gone");
      return;
    }
    projectSharesApi
      .view(token)
      .then((v) => {
        setView(v);
        setState("ready");
        document.title = `${v.title} · Projelio`;
      })
      .catch((err) => {
        // 404 = link yok / kapatılmış / süresi dolmuş. Sunucu üçünü ayırmıyor
        // (bkz. ProjectSharesService.resolve), sayfa da ayırmaz.
        setState(err instanceof ApiError && err.status === 404 ? "gone" : "error");
      });
  }, [token]);

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: c.background }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 20px",
          borderBottom: `1px solid ${c.border}`,
          background: c.surface,
        }}
      >
        <img src="/logo.png" alt="Projelio" style={{ width: 32, height: 32 }} />
        <span style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary }}>Projelio</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: c.textSecondary }}>Proje takip sayfası</span>
      </header>
      <main style={{ maxWidth: 880, margin: "0 auto", padding: isDesktop ? "28px 24px 64px" : "18px 16px 48px" }}>
        {children}
      </main>
    </div>
  );

  if (state === "loading") {
    return shell(<p style={{ color: c.textSecondary, fontSize: 14 }}>Yükleniyor…</p>);
  }

  if (state === "gone" || state === "error") {
    return shell(
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, color: c.textPrimary, margin: 0 }}>
          {state === "gone" ? "Bu bağlantı artık geçerli değil" : "Sayfa açılamadı"}
        </h1>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {state === "gone"
            ? "Link kapatılmış ya da süresi dolmuş olabilir. Projeyi paylaşan kişiden yeni bir bağlantı isteyebilirsin."
            : "Bağlantı kurulamadı. Sayfayı yenilemeyi dene."}
        </p>
      </div>
    );
  }

  const v = view!;
  const statusStyle = PROJECT_STATUS_STYLE[v.status];

  return shell(
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* ------------------------------------------------------------ Özet */}
      {/* Kapak görseli Supabase'in AÇIK kovasında duruyor (bkz.
          ProjectsService COVER_BUCKET / getPublicUrl), yani giriş yapmamış
          ziyaretçinin tarayıcısı da yükleyebiliyor. Yoksa hiç çizilmez —
          yerine gri bir kutu koymak sayfayı zenginleştirmiyor. */}
      {v.coverImageUrl && (
        <img
          src={v.coverImageUrl}
          alt=""
          style={{
            width: "100%",
            height: isDesktop ? 220 : 140,
            objectFit: "cover",
            borderRadius: 12,
            display: "block",
          }}
        />
      )}

      <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: isDesktop ? 26 : 21, color: c.textPrimary, margin: 0 }}>{v.title}</h1>
          <span
            style={{
              fontSize: 12,
              padding: "3px 10px",
              borderRadius: 999,
              background: statusStyle.bg,
              color: statusStyle.text,
            }}
          >
            {PROJECT_STATUS_LABELS[v.status]}
          </span>
        </div>

        {v.description && (
          <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, lineHeight: 1.6 }}>{v.description}</p>
        )}

        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: c.textSecondary }}>
          <span>Başlangıç: {new Date(v.startDate).toLocaleDateString("tr-TR")}</span>
          <span>Bitiş: {new Date(v.deadline).toLocaleDateString("tr-TR")}</span>
          {v.ownerName && <span>Sorumlu: {v.ownerName}</span>}
        </div>

        <ProgressBar view={v} />
      </section>

      {v.budget && (
        <Card title="Bütçe">
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            <Figure label="Toplam" value={`${v.budget.total.toLocaleString("tr-TR")} ₺`} />
            <Figure label="Harcanan" value={`${v.budget.spent.toLocaleString("tr-TR")} ₺`} />
            <Figure
              label="Kalan"
              value={`${Math.max(0, v.budget.total - v.budget.spent).toLocaleString("tr-TR")} ₺`}
            />
          </div>
        </Card>
      )}

      {v.outputs && (
        <Card title={`Çıktılar (${v.outputs.length})`}>
          {v.outputs.length === 0 ? (
            <Empty>Henüz çıktı eklenmemiş.</Empty>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
              {v.outputs.map((o) => (
                <li key={o.id} style={{ fontSize: 14, color: c.textPrimary }}>
                  {o.title}
                  {o.description && (
                    <span style={{ color: c.textSecondary, fontSize: 13 }}> — {o.description}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {v.tasks && (
        <Card title={`Görevler (${v.tasks.length})`}>
          {v.tasks.length === 0 ? (
            <Empty>Henüz görev eklenmemiş.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {v.tasks.map((t) => (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: c.background,
                  }}
                >
                  <StatusDot status={t.status} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 14,
                      color: c.textPrimary,
                      textDecoration: t.status === "completed" ? "line-through" : "none",
                    }}
                  >
                    {t.title}
                  </span>
                  {t.assigneeName && (
                    <span style={{ fontSize: 12, color: c.textSecondary, whiteSpace: "nowrap" }}>
                      {t.assigneeName}
                    </span>
                  )}
                  {t.deadline && (
                    <span style={{ fontSize: 12, color: c.textSecondary, whiteSpace: "nowrap" }}>
                      {new Date(t.deadline).toLocaleDateString("tr-TR")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {v.team && (
        <Card title={`Ekip (${v.team.length})`}>
          {v.team.length === 0 ? (
            <Empty>Ekip bilgisi yok.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {v.team.map((m, i) => (
                <div key={`${m.fullName}-${i}`} style={{ fontSize: 14, color: c.textPrimary }}>
                  {m.fullName}
                  {m.title && <span style={{ color: c.textSecondary, fontSize: 13 }}> — {m.title}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {v.feed && (
        <Card title="Proje akışı">
          {v.feed.length === 0 ? (
            <Empty>Henüz paylaşım yok.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {v.feed.map((p) => (
                <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ fontSize: 12, color: c.textSecondary }}>
                    {p.authorName} · {parseServerDate(p.createdAt).toLocaleDateString("tr-TR")}
                  </div>
                  <div style={{ fontSize: 14, color: c.textPrimary, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>
                    {p.body}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {v.files && (
        <Card title={`Dosyalar (${v.files.length})`}>
          {v.files.length === 0 ? (
            <Empty>Dosya yok.</Empty>
          ) : (
            <>
              {/* Dosyalar indirilemez: liste bilerek yalnızca isim taşıyor
                  (bkz. ProjectSharesService.fetchFiles). Ziyaretçi "tıklayamıyorum"
                  diye düşünmesin diye sebebini yazıyoruz. */}
              <p style={{ fontSize: 12, color: c.textSecondary, margin: "0 0 8px" }}>
                Yalnızca dosya adları paylaşılıyor; dosyalar bu sayfadan indirilemez.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {v.files.map((f) => (
                  <div key={f.id} style={{ fontSize: 14, color: c.textPrimary }}>
                    {f.name}
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      <footer style={{ fontSize: 12, color: c.textSecondary, textAlign: "center", paddingTop: 8 }}>
        Bu sayfa salt okunurdur ve proje sorumlusunun paylaştığı bölümleri gösterir.{" "}
        <Link to="/login" style={{ color: c.accent }}>
          Projelio
        </Link>{" "}
        ile hazırlandı.
      </footer>
    </div>
  );
}

/** İlerleme: yüzde + durum kırılımı. Görev yoksa çubuk hiç çizilmez. */
function ProgressBar({ view }: { view: PublicProjectView }) {
  const c = useThemeColors();
  const counts = view.taskCounts;
  if (!counts || counts.total === 0) {
    return (
      <div style={{ fontSize: 13, color: c.textSecondary }}>
        Görev eklendiğinde ilerleme burada görünecek.
      </div>
    );
  }
  const percent = view.progressPercent ?? 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 24, fontWeight: 600, color: c.textPrimary }}>%{percent}</span>
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          {counts.completed}/{counts.total} görev tamamlandı
        </span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: c.border, overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: c.accent }} />
      </div>
      <div style={{ fontSize: 12, color: c.textSecondary }}>
        {counts.inProgress} devam ediyor · {counts.todo} bekliyor
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: TaskStatus }) {
  const c = useThemeColors();
  const color = status === "completed" ? c.success : status === "in_progress" ? c.accent : c.border;
  return <span style={{ width: 9, height: 9, borderRadius: 999, background: color, flexShrink: 0 }} />;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <section
      style={{
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <h2 style={{ fontSize: 15, color: c.textPrimary, margin: 0 }}>{title}</h2>
      {children}
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 12, color: c.textSecondary }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 600, color: c.textPrimary }}>{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return <span style={{ fontSize: 13, color: c.textSecondary }}>{children}</span>;
}
