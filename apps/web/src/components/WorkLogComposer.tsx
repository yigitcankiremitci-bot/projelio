import { useEffect, useRef, useState } from "react";
import { dakikayiMetneCevir, sureyiDakikayaCevir } from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { useTaskSearch, type Oneri } from "../lib/useTaskSearch";
import WorkLogTargetModal, { type HedefNiyeti } from "./WorkLogTargetModal";
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
    niyet?: HedefNiyeti | null;
    kronometreBaslat?: boolean;
  }) => void;
  /** Sayfadaki "+" düğmesi kutuya odaklanabilsin diye. */
  odakRef?: React.MutableRefObject<(() => void) | null>;
}

export default function WorkLogComposer({ kaydediliyor, onSubmit, odakRef }: Props) {
  const c = useThemeColors();
  const t = useT();

  const [metin, setMetin] = useState("");
  // Seçilen öneri: görev de olabilir, proje/iş/departman da. Ayrım
  // `secilen.tur`'de; görev seçildiğinde ek seçenekler (yapıldı/takvim) çıkıyor.
  const [secilen, setSecilen] = useState<Oneri | null>(null);
  // Eşleşme çıkmayınca "yeni oluştur" ile seçilen yer. Kayıt HENÜZ açılmadı;
  // niyet Ekle'ye basılınca uygulanıyor.
  const [niyet, setNiyet] = useState<HedefNiyeti | null>(null);
  const [hedefModali, setHedefModali] = useState(false);
  const [sure, setSure] = useState("");
  const [aralikModu, setAralikModu] = useState(false);
  const [baslangic, setBaslangic] = useState("");
  const [bitis, setBitis] = useState("");
  const [yapildi, setYapildi] = useState(true);
  const [takvime, setTakvime] = useState(true);

  const [listeAcik, setListeAcik] = useState(false);
  const [vurgulu, setVurgulu] = useState(0);
  const girisRef = useRef<HTMLInputElement>(null);

  // Görev seçiliyken arama durur: kutuda artık bir arama terimi değil, seçilmiş
  // işin adı duruyor.
  const { oneriler, loading, hata, adaySayisi, tekrarDene } = useTaskSearch(metin, !secilen);

  useEffect(() => {
    if (odakRef) odakRef.current = () => girisRef.current?.focus();
  }, [odakRef]);

  useEffect(() => {
    setVurgulu(0);
  }, [oneriler.length]);

  // Liste, eşleşme olmasa da açılıyor: "yeni oluştur" satırı her zaman
  // orada ve kullanıcının bir sonraki adımı o.
  const gorunenListe = listeAcik && !secilen && !niyet && metin.trim().length >= 2;

  const oneriSec = (oneri: Oneri) => {
    setSecilen(oneri);
    setMetin(oneri.baslik);
    setListeAcik(false);
    // Görevin tahmini süresi hazır bir öneri: çoğu zaman gerçekleşen de ona
    // yakın çıkıyor ve kullanıcı yalnızca düzeltiyor. Kullanıcı süre yazdıysa
    // ona dokunmuyoruz.
    if (!sure && !aralikModu && oneri.task?.estimatedMinutes) {
      setSure(dakikayiMetneCevir(oneri.task.estimatedMinutes));
    }
    girisRef.current?.focus();
  };

  const secimiKaldir = () => {
    setSecilen(null);
    setNiyet(null);
    // Metin DURUYOR: kullanıcı proje bağlantısını kaldırdığında yazdığı iş
    // adını da kaybetmemeli.
    girisRef.current?.focus();
  };

  const gonder = (kronometreBaslat = false) => {
    if (!metin.trim() || kaydediliyor) return;
    const aralikVar = aralikModu && baslangic && bitis;
    const gorev = secilen;
    onSubmit({
      // Görev seçiliyse başlık sunucuda görevden geliyor; kullanıcı kutudaki
      // metni değiştirdiyse (ör. "…(revizyon)" ekledi) onunki kazanıyor.
      title: metin.trim(),
      taskId: gorev?.id,
      duration: aralikVar ? null : sure.trim() || null,
      startedAt: aralikVar ? baslangic : null,
      endedAt: aralikVar ? bitis : null,
      markTaskDone: Boolean(gorev) && yapildi,
      addToCalendar: Boolean(gorev) && takvime,
      // Görev seçiliyse bağlantıyı sunucu görevden kuruyor; kapsayıcı
      // (proje/iş/departman) seçildiyse bağlantı bilgisi buradan gidiyor.
      // Görev seçiliyse bağlantıyı sunucu görevden kuruyor; "yeni oluştur"
      // ile bir yer seçildiyse niyet Ekle'den sonra uygulanıyor.
      niyet: gorev ? null : niyet,
      kronometreBaslat,
    });
    setMetin("");
    setSure("");
    setBaslangic("");
    setBitis("");
    setSecilen(null);
    setNiyet(null);
    setListeAcik(false);
  };

  const tusIsle = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!gorunenListe) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setVurgulu((n) => (n + 1) % (oneriler.length + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setVurgulu((n) => (n - 1 + oneriler.length + 1) % (oneriler.length + 1));
    } else if (e.key === "Enter") {
      // Listede gezinirken Enter SEÇER, kaydetmez: kullanıcı ok tuşlarıyla
      // aşağı indiyse niyeti listeden bir şey almaktır.
      e.preventDefault();
      if (vurgulu >= oneriler.length) {
        setListeAcik(false);
        setHedefModali(true);
      } else {
        oneriSec(oneriler[vurgulu]);
      }
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
        border: `1px solid ${secilen || niyet ? c.accent : c.border}`,
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
              if (secilen && !e.target.value.trim()) setSecilen(null);
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
            <OneriListesi
              oneriler={oneriler}
              metin={metin.trim()}
              vurgulu={vurgulu}
              onSec={oneriSec}
              onYeni={() => {
                setListeAcik(false);
                setHedefModali(true);
              }}
              onVurgula={setVurgulu}
            />
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
        {(secilen || niyet) && (
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
              {secilen ? (secilen.altBaslik || t("Görev")) : niyet?.ozet}
            </span>
            <button
              type="button"
              onClick={secimiKaldir}
              aria-label={t("Bağlantıyı kaldır")}
              title={t("Bağlantıyı kaldır")}
              style={{ border: "none", background: "transparent", padding: 0, display: "flex" }}
            >
              <IconX size={12} color={c.accentDark} />
            </button>
          </span>
        )}

        {/* Bu iki seçenek yalnızca VAR OLAN bir görev seçilince anlamlı: yeni
            açılacak görev zaten tamamlanmış olarak açılıyor ve takvime de
            aktarma adımında giriyor. */}
        {secilen && (
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
      {!secilen && loading && (
        <span style={{ fontSize: 12.5, color: c.textSecondary }}>{t("Görevlerin yükleniyor…")}</span>
      )}
      {!secilen && !loading && hata && (
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
      {!secilen && !loading && !hata && adaySayisi === 0 && (
        <span style={{ fontSize: 12.5, color: c.textSecondary }}>
          {t("Bağlanacak bir şey bulunamadı; serbestçe yazabilirsin.")}
        </span>
      )}
      {!secilen && !loading && !hata && adaySayisi > 0 && metin.trim().length >= 2 && oneriler.length === 0 && (
        <span style={{ fontSize: 12.5, color: c.textSecondary }}>
          {t("{n} kayıt arasında eşleşme yok — serbest kayıt olarak eklenecek.", { n: adaySayisi })}
        </span>
      )}
      {hedefModali && (
        <WorkLogTargetModal
          baslik={metin.trim()}
          onClose={() => setHedefModali(false)}
          onSecim={(secim) => {
            setNiyet(secim);
            setHedefModali(false);
            girisRef.current?.focus();
          }}
        />
      )}
    </form>
  );
}

/**
 * Arama kutusunun altında açılan görev listesi.
 *
 * SON SATIR HER ZAMAN "YENİ OLUŞTUR": eşleşme çıkmadığında kullanıcının tek
 * yolu bu, eşleşme çıktığında da hiçbiri doğru olmayabiliyor. Ona basmak
 * "nereye ait?" penceresini açıyor — yer seçimi orada, süre yine kutuda.
 */
function OneriListesi({
  oneriler,
  metin,
  vurgulu,
  onSec,
  onYeni,
  onVurgula,
}: {
  oneriler: Oneri[];
  metin: string;
  vurgulu: number;
  onSec: (oneri: Oneri) => void;
  onYeni: () => void;
  onVurgula: (i: number) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const satirStili = (secili: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 11px",
    border: "none",
    borderBottom: `1px solid ${c.border}`,
    background: secili ? c.background : "transparent",
    color: c.textPrimary,
    fontSize: 14,
    textAlign: "left" as const,
  });

  return (
    <div
      role="listbox"
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        marginTop: 4,
        zIndex: 5,
        background: c.surface,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(15,18,25,0.14)",
        overflow: "hidden",
      }}
    >
      {oneriler.map((oneri, i) => (
        <button
          key={oneri.id}
          type="button"
          role="option"
          aria-selected={i === vurgulu}
          onMouseEnter={() => onVurgula(i)}
          // onMouseDown: input'un onBlur'ü tıklamadan önce çalışıp listeyi
          // kapatıyor ve onClick hiç ateşlenmiyordu.
          onMouseDown={(e) => {
            e.preventDefault();
            onSec(oneri);
          }}
          style={satirStili(i === vurgulu)}
        >
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 1 }}>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                // Tamamlanmış görev listede duruyor (sonradan süre yazılabilsin
                // diye) ama açık olanlardan ayırt edilebilmeli.
                color: oneri.task.status === "completed" ? c.textSecondary : c.textPrimary,
              }}
            >
              {oneri.baslik}
            </span>
            {oneri.altBaslik && (
              <span
                style={{
                  fontSize: 12,
                  color: c.textSecondary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {oneri.altBaslik}
              </span>
            )}
          </span>
        </button>
      ))}

      <button
        type="button"
        role="option"
        aria-selected={vurgulu === oneriler.length}
        onMouseEnter={() => onVurgula(oneriler.length)}
        onMouseDown={(e) => {
          e.preventDefault();
          onYeni();
        }}
        style={{ ...satirStili(vurgulu === oneriler.length), borderBottom: "none", color: c.accentDark }}
      >
        <span style={{ fontSize: 15, lineHeight: 1 }}>＋</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {t("“{metin}” için yeni oluştur — yerini seç", { metin })}
        </span>
      </button>
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

/** "09:00" ve "10:30" -> 90. Gece yarısını geçen aralık burada eksi döner. */
function dakikaFarki(baslangic: string, bitis: string): number {
  const [bs, bd] = baslangic.split(":").map(Number);
  const [es, ed] = bitis.split(":").map(Number);
  return es * 60 + ed - (bs * 60 + bd);
}
