import { useEffect, useRef, useState } from "react";
import type { FileDownloadLink, FileDownloadLinkSendResult } from "@projelio/shared";
import type { ProjectFile } from "@projelio/shared";
import { fileDownloadLinksApi } from "../api/fileDownloadLinks";
import { formatDateTime } from "../lib/dates";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconCopy, IconLink, IconSend, IconTrash } from "./icons";

interface Props {
  /**
   * Paylaşılacak dosyalar. Birden fazlaysa TEK bağlantı üretilir (bkz.
   * migration 121) — alıcı tek adreste hepsini görür, gönderen tek bağlantıyı
   * kapatarak hepsini geri alır.
   */
  files: ProjectFile[];
  onClose: () => void;
}

/**
 * "Bağlantı oluştur": dosyayı Projelio hesabı OLMAYAN birine göndermek.
 *
 * NEDEN AYRI BİR PENCERE ve menüde tek tıkla üretilmiyor: bağlantı üretmek
 * kararın YARISI. Asıl sorular hemen ardından geliyor — indirsin mi yoksa
 * yalnızca baksın mı, adresini sorayım mı, indirince haber alayım mı. Menüde
 * "kopyalandı" deyip geçmek, bu üç kararı da sessizce varsayılana bırakırdı.
 *
 * ADRES SUNUCUDAN GELİYOR (`link.url`), burada kurulmuyor: web adresi ortama
 * göre değişiyor ve ikinci bir kopya, e-postayla gönderilen adresle panodaki
 * adresin ayrışması demekti.
 */
/**
 * İki adımlı: önce NE YAPMAK İSTEDİĞİ, sonra ona göre pencere.
 *
 * NEDEN ADIM SORULUYOR: "bağlantıyı kopyalayıp WhatsApp'tan atacağım" ile
 * "adrese e-posta göndereceğim" farklı işler ve ikisini tek ekranda yan yana
 * koymak her ikisini de yavaşlatıyordu — kopyalamak isteyen kişi altındaki
 * e-posta formunu, göndermek isteyen de üstündeki adres kutusunu es geçmek
 * zorunda kalıyordu. Seçim yapılınca bağlantı KENDİLİĞİNDEN üretiliyor:
 * "bağlantı al" demek zaten "bağlantı üret" demek, ayrıca bir düğmeye daha
 * basmak gereksiz bir adım olurdu.
 */
type Mod = "secim" | "baglanti" | "eposta";

