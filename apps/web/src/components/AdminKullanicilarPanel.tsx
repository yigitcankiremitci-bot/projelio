import { useEffect, useMemo, useState } from "react";
import {
  ADMIN_KULLANICI_DURUMLARI,
  ADMIN_KULLANICI_DURUM_ETIKETI,
  ADMIN_MESAJ_SINIRI,
  etkinlikSuresiYaz,
  gunlukEtkinligiDoldur,
  krediHareketiGeriAlinabilirMi,
  type AdminKrediHareketi,
  type AdminKullaniciDetayi,
  type AdminKullaniciDurumu,
  type AdminKullaniciSatiri,
  type ThemeColors,
} from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { adminKullanicilar } from "../api/adminKullanicilar";
import { useT } from "../lib/i18n";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import AdminMesajModal from "./AdminMesajModal";
import { IconUser } from "./icons";

/**
 * Admin paneli > Kullanıcılar: tüm hesapların tek listesi ve hesap başına
 * işlemler (askı, oturum kapatma, rol, kredi, silme).
 *
 * Kurallar sunucuda (modules/admin/admin-kullanicilar.service.ts). Buradaki
 * gizle/göster kararları yalnızca kolaylık: sunucu yine de reddeder.
 *
 * Arama ve süzme istemcide yapılıyor: liste tek seferde geliyor (tavan 2000)
 * ve yönetici yazarken her tuşta istek atmak gereksiz.
 */

const TR_TARIH: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
const TR_TARIH_SAAT: Intl.DateTimeFormatOptions = { ...TR_TARIH, hour: "2-digit", minute: "2-digit" };

