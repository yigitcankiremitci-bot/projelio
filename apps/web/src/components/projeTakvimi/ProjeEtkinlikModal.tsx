import { useEffect, useState } from "react";
import type { ProjectMember, ProjeEtkinligi, ProjeEtkinlikGirdisi, ProjeEtkinlikTuru } from "@projelio/shared";
import { PROJE_ETKINLIK_TURLERI, PROJE_ETKINLIK_TURU_ETIKETI, projeEtkinlikRengi } from "@projelio/shared";
import { useNavigate } from "react-router-dom";
import Modal from "../Modal";
import { api } from "../../api/client";
import { projeTakvimiApi } from "../../api/projeTakvimi";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { bicimDili } from "../../lib/i18n/depo";
import { inputStyle, labelStyle, primaryButton, secondaryButton } from "../plan/PlanTargetsModal";

interface Props {
  projectId: string;
  /** Var olan etkinlik; boşsa yeni etkinlik formu açılır. */
  etkinlik?: ProjeEtkinligi;
  /** Yeni etkinlik için ön doldurulmuş gün ve saatler. */
  taslak?: { tarih: string; baslangic?: string; bitis?: string; tumGun?: boolean };
  /** Kişisel Takvim'den açıldıysa "Projeye git" bağlantısı çıkar. */
  projeyeGitGoster?: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Proje takvimindeki ortak etkinlik.
 *
 * Düzenleme hakkı yalnızca yazanda ve proje sahibinde (sunucu kuralı, bkz.
 * CalendarService); diğerleri aynı pencereyi salt okunur görür. Pencere
 * katılımcı seçimi için projenin ekibini kendisi okur: hem proje sayfasından
 * hem kişisel Takvim'den açılıyor ve ikincisinde ekip listesi elde yok.
 */
export default function ProjeEtkinlikModal({ projectId, etkinlik, taslak, projeyeGitGoster, onClose, onSaved }: Props) {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const duzenlenebilir = !etkinlik || etkinlik.duzenlenebilir;

  const [uyeler, setUyeler] = useState<ProjectMember[]>([]);
  useEffect(() => {
    // Taşeron ekip listesini göremez (403); o zaman seçici yalnızca "tüm ekip" olur.
    api
      .get<ProjectMember[]>(`/projects/${projectId}/members`)
      .then((liste) => setUyeler(liste.filter((m) => m.status === "approved")))
      .catch(() => setUyeler([]));
  }, [projectId]);

  const [baslik, setBaslik] = useState(etkinlik?.title ?? "");
  const [tur, setTur] = useState<ProjeEtkinlikTuru>(etkinlik?.kind ?? "meeting");
  const [gun, setGun] = useState(etkinlik?.eventDate ?? taslak?.tarih ?? "");
  const [tumGun, setTumGun] = useState(etkinlik?.allDay ?? taslak?.tumGun ?? false);
  const [sonGun, setSonGun] = useState(etkinlik?.endDate ?? "");
  const [bas, setBas] = useState(etkinlik?.startsAt ?? taslak?.baslangic ?? "10:00");
  const [bit, setBit] = useState(etkinlik?.endsAt ?? taslak?.bitis ?? "11:00");
  const [konum, setKonum] = useState(etkinlik?.location ?? "");
  const [not, setNot] = useState(etkinlik?.note ?? "");
  const [katilimcilar, setKatilimcilar] = useState<string[]>(etkinlik?.participantIds ?? []);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState<string | null>(null);

  const calistir = async (is: () => Promise<unknown>) => {
    setMesgul(true);
    setHata(null);
    try {
      await is();
      onSaved();
      onClose();
    } catch (e: any) {
      setHata(String(e?.message ?? t("İşlem tamamlanamadı.")));
    } finally {
      setMesgul(false);
    }
  };

  const kaydet = () => {
    if (!baslik.trim()) return setHata(t("Etkinliğin bir başlığı olmalı."));
    if (!gun) return setHata(t("Tarih seç."));
    if (!tumGun && bit <= bas) return setHata(t("Bitiş saati başlangıçtan sonra olmalı."));
    if (tumGun && sonGun && sonGun < gun) return setHata(t("Son gün ilk günden önce olamaz."));
    const girdi: ProjeEtkinlikGirdisi = {
      title: baslik.trim(),
      kind: tur,
      eventDate: gun,
      allDay: tumGun,
      ...(tumGun ? { endDate: sonGun || null } : { startsAt: bas, endsAt: bit }),
      location: konum.trim() || null,
      note: not.trim() || null,
      participantIds: katilimcilar,
    };
    void calistir(() => (etkinlik ? projeTakvimiApi.duzenle(etkinlik.id, girdi) : projeTakvimiApi.ekle(projectId, girdi)));
  };

  const sil = () => {
    if (!etkinlik) return;
    if (!window.confirm(t("Bu etkinlik proje takviminden silinsin mi? Ekipteki herkesin takviminden kalkar."))) return;
    void calistir(() => projeTakvimiApi.sil(etkinlik.id));
  };

  const projeyeGit = projeyeGitGoster ? (
    <button
      type="button"
      onClick={() => {
        onClose();
        navigate(`/projects/${projectId}?tab=process&gorunum=takvim&tarih=${etkinlik?.eventDate ?? gun}`);
      }}
      style={{ border: "none", background: "transparent", color: c.accent, cursor: "pointer", padding: 0, fontSize: 14 }}
    >
      {t("Proje takviminde aç")}
    </button>
  ) : null;

  // ------------------------------------------------------------ Salt okunur
  if (etkinlik && !duzenlenebilir) {
    const kisiler = etkinlik.participantIds
      .map((id) => uyeler.find((m) => m.userId === id)?.fullName)
      .filter(Boolean) as string[];
    return (
      <Modal title={etkinlik.title} onClose={onClose} maxWidth={460}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, color: c.textPrimary }}>
          <div>{zamanMetni(etkinlik)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: c.textSecondary }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: projeEtkinlikRengi(etkinlik) }} />
            {t(PROJE_ETKINLIK_TURU_ETIKETI[etkinlik.kind])}
            {etkinlik.projectTitle ? ` · ${etkinlik.projectTitle}` : ""}
          </div>
          {etkinlik.location && <div style={{ color: c.textSecondary }}>{etkinlik.location}</div>}
          <div style={{ color: c.textSecondary }}>
            {etkinlik.participantIds.length === 0
              ? t("Katılımcılar: tüm proje ekibi")
              : t("Katılımcılar: {liste}", { liste: kisiler.length ? kisiler.join(", ") : String(etkinlik.participantIds.length) })}
          </div>
          {etkinlik.createdByName && (
            <div style={{ color: c.textSecondary }}>{t("Ekleyen: {ad}", { ad: etkinlik.createdByName })}</div>
          )}
          {etkinlik.note && (
            <div
              style={{
                whiteSpace: "pre-wrap",
                background: c.background,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
                color: c.textSecondary,
              }}
            >
              {etkinlik.note}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18 }}>
          {projeyeGit}
          <button onClick={onClose} style={{ ...secondaryButton(c), marginLeft: "auto" }}>
            {t("Kapat")}
          </button>
        </div>
      </Modal>
    );
  }

  // ------------------------------------------------------------------ Form
  return (
    <Modal title={etkinlik ? t("Etkinliği düzenle") : t("Proje takvimine etkinlik ekle")} onClose={onClose} maxWidth={480}>
      <label style={labelStyle(c)}>{t("Başlık")}</label>
      <input value={baslik} onChange={(e) => setBaslik(e.target.value)} style={inputStyle(c)} autoFocus maxLength={200} />

      <label style={{ ...labelStyle(c), marginTop: 14 }}>{t("Tür")}</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PROJE_ETKINLIK_TURLERI.map((k) => {
          const secili = tur === k;
          const renk = projeEtkinlikRengi({ kind: k });
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTur(k)}
              aria-pressed={secili}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 11px",
                borderRadius: 999,
                fontSize: 13,
                border: `1px solid ${secili ? renk : c.border}`,
                background: secili ? `${renk}24` : c.surface,
                color: c.textPrimary,
                cursor: "pointer",
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: 5, background: renk }} />
              {t(PROJE_ETKINLIK_TURU_ETIKETI[k])}
            </button>
          );
        })}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: c.textPrimary, marginTop: 14 }}>
        <input type="checkbox" checked={tumGun} onChange={(e) => setTumGun(e.target.checked)} />
        {t("Tüm gün")}
      </label>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1.4 1 140px" }}>
          <label style={labelStyle(c)}>{tumGun ? t("İlk gün") : t("Tarih")}</label>
          <input type="date" value={gun} onChange={(e) => setGun(e.target.value)} style={inputStyle(c)} />
        </div>
        {tumGun ? (
          <div style={{ flex: "1.4 1 140px" }}>
            <label style={labelStyle(c)}>{t("Son gün")}</label>
            <input type="date" value={sonGun} min={gun} onChange={(e) => setSonGun(e.target.value)} style={inputStyle(c)} />
          </div>
        ) : (
          <>
            <div style={{ flex: "1 1 90px" }}>
              <label style={labelStyle(c)}>{t("Başlangıç")}</label>
              <input type="time" value={bas} onChange={(e) => setBas(e.target.value)} style={inputStyle(c)} />
            </div>
            <div style={{ flex: "1 1 90px" }}>
              <label style={labelStyle(c)}>{t("Bitiş")}</label>
              <input type="time" value={bit} onChange={(e) => setBit(e.target.value)} style={inputStyle(c)} />
            </div>
          </>
        )}
      </div>

      <label style={{ ...labelStyle(c), marginTop: 14 }}>{t("Konum ya da bağlantı")}</label>
      <input value={konum} onChange={(e) => setKonum(e.target.value)} style={inputStyle(c)} maxLength={300} />

      <label style={{ ...labelStyle(c), marginTop: 14 }}>{t("Katılımcılar")}</label>
      <p style={{ fontSize: 12, color: c.textSecondary, margin: "0 0 6px", lineHeight: 1.5 }}>
        {t("Kimseyi seçmezsen etkinlik tüm ekibin kişisel takviminde görünür. Seçtiklerine ayrıca bildirim gider.")}
      </p>
      {uyeler.length === 0 ? (
        <div style={{ fontSize: 13, color: c.textSecondary }}>{t("Tüm proje ekibi")}</div>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {uyeler.map((m) => {
            const secili = katilimcilar.includes(m.userId);
            return (
              <button
                key={m.userId}
                type="button"
                aria-pressed={secili}
                onClick={() =>
                  setKatilimcilar((k) => (secili ? k.filter((x) => x !== m.userId) : [...k, m.userId]))
                }
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 13,
                  border: `1px solid ${secili ? c.accent : c.border}`,
                  background: secili ? `${c.accent}1F` : c.surface,
                  color: c.textPrimary,
                  cursor: "pointer",
                }}
              >
                {m.fullName ?? m.username ?? m.email ?? "?"}
              </button>
            );
          })}
        </div>
      )}

      <label style={{ ...labelStyle(c), marginTop: 14 }}>{t("Not")}</label>
      <textarea value={not} onChange={(e) => setNot(e.target.value)} rows={3} style={{ ...inputStyle(c), resize: "vertical" }} />

      {hata && <p style={{ color: c.danger, fontSize: 13, margin: "12px 0 0" }}>{hata}</p>}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
        {etkinlik && (
          <button onClick={sil} disabled={mesgul} style={{ ...secondaryButton(c), color: c.danger }}>
            {t("Sil")}
          </button>
        )}
        {projeyeGit}
        <span style={{ flex: 1 }} />
        <button onClick={onClose} style={secondaryButton(c)}>
          {t("Vazgeç")}
        </button>
        <button onClick={kaydet} disabled={mesgul} style={primaryButton(c, mesgul)}>
          {mesgul ? t("Kaydediliyor…") : t("Kaydet")}
        </button>
      </div>
    </Modal>
  );
}

/** "8 Eki Per 10:00–11:30" / "8 – 10 Eki" — kullanıcının dilinde. */
function zamanMetni(e: ProjeEtkinligi): string {
  const dil = bicimDili();
  const gunBicimi = (g: string) =>
    new Date(`${g}T12:00:00`).toLocaleDateString(dil, { day: "numeric", month: "short", weekday: "short" });
  if (e.allDay) return e.endDate ? `${gunBicimi(e.eventDate)} – ${gunBicimi(e.endDate)}` : gunBicimi(e.eventDate);
  return `${gunBicimi(e.eventDate)} ${e.startsAt}–${e.endsAt}`;
}
