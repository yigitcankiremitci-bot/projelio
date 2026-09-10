import { useEffect, useRef, useState } from "react";
import type { SchedulableTask } from "@projelio/shared";
import { dakikayiMetneCevir, sureyiDakikayaCevir } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { useTaskSearch } from "../lib/useTaskSearch";
import WorkLogHedefSecici, { type SecilenHedef } from "./WorkLogHedefSecici";
import { IconPlay, IconX, IconCheck } from "./icons";

/**
 * Yaptım'ın giriş kutusu.
 *
 * İKİ İŞİ BİRDEN YAPAR ve ayrımı kullanıcıya sormaz:
 *   · Serbest metin — sistemde karşılığı olmayan iş. Yazıp Enter.
 *   · KAYITLI GÖREV — yazarken kullanıcının görevleri taranır, listeden
 *     seçilir. Yapılan iş çoğu zaman zaten açık duran bir görevdir ve onu
 *     yüzlerce kart arasında aramak, kaydı hiç girmemeye yol açıyordu.
 *
 * Görev seçilince üç şey birden mümkün oluyor: harcanan süre görevin üstünde
 * birikir, görev kendi panosunda kapatılabilir, iş takvimde yerini alır.
 * Üçü de İSTEĞE BAĞLI — hiçbiri işaretlenmese bile kayıt durur.
 *
 * SÜRE İKİ BİÇİMDE girilebilir ve ikisi aynı anda görünmez: ya "ne kadar
 * sürdü" (45, 1s 30dk) ya da "kaçta başladı, kaçta bitti". İkincisinde süre
 * hesaplanır — kullanıcı bildiği şeyi yazar, aritmetiği makine yapar.
 */

interface Props {
  kaydediliyor: boolean;
  onSubmit: (veri: {
    title?: string;
    taskId?: string;
    duration?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    markTaskDone?: boolean;
    addToCalendar?: boolean;
    hedef?: SecilenHedef | null;
    kronometreBaslat?: boolean;
  }) => void;
  /** Sayfadaki "+" düğmesi kutuya odaklanabilsin diye. */
  odakRef?: React.MutableRefObject<(() => void) | null>;
}

