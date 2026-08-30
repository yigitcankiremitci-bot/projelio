import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { PublicProjectAccess, PublicProjectView, TaskStatus } from "@projelio/shared";
import { projectSharesApi } from "../api/projectShares";
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
  const [state, setState] = useState<"loading" | "ready" | "gate" | "gone" | "error">("loading");
  // E-posta kapısı durumu. Adres sunucuya gövdeyle gidiyor, hiçbir yere yazılmıyor.
  const [email, setEmail] = useState("");
  const [rejected, setRejected] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [gateError, setGateError] = useState("");

  const apply = (res: PublicProjectAccess) => {
    if (res.state === "open" && res.view) {
      setView(res.view);
      setState("ready");
      document.title = `${res.view.title} · Projelio`;
      return;
    }
    if (res.state === "email_required") {
      setRejected(res.emailRejected === true);
      setState("gate");
      return;
    }
    // "closed": kapatılmış, süresi dolmuş, projesi tamamlanmış ya da hiç var
    // olmamış link. Sunucu dördünü ayırmıyor, sayfa da ayırmaz.
    setState("gone");
  };

  useEffect(() => {
    if (!token) {
      setState("gone");
      return;
    }
    // Kapıyı bir kez geçen ziyaretçi sekmeyi yenilediğinde adresi yeniden
    // yazmasın diye oturum boyunca hatırlanıyor. sessionStorage bilerek:
    // sekme kapanınca siliniyor, ortak kullanılan bir bilgisayarda kalmıyor.
    const saved = sessionStorage.getItem(gateKey(token));
    const request = saved ? projectSharesApi.unlock(token, saved) : projectSharesApi.view(token);
    request.then(apply).catch(() => setState("error"));
  }, [token]);

  const submitEmail = async () => {
    if (!token) return;
    setUnlocking(true);
    setGateError("");
    try {
      const res = await projectSharesApi.unlock(token, email);
      if (res.state === "open") sessionStorage.setItem(gateKey(token), email);
      else sessionStorage.removeItem(gateKey(token));
      apply(res);
    } catch (err) {
      // Tek beklenen hata deneme sınırı (bkz. ShareUnlockRateLimitGuard).
      setGateError(err instanceof Error ? err.message : "Bağlantı kurulamadı.");
    } finally {
      setUnlocking(false);
    }
  };

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

  // ---------------------------------------------------------- E-posta kapısı
  // Burada projeye dair HİÇBİR ŞEY yok — başlık bile. Kapının arkasındaki
  // bilgiyi kapının önünde göstermek kapıyı anlamsız kılardı.
  if (state === "gate") {
    return shell(
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingTop: 32,
          maxWidth: 380,
          margin: "0 auto",
        }}
      >
        <h1 style={{ fontSize: 20, color: c.textPrimary, margin: 0 }}>Bu bağlantı size özel</h1>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, lineHeight: 1.6 }}>
          Devam etmek için bağlantının gönderildiği e-posta adresini yazın.
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !unlocking && submitEmail()}
          placeholder="ornek@firma.com"
          autoComplete="email"
          autoFocus
          style={{
            fontSize: 14,
            padding: "9px 11px",
            width: "100%",
            border: `1px solid ${rejected ? c.danger : c.border}`,
            borderRadius: 8,
            background: c.surface,
            color: c.textPrimary,
          }}
        />
        {rejected && (
          <span style={{ fontSize: 13, color: c.danger }}>
            Bu adres bu bağlantıya tanımlı değil. Bağlantıyı paylaşan kişiden doğru adresi teyit edebilirsiniz.
          </span>
        )}
        {gateError && <span style={{ fontSize: 13, color: c.danger }}>{gateError}</span>}
        <button
          data-primary
          onClick={submitEmail}
          disabled={unlocking || !email.trim()}
          style={{
            fontSize: 14,
            padding: "9px 16px",
            background: c.primary,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: unlocking || !email.trim() ? "default" : "pointer",
            opacity: unlocking || !email.trim() ? 0.6 : 1,
          }}
        >
          {unlocking ? "Kontrol ediliyor…" : "Devam et"}
        </button>
        <span style={{ fontSize: 12, color: c.textSecondary, lineHeight: 1.6 }}>
          Adresiniz yalnızca bu bağlantıyı açmak için kullanılır; kaydedilmez ve size e-posta gönderilmez.
        </span>
      </div>
    );
  }

  if (state === "error") {
    return shell(
      <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 40, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, color: c.textPrimary, margin: 0 }}>Sayfa açılamadı</h1>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          Bağlantı kurulamadı. Sayfayı yenilemeyi dene.
        </p>
      </div>
    );
  }

  // ------------------------------------------------------- Kapanmış bağlantı
  // Kapatılmış, süresi dolmuş, projesi tamamlanmış ve hiç var olmamış linkler
  // AYNI sayfayı görür. Sebep yazılsaydı, elinde token olan birine "bu link
  // bir zamanlar vardı" bilgisi sızardı.
  //
  // Hata sayfası değil tanıtım sayfası: buraya gelen kişi projeyi takip eden
  // gerçek bir insan ve Projelio'yu ilk kez burada görüyor olabilir.
  if (state === "gone") {
    return shell(
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          paddingTop: 32,
          maxWidth: 460,
          margin: "0 auto",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, color: c.textPrimary, margin: 0 }}>Bu bağlantı artık aktif değil</h1>
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0, lineHeight: 1.6 }}>
          Takip penceresi kapanmış. Projeyi paylaşan kişiden yeni bir bağlantı isteyebilirsiniz.
        </p>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "18px 20px",
            marginTop: 8,
            background: c.surface,
            border: `1px solid ${c.border}`,
            borderRadius: 12,
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary }}>
            Projelerinizi de böyle paylaşın
          </span>
          <span style={{ fontSize: 13, color: c.textSecondary, lineHeight: 1.7 }}>
            Projelio, ekiplerin işlerini tek yerden yürüttüğü bir çalışma alanı. Müşterinize
            durum raporu hazırlamak yerine, göstermek istediğiniz kadarını gösteren bir bağlantı
            paylaşırsınız — karşı tarafın hesap açmasına gerek kalmadan.
          </span>
          <ul
            style={{
              margin: 0,
              paddingLeft: 18,
              fontSize: 13,
              color: c.textSecondary,
              lineHeight: 1.9,
            }}
          >
            <li>Görev, çıktı, bütçe ve dosyalar tek panoda</li>
            <li>Hangi bölümün paylaşılacağına bağlantı başına siz karar verirsiniz</li>
            <li>Proje bitince bağlantı kendiliğinden kapanır</li>
          </ul>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
            <Link
              to="/register"
              style={{
                fontSize: 13,
                padding: "8px 16px",
                background: c.primary,
                color: "#fff",
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              Ücretsiz deneyin
            </Link>
            <a
              href="https://projelio.app"
              target="_blank"
              rel="noreferrer"
              style={{
                fontSize: 13,
                padding: "8px 16px",
                border: `1px solid ${c.border}`,
                color: c.textSecondary,
                borderRadius: 8,
                textDecoration: "none",
              }}
            >
              Projelio nedir?
            </a>
          </div>
        </div>
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

/**
 * Kapıyı geçen ziyaretçinin adresini oturum boyunca tutan anahtar.
 *
 * Token'a göre ayrı: aynı sekmede iki farklı takip linki açılırsa biri
 * diğerinin adresini kullanmasın.
 */
function gateKey(token: string): string {
  return `projelio-takip-eposta:${token}`;
}