export default function FileDownloadLinkModal({ files, onClose }: Props) {
  const c = useThemeColors();
  const t = useT();
  const paket = files.length > 1;
  const tekDosyaId = paket ? undefined : files[0]?.id;
  const [mod, setMod] = useState<Mod>("secim");
  const [links, setLinks] = useState<FileDownloadLink[]>([]);
  // Pakette önceki bağlantılar aranmıyor: aynı dosya kümesiyle üretilmiş bir
  // bağlantı neredeyse hiç olmaz ve seçimi "birebir aynı küme" diye eşlemek,
  // kullanıcının beklemediği eski bir bağlantıyı önüne çıkarırdı.
  const [loading, setLoading] = useState(!paket);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!tekDosyaId) return;
    fileDownloadLinksApi
      .list(tekDosyaId)
      .then(setLinks)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tekDosyaId]);

  const olustur = async (): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      const link = paket
        ? await fileDownloadLinksApi.createMany(files.map((f) => f.id))
        : await fileDownloadLinksApi.create(files[0].id);
      setLinks((onceki) => [link, ...onceki]);
      return true;
    } catch (e: any) {
      setError(e?.message ?? t("Bağlantı oluşturulamadı"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const degistir = (guncel: FileDownloadLink) =>
    setLinks((onceki) => onceki.map((l) => (l.id === guncel.id ? guncel : l)));

  // Yalnızca BU seçimin bağlantısı sayılır: dosyanın listesinde onu içeren
  // paketler de var, ama "bu dosyayı gönder" diyen kişiye başka dosyaları da
  // açan bir paketi vermek, istemediği dosyaları paylaşmak olurdu.
  const acikVar = links.some((l) => l.active && l.fileIds.length === files.length);

  /** Seçim yapıldı: açık bir bağlantı yoksa hemen üret, sonra ekrana geç. */
  const sec = async (hedef: Mod) => {
    if (!acikVar && !(await olustur())) return;
    setMod(hedef);
  };

  const baslik =
    mod === "eposta"
      ? t("Bağlantıyı e-postayla gönder")
      : mod === "baglanti"
      ? t("İndirme bağlantısı")
      : paket
      ? t("Dosyaları paylaş")
      : t("Dosyayı paylaş");

  const altBaslik = paket
    ? t("{ilk} ve {sayi} dosya daha", { ilk: files[0].name, sayi: files.length - 1 })
    : files[0]?.name;

  return (
    <Modal title={baslik} subtitle={altBaslik} onClose={onClose} maxWidth={520}>
      {error && <div style={{ color: c.danger, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div style={{ color: c.textSecondary, fontSize: 14 }}>{t("Yükleniyor…")}</div>
      ) : mod === "secim" ? (
        <>
          <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.6, color: c.textSecondary }}>
            {paket
              ? t(
                  "{sayi} dosya tek bağlantıda paylaşılır. Bağlantıyı açan kişi Projelio hesabı olmadan hepsini önizleyip indirebilir; bağlantıyı istediğiniz an kaldırabilirsiniz.",
                  { sayi: files.length }
                )
              : t(
                  "Bağlantıyı açan kişi Projelio hesabı olmadan dosyayı önizleyip indirebilir. Bağlantıyı istediğiniz an kaldırabilirsiniz."
                )}
          </p>
          {paket && <DosyaListesi adlar={files.map((f) => f.name)} />}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <SecimKarti
              icon={<IconLink size={18} color={c.accent} />}
              label={t("Bağlantı al")}
              hint={t("Adresi kopyalayın, istediğiniz yere yapıştırın.")}
              disabled={busy}
              onClick={() => void sec("baglanti")}
            />
            <SecimKarti
              icon={<IconSend size={18} color={c.accent} />}
              label={t("E-postayla gönder")}
              hint={t("Bağlantıyı doğrudan alıcının gelen kutusuna yollayın.")}
              disabled={busy}
              onClick={() => void sec("eposta")}
            />
          </div>
          {acikVar && (
            <p style={{ margin: "14px 0 0", fontSize: 12, color: c.textSecondary }}>
              {t("Bu dosya için zaten bir bağlantı var; ikisi de onu kullanır.")}
            </p>
          )}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setMod("secim")}
            style={{
              marginBottom: 12,
              padding: 0,
              border: "none",
              background: "transparent",
              color: c.textSecondary,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            ← {t("Geri")}
          </button>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {links.map((link) => (
              <LinkKarti key={link.id} link={link} onChange={degistir} gonderim={mod === "eposta"} />
            ))}
          </div>

          <button
            type="button"
            onClick={() => void olustur()}
            disabled={busy}
            style={{
              marginTop: 16,
              width: "100%",
              padding: "11px 14px",
              borderRadius: 10,
              border: "none",
              background: "transparent",
              color: c.accent,
              boxShadow: `inset 0 0 0 1px ${c.border}`,
              fontSize: 15,
              fontWeight: 600,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {t("Yeni bağlantı oluştur")}
          </button>
        </>
      )}
    </Modal>
  );
}

/**
 * Pakete girecek dosyalar. Uzun seçimde kaydırılır: pencere, altındaki iki
 * seçeneği ekranın dışına itmesin.
 */
function DosyaListesi({ adlar }: { adlar: string[] }) {
  const c = useThemeColors();
  return (
    <div
      style={{
        maxHeight: 150,
        overflowY: "auto",
        margin: "0 0 16px",
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${c.border}`,
        fontSize: 13,
        lineHeight: 1.7,
        color: c.textPrimary,
      }}
    >
      {adlar.map((ad, i) => (
        <div key={i} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {ad}
        </div>
      ))}
    </div>
  );
}

/** İlk adımdaki iki seçenekten biri. */
function SecimKarti({
  icon,
  label,
  hint,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const c = useThemeColors();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        textAlign: "left",
        padding: "14px 16px",
        borderRadius: 12,
        border: `1px solid ${c.border}`,
        background: c.surface,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          background: `${c.accent}1f`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{label}</span>
        <span style={{ display: "block", fontSize: 12.5, lineHeight: 1.5, color: c.textSecondary }}>{hint}</span>
      </span>
    </button>
  );
}

/**
 * Tek bir bağlantının kartı: adres, ayarlar, kaldırma — ve e-posta kipinde
 * gönderme formu.
 *
 * `gonderim` kapalıyken form HİÇ ÇİZİLMİYOR (gizlenmiyor): "bağlantı al"
 * diyen kişiye e-posta alanı göstermek, seçim sormanın anlamını ortadan
 * kaldırırdı.
 */
function LinkKarti({
  link,
  onChange,
  gonderim,
}: {
  link: FileDownloadLink;
  onChange: (l: FileDownloadLink) => void;
  gonderim: boolean;
}) {
  const c = useThemeColors();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState("");
  const [alici, setAlici] = useState(link.recipientEmail ?? "");
  const [gonderAdres, setGonderAdres] = useState(link.recipientEmail ?? "");
  const [not, setNot] = useState("");
  // Gönderim sonucu ADRES BAŞINA tutuluyor: "3 adrese gönderildi" ile
  // "2 gitti, 1 gitmedi" arasındaki farkı kullanıcı görmeli.
  const [sonuclar, setSonuclar] = useState<FileDownloadLinkSendResult["results"] | null>(null);

  const guncelle = async (input: Parameters<typeof fileDownloadLinksApi.update>[1]) => {
    setBusy(true);
    setHata("");
    try {
      onChange(await fileDownloadLinksApi.update(link.id, input));
    } catch (e: any) {
      setHata(e?.message ?? t("Kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  };

  const kaldir = async () => {
    setBusy(true);
    setHata("");
    try {
      onChange(await fileDownloadLinksApi.revoke(link.id));
    } catch (e: any) {
      setHata(e?.message ?? t("Kaldırılamadı"));
    } finally {
      setBusy(false);
    }
  };

  const epostaylaGonder = async (e: React.FormEvent) => {
    // Form gönderimi: Enter da buraya düşüyor (bkz. Modal'ın Enter kuralı —
    // odağın İÇİNDE olduğu formun olumlu eylemi kazanır). Bu form olmadan
    // Enter, modalin genelindeki "Bağlantı oluştur" düğmesine gidiyordu.
    e.preventDefault();
    if (!gonderAdres.trim()) return;
    setBusy(true);
    setHata("");
    setSonuclar(null);
    try {
      const sonuc = await fileDownloadLinksApi.send(link.id, gonderAdres, not.trim() || undefined);
      onChange(sonuc.link);
      setSonuclar(sonuc.results);
      // Hepsi gittiyse alanlar temizlenir: aynı listeye ikinci kez basılması
      // en kolay hata. Bir tanesi bile düştüyse metin DURUR, kullanıcı
      // düzeltip yeniden gönderebilsin.
      if (sonuc.results.every((r) => r.sent)) {
        setGonderAdres("");
        setNot("");
      }
    } catch (e: any) {
      setHata(e?.message ?? t("Gönderilemedi"));
    } finally {
      setBusy(false);
    }
  };

  // E-postayla gönderme. Gönderen link@ alan adı, yanıt kullanıcının kendi
  // adresi — alıcı "bu dosya ne?" diye yanıtlayabilsin.
  //
  // <form> ŞART: Modal'ın Enter kuralı önce odağın İÇİNDE olduğu forma bakıyor.
  // Form olmadan Enter, modalin genelindeki "Bağlantı oluştur" düğmesine
  // düşüyordu — yani gönderilmek istenen her Enter yeni bir bağlantı üretiyordu.
  const gonderimFormu = (
        <form
          onSubmit={epostaylaGonder}
          style={{ marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${c.border}` }}
        >
          {/* Etiket "Kime": pencerenin başlığı zaten "Bağlantıyı e-postayla
              gönder", aynı cümleyi iki kez yazmak yer kaybı. */}
          <label style={{ display: "block", fontSize: 13, color: c.textSecondary, marginBottom: 5 }}>
            {t("Kime")}
          </label>
          {/* type="email" DEĞİL: tarayıcı çoklu adresi geçersiz sayıp formu
              engelliyor. Ayrıştırma ve doğrulama zaten sunucuda. */}
          <input
            type="text"
            value={gonderAdres}
            disabled={busy}
            onChange={(e) => setGonderAdres(e.target.value)}
            placeholder={t("alici@firma.com, ikinci@firma.com")}
            style={{ width: "100%", fontSize: 13, padding: "7px 9px", marginBottom: 4 }}
          />
          <div style={{ fontSize: 11, color: c.textSecondary, marginBottom: 6 }}>
            {t("Birden fazla adresi virgülle ayırın. Enter gönderir; bir kopyası size de gelir.")}
          </div>
          {/* Çok satırlı alanda Enter yeni satırdır (Modal'ın kuralı); notu
              bitirip göndermek için ⌘/Ctrl+Enter ya da düğme. */}
          <textarea
            value={not}
            disabled={busy}
            onChange={(e) => setNot(e.target.value)}
            placeholder={t("Kısa bir not (isteğe bağlı)")}
            rows={2}
            style={{ width: "100%", fontSize: 13, padding: "7px 9px", resize: "vertical" }}
          />
          <button
            type="submit"
            data-primary
            disabled={busy || !gonderAdres.trim()}
            style={{
              ...ikincilButon(c),
              marginTop: 6,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: busy || !gonderAdres.trim() ? 0.5 : 1,
            }}
          >
            <IconSend size={14} color={c.textSecondary} />
            {busy ? t("Gönderiliyor…") : t("Gönder")}
          </button>

          {sonuclar && <GonderimSonucu sonuclar={sonuclar} />}
        </form>
  );

  const kutu: React.CSSProperties = {
    border: `1px solid ${c.border}`,
    borderRadius: 12,
    padding: 14,
    background: link.active ? c.surface : "transparent",
    opacity: link.active ? 1 : 0.6,
  };

  if (!link.active) {
    return (
      <div style={kutu}>
        <div style={{ fontSize: 13, color: c.textSecondary }}>
          {link.closedReason === "expired" ? t("Süresi doldu") : t("Bağlantı kapatıldı")}
          {" · "}
          {t("{sayi} indirme", { sayi: link.downloadCount })}
          {link.label ? ` · ${link.label}` : ""}
        </div>
      </div>
    );
  }

  return (
    <div style={kutu}>
      {gonderim && gonderimFormu}

      {/* Paket bağlantısı tek dosyanın penceresinde de listeleniyor (kapatılabilsin
          diye); içinde başka neler olduğu burada görünmeli. */}
      {link.fileIds.length > 1 && (
        <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 8, lineHeight: 1.5 }}>
          {t("{sayi} dosyalık bağlantı: {adlar}", { sayi: link.fileIds.length, adlar: link.fileNames.join(", ") })}
        </div>
      )}

      <KopyalaSatiri url={link.url} />

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        <Anahtar
          checked={link.downloadEnabled}
          disabled={busy}
          onChange={(v) => void guncelle({ downloadEnabled: v })}
          label={t("İndirmeye izin ver")}
          hint={t("Kapalıyken bağlantıyı açan kişi dosyayı görebilir ama indiremez.")}
        />
        <Anahtar
          checked={link.notifyOnDownload}
          disabled={busy}
          onChange={(v) => void guncelle({ notifyOnDownload: v })}
          label={t("İndirilince bana haber ver")}
          hint={t("E-posta ve uygulama içi bildirim gönderilir.")}
        />
      </div>

      {/* E-posta kapısı. Kimlik doğrulaması DEĞİL (bkz. migration 077); metin
          de böyle söylüyor ki kullanıcı bunu bir kilit sanmasın. */}
      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontSize: 13, color: c.textSecondary, marginBottom: 5 }}>
          {t("Yalnızca bu adresi bilen açsın (isteğe bağlı)")}
        </label>
        {/* Kendi formu: buradaki Enter, gönderim formunun düğmesine değil bu
            "Kaydet"e gitsin (bkz. Modal'ın Enter kuralı). */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void guncelle({ recipientEmail: alici.trim() || null });
          }}
          style={{ display: "flex", gap: 6 }}
        >
          <input
            type="email"
            value={alici}
            disabled={busy}
            onChange={(e) => setAlici(e.target.value)}
            placeholder={t("ornek@firma.com")}
            style={{ flex: 1, minWidth: 0, fontSize: 13, padding: "7px 9px" }}
          />
          <button
            type="submit"
            data-primary
            disabled={busy || (alici.trim() || null) === (link.recipientEmail ?? null)}
            style={ikincilButon(c)}
          >
            {t("Kaydet")}
          </button>
        </form>
      </div>

      {/* Süre. "Süresiz" varsayılan: çoğu paylaşım tek seferlik ve kullanıcı
          süreyi düşünmek zorunda kalmasın; kalıcı olmasını istemeyen seçer. */}
      <div style={{ marginTop: 14 }}>
        <label style={{ display: "block", fontSize: 13, color: c.textSecondary, marginBottom: 5 }}>
          {t("Geçerlilik")}
        </label>
        <select
          disabled={busy}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") return;
            void guncelle({ expiresInDays: v === "0" ? null : Number(v) });
          }}
          style={{ width: "100%", fontSize: 13, padding: "7px 9px" }}
        >
          <option value="">
            {link.expiresAt
              ? t("{tarih} tarihine kadar — değiştir", { tarih: formatDateTime(link.expiresAt) })
              : t("Süresiz — değiştir")}
          </option>
          <option value="0">{t("Süresiz")}</option>
          <option value="1">{t("1 gün")}</option>
          <option value="7">{t("7 gün")}</option>
          <option value="30">{t("30 gün")}</option>
          <option value="90">{t("90 gün")}</option>
        </select>
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 12,
          borderTop: `1px solid ${c.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <span style={{ fontSize: 12, color: c.textSecondary }}>
          {t("{goruntuleme} görüntüleme · {indirme} indirme", {
            goruntuleme: link.viewCount,
            indirme: link.downloadCount,
          })}
          {link.lastDownloadedAt ? ` · ${t("son indirme {tarih}", { tarih: formatDateTime(link.lastDownloadedAt) })}` : ""}
        </span>
        <button
          type="button"
          onClick={() => void kaldir()}
          disabled={busy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${c.border}`,
            background: "transparent",
            color: c.danger,
            cursor: "pointer",
          }}
        >
          <IconTrash size={13} color={c.danger} />
          {t("Bağlantıyı kapat")}
        </button>
      </div>

      {hata && <div style={{ marginTop: 8, fontSize: 12, color: c.danger }}>{hata}</div>}
    </div>
  );
}

