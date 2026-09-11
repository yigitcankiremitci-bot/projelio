import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { dakikayiMetneCevir, sureyiDakikayaCevir, type WorkLogEntry } from "@projelio/shared";
import { worklog } from "../api/worklog";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { useProjectFabAction } from "../lib/projectFab";
import { useIsDesktop } from "../lib/useIsDesktop";
import WorkLogComposer from "../components/WorkLogComposer";
import WorkLogTargetModal, { type HedefNiyeti } from "../components/WorkLogTargetModal";
import WorkLogEditModal from "../components/WorkLogEditModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { IconPlay, IconStop, IconLink, IconTrash, IconCheck, IconEdit } from "../components/icons";

/**
 * YAPTIM — kullanıcının kişisel iş günlüğü.
 *
 * Yapılacaklar'ın tersi: orada "yapacağım", burada "yaptım". Sayfanın tek
 * amacı, gün içinde yapılan işin KAYBOLMAMASI.
 *
 * TASARIMIN ÇEKİRDEĞİ — sıra tersine çevrildi:
 *   Klasik yol "önce doğru görevi bul, sonra işaretle"dir. Kullanıcı yüzlerce
 *   kart arasında hangisiydi diye ararken vazgeçiyor ve yapılan iş hiçbir yere
 *   yazılmıyordu. Burada önce İŞ yazılır (tek satır + isteğe bağlı süre),
 *   nereye ait olduğu SONRA seçilir — hiç seçilmese bile kayıt durur.
 *
 * Bu yüzden giriş kutusu sayfanın en üstünde ve tek zorunlu alanı var. Proje
 * seçimi, süre, tarih: hepsi opsiyonel. Zorunlu kıldığımız her alan, kaydın
 * hiç girilmeme ihtimalini artırıyor.
 */

/** Hızlı süre düğmeleri. Gerçek hayatta en sık girilen değerler. */
const HIZLI_SURELER = [15, 30, 60, 120];

type Aralik = "today" | "week" | "month" | "all";

const ARALIKLAR: { value: Aralik; label: string }[] = [
  { value: "today", label: "Bugün" }, // dil:anahtar
  { value: "week", label: "Son 7 gün" }, // dil:anahtar
  { value: "month", label: "Son 30 gün" }, // dil:anahtar
  { value: "all", label: "Tümü" }, // dil:anahtar
];