/** TIMESTAMP sütunları "Z" olmadan geliyor; yerel saat sanılmasın (bkz. oturum-engeli.ts utcMs). */
function tarih(deger: string | undefined, saatli = false): string {
  if (!deger) return "—";
  const d = new Date(/(Z|[+-]\d{2}:?\d{2})$/.test(deger) ? deger : `${deger}Z`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", saatli ? TR_TARIH_SAAT : TR_TARIH);
}

function sayi(n: number): string {
  return n.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

function durumRengi(c: ThemeColors, durum: AdminKullaniciDurumu): string {
  switch (durum) {
    case "aktif":
      return c.success;
    case "dogrulanmamis":
      return c.warning;
    case "askida":
    case "silinecek":
      return c.danger;
    case "silindi":
      return c.textSecondary;
  }
}

/**
 * Sıralanabilir sütunlar. Her biri bir değer çıkarıcıyla tanımlı; değeri
 * olmayan satırlar (hiç görülmemiş kullanıcının "son görülme"si) yön ne olursa
 * olsun EN ALTA gider — yoksa "en çok kullanan" sıralamasında liste boş
 * satırlarla başlardı.
 */
type SiraAnahtari =
  | "ad"
  | "durum"
  | "rol"
  | "sonGorulme"
  | "son7"
  | "son30"
  | "aktifGun"
  | "toplam"
  | "kredi"
  | "abonelik"
  | "kayit";

type Yon = "artan" | "azalan";

const SIRA_DEGERI: Record<SiraAnahtari, (u: AdminKullaniciSatiri) => string | number | undefined> = {
  ad: (u) => u.fullName?.toLocaleLowerCase("tr-TR"),
  durum: (u) => ADMIN_KULLANICI_DURUMLARI.indexOf(u.durum),
  rol: (u) => u.role,
  sonGorulme: (u) => u.etkinlik?.sonGorulme,
  son7: (u) => u.etkinlik?.son7GunSaniye || undefined,
  son30: (u) => u.etkinlik?.son30GunSaniye || undefined,
  aktifGun: (u) => u.etkinlik?.son30GundeAktifGun || undefined,
  toplam: (u) => u.etkinlik?.toplamSaniye || undefined,
  kredi: (u) => u.kredi.balance,
  abonelik: (u) => u.abonelik?.planKey,
  kayit: (u) => u.createdAt,
};

/** Metin sütunlarında ilk tık A→Z; sayı ve tarihlerde en büyük/en yeni üstte. */
const METIN_SUTUNLARI: SiraAnahtari[] = ["ad", "rol", "abonelik", "durum"];

function sirala(liste: AdminKullaniciSatiri[], anahtar: SiraAnahtari, yon: Yon): AdminKullaniciSatiri[] {
  const deger = SIRA_DEGERI[anahtar];
  const carpan = yon === "artan" ? 1 : -1;
  return [...liste].sort((a, b) => {
    const x = deger(a);
    const y = deger(b);
    if (x === undefined && y === undefined) return 0;
    if (x === undefined) return 1;
    if (y === undefined) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * carpan;
    return String(x).localeCompare(String(y), "tr") * carpan;
  });
}

const ROL_ETIKETI: Record<string, string> = {
  admin: "Yönetici", // dil:anahtar
  freelancer: "Kullanıcı", // dil:anahtar
  demo: "Demo", // dil:anahtar
};

/**
 * @param yenile Değiştikçe liste yeniden okunur — kredi siparişi onaylanınca
 *               (AiCreditOrdersAdmin) bakiyeler burada da tazelensin diye.
 */
export default function AdminKullanicilarPanel({ yenile = 0 }: { yenile?: number }) {
  const c = useThemeColors();
  const t = useT();
  const [kullanicilar, setKullanicilar] = useState<AdminKullaniciSatiri[] | null>(null);
  const [migrationEksik, setMigrationEksik] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [arama, setArama] = useState("");
  const [durumSuzgeci, setDurumSuzgeci] = useState<AdminKullaniciDurumu | "hepsi">("hepsi");
  const [rolSuzgeci, setRolSuzgeci] = useState<"hepsi" | "admin" | "freelancer" | "demo">("hepsi");
  const [sira, setSira] = useState<{ anahtar: SiraAnahtari; yon: Yon }>({ anahtar: "sonGorulme", yon: "azalan" });
  const [seciliId, setSeciliId] = useState<string | null>(null);
  // Toplu mesaj için işaretlenenler. Süzgeç değişince seçim KORUNUR: yönetici
  // önce "Askıda"yı sonra "Doğrulanmamış"ı süzüp ikisinden kişi toplayabilmeli.
  const [secilenler, setSecilenler] = useState<Set<string>>(new Set());
  const [mesajAlicilari, setMesajAlicilari] = useState<AdminKullaniciSatiri[] | null>(null);

  const yukle = () => {
    adminKullanicilar
      .liste()
      .then((r) => {
        setKullanicilar(r.kullanicilar);
        setMigrationEksik(r.migrationEksik);
        setHata(null);
      })
      .catch((err: any) => setHata(err?.message ?? t("Kullanıcı listesi yüklenemedi.")));
  };

  useEffect(yukle, [yenile]);

  const durumSayilari = useMemo(() => {
    const sayilar: Record<string, number> = { hepsi: 0 };
    for (const u of kullanicilar ?? []) {
      if (rolSuzgeci !== "hepsi" && u.role !== rolSuzgeci) continue;
      sayilar.hepsi++;
      sayilar[u.durum] = (sayilar[u.durum] ?? 0) + 1;
    }
    return sayilar;
  }, [kullanicilar, rolSuzgeci]);

  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr-TR");
    const liste = (kullanicilar ?? []).filter((u) => {
      if (durumSuzgeci !== "hepsi" && u.durum !== durumSuzgeci) return false;
      if (rolSuzgeci !== "hepsi" && u.role !== rolSuzgeci) return false;
      if (!q) return true;
      return (
        u.fullName?.toLocaleLowerCase("tr-TR").includes(q) ||
        u.email?.toLocaleLowerCase("tr-TR").includes(q) ||
        u.username?.toLocaleLowerCase("tr-TR").includes(q) ||
        u.id === q
      );
    });
    return sirala(liste, sira.anahtar, sira.yon);
  }, [kullanicilar, arama, durumSuzgeci, rolSuzgeci, sira]);

  const gorunenHepsiSecili = gorunen.length > 0 && gorunen.every((u) => secilenler.has(u.id));
  const secimiDegistir = (id: string) =>
    setSecilenler((onceki) => {
      const yeni = new Set(onceki);
      if (yeni.has(id)) yeni.delete(id);
      else yeni.add(id);
      return yeni;
    });
  const gorunenleriSec = () =>
    setSecilenler((onceki) => {
      const yeni = new Set(onceki);
      if (gorunenHepsiSecili) gorunen.forEach((u) => yeni.delete(u.id));
      else gorunen.forEach((u) => yeni.add(u.id));
      return yeni;
    });
  const secilenSatirlar = (kullanicilar ?? []).filter((u) => secilenler.has(u.id));

  const siraDegistir = (anahtar: SiraAnahtari) =>
    setSira((onceki) =>
      onceki.anahtar === anahtar
        ? { anahtar, yon: onceki.yon === "artan" ? "azalan" : "artan" }
        : { anahtar, yon: METIN_SUTUNLARI.includes(anahtar) ? "artan" : "azalan" }
    );

  const baslik = (anahtar: SiraAnahtari, etiket: string, hiza: "left" | "right" = "left") => (
    <SiraliBaslik c={c} etiket={etiket} hiza={hiza} aktif={sira.anahtar === anahtar} yon={sira.yon} onClick={() => siraDegistir(anahtar)} />
  );

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <IconUser size={18} color={c.accent} />
        <h2 style={{ color: c.textPrimary, fontSize: 18, fontWeight: 600, margin: 0 }}>{t("Kullanıcılar")}</h2>
        {kullanicilar && (
          <span style={{ color: c.textSecondary, fontSize: 14 }}>
            {t("{sayi} hesap", { sayi: sayi(kullanicilar.length) })}
          </span>
        )}
      </div>
      <p style={{ color: c.textSecondary, fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }}>
        {t("Bir kullanıcıya tıklayarak kredi yükleyip geri alabilir, askıya alabilir, oturumlarını kapatabilir ya da hesabını silebilirsin. Sütun başlıklarına tıklayarak sıralayabilirsin.")}
      </p>

      {migrationEksik && (
        <Uyari c={c}>
          {t("Veritabanı güncellemesi (migration 108) henüz uygulanmamış: askıya alma, oturum kapatma, kredi geri alma ve işlem kaydı çalışmaz.")}
        </Uyari>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {(["hepsi", ...ADMIN_KULLANICI_DURUMLARI] as const).map((d) => {
          const secili = durumSuzgeci === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDurumSuzgeci(d)}
              style={{
                padding: "5px 11px",
                borderRadius: 999,
                border: `1px solid ${secili ? c.accent : c.border}`,
                background: secili ? c.accent : c.surface,
                color: secili ? c.onPrimary : c.textPrimary,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {d === "hepsi" ? t("Tümü") : t(ADMIN_KULLANICI_DURUM_ETIKETI[d])} · {durumSayilari[d] ?? 0}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder={t("Ad, e-posta ya da kullanıcı adıyla ara")}
          style={{ ...inputStyle(c), flex: "1 1 240px" }}
        />
        <select
          value={rolSuzgeci}
          onChange={(e) => setRolSuzgeci(e.target.value as typeof rolSuzgeci)}
          style={{ ...inputStyle(c), flex: "0 0 170px" }}
          aria-label={t("Rol")}
        >
          <option value="hepsi">{t("Tüm roller")}</option>
          <option value="freelancer">{t(ROL_ETIKETI.freelancer)}</option>
          <option value="admin">{t(ROL_ETIKETI.admin)}</option>
          <option value="demo">{t(ROL_ETIKETI.demo)}</option>
        </select>
        <button type="button" onClick={yukle} style={ikincilButon(c)}>
          {t("Yenile")}
        </button>
      </div>

      {secilenler.size > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            marginBottom: 10,
            borderRadius: 10,
            border: `1px solid ${c.accent}`,
            background: c.surface,
          }}
        >
          <span style={{ fontSize: 14, color: c.textPrimary }}>{t("{n} kişi seçildi", { n: secilenler.size })}</span>
          <button
            type="button"
            style={birincilButon(c)}
            disabled={secilenler.size > ADMIN_MESAJ_SINIRI.alici}
            onClick={() => setMesajAlicilari(secilenSatirlar)}
          >
            {t("Mesaj gönder")}
          </button>
          <button type="button" style={ikincilButon(c)} onClick={() => setSecilenler(new Set())}>
            {t("Seçimi temizle")}
          </button>
          {secilenler.size > ADMIN_MESAJ_SINIRI.alici && (
            <span style={{ fontSize: 13, color: c.danger }}>
              {t("Tek seferde en fazla {n} kişiye gönderilebilir.", { n: ADMIN_MESAJ_SINIRI.alici })}
            </span>
          )}
        </div>
      )}

      {hata && <p style={{ color: c.danger, fontSize: 14 }}>{hata}</p>}
      {!kullanicilar && !hata && <p style={{ color: c.textSecondary, fontSize: 14 }}>{t("Yükleniyor…")}</p>}

      {kullanicilar && (
        <div style={{ overflowX: "auto", border: `1px solid ${c.border}`, borderRadius: 12, background: c.surface }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                <th style={{ ...thStyle(c), width: 28, paddingRight: 0 }}>
                  <input
                    type="checkbox"
                    checked={gorunenHepsiSecili}
                    onChange={gorunenleriSec}
                    aria-label={t("Listelenenlerin hepsini seç")}
                  />
                </th>
                {baslik("ad", t("Kullanıcı"))}
                {baslik("durum", t("Durum"))}
                {baslik("rol", t("Rol"))}
                {baslik("sonGorulme", t("Son görülme"))}
                {baslik("son7", t("Son 7 gün"), "right")}
                {baslik("son30", t("Son 30 gün"), "right")}
                {baslik("aktifGun", t("Aktif gün"), "right")}
                {baslik("toplam", t("Toplam süre"), "right")}
                {baslik("kredi", t("Kredi"), "right")}
                {baslik("abonelik", t("Abonelik"))}
                {baslik("kayit", t("Kayıt"))}
              </tr>
            </thead>
            <tbody>
              {gorunen.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSeciliId(u.id)}
                  style={{ borderBottom: `1px solid ${c.border}`, cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = c.background)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Kutuya tıklamak satırı (detayı) açmasın. */}
                  <td style={{ ...tdStyle(c), paddingRight: 0 }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={secilenler.has(u.id)}
                      onChange={() => secimiDegistir(u.id)}
                      aria-label={t("{ad} seç", { ad: u.fullName })}
                    />
                  </td>
                  <td style={tdStyle(c)}>
                    <div style={{ fontWeight: 500 }}>{u.fullName}</div>
                    <div style={{ color: c.textSecondary, fontSize: 12.5 }}>{u.email}</div>
                  </td>
                  <td style={tdStyle(c)}>
                    <DurumRozeti c={c} durum={u.durum} />
                  </td>
                  <td style={{ ...tdStyle(c), color: u.role === "demo" ? c.textSecondary : c.textPrimary }}>{t(ROL_ETIKETI[u.role] ?? u.role)}</td>
                  <td style={{ ...tdStyle(c), color: c.textSecondary, whiteSpace: "nowrap" }}>{goreliZaman(u.etkinlik?.sonGorulme, t)}</td>
                  <td style={sayiHucresi(c)}>{etkinlikSuresiYaz(u.etkinlik?.son7GunSaniye)}</td>
                  <td style={sayiHucresi(c)}>{etkinlikSuresiYaz(u.etkinlik?.son30GunSaniye)}</td>
                  <td style={sayiHucresi(c)}>{u.etkinlik?.son30GundeAktifGun || "—"}</td>
                  <td style={sayiHucresi(c)}>{etkinlikSuresiYaz(u.etkinlik?.toplamSaniye)}</td>
                  <td style={{ ...sayiHucresi(c), color: u.kredi.balance < 0 ? c.danger : c.textPrimary }}>{sayi(u.kredi.balance)}</td>
                  <td style={{ ...tdStyle(c), color: c.textSecondary }}>{u.abonelik ? `${u.abonelik.planKey} · ${u.abonelik.status}` : "—"}</td>
                  <td style={{ ...tdStyle(c), color: c.textSecondary, whiteSpace: "nowrap" }}>{tarih(u.createdAt)}</td>
                </tr>
              ))}
              {gorunen.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ ...tdStyle(c), color: c.textSecondary, textAlign: "center", padding: 24 }}>
                    {t("Eşleşen kullanıcı yok.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {seciliId && (
        <KullaniciDetayModal
          userId={seciliId}
          onClose={() => setSeciliId(null)}
          onDegisti={yukle}
        />
      )}

      {mesajAlicilari && (
        <AdminMesajModal
          alicilar={mesajAlicilari}
          onClose={() => setMesajAlicilari(null)}
          onGonderildi={() => setSecilenler(new Set())}
        />
      )}
    </section>
  );
}

function SiraliBaslik({
  c,
  etiket,
  hiza,
  aktif,
  yon,
  onClick,
}: {
  c: ThemeColors;
  etiket: string;
  hiza: "left" | "right";
  aktif: boolean;
  yon: Yon;
  onClick: () => void;
}) {
  return (
    <th style={thStyle(c, hiza)} aria-sort={aktif ? (yon === "artan" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={onClick}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          flexDirection: hiza === "right" ? "row-reverse" : "row",
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          color: aktif ? c.textPrimary : c.textSecondary,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {etiket}
        <span aria-hidden style={{ fontSize: 11, color: aktif ? c.accent : c.border, width: 9, textAlign: "center" }}>
          {aktif ? (yon === "artan" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

/** "3 dk önce", "2 sa önce", "dün", yoksa tarih. Listede kesin saatten çok tazelik önemli. */
function goreliZaman(deger: string | undefined, t: ReturnType<typeof useT>): string {
  if (!deger) return "—";
  const ms = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(deger) ? deger : `${deger}Z`);
  if (Number.isNaN(ms)) return "—";
  const fark = Date.now() - ms;
  const dakika = Math.floor(fark / 60_000);
  if (dakika < 2) return t("şimdi");
  if (dakika < 60) return t("{n} dk önce", { n: dakika });
  const saat = Math.floor(dakika / 60);
  if (saat < 24) return t("{n} sa önce", { n: saat });
  const gun = Math.floor(saat / 24);
  if (gun === 1) return t("dün");
  if (gun < 30) return t("{n} gün önce", { n: gun });
  return tarih(deger);
}

function sayiHucresi(c: ThemeColors): React.CSSProperties {
  return { ...tdStyle(c), textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
}

// ================================================================ Detay

type Onay =
  | { tur: "askiya_al" }
  | { tur: "oturumlari_kapat" }
  | { tur: "rol"; rol: "admin" | "freelancer" }
  | { tur: "silme_planla" }
  | { tur: "hemen_sil" }
  | { tur: "kredi_dus"; miktar: number }
  | { tur: "geri_al"; hareket: AdminKrediHareketi };

function KullaniciDetayModal({ userId, onClose, onDegisti }: { userId: string; onClose: () => void; onDegisti: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [detay, setDetay] = useState<AdminKullaniciDetayi | null>(null);
  const [mesajAc, setMesajAc] = useState(false);
  const [yuklemeHatasi, setYuklemeHatasi] = useState<string | null>(null);
  const [geriBildirim, setGeriBildirim] = useState<{ ok: boolean; text: string } | null>(null);
  const [calisiyor, setCalisiyor] = useState(false);
  const [onay, setOnay] = useState<Onay | null>(null);
  const [miktar, setMiktar] = useState("");
  const [aciklama, setAciklama] = useState("");
  const [sebep, setSebep] = useState("");
  const [onayEposta, setOnayEposta] = useState("");

  const yukle = (signal?: AbortSignal) =>
    adminKullanicilar
      .detay(userId, signal)
      .then((d) => {
        setDetay(d);
        setYuklemeHatasi(null);
      })
      .catch((err: any) => {
        if (err?.name === "AbortError") return;
        setYuklemeHatasi(err?.message ?? t("Kullanıcı yüklenemedi."));
      });

  useEffect(() => {
    const ac = new AbortController();
    yukle(ac.signal);
    return () => ac.abort();
  }, [userId]);

  /** Her işlem aynı yoldan: çalıştır, sunucunun mesajını göster, detayı ve listeyi tazele. */
  const calistir = async (is: () => Promise<unknown>, basari: string) => {
    setCalisiyor(true);
    setGeriBildirim(null);
    try {
      await is();
      setGeriBildirim({ ok: true, text: basari });
      await yukle();
      onDegisti();
    } catch (err: any) {
      setGeriBildirim({ ok: false, text: err?.message ?? t("İşlem gerçekleştirilemedi. Tekrar dene.") });
    } finally {
      setCalisiyor(false);
    }
  };

  const u = detay?.kullanici;
  const miktarSayi = Number(miktar.replace(",", "."));
  const miktarGecerli = Number.isFinite(miktarSayi) && miktarSayi > 0;
  const kilitli = calisiyor || !detay || u?.anonimlestirildi;

  return (
    <Modal title={u?.fullName ?? t("Kullanıcı")} subtitle={u?.email} onClose={onClose} maxWidth={760} mobileFullScreen>
      {yuklemeHatasi && <p style={{ color: c.danger, fontSize: 14 }}>{yuklemeHatasi}</p>}
      {!detay && !yuklemeHatasi && <p style={{ color: c.textSecondary, fontSize: 14 }}>{t("Yükleniyor…")}</p>}

      {detay && u && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {detay.migrationEksik && (
            <Uyari c={c}>{t("Migration 108 uygulanmadığı için askı, oturum kapatma ve kredi geri alma kapalı.")}</Uyari>
          )}

          {geriBildirim && (
            <div
              role="status"
              style={{
                padding: "9px 12px",
                borderRadius: 9,
                fontSize: 14,
                border: `1px solid ${geriBildirim.ok ? c.success : c.danger}`,
                color: geriBildirim.ok ? c.success : c.danger,
              }}
            >
              {geriBildirim.text}
            </div>
          )}

          {/* ---------------------------------------------------- Künye */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <Bilgi c={c} etiket={t("Durum")}>
              <DurumRozeti c={c} durum={u.durum} />
            </Bilgi>
            <Bilgi c={c} etiket={t("Rol")}>{t(ROL_ETIKETI[u.role] ?? u.role)}</Bilgi>
            <Bilgi c={c} etiket={t("Kullanıcı adı")}>@{u.username}</Bilgi>
            <Bilgi c={c} etiket={t("Giriş yöntemi")}>{u.sifreliGiris ? t("Şifre") : t("Google / Microsoft")}</Bilgi>
            <Bilgi c={c} etiket={t("Kayıt")}>{tarih(u.createdAt, true)}</Bilgi>
            <Bilgi c={c} etiket={t("E-posta doğrulandı")}>{tarih(u.emailVerifiedAt, true)}</Bilgi>
            <Bilgi c={c} etiket={t("Son Lio kullanımı")}>{tarih(detay.sonAiKullanimi, true)}</Bilgi>
            <Bilgi c={c} etiket={t("Abonelik")}>{u.abonelik ? `${u.abonelik.planKey} · ${u.abonelik.period} · ${u.abonelik.status}` : "—"}</Bilgi>
          </div>

          {u.bannedAt && (
            <Uyari c={c}>
              {t("{tarih} tarihinde askıya alındı.", { tarih: tarih(u.bannedAt, true) })}
              {u.banReason ? ` ${t("Sebep: {sebep}", { sebep: u.banReason })}` : ""}
            </Uyari>
          )}
          {u.deletedAt && !u.anonimlestirildi && (
            <Uyari c={c}>
              {t("{tarih} tarihinde silme talebi alındı; 30 gün dolunca kalıcı olarak silinecek. Kişi bu sürede giriş yaparsa talep iptal olur.", {
                tarih: tarih(u.deletedAt, true),
              })}
            </Uyari>
          )}
          {u.anonimlestirildi && <Uyari c={c}>{t("Bu hesap kalıcı olarak silinmiş; üzerinde işlem yapılamaz.")}</Uyari>}

          {/* ---------------------------------------------------- Etkinlik */}
          <Bolum c={c} baslik={t("Uygulama kullanımı")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 12 }}>
              <Metrik c={c} etiket={t("Son görülme")} deger={goreliZaman(u.etkinlik?.sonGorulme, t)} />
              <Metrik c={c} etiket={t("Son 7 gün")} deger={etkinlikSuresiYaz(u.etkinlik?.son7GunSaniye)} />
              <Metrik c={c} etiket={t("Son 30 gün")} deger={etkinlikSuresiYaz(u.etkinlik?.son30GunSaniye)} />
              <Metrik c={c} etiket={t("Aktif gün (30)")} deger={String(u.etkinlik?.son30GundeAktifGun ?? 0)} />
              <Metrik c={c} etiket={t("Toplam süre")} deger={etkinlikSuresiYaz(u.etkinlik?.toplamSaniye)} />
            </div>
            <GunlukCubuklar c={c} gunler={detay.gunlukEtkinlik} />
            {!u.etkinlik && (
              <p style={{ color: c.textSecondary, fontSize: 13, margin: "8px 0 0" }}>
                {t("Süre ölçümü bu kullanıcı için henüz başlamadı: uygulamayı ölçüm eklendikten sonra açmadı.")}
              </p>
            )}
          </Bolum>

          {/* ---------------------------------------------------- Hesap */}
          <Bolum c={c} baslik={t("Hesap")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {u.bannedAt ? (
                <button
                  type="button"
                  disabled={kilitli}
                  style={ikincilButon(c)}
                  onClick={() => calistir(() => adminKullanicilar.askiyiKaldir(u.id), t("Askı kaldırıldı."))}
                >
                  {t("Askıyı kaldır")}
                </button>
              ) : (
                <button type="button" disabled={kilitli} style={tehlikeButon(c)} onClick={() => setOnay({ tur: "askiya_al" })}>
                  {t("Askıya al")}
                </button>
              )}
              <button type="button" disabled={kilitli} style={ikincilButon(c)} onClick={() => setMesajAc(true)}>
                {t("Mesaj gönder")}
              </button>
              <button type="button" disabled={kilitli} style={ikincilButon(c)} onClick={() => setOnay({ tur: "oturumlari_kapat" })}>
                {t("Tüm oturumları kapat")}
              </button>
              <button
                type="button"
                disabled={kilitli}
                style={ikincilButon(c)}
                onClick={() => setOnay({ tur: "rol", rol: u.role === "admin" ? "freelancer" : "admin" })}
              >
                {u.role === "admin" ? t("Yöneticiliği kaldır") : t("Yönetici yap")}
              </button>
              {!u.emailVerifiedAt && (
                <button
                  type="button"
                  disabled={kilitli}
                  style={ikincilButon(c)}
                  onClick={() => calistir(() => adminKullanicilar.epostayiDogrula(u.id), t("E-posta doğrulanmış sayıldı."))}
                >
                  {t("E-postayı doğrulanmış say")}
                </button>
              )}
            </div>
          </Bolum>

          {/* ---------------------------------------------------- Kredi */}
          <Bolum c={c} baslik={t("Lio kredisi")}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 12 }}>
              <Metrik c={c} etiket={t("Bakiye")} deger={sayi(u.kredi.balance)} renk={u.kredi.balance < 0 ? c.danger : undefined} />
              <Metrik c={c} etiket={t("Toplam yüklenen")} deger={sayi(u.kredi.lifetimePurchased)} />
              <Metrik c={c} etiket={t("Toplam harcanan")} deger={sayi(u.kredi.lifetimeSpent)} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <input
                value={miktar}
                onChange={(e) => setMiktar(e.target.value)}
                inputMode="decimal"
                placeholder={t("Miktar")}
                style={{ ...inputStyle(c), flex: "0 0 120px" }}
              />
              <input
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                placeholder={t("Açıklama (isteğe bağlı)")}
                style={{ ...inputStyle(c), flex: "1 1 200px" }}
              />
              <button
                type="button"
                disabled={kilitli || !miktarGecerli}
                style={birincilButon(c)}
                onClick={() =>
                  calistir(async () => {
                    await adminKullanicilar.krediYukle(u.id, miktarSayi, aciklama.trim() || undefined);
                    setMiktar("");
                    setAciklama("");
                  }, t("{miktar} kredi yüklendi.", { miktar: sayi(miktarSayi) }))
                }
              >
                {t("Yükle")}
              </button>
              <button
                type="button"
                disabled={kilitli || !miktarGecerli}
                style={ikincilButon(c)}
                onClick={() => setOnay({ tur: "kredi_dus", miktar: miktarSayi })}
              >
                {t("Düş")}
              </button>
            </div>

            <div style={{ overflowX: "auto", marginTop: 14, maxHeight: 320, overflowY: "auto", border: `1px solid ${c.border}`, borderRadius: 10 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead style={{ position: "sticky", top: 0, background: c.surface }}>
                  <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                    <th style={thStyle(c)}>{t("Tarih")}</th>
                    <th style={thStyle(c)}>{t("Tür")}</th>
                    <th style={thStyle(c, "right")}>{t("Kredi")}</th>
                    <th style={thStyle(c, "right")}>{t("Bakiye")}</th>
                    <th style={thStyle(c)}>{t("Açıklama")}</th>
                    <th style={thStyle(c)} />
                  </tr>
                </thead>
                <tbody>
                  {detay.krediHareketleri.map((h) => (
                    <tr key={h.id} style={{ borderBottom: `1px solid ${c.border}`, opacity: h.geriAlindi && h.credits > 0 && !detay.migrationEksik ? 0.55 : 1 }}>
                      <td style={{ ...tdStyle(c), whiteSpace: "nowrap", color: c.textSecondary }}>{tarih(h.createdAt, true)}</td>
                      <td style={tdStyle(c)}>{t(HAREKET_ETIKETI[h.type] ?? h.type)}</td>
                      <td style={{ ...tdStyle(c), textAlign: "right", fontVariantNumeric: "tabular-nums", color: h.credits < 0 ? c.danger : c.success }}>
                        {h.credits > 0 ? "+" : ""}
                        {sayi(h.credits)}
                      </td>
                      <td style={{ ...tdStyle(c), textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{sayi(h.balanceAfter)}</td>
                      <td style={{ ...tdStyle(c), color: c.textSecondary }}>
                        {h.description ?? h.model ?? ""}
                        {h.reversesTransactionId ? ` · ${t("geri alma")}` : ""}
                        {h.geriAlindi && h.credits > 0 && !detay.migrationEksik ? ` · ${t("geri alındı")}` : ""}
                      </td>
                      <td style={{ ...tdStyle(c), textAlign: "right" }}>
                        {krediHareketiGeriAlinabilirMi(h) && (
                          <button
                            type="button"
                            disabled={kilitli}
                            style={{ ...ikincilButon(c), padding: "3px 9px", fontSize: 12.5 }}
                            onClick={() => setOnay({ tur: "geri_al", hareket: h })}
                          >
                            {t("Geri al")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {detay.krediHareketleri.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle(c), color: c.textSecondary, textAlign: "center", padding: 16 }}>
                        {t("Henüz kredi hareketi yok.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Bolum>

          {/* ---------------------------------------------------- Silme */}
          {!u.anonimlestirildi && (
            <Bolum c={c} baslik={t("Hesabı silme")}>
              <p style={{ color: c.textSecondary, fontSize: 14, margin: "0 0 10px", lineHeight: 1.5 }}>
                {t("Sahip olduğu: {is} iş, {org} organizasyon, {grup} grup.", {
                  is: detay.sayilar.sahipOlunanIs,
                  org: detay.sayilar.sahipOlunanOrganizasyon,
                  grup: detay.sayilar.sahipOlunanGrup,
                })}
              </p>
              {detay.silmeOnizleme?.blocker && <Uyari c={c}>{detay.silmeOnizleme.blocker}</Uyari>}
              {!!detay.silmeOnizleme?.silinecekIsler.length && (
                <p style={{ color: c.textSecondary, fontSize: 13.5, margin: "0 0 6px" }}>
                  {t("Hesapla birlikte silinecek: {liste}", { liste: detay.silmeOnizleme.silinecekIsler.join(", ") })}
                </p>
              )}
              {!!detay.silmeOnizleme?.korunacakIsler.length && (
                <p style={{ color: c.textSecondary, fontSize: 13.5, margin: "0 0 6px" }}>
                  {t("Ekibi olduğu için korunacak: {liste}", { liste: detay.silmeOnizleme.korunacakIsler.join(", ") })}
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {u.deletedAt ? (
                  <button
                    type="button"
                    disabled={kilitli}
                    style={ikincilButon(c)}
                    onClick={() => calistir(() => adminKullanicilar.silmeyiIptalEt(u.id), t("Silme talebi iptal edildi."))}
                  >
                    {t("Silmeyi iptal et")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={kilitli || !!detay.silmeOnizleme?.blocker}
                    style={ikincilButon(c)}
                    onClick={() => setOnay({ tur: "silme_planla" })}
                  >
                    {t("30 gün sonra sil")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={kilitli || !!detay.silmeOnizleme?.blocker}
                  style={tehlikeButon(c)}
                  onClick={() => {
                    setOnayEposta("");
                    setOnay({ tur: "hemen_sil" });
                  }}
                >
                  {t("Şimdi kalıcı olarak sil")}
                </button>
              </div>
            </Bolum>
          )}

          {/* ---------------------------------------------------- Kayıt */}
          <Bolum c={c} baslik={t("Yönetici işlem kaydı")}>
            {detay.islemler.length === 0 ? (
              <p style={{ color: c.textSecondary, fontSize: 14, margin: 0 }}>{t("Bu hesapta henüz yönetici işlemi yapılmadı.")}</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {detay.islemler.map((i) => (
                  <li key={i.id} style={{ fontSize: 13.5, color: c.textPrimary }}>
                    <span style={{ color: c.textSecondary }}>{tarih(i.createdAt, true)}</span> · {t(ISLEM_ETIKETI[i.action] ?? i.action)}
                    {i.adminName ? <span style={{ color: c.textSecondary }}> · {i.adminName}</span> : null}
                    {islemDetayi(i.detail) ? <span style={{ color: c.textSecondary }}> · {islemDetayi(i.detail)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Bolum>
        </div>
      )}

      {/* ---------------------------------------------------- Onaylar */}
      {onay && u && (
        <ConfirmDialog
          {...onayMetni(onay, u, t)}
          extra={
            onay.tur === "askiya_al" ? (
              <input
                autoFocus
                value={sebep}
                onChange={(e) => setSebep(e.target.value)}
                placeholder={t("Sebep (isteğe bağlı, yalnızca yöneticiler görür)")}
                style={inputStyle(c)}
              />
            ) : onay.tur === "hemen_sil" ? (
              <div>
                <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 6px" }}>
                  {t("Onaylamak için e-posta adresini yaz: {eposta}", { eposta: u.email })}
                </p>
                <input autoFocus value={onayEposta} onChange={(e) => setOnayEposta(e.target.value)} style={inputStyle(c)} />
              </div>
            ) : undefined
          }
          onCancel={() => setOnay(null)}
          onConfirm={async () => {
            const o = onay;
            setOnay(null);
            switch (o.tur) {
              case "askiya_al":
                await calistir(() => adminKullanicilar.askiyaAl(u.id, sebep.trim() || undefined), t("Hesap askıya alındı."));
                setSebep("");
                break;
              case "oturumlari_kapat":
                await calistir(() => adminKullanicilar.oturumlariKapat(u.id), t("Tüm oturumlar kapatıldı."));
                break;
              case "rol":
                await calistir(() => adminKullanicilar.rolDegistir(u.id, o.rol), t("Rol güncellendi."));
                break;
              case "kredi_dus":
                await calistir(async () => {
                  await adminKullanicilar.krediDus(u.id, o.miktar, aciklama.trim() || undefined);
                  setMiktar("");
                  setAciklama("");
                }, t("{miktar} kredi düşüldü.", { miktar: sayi(o.miktar) }));
                break;
              case "geri_al":
                await calistir(() => adminKullanicilar.krediGeriAl(u.id, o.hareket.id), t("Yükleme geri alındı."));
                break;
              case "silme_planla":
                await calistir(() => adminKullanicilar.silmePlanla(u.id), t("Hesap 30 gün sonra silinecek."));
                break;
              case "hemen_sil":
                await calistir(() => adminKullanicilar.hemenSil(u.id, onayEposta), t("Hesap kalıcı olarak silindi."));
                break;
            }
          }}
        />
      )}
      {mesajAc && u && (
        <AdminMesajModal alicilar={[u]} onClose={() => setMesajAc(false)} onGonderildi={() => void yukle()} />
      )}
    </Modal>
  );
}

function onayMetni(
  onay: Onay,
  u: AdminKullaniciSatiri,
  t: ReturnType<typeof useT>
): { title: string; message: string; confirmLabel: string; danger: boolean } {
  switch (onay.tur) {
    case "askiya_al":
      return {
        title: t("Hesabı askıya al"),
        message: t("{ad} hemen tüm cihazlardan çıkarılır ve askı kaldırılana kadar giriş yapamaz. Verisi silinmez.", { ad: u.fullName }),
        confirmLabel: t("Askıya al"),
        danger: true,
      };
    case "oturumlari_kapat":
      return {
        title: t("Tüm oturumları kapat"),
        message: t("{ad} bütün cihazlarda çıkışa düşer; yeniden giriş yapabilir.", { ad: u.fullName }),
        confirmLabel: t("Oturumları kapat"),
        danger: false,
      };
    case "rol":
      return onay.rol === "admin"
        ? {
            title: t("Yönetici yap"),
            message: t("{ad} admin paneline ve tüm kullanıcı işlemlerine erişir. Yeni rol, kişi yeniden giriş yapınca geçerli olur.", { ad: u.fullName }),
            confirmLabel: t("Yönetici yap"),
            danger: true,
          }
        : {
            title: t("Yöneticiliği kaldır"),
            message: t("{ad} admin paneline erişimini kaybeder ve tüm cihazlardan çıkarılır.", { ad: u.fullName }),
            confirmLabel: t("Yöneticiliği kaldır"),
            danger: true,
          };
    case "kredi_dus":
      return {
        title: t("Kredi düş"),
        message: t("{ad} kullanıcısının bakiyesinden {miktar} kredi düşülecek. Belirli bir yüklemeyi geri almak istiyorsan listedeki \"Geri al\" düğmesini kullan.", {
          ad: u.fullName,
          miktar: sayi(onay.miktar),
        }),
        confirmLabel: t("Düş"),
        danger: true,
      };
    case "geri_al":
      return {
        title: t("Yüklemeyi geri al"),
        message: t("{miktar} kredilik yükleme geri alınacak. Kredi harcanmışsa bakiye eksiye düşebilir.", { miktar: sayi(onay.hareket.credits) }),
        confirmLabel: t("Geri al"),
        danger: true,
      };
    case "silme_planla":
      return {
        title: t("Hesabı 30 gün sonra sil"),
        message: t("{ad} tüm cihazlardan çıkarılır. 30 gün içinde giriş yaparsa silme iptal olur; yapmazsa hesap kalıcı olarak silinir.", { ad: u.fullName }),
        confirmLabel: t("Silmeyi planla"),
        danger: true,
      };
    case "hemen_sil":
      return {
        title: t("Şimdi kalıcı olarak sil"),
        message: t("Bu işlem GERİ ALINAMAZ. Kişisel verisi ve yalnızca ona ait işler silinir, hesap anonimleştirilir. Ekibi olan işler \"Silinmiş kullanıcı\" sahipliğinde kalır."),
        confirmLabel: t("Kalıcı olarak sil"),
        danger: true,
      };
  }
}

const HAREKET_ETIKETI: Record<string, string> = {
  topup: "Yükleme", // dil:anahtar
  usage: "Kullanım", // dil:anahtar
  refund: "İade", // dil:anahtar
  adjustment: "Düzeltme", // dil:anahtar
  welcome: "Hoş geldin", // dil:anahtar
};

const ISLEM_ETIKETI: Record<string, string> = {
  askiya_al: "Askıya aldı", // dil:anahtar
  askiyi_kaldir: "Askıyı kaldırdı", // dil:anahtar
  oturumlari_kapat: "Oturumları kapattı", // dil:anahtar
  rol_degistir: "Rolü değiştirdi", // dil:anahtar
  eposta_dogrula: "E-postayı doğruladı", // dil:anahtar
  kredi_yukle: "Kredi yükledi", // dil:anahtar
  kredi_dus: "Kredi düştü", // dil:anahtar
  kredi_geri_al: "Kredi yüklemesini geri aldı", // dil:anahtar
  mesaj_gonder: "Mesaj gönderdi", // dil:anahtar
  silme_planla: "Silmeyi planladı", // dil:anahtar
  silmeyi_iptal_et: "Silmeyi iptal etti", // dil:anahtar
  hemen_sil: "Kalıcı olarak sildi", // dil:anahtar
};

/** Kayıttaki ayrıntının kısa hâli: miktar, sebep, rol geçişi. */
function islemDetayi(detail: Record<string, unknown> | undefined): string {
  if (!detail) return "";
  const parcalar: string[] = [];
  if (typeof detail.miktar === "number") parcalar.push(sayi(detail.miktar));
  if (typeof detail.once === "string" && typeof detail.sonra === "string") parcalar.push(`${detail.once} → ${detail.sonra}`);
  if (typeof detail.sebep === "string" && detail.sebep) parcalar.push(detail.sebep);
  if (typeof detail.aciklama === "string" && detail.aciklama) parcalar.push(detail.aciklama);
  if (typeof detail.baslik === "string" && detail.baslik) {
    const kanallar = [detail.bildirim === true ? "🔔" : "", detail.eposta === true ? "✉" : ""].filter(Boolean).join(" ");
    parcalar.push(`"${detail.baslik}"${kanallar ? ` ${kanallar}` : ""}`);
  }
  return parcalar.join(" · ");
}

// ================================================================ Küçük parçalar

/** Son 30 günün günlük kullanımı; yükseklik o dönemin en uzun gününe göre. */
function GunlukCubuklar({ c, gunler }: { c: ThemeColors; gunler: { gun: string; saniye: number }[] }) {
  const t = useT();
  // Sunucu zaten 30 güne tamamlıyor; eski bir sunucu yanıtında boş gelirse de çizim bozulmasın.
  const dizi = gunler.length ? gunler : gunlukEtkinligiDoldur([], new Date().toISOString().slice(0, 10));
  const enCok = Math.max(...dizi.map((g) => g.saniye), 1);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 64 }} role="img" aria-label={t("Son 30 günün günlük kullanım süresi")}>
        {dizi.map((g) => (
          <div
            key={g.gun}
            title={`${tarih(g.gun)} · ${etkinlikSuresiYaz(g.saniye)}`}
            style={{
              flex: 1,
              minWidth: 3,
              height: g.saniye > 0 ? `${Math.max(6, (g.saniye / enCok) * 100)}%` : 2,
              background: g.saniye > 0 ? c.accent : c.border,
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: c.textSecondary, marginTop: 4 }}>
        <span>{tarih(dizi[0]?.gun)}</span>
        <span>{t("bugün")}</span>
      </div>
    </div>
  );
}

function DurumRozeti({ c, durum }: { c: ThemeColors; durum: AdminKullaniciDurumu }) {
  const t = useT();
  const renk = durumRengi(c, durum);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 9px",
        borderRadius: 999,
        border: `1px solid ${renk}`,
        color: renk,
        fontSize: 12.5,
        whiteSpace: "nowrap",
      }}
    >
      {t(ADMIN_KULLANICI_DURUM_ETIKETI[durum])}
    </span>
  );
}

function Bolum({ c, baslik, children }: { c: ThemeColors; baslik: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 14 }}>
      <h3 style={{ color: c.textPrimary, fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>{baslik}</h3>
      {children}
    </div>
  );
}

function Bilgi({ c, etiket, children }: { c: ThemeColors; etiket: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: c.textSecondary, marginBottom: 2 }}>{etiket}</div>
      <div style={{ fontSize: 14, color: c.textPrimary }}>{children}</div>
    </div>
  );
}

function Metrik({ c, etiket, deger, renk }: { c: ThemeColors; etiket: string; deger: string; renk?: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: c.textSecondary }}>{etiket}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: renk ?? c.textPrimary, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{deger}</div>
    </div>
  );
}

function Uyari({ c, children }: { c: ThemeColors; children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "9px 12px",
        borderRadius: 9,
        border: `1px solid ${c.warning}`,
        color: c.textPrimary,
        fontSize: 14,
        lineHeight: 1.5,
        margin: "0 0 10px",
      }}
    >
      {children}
    </div>
  );
}

function thStyle(c: ThemeColors, align: "left" | "right" = "left"): React.CSSProperties {
  return { textAlign: align, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: c.textSecondary, whiteSpace: "nowrap" };
}

function tdStyle(c: ThemeColors): React.CSSProperties {
  return { padding: "9px 12px", color: c.textPrimary, verticalAlign: "middle" };
}

function inputStyle(c: ThemeColors): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 11px",
    borderRadius: 9,
    border: `1px solid ${c.border}`,
    fontSize: 14,
    color: c.textPrimary,
    background: c.background,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}

function temelButon(): React.CSSProperties {
  return { padding: "8px 14px", borderRadius: 9, fontSize: 14, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
}

function birincilButon(c: ThemeColors): React.CSSProperties {
  return { ...temelButon(), border: `1px solid ${c.accent}`, background: c.accent, color: c.onPrimary };
}

function ikincilButon(c: ThemeColors): React.CSSProperties {
  return { ...temelButon(), border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary };
}

function tehlikeButon(c: ThemeColors): React.CSSProperties {
  return { ...temelButon(), border: `1px solid ${c.danger}`, background: c.surface, color: c.danger };
}