/**
 * Gönderim sonucu — ADRES BAŞINA.
 *
 * Eskiden düğmenin yanında tek satırlık soluk bir yazıydı ve fark edilmiyordu:
 * kullanıcı "gönder"e basıp hiçbir şey olmadığını sanıyordu. Şimdi kendi
 * kutusunda, başarıda yeşil çerçeveyle duruyor ve giden adresleri sayıyor.
 *
 * Başarısızlar AYRI listeleniyor: "3 adrese gönderildi" deyip birinin
 * düştüğünü söylememek, kullanıcının beklemeye devam etmesi demekti.
 */
function GonderimSonucu({ sonuclar }: { sonuclar: FileDownloadLinkSendResult["results"] }) {
  const c = useThemeColors();
  const t = useT();
  const gidenler = sonuclar.filter((r) => r.sent);
  const dusenler = sonuclar.filter((r) => !r.sent);

  return (
    <div
      style={{
        marginTop: 10,
        padding: "9px 11px",
        borderRadius: 9,
        border: `1px solid ${dusenler.length ? c.danger : c.success}`,
        background: `${dusenler.length ? c.danger : c.success}14`,
        fontSize: 12,
        lineHeight: 1.6,
        color: c.textPrimary,
      }}
    >
      {gidenler.length > 0 && (
        <div>
          ✓ {t("{sayi} adrese gönderildi", { sayi: gidenler.length })}
          <span style={{ color: c.textSecondary }}> — {gidenler.map((r) => r.email).join(", ")}</span>
        </div>
      )}
      {dusenler.length > 0 && (
        <div style={{ color: c.danger, marginTop: gidenler.length ? 4 : 0 }}>
          {t("Gönderilemedi: {adresler}", { adresler: dusenler.map((r) => r.email).join(", ") })}
          <div style={{ color: c.textSecondary }}>
            {t("Bağlantıyı kopyalayıp kendiniz iletebilirsiniz.")}
          </div>
        </div>
      )}
    </div>
  );
}