export default function WorkLogComposer({ kaydediliyor, onSubmit, odakRef }: Props) {
  const c = useThemeColors();
  const t = useT();

  const [metin, setMetin] = useState("");
  const [secilenGorev, setSecilenGorev] = useState<SchedulableTask | null>(null);
  const [sure, setSure] = useState("");
  const [aralikModu, setAralikModu] = useState(false);
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [yapildi, setYapildi] = useState(true);
  const [takvime, setTakvime] = useState(true);
  // Görev SEÇİLMEDİĞİNDE kullanılan serbest hedef (proje/iş/departman).
  const [hedef, setHedef] = useState<SecilenHedef | null>(null);

  const [listeAcik, setListeAcik] = useState(false);
  const [vurgulu, setVurgulu] = useState(0);
  const girisRef = useRef<HTMLInputElement>(null);

  // Görev seçiliyken arama durur: kutuda artık bir arama terimi değil, seçilmiş
  // işin adı duruyor.
  const { tasks, loading, hata, adaySayisi, tekrarDene } = useTaskSearch(metin, !secilenGorev);

  useEffect(() => {
    if (odakRef) odakRef.current = () => girisRef.current?.focus();
  }, [odakRef]);

  useEffect(() => {
    setVurgulu(0);
  }, [tasks.length]);

  const gorunenListe = listeAcik && !secilenGorev && tasks.length > 0;

  const gorevSec = (gorev: SchedulableTask) => {
    setSecilenGorev(gorev);
    setMetin(gorev.title);
    setListeAcik(false);
    // Görevin tahmini süresi hazır bir öneri: çoğu zaman gerçekleşen de ona
    // yakın çıkıyor ve kullanıcı yalnızca düzeltiyor. Kullanıcı süre yazdıysa
    // ona dokunmuyoruz.
    if (!sure && !aralikModu && gorev.estimatedMinutes) setSure(dakikayiMetneCevir(gorev.estimatedMinutes));
    girisRef.current?.focus();
  };

  const secimiKaldir = () => {
    setSecilenGorev(null);
    setMetin("");
    girisRef.current?.focus();
  };

  const gonder = (kronometreBaslat = false) => {
    if (!metin.trim() || kaydediliyor) return;
    const aralikVar = aralikModu && baslangic && bitis;
    onSubmit({
      // Görev seçiliyse başlık sunucuda görevden geliyor; kullanıcı kutudaki
      // metni değiştirdiyse (ör. "…(revizyon)" ekledi) onunki kazanıyor.
      title: metin.trim(),
      taskId: secilenGorev?.id,
      duration: aralikVar ? null : sure.trim() || null,
      startedAt: aralikVar ? baslangic : null,
      endedAt: aralikVar ? bitis : null,
      markTaskDone: Boolean(secilenGorev) && yapildi,
      addToCalendar: Boolean(secilenGorev) && takvime,
      // Görev seçiliyse bağlantı zaten o görevdir; serbest hedef yalnızca
      // görev seçilmediğinde anlamlı.
      hedef: secilenGorev ? null : hedef,
      kronometreBaslat,
    });
    setMetin("");
    setSure("");
    setBaslangic("");
    setBitis("");
    setSecilenGorev(null);
    setHedef(null);
    setListeAcik(false);
  };

  const tusIsle = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!gorunenListe) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setVurgulu((n) => (n + 1) % tasks.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setVurgulu((n) => (n - 1 + tasks.length) % tasks.length);
    } else if (e.key === "Enter") {
      // Listede gezinirken Enter SEÇER, kaydetmez: kullanıcı ok tuşlarıyla
      // aşağı indiyse niyeti listeden bir şey almaktır.
      e.preventDefault();
      gorevSec(tasks[vurgulu]);
    } else if (e.key === "Escape") {
      setListeAcik(false);
    }
  };

  const hesaplananDakika = aralikModu && baslangic && bitis ? dakikaFarki(baslangic, bitis) : null;
  const sureGecerli = !sure.trim() || sureyiDakikayaCevir(sure) != null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        gonder(false);
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        borderRadius: 12,
        background: c.surface,
        border: `1px solid ${secilenGorev ? c.accent : c.border}`,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, position: "relative" }}>
        <div style={{ flex: "1 1 260px", minWidth: 0, position: "relative" }}>
          <input
            ref={girisRef}
            value={metin}
            onChange={(e) => {
              setMetin(e.target.value);
              setListeAcik(true);
              // Kutuyu elle değiştirmek seçimi bozmaz: kullanıcı görevin adına
              // bir ek yazabilmeli. Tamamen silerse seçim de düşer.
              if (secilenGorev && !e.target.value.trim()) setSecilenGorev(null);
            }}
            onFocus={() => setListeAcik(true)}
            onBlur={() => window.setTimeout(() => setListeAcik(false), 150)}
            onKeyDown={tusIsle}
            placeholder={t("Ne yaptın? Görev adı yazarsan listeden seçebilirsin")}
            aria-label={t("Ne yaptın?")}
            role="combobox"
            aria-expanded={gorunenListe}
            aria-autocomplete="list"
            style={{ width: "100%" }}
          />
          {gorunenListe && (
            <GorevListesi tasks={tasks} vurgulu={vurgulu} onSec={gorevSec} onVurgula={setVurgulu} />
          )}
        </div>

        {aralikModu ? (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="time"
              value={baslangic}
              onChange={(e) => setBaslangic(e.target.value)}
              aria-label={t("Başlangıç saati")}
              style={{ width: 108 }}
            />
            <span style={{ color: c.textSecondary }}>–</span>
            <input
              type="time"
              value={bitis}
              onChange={(e) => setBitis(e.target.value)}
              aria-label={t("Bitiş saati")}
              style={{ width: 108 }}
            />
          </div>
        ) : (
          <input
            value={sure}
            onChange={(e) => setSure(e.target.value)}
            placeholder={t("Süre")}
            aria-label={t("Süre (örn. 45, 1s 30dk)")}
            title={t('Örnek: "45", "1s 30dk", "2 saat", "1:30"')}
            style={{ flex: "0 0 110px", width: 110, borderColor: sureGecerli ? undefined : c.danger }}
          />
        )}

        <button
          type="submit"
          data-primary
          disabled={!metin.trim() || kaydediliyor}
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: c.onPrimary,
            fontSize: 15,
            fontWeight: 500,
            opacity: !metin.trim() ? 0.6 : 1,
          }}
        >
          {t("Ekle")}
        </button>
        {/* Süreyi bilmeyen için: kaydı aç ve ölçmeye başla. */}
        <button
          type="button"
          onClick={() => gonder(true)}
          disabled={!metin.trim() || kaydediliyor}
          title={t("Kaydı aç ve kronometreyi başlat")}
          style={{
            padding: "9px 14px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.textSecondary,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 6,
            opacity: !metin.trim() ? 0.6 : 1,
          }}
        >
          <IconPlay size={14} color={c.textSecondary} />
          {t("Başlat")}
        </button>
      </div>

      {/* --- İkinci satır: seçili görev, seçenekler ve süre biçimi --------- */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 13 }}>
        {secilenGorev && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 6px 3px 9px",
              borderRadius: 999,
              background: "rgba(192,129,63,0.12)",
              color: c.accentDark,
              maxWidth: "100%",
            }}
          >
            <IconCheck size={12} color={c.accentDark} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {gorevinYeri(secilenGorev) ?? t("Görev")}
              {secilenGorev.parentTaskId ? ` · ${t("alt görev")}` : ""}
            </span>
            <button
              type="button"
              onClick={secimiKaldir}
              aria-label={t("Görev bağlantısını kaldır")}
              title={t("Görev bağlantısını kaldır")}
              style={{ border: "none", background: "transparent", padding: 0, display: "flex" }}
            >
              <IconX size={12} color={c.accentDark} />
            </button>
          </span>
        )}

        {!secilenGorev && <WorkLogHedefSecici secilen={hedef} onSec={setHedef} />}

        {secilenGorev && (
          <>
            <Onay
              isaretli={yapildi}
              onDegis={setYapildi}
              etiket={t("Görevi yapıldı işaretle")}
              ipucu={t("Görev kendi projesinde/departmanında da tamamlandıya geçer.")}
            />
            <Onay
              isaretli={takvime}
              onDegis={setTakvime}
              etiket={t("Takvime işle")}
              ipucu={t("Takvimde “yapıldı” bloğu olarak görünür.")}
            />
          </>
        )}

        <span style={{ flex: 1 }} />

        {hesaplananDakika != null && hesaplananDakika > 0 && (
          <span style={{ color: c.textSecondary }}>{dakikayiMetneCevir(hesaplananDakika)}</span>
        )}
        <button
          type="button"
          onClick={() => setAralikModu((v) => !v)}
          style={{ border: "none", background: "transparent", color: c.textSecondary, fontSize: 13, padding: 0 }}
        >
          {aralikModu ? t("Süre gir") : t("Saat aralığı gir")}
        </button>
      </div>

      {/* Aday listesinin durumu. Kutu her hâlükârda SERBEST METİN kutusu olarak
          çalışmaya devam ediyor — görev önerisi bir kolaylık, kaydın önkoşulu
          değil. Ama sessizce boş kalmıyor: kullanıcı neden öneri görmediğini
          buradan anlıyor. */}
      {!secilenGorev && loading && (
        <span style={{ fontSize: 12.5, color: c.textSecondary }}>{t("Görevlerin yükleniyor…")}</span>
      )}
      {!secilenGorev && !loading && hata && (
        <span style={{ fontSize: 12.5, color: c.danger, display: "flex", alignItems: "center", gap: 8 }}>
          {t("Görevlerin yüklenemedi, arama çalışmıyor.")}
          <button
            type="button"
            onClick={tekrarDene}
            style={{ border: "none", background: "transparent", color: c.accentDark, fontSize: 12.5, padding: 0 }}
          >
            {t("Tekrar dene")}
          </button>
        </span>
      )}
      {!secilenGorev && !loading && !hata && adaySayisi === 0 && (
        <span style={{ fontSize: 12.5, color: c.textSecondary }}>
          {t("Aranacak açık görevin yok; serbestçe yazabilirsin.")}
        </span>
      )}
      {!secilenGorev && !loading && !hata && adaySayisi > 0 && metin.trim().length >= 2 && tasks.length === 0 && (
        <span style={{ fontSize: 12.5, color: c.textSecondary }}>
          {t("{n} görev arasında eşleşme yok — serbest kayıt olarak eklenecek.", { n: adaySayisi })}
        </span>
      )}
    </form>
  );
}