export default function WorkLog() {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const [entries, setEntries] = useState<WorkLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [aralik, setAralik] = useState<Aralik>("today");
  const [hata, setHata] = useState("");

  const [kaydediliyor, setKaydediliyor] = useState(false);
  // Giriş kutusuna odaklanma yolu: kutu kendi ref'ini buraya bırakıyor, mobil
  // "+" düğmesi de bunu çağırıyor (bkz. WorkLogComposer odakRef).
  const odaklanRef = useRef<(() => void) | null>(null);

  const [hedefSecilen, setHedefSecilen] = useState<WorkLogEntry | null>(null);
  const [silinecek, setSilinecek] = useState<WorkLogEntry | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<WorkLogEntry | null>(null);
  // Kronometre çalışırken saniyede bir yeniden çizmek için: gerçek süre
  // sunucuda hesaplanıyor, buradaki sayaç yalnızca gösterim.
  const [tik, setTik] = useState(0);

  const araligiCozumle = useCallback((): { from?: string; to?: string } => {
    if (aralik === "all") return {};
    const bugun = new Date();
    const gun = (d: Date) => yerelGun(d);
    if (aralik === "today") return { from: gun(bugun), to: gun(bugun) };
    const geriye = aralik === "week" ? 6 : 29;
    const baslangic = new Date(bugun);
    baslangic.setDate(baslangic.getDate() - geriye);
    return { from: gun(baslangic), to: gun(bugun) };
  }, [aralik]);

  const yukle = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      worklog
        .list(araligiCozumle(), signal)
        .then((liste) => {
          setEntries(liste);
          setHata("");
        })
        .catch((err) => {
          if (signal?.aborted) return;
          setHata(err instanceof Error ? err.message : "Kayıtlar yüklenemedi");
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false);
        });
    },
    [araligiCozumle]
  );

  // Aralık değişince yeniden yükle. AbortController şart: kullanıcı hızlıca
  // Bugün → Hafta → Ay gezdiğinde geç dönen eski yanıt yenisini eziyordu
  // (bkz. api/client.ts'teki aynı gerekçe).
  useEffect(() => {
    const ac = new AbortController();
    yukle(ac.signal);
    return () => ac.abort();
  }, [yukle]);

  // Kronometre çalışan bir kayıt varsa geçen süreyi canlı göster.
  const calisan = entries.find((e) => e.timerStartedAt);
  useEffect(() => {
    if (!calisan) return;
    const id = window.setInterval(() => setTik((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [calisan?.id]);

  // Mobildeki "+" düğmesi bu sayfada giriş kutusuna odaklanır: yeni bir modal
  // açmak, tek satırlık bir kaydı iki tıklık bir işe dönüştürürdü.
  useProjectFabAction(
    useMemo(() => ({ label: "Kayıt ekle", onClick: () => odaklanRef.current?.() }), []),
    []
  );

  /**
   * Yeni kayıt. Görev seçildiyse sunucu üç işi daha yapıyor: süreyi görevin
   * üstünde biriktiriyor, istenirse görevi kapatıyor ve takvime "yapıldı"
   * bloğu koyuyor (bkz. WorklogService.gorevYansimalari).
   */
  const ekle = async (veri: {
    title?: string;
    taskId?: string;
    duration?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    markTaskDone?: boolean;
    addToCalendar?: boolean;
    niyet?: HedefNiyeti | null;
    kronometreBaslat?: boolean;
  }) => {
    if (kaydediliyor) return;
    setKaydediliyor(true);
    try {
      const yeni = await worklog.create({
        title: veri.title,
        taskId: veri.taskId,
        duration: veri.duration,
        // Saat aralığı yerel duvar saatiyle gidiyor: sunucu gün defterini de
        // takvim bloğunu da buna göre kuruyor (bkz. api/worklog.ts).
        startedAt: veri.startedAt ? `${yerelGun(new Date())}T${veri.startedAt}:00` : null,
        endedAt: veri.endedAt ? `${yerelGun(new Date())}T${veri.endedAt}:00` : null,
        doneAt: veri.startedAt ? undefined : simdiYerel(),
        markTaskDone: veri.markTaskDone,
        addToCalendar: veri.addToCalendar,
        // "Yeni oluştur" ile BAĞLAMA seçildiyse kayıt zaten bağlı doğuyor.
        ...(veri.niyet?.tip === "link"
          ? {
              targetKind: veri.niyet.targetKind,
              targetId: veri.niyet.targetId,
              targetLabel: veri.niyet.targetLabel,
              targetPath: veri.niyet.targetPath,
            }
          : {}),
      });

      // AKTARMA kaydın açılmasını bekliyor: hedefte kayıt açmak (tamamlanmış
      // görev, kasa hareketi) kaydın id'sini istiyor ve kullanıcı Ekle'ye
      // basmadan hedefte bir şey yaratmak yanlış olurdu — vazgeçerse ortada
      // sahipsiz bir görev kalırdı.
      const bagli = veri.niyet?.tip === "push" ? (await worklog.push(yeni.id, veri.niyet.push)).entry : yeni;
      const kayit = veri.kronometreBaslat ? await worklog.startTimer(bagli.id) : bagli;
      setEntries((prev) => [
        kayit,
        ...prev.map((e) => (veri.kronometreBaslat ? { ...e, timerStartedAt: undefined } : e)),
      ]);
      setHata("");
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Kayıt eklenemedi");
    } finally {
      setKaydediliyor(false);
    }
  };

  const guncelle = async (entry: WorkLogEntry, yama: { title?: string; duration?: string | number | null }) => {
    const onceki = entries;
    setEntries((prev) =>
      prev.map((e) =>
        e.id === entry.id
          ? {
              ...e,
              ...(yama.title !== undefined ? { title: yama.title } : {}),
              ...(yama.duration !== undefined
                ? { durationMinutes: yama.duration == null ? undefined : sureyiDakikayaCevir(yama.duration) ?? undefined }
                : {}),
            }
          : e
      )
    );
    try {
      const guncel = await worklog.update(entry.id, yama);
      setEntries((prev) => prev.map((e) => (e.id === guncel.id ? guncel : e)));
      setHata("");
    } catch (err) {
      setEntries(onceki);
      setHata(err instanceof Error ? err.message : "Kayıt güncellenemedi");
    }
  };

  const sureyiDegistir = async (entry: WorkLogEntry, dakika: number) => {
    // Aynı düğmeye tekrar basmak süreyi SIFIRLAMAZ, üstüne yazar: kullanıcı
    // yanlış düğmeye bastığında doğrusuna basıp düzeltebilmeli.
    const onceki = entries;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, durationMinutes: dakika } : e)));
    try {
      await worklog.update(entry.id, { duration: dakika });
    } catch (err) {
      setEntries(onceki);
      setHata(err instanceof Error ? err.message : "Süre kaydedilemedi");
    }
  };

  const kronometre = async (entry: WorkLogEntry) => {
    try {
      const guncel = entry.timerStartedAt
        ? await worklog.stopTimer(entry.id)
        : await worklog.startTimer(entry.id);
      // Başlatmak, çalışan başka bir kronometreyi durdurur (sunucu kuralı);
      // o kaydın süresi de değişmiş olabilir, listeyi tazeliyoruz.
      if (!entry.timerStartedAt && entries.some((e) => e.timerStartedAt && e.id !== entry.id)) {
        yukle();
        return;
      }
      setEntries((prev) => prev.map((e) => (e.id === guncel.id ? guncel : e)));
    } catch (err) {
      setHata(err instanceof Error ? err.message : "Kronometre değiştirilemedi");
    }
  };

  const sil = async (entry: WorkLogEntry) => {
    const onceki = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    setSilinecek(null);
    try {
      await worklog.archive(entry.id);
    } catch (err) {
      setEntries(onceki);
      setHata(err instanceof Error ? err.message : "Kayıt silinemedi");
    }
  };

  // Gün gün grupla. Sunucu zaten sıralı gönderiyor; burada yalnızca başlıklar
  // için bölüyoruz.
  const gunler = useMemo(() => {
    const harita = new Map<string, WorkLogEntry[]>();
    for (const entry of entries) {
      const gun = entry.doneAt.slice(0, 10);
      const liste = harita.get(gun) ?? [];
      liste.push(entry);
      harita.set(gun, liste);
    }
    return [...harita.entries()];
  }, [entries]);

  const toplamDakika = entries.reduce((acc, e) => acc + (e.durationMinutes ?? 0), 0);
  const bagsizSayisi = entries.filter((e) => !e.targetKind).length;

  return (
    // Kenar boşluğu sayfanın kendi sorumluluğu: App'teki kapsayıcı yalnızca
    // dikey boşluk veriyor (bkz. TasksOverview / Calendar — aynı 28/16 değeri).
    <div
      style={{
        minHeight: "100vh",
        background: c.background,
        padding: isDesktop ? "28px 28px 40px" : "16px 16px 40px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div>
        <h1 style={{ margin: 0, fontSize: 26, color: c.textPrimary }}>{t("Yaptım")}</h1>
        <p style={{ margin: "6px 0 0", fontSize: 14, color: c.textSecondary, lineHeight: 1.5, maxWidth: 620 }}>
          {t(
            "Yaptığın işi buraya yaz, nereye ait olduğunu sonra seç. Hiç seçmesen de kaydın durur — " +
              "önemli olan yapılan işin kaybolmaması."
          )}
        </p>
      </div>

      {/* --- Hızlı giriş --------------------------------------------------
          Kutu yazarken kullanıcının görevlerini de tarıyor: yapılan iş çoğu
          zaman sistemde zaten açık duran bir görev ve onu yüzlerce kart
          arasında aramak, kaydı hiç girmemeye yol açıyordu
          (bkz. WorkLogComposer). */}
      <WorkLogComposer kaydediliyor={kaydediliyor} onSubmit={(veri) => void ekle(veri)} odakRef={odaklanRef} />

      {hata && (
        <p style={{ margin: 0, color: c.danger, fontSize: 13.5 }} role="alert">
          {hata}
        </p>
      )}

      {/* --- Aralık ve özet ---------------------------------------------- */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {ARALIKLAR.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => setAralik(a.value)}
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              border: `1px solid ${aralik === a.value ? c.accent : c.border}`,
              background: aralik === a.value ? "rgba(192,129,63,0.10)" : "transparent",
              color: aralik === a.value ? c.accentDark : c.textSecondary,
              fontSize: 13.5,
            }}
          >
            {t(a.label)}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13.5, color: c.textSecondary }}>
          {entries.length} {t("kayıt")}
          {toplamDakika > 0 && ` · ${dakikayiMetneCevir(toplamDakika)}`}
          {bagsizSayisi > 0 && ` · ${bagsizSayisi} ${t("bağlanmamış")}`}
        </span>
      </div>

      {/* --- Liste -------------------------------------------------------- */}
      {loading ? (
        <p style={{ fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</p>
      ) : entries.length === 0 ? (
        <div
          style={{
            padding: "28px 20px",
            borderRadius: 12,
            border: `1px dashed ${c.border}`,
            textAlign: "center",
            color: c.textSecondary,
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          {t("Bu aralıkta kayıt yok.")}
          <br />
          {t("Yukarıya bir satır yaz — sonrası kolay.")}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {gunler.map(([gun, gunKayitlari]) => {
            const gunToplami = gunKayitlari.reduce((acc, e) => acc + (e.durationMinutes ?? 0), 0);
            return (
              <div key={gun}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    margin: "0 0 8px 2px",
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: 0.3,
                    color: c.textSecondary,
                  }}
                >
                  <span>{gunBasligi(gun, t)}</span>
                  {gunToplami > 0 && (
                    <span style={{ fontWeight: 400, color: c.textSecondary }}>· {dakikayiMetneCevir(gunToplami)}</span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {gunKayitlari.map((entry) => (
                    <WorkLogRow
                      key={entry.id}
                      entry={entry}
                      tik={tik}
                      onDuration={(dk) => void sureyiDegistir(entry, dk)}
                      onRename={(yeni) => void guncelle(entry, { title: yeni })}
                      onClearDuration={() => void guncelle(entry, { duration: null })}
                      onTimer={() => void kronometre(entry)}
                      onTarget={() => setHedefSecilen(entry)}
                      onEdit={() => setDuzenlenen(entry)}
                      onDelete={() => setSilinecek(entry)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hedefSecilen && (
        <WorkLogTargetModal
          entry={hedefSecilen}
          onClose={() => setHedefSecilen(null)}
          onDone={(guncel, path) => {
            setEntries((prev) => prev.map((e) => (e.id === guncel.id ? guncel : e)));
            setHedefSecilen(null);
            if (path) navigate(path);
          }}
        />
      )}

      {duzenlenen && (
        <WorkLogEditModal
          entry={duzenlenen}
          onClose={() => setDuzenlenen(null)}
          onSaved={(guncel) => {
            // Tarih değişmiş olabilir: kayıt seçili aralığın dışına çıkabilir,
            // bu yüzden listeyi tazeliyoruz (yerinde güncellemek onu yanlış
            // gün başlığının altında bırakırdı).
            setDuzenlenen(null);
            void guncel;
            yukle();
          }}
        />
      )}

      {silinecek && (
        <ConfirmDialog
          title={t("Kaydı sil")}
          message={t("“{baslik}” kaydı silinsin mi?", { baslik: silinecek.title })}
          confirmLabel={t("Sil")}
          danger
          onCancel={() => setSilinecek(null)}
          onConfirm={() => void sil(silinecek)}
        />
      )}
    </div>
  );
}

/** Tek bir günlük satırı. */
function WorkLogRow({
  entry,
  tik,
  onDuration,
  onRename,
  onClearDuration,
  onTimer,
  onTarget,
  onEdit,
  onDelete,
}: {
  entry: WorkLogEntry;
  tik: number;
  onDuration: (dakika: number) => void;
  onRename: (baslik: string) => void;
  onClearDuration: () => void;
  onTimer: () => void;
  onTarget: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const calisiyor = Boolean(entry.timerStartedAt);
  // Çift tıklayınca başlık yerinde düzenlenir — pano kartlarındaki davranışın
  // aynısı (bkz. TaskColumn). Yazım hatasını düzeltmek için kaydı silip yeniden
  // yazmak, hızlı giriş vaadini boşa çıkarırdı.
  const [duzenleniyor, setDuzenleniyor] = useState(false);
  const [taslak, setTaslak] = useState(entry.title);
  // tik yalnızca yeniden çizim tetiği; değeri kullanılmıyor.
  void tik;

  const bitir = () => {
    const yeniBaslik = taslak.trim();
    setDuzenleniyor(false);
    // Boş başlık kaydı silmez, sadece düzenlemeyi iptal eder: bir satırı
    // yanlışlıkla boşaltmak, onu kaybetmek anlamına gelmemeli.
    if (!yeniBaslik || yeniBaslik === entry.title) {
      setTaslak(entry.title);
      return;
    }
    onRename(yeniBaslik);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        background: c.surface,
        border: `1px solid ${calisiyor ? c.accent : c.border}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {duzenleniyor ? (
            <input
              autoFocus
              value={taslak}
              onChange={(e) => setTaslak(e.target.value)}
              onBlur={bitir}
              onKeyDown={(e) => {
                if (e.key === "Enter") bitir();
                if (e.key === "Escape") {
                  setTaslak(entry.title);
                  setDuzenleniyor(false);
                }
              }}
              aria-label={t("Kayıt başlığı")}
              style={{ flex: 1, minWidth: 160, fontSize: 15 }}
            />
          ) : (
            <span
              onDoubleClick={() => {
                setTaslak(entry.title);
                setDuzenleniyor(true);
              }}
              title={t("Düzenlemek için çift tıkla")}
              style={{ fontSize: 15, color: c.textPrimary, wordBreak: "break-word" }}
            >
              {entry.title}
            </span>
          )}
          {entry.source === "lio" && (
            <span
              title={t("Lio ekledi")}
              style={{
                fontSize: 11,
                padding: "1px 6px",
                borderRadius: 999,
                background: "rgba(192,129,63,0.14)",
                color: c.accentDark,
              }}
            >
              Lio
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
          {/* Saat aralığı varsa onu göster: "09:00–10:30", kaydın girildiği tek
              bir andan daha çok şey anlatıyor ve takvimdeki bloğun karşılığı. */}
          <span style={{ fontSize: 12.5, color: c.textSecondary }}>
            {entry.startedAt && entry.endedAt
              ? `${entry.startedAt.slice(11, 16)}–${entry.endedAt.slice(11, 16)}`
              : entry.doneAt.slice(11, 16)}
          </span>
          {entry.durationMinutes ? (
            // Süreye tıklamak onu SİLER ve hızlı düğmeleri geri getirir: yanlış
            // düğmeye basan biri tek tıkla düzeltebilmeli.
            <button
              type="button"
              onClick={onClearDuration}
              title={t("Süreyi değiştir")}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                fontSize: 12.5,
                color: c.textSecondary,
              }}
            >
              · {dakikayiMetneCevir(entry.durationMinutes)}
            </button>
          ) : (
            // Süresi olmayan kayıtta hızlı düğmeler: tek tıkla süre girmek,
            // düzenleme modalı açmaktan kat kat hızlı.
            <span style={{ display: "flex", gap: 4 }}>
              {HIZLI_SURELER.map((dk) => (
                <button
                  key={dk}
                  type="button"
                  onClick={() => onDuration(dk)}
                  title={t("Süre: {sure}", { sure: dakikayiMetneCevir(dk) })}
                  style={{
                    padding: "1px 7px",
                    borderRadius: 999,
                    border: `1px solid ${c.border}`,
                    background: "transparent",
                    color: c.textSecondary,
                    fontSize: 11.5,
                  }}
                >
                  {dakikayiMetneCevir(dk)}
                </button>
              ))}
            </span>
          )}
          {entry.timeBlockId && (
            <span title={t("Takvimde “yapıldı” olarak duruyor")} style={{ fontSize: 12.5, color: c.textSecondary }}>
              · {t("takvimde")}
            </span>
          )}
          {/* Bağlı olduğu yer TIKLANABİLİR: kullanıcının bir kaydı görünce ilk
              yaptığı şey "hangi işti bu" diye oraya gitmek. Adres bağlama
              anında yazılıyor (bkz. migration 099); yoksa düz metin kalır. */}
          {entry.targetLabel &&
            (entry.targetPath ? (
              <Link
                to={entry.targetPath}
                title={t("Bağlı olduğu yere git")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12.5,
                  color: c.completed,
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                <IconCheck size={12} color={c.completed} />
                {entry.targetLabel}
              </Link>
            ) : (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, color: c.completed }}>
                <IconCheck size={12} color={c.completed} />
                {entry.targetLabel}
              </span>
            ))}
        </div>
      </div>

      <button
        type="button"
        onClick={onTimer}
        aria-label={calisiyor ? t("Kronometreyi durdur") : t("Kronometreyi başlat")}
        title={calisiyor ? t("Kronometreyi durdur") : t("Kronometreyi başlat")}
        style={ikonDugmesi(c, calisiyor)}
      >
        {calisiyor ? <IconStop size={14} color={c.accentDark} /> : <IconPlay size={14} color={c.textSecondary} />}
      </button>
      <button
        type="button"
        onClick={onTarget}
        aria-label={t("Nereye ait?")}
        title={t("Nereye ait? — projeye, göreve, kasaya aktar")}
        style={ikonDugmesi(c, false)}
      >
        <IconLink size={14} color={entry.targetKind ? c.accentDark : c.textSecondary} />
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t("Düzenle")}
        title={t("Düzenle — tarih, saat, süre")}
        style={ikonDugmesi(c, false)}
      >
        <IconEdit size={14} color={c.textSecondary} />
      </button>
      <button type="button" onClick={onDelete} aria-label={t("Sil")} title={t("Sil")} style={ikonDugmesi(c, false)}>
        <IconTrash size={14} color={c.textSecondary} />
      </button>
    </div>
  );
}

function ikonDugmesi(c: ReturnType<typeof useThemeColors>, vurgulu: boolean) {
  return {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: 8,
    border: `1px solid ${vurgulu ? c.accent : c.border}`,
    background: vurgulu ? "rgba(192,129,63,0.10)" : "transparent",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
}

/** Şu anı, saat dilimi taşımayan yerel damgaya çevirir: "YYYY-MM-DDTHH:MM:SS". */
function simdiYerel(): string {
  const d = new Date();
  const ss = String(d.getHours()).padStart(2, "0");
  const dd = String(d.getMinutes()).padStart(2, "0");
  const sn = String(d.getSeconds()).padStart(2, "0");
  return `${yerelGun(d)}T${ss}:${dd}:${sn}`;
}

/** Yerel günü "YYYY-MM-DD" olarak verir. toISOString UTC'ye kaydırırdı. */
function yerelGun(d: Date): string {
  const ay = String(d.getMonth() + 1).padStart(2, "0");
  const gun = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${ay}-${gun}`;
}

/** "Bugün" / "Dün" / "10 Eylül Perşembe". */
function gunBasligi(gun: string, t: (metin: string) => string): string {
  const bugun = yerelGun(new Date());
  if (gun === bugun) return t("Bugün");
  const dun = new Date();
  dun.setDate(dun.getDate() - 1);
  if (gun === yerelGun(dun)) return t("Dün");
  return new Date(`${gun}T12:00:00`).toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
}