function ikincilButon(c: ReturnType<typeof useThemeColors>): React.CSSProperties {
  return {
    fontSize: 13,
    padding: "7px 12px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
}

function Anahtar({
  checked,
  disabled,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  const c = useThemeColors();
  return (
    <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: disabled ? "wait" : "pointer" }}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2 }}
      />
      <span>
        <span style={{ display: "block", fontSize: 14, color: c.textPrimary }}>{label}</span>
        <span style={{ display: "block", fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>{hint}</span>
      </span>
    </label>
  );
}

/**
 * Adres + kopyala.
 *
 * Adres salt okunur bir input'ta duruyor, düz metinde değil: pano yazma izni
 * olmayan bağlamlarda kullanıcı yine de metni seçip elle kopyalayabilsin
 * (ShareProjectModal'daki CopyRow ile aynı gerekçe).
 */
function KopyalaSatiri({ url }: { url: string }) {
  const c = useThemeColors();
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kopyalandi, setKopyalandi] = useState(false);

  useEffect(() => {
    if (!kopyalandi) return;
    const zaman = setTimeout(() => setKopyalandi(false), 2000);
    return () => clearTimeout(zaman);
  }, [kopyalandi]);

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setKopyalandi(true);
    } catch {
      inputRef.current?.select();
    }
  };

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <input
        ref={inputRef}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "6px 8px" }}
      />
      <button type="button" onClick={() => void kopyala()} style={{ ...ikincilButon(c), display: "flex", alignItems: "center", gap: 5, fontSize: 12, padding: "6px 10px" }}>
        <IconCopy size={14} color={c.textSecondary} />
        {kopyalandi ? t("Kopyalandı") : t("Kopyala")}
      </button>
    </div>
  );
}