/** Arama kutusunun altında açılan görev listesi. */
function GorevListesi({
  tasks,
  vurgulu,
  onSec,
  onVurgula,
}: {
  tasks: SchedulableTask[];
  vurgulu: number;
  onSec: (gorev: SchedulableTask) => void;
  onVurgula: (i: number) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  return (
    <div
      role="listbox"
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        marginTop: 4,
        // Kutunun kendi kartından yukarıda dursun; sayfadaki satırların altında
        // kaybolursa liste yarı görünür kalıyor.
        zIndex: 5,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(15,18,25,0.14)",
        overflow: "hidden",
      }}
    >
      {tasks.map((gorev, i) => (
        <button
          key={gorev.id}
          type="button"
          role="option"
          aria-selected={i === vurgulu}
          onMouseEnter={() => onVurgula(i)}
          // onMouseDown: input'un onBlur'ü tıklamadan önce çalışıp listeyi
          // kapatıyor ve onClick hiç ateşlenmiyordu.
          onMouseDown={(e) => {
            e.preventDefault();
            onSec(gorev);
          }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 2,
            width: "100%",
            padding: "8px 11px",
            border: "none",
            borderBottom: `1px solid ${c.border}`,
            background: i === vurgulu ? c.background : "transparent",
            color: c.textPrimary,
            fontSize: 14,
            textAlign: "left",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
            {gorev.title}
          </span>
          <span style={{ fontSize: 12, color: c.textSecondary }}>
            {[
              gorev.parentTaskId ? t("alt görev") : null,
              gorevinYeri(gorev),
              gorev.jobTitle,
              gorev.actualMinutes ? `${t("şimdiye dek")} ${dakikayiMetneCevir(gorev.actualMinutes)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
      ))}
    </div>
  );
}

function Onay({
  isaretli,
  onDegis,
  etiket,
  ipucu,
}: {
  isaretli: boolean;
  onDegis: (v: boolean) => void;
  etiket: string;
  ipucu: string;
}) {
  const c = useThemeColors();
  return (
    <label
      title={ipucu}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, color: c.textSecondary, cursor: "pointer" }}
    >
      <input type="checkbox" checked={isaretli} onChange={(e) => onDegis(e.target.checked)} />
      {etiket}
    </label>
  );
}

/**
 * Görevin nerede yaşadığı, tek satırda. Departmanda ŞİRKET ADI da var: iki
 * şirkette aynı adlı departman olabiliyor ("Muhasebe") ve şirket adı olmadan
 * hangisi olduğu anlaşılmıyor.
 */
function gorevinYeri(gorev: SchedulableTask): string | undefined {
  if (gorev.projectTitle) return gorev.projectTitle;
  if (gorev.departmentName) {
    return gorev.departmentOrganizationName
      ? `${gorev.departmentName} · ${gorev.departmentOrganizationName}`
      : gorev.departmentName;
  }
  return gorev.operationTitle;
}

/** "09:00" ve "10:30" -> 90. Gece yarısını geçen aralık burada eksi döner. */
function dakikaFarki(baslangic: string, bitis: string): number {
  const [bs, bd] = baslangic.split(":").map(Number);
  const [es, ed] = bitis.split(":").map(Number);
  return es * 60 + ed - (bs * 60 + bd);
}
