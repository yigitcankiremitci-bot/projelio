import { Fragment, useState } from "react";
import {
  ODEME_YONTEMI_ETIKET,
  ODEME_YONTEMLERI,
  SIPARIS_ASAMALARI,
  SIPARIS_ASAMASI_ETIKET,
  asamaGecisi,
  evrakliMi,
  onayliMi,
  stokTakipli,
  kalanTutar,
  katalogSapmasi,
  siparisDurumu,
  tahsilatTutariHatasi,
  tahsilEdilen,
  type MusteriSiparisi,
  type OdemeYontemi,
  type SiparisAsamasi,
} from "@projelio/shared";
import { siparisApi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { fmtPara, fmtTarih } from "../butce/butceBicim";
import { IconTrash, IconX } from "../icons";
import SiparisFormu from "./SiparisFormu";
import SiparisFaturasi from "./SiparisFaturasi";
import { Alan, AsamaRozeti, DurumRozeti, TAM_GENISLIK, bugunYerel } from "./siparisOrtak";
import { useIsDesktop } from "../../lib/useIsDesktop";
import { onayla } from "../../lib/onay";

/**
 * Tek sipariş satırı: özet + sağda tutar/vade.
 *
 * Hem müşteri kartındaki Siparişler sekmesi hem Tahsilat takibi görünümü
 * bunu kullanır; `musteriAdiGoster` ikincisinde satırın kime ait olduğunu yazar
 * (müşterisiz siparişte alıcı + kanal). `onSec` verilirse satırın başında
 * toplu "tahsil edildi" için seçim kutusu çıkar.
 *
 * `onAc` verilirse satıra basmak ayrıntıyı satırın altında açmaz, üst
 * bileşene bildirir: Tahsilat sekmesi onu sağdaki panelde (dar ekranda
 * pencerede) gösterir — satırın altında açılan ayrıntı listeyi bölüyor,
 * gözü yoruyordu (kullanıcı geri bildirimi, 2026-11-11).
 */
export default function SiparisKarti({
  siparis,
  yazabilir,
  musteriAdiGoster = false,
  sorumluGoster = false,
  onDegisti,
  onSilindi,
  secili,
  onSec,
  cerceveli = false,
  onAc,
  acikta = false,
  hizliTahsilYok = false,
}: {
  siparis: MusteriSiparisi;
  yazabilir: boolean;
  musteriAdiGoster?: boolean;
  sorumluGoster?: boolean;
  onDegisti: (s: MusteriSiparisi) => void;
  onSilindi: (id: string) => void;
  secili?: boolean;
  onSec?: (secili: boolean) => void;
  /** Tek çerçeveli listenin satırı: zemin ve köşe satırdan (lib/listeStili.ts) gelir. */
  cerceveli?: boolean;
  /** Ayrıntı dışarıda açılır (Tahsilat'ın sağ paneli); "tahsil" doğrudan formu açar. */
  onAc?: (mod?: "tahsil") => void;
  /** Ayrıntısı şu an sağ panelde açık olan satır (vurgulanır). */
  acikta?: boolean;
  /** Satırdaki "Tahsil et" kısayolu gizli (ayrıntı yanda açıkken listeye yer kalsın). */
  hizliTahsilYok?: boolean;
}) {
  const c = useThemeColors();
  const t = useT();
  const [acik, setAcik] = useState(false);
  const [ilkMod, setIlkMod] = useState<"tahsil" | null>(null);
  const masaustu = useIsDesktop();

  const bugun = bugunYerel();
  const durum = siparisDurumu(siparis, bugun);
  const kalan = kalanTutar(siparis);
  const odenen = tahsilEdilen(siparis);
  const para = siparis.paraBirimi;
  const baslik = siparisBasligi(siparis, musteriAdiGoster, t);

  const vade = vadeDurumu(siparis.vadeTarihi, bugun, durum);
  const vadeRengi = vadeRengiSec(vade.ton, c);
  // Meta satırı parça parça: "Faturasız" renkli olabilsin diye düz metin değil.
  const meta: React.ReactNode[] = [
    // Satırda siparişin günü; vade sağdaki sütunda (kullanıcı isteği, 2026-10-20 / 2026-11-11).
    fmtTarih(siparis.siparisTarihi),
    siparis.kanalAdi,
    t(ODEME_YONTEMI_ETIKET[siparis.odemeYontemi]),
    siparis.fatura ? (
      siparis.fatura.faturaNo ? t("Fatura #{no}", { no: siparis.fatura.faturaNo }) : t("Faturalı")
    ) : siparis.asama !== "iptal" ? (
      // Faturası kesilmemiş sipariş görünür olsun: muhasebenin ay sonu işi bu.
      <span style={{ color: c.warning }}>{t("Faturasız")}</span>
    ) : undefined,
    sorumluGoster ? siparis.sorumluAdi ?? t("Sorumlu yok") : undefined,
  ].filter(Boolean);
  // Telefonda satırda yer yok (ad beş satıra bölünüyordu): orada "Tahsil et"
  // satır açılınca ayrıntıdaki düğmelerde.
  const hizliTahsil = masaustu && !hizliTahsilYok && yazabilir && kalan > 0 && siparis.asama !== "iptal" && (onAc ? true : !acik);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        ...(cerceveli ? {} : { background: c.background, borderRadius: 8 }),
        // Sağ panelde açık olan satır solda renkli çizgiyle işaretli.
        boxShadow: acikta ? `inset 3px 0 0 ${c.primary}` : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: hizliTahsil ? 10 : 0 }}>
      {onSec && (
        <input
          type="checkbox"
          checked={!!secili}
          disabled={kalan <= 0 || siparis.asama === "iptal"}
          onChange={(e) => onSec(e.target.checked)}
          aria-label={t("Siparişi seç")}
          style={{ marginLeft: 12, width: 16, height: 16, flexShrink: 0 }}
        />
      )}
      <button
        type="button"
        onClick={() => (onAc ? onAc() : setAcik((x) => !x))}
        aria-expanded={onAc ? acikta : acik}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "11px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          flex: 1,
          minWidth: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis" }}>
              {baslik || t("Sipariş")}
            </span>
            {/* Tahsilat durumu sağdaki vade satırında yazıyor; burada yalnızca
                orada görünmeyen iki hâl (kısmi, iptal) ve sipariş aşaması.
                "Web sitesi" rozeti kalktı: kanal adı meta satırında zaten var. */}
            <AsamaRozeti asama={siparis.asama} />
            {(durum === "kismi" || durum === "iptal") && <DurumRozeti durum={durum} />}
          </div>
          <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 3, display: "flex", flexWrap: "wrap", columnGap: 6 }}>
            {meta.map((m, i) => (
              <span key={i}>
                {i > 0 && <span aria-hidden style={{ marginRight: 6 }}>·</span>}
                {m}
              </span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary, fontVariantNumeric: "tabular-nums" }}>{fmtPara(siparis.tutar, para)}</span>
          {odenen > 0 && kalan > 0 && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Kalan {tutar}", { tutar: fmtPara(kalan, para) })}</span>
          )}
          <span style={{ fontSize: 12, fontWeight: 500, color: vadeRengi, whiteSpace: "nowrap" }}>{t(vade.metin, vade.degisken)}</span>
        </div>
      </button>
      {/* Tek tık tahsilat: en sık iş, satırı açıp aramadan yapılsın. */}
      {hizliTahsil && (
        <button
          onClick={() => {
            if (onAc) return onAc("tahsil");
            setIlkMod("tahsil");
            setAcik(true);
          }}
          style={{
            fontSize: 13,
            padding: "5px 12px",
            borderRadius: 7,
            border: `1px solid color-mix(in srgb, ${c.primary} 45%, transparent)`,
            background: "transparent",
            color: c.primary,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {t("Tahsil et")}
        </button>
      )}
      </div>

      {acik && !onAc && (
        <div style={{ margin: "0 12px 12px", padding: "14px 16px", borderRadius: 10, background: cerceveli ? c.background : c.surface }}>
          <SiparisAyrintisi
            siparis={siparis}
            yazabilir={yazabilir}
            onDegisti={onDegisti}
            onSilindi={onSilindi}
            ilkMod={ilkMod}
          />
        </div>
      )}
    </div>
  );
}

/** Satırın ve panelin başlığı: (müşteri ·) açıklama ya da ilk kalem "+2". */
function siparisBasligi(siparis: MusteriSiparisi, musteriAdiGoster: boolean, t: ReturnType<typeof useT>): string {
  const ilk = siparis.kalemler[0];
  const kalemOzeti = ilk
    ? `${ilk.productName ?? ilk.aciklama ?? t("Ürün")}${siparis.kalemler.length > 1 ? ` +${siparis.kalemler.length - 1}` : ""}`
    : undefined;
  const kime = siparis.partyName ?? (siparis.alici?.ad ? siparis.alici.ad : undefined);
  return [
    musteriAdiGoster ? kime : undefined,
    siparis.aciklama || kalemOzeti || (siparis.siparisNo ? `#${siparis.siparisNo}` : undefined),
  ]
    .filter(Boolean)
    .join(" · ");
}

function vadeRengiSec(ton: ReturnType<typeof vadeDurumu>["ton"], c: ReturnType<typeof useThemeColors>): string {
  return ton === "kotu" ? c.danger : ton === "dikkat" ? c.warning : ton === "iyi" ? c.success : c.textSecondary;
}

/**
 * Siparişin ayrıntısı. Önceden iki sütunlu, iç içe zeminli bir kutuydu ve
 * düğmeler en altta kalıyordu; şimdi yukarıdan aşağı tek akış: (başlık) →
 * para durumu + asıl işler → tahsilatlar → fatura → siparişin künyesi.
 * Bölümler yalnızca ince çizgiyle ayrılır, zemin değişmez.
 *
 * `baslikli` (Tahsilat'ın sağ paneli): satır görünmediği için başlık, tutar
 * ve vade de burada; satırın altında açılırken bunlar zaten satırda yazılı.
 */
export function SiparisAyrintisi({
  siparis,
  yazabilir,
  onDegisti,
  onSilindi,
  ilkMod = null,
  baslikli = false,
  musteriAdiGoster = false,
  onKapat,
}: {
  siparis: MusteriSiparisi;
  yazabilir: boolean;
  onDegisti: (s: MusteriSiparisi) => void;
  onSilindi: (id: string) => void;
  ilkMod?: "tahsil" | null;
  baslikli?: boolean;
  musteriAdiGoster?: boolean;
  onKapat?: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [mod, setMod] = useState<"tahsil" | "duzenle" | null>(ilkMod);
  const [hata, setHata] = useState("");

  const bugun = bugunYerel();
  const durum = siparisDurumu(siparis, bugun);
  const kalan = kalanTutar(siparis);
  const odenen = tahsilEdilen(siparis);
  const para = siparis.paraBirimi;
  const sapma = katalogSapmasi(siparis.kalemler);
  const vade = vadeDurumu(siparis.vadeTarihi, bugun, durum);
  const vadeRengi = vadeRengiSec(vade.ton, c);
  const oran = siparis.tutar > 0 ? Math.min(1, odenen / siparis.tutar) : 0;

  const geriAl = async (tahsilatId: string) => {
    if (!(await onayla(t("Bu tahsilat geri alınsın mı? Kasadaki gelir kaydı da silinir.")))) return;
    setHata("");
    try {
      onDegisti(await siparisApi.tahsilatiGeriAl(tahsilatId));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("İşlem başarısız"));
    }
  };

  // Aşama: yalnızca geçerli geçişler listelenir (kural ortak: asamaGecisi).
  const asamaSecenekleri = SIPARIS_ASAMALARI.filter((a) => a === siparis.asama || !("hata" in asamaGecisi(siparis.kaynak, siparis.asama, a)));
  const asamaDegistir = async (yeni: SiparisAsamasi) => {
    if (yeni === siparis.asama) return;
    const g = asamaGecisi(siparis.kaynak, siparis.asama, yeni);
    if ("hata" in g) return setHata(t(g.hata));
    const soru =
      g.stok === "satis"
        ? t("Sipariş onaylanınca ürünlerin stoğu düşer. Devam edilsin mi?")
        : g.stok === "iade"
          ? t("Sipariş iptal edilince düşen stok geri eklenir. İptal geri alınamaz. Devam edilsin mi?")
          : yeni === "iptal"
            ? t("Sipariş iptal edilsin mi? İptal geri alınamaz.")
            : null;
    if (soru && !(await onayla(soru))) return;
    setHata("");
    try {
      onDegisti(await siparisApi.asama(siparis.id, yeni));
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("İşlem başarısız"));
    }
  };
  // Onaylı (stoğu düşmüş) sipariş silinmez; önce iptal edilir (sunucu da reddeder).
  const silinebilir = siparis.tahsilatlar.length === 0 && !(stokTakipli(siparis.kaynak) && onayliMi(siparis.asama));

  const sil = async () => {
    if (!(await onayla(t("Sipariş silinsin mi?")))) return;
    setHata("");
    try {
      await siparisApi.sil(siparis.id);
      onSilindi(siparis.id);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Silinemedi"));
    }
  };

  const bolumBasligi: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0.3,
    textTransform: "uppercase",
    color: c.textSecondary,
  };
  const bolum: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8, paddingTop: 16, borderTop: `1px solid ${c.border}` };
  const dugme: React.CSSProperties = {
    fontSize: 14,
    padding: "7px 14px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textPrimary,
    cursor: "pointer",
  };
  const anaDugme: React.CSSProperties = { ...dugme, border: "none", background: c.primary, color: c.onPrimary, fontWeight: 600 };

  // Künye: etiket solda, değer sağda — virgüllü tek satır okunmuyordu.
  const kunye: [string, string][] = [
    [t("Sipariş tarihi"), fmtTarih(siparis.siparisTarihi)],
    [t("Vade"), `${fmtTarih(siparis.vadeTarihi)} (${t("{gun} gün", { gun: siparis.vadeGun })})`],
    [t("Ödeme yöntemi"), t(ODEME_YONTEMI_ETIKET[siparis.odemeYontemi])],
    ...(evrakliMi(siparis.odemeYontemi) && siparis.evrakNo ? ([[t("Evrak no"), siparis.evrakNo]] as [string, string][]) : []),
    ...(evrakliMi(siparis.odemeYontemi) && siparis.evrakVadesi ? ([[t("Evrak vadesi"), fmtTarih(siparis.evrakVadesi)]] as [string, string][]) : []),
    ...(siparis.kanalAdi ? ([[t("Kanal"), siparis.kanalAdi]] as [string, string][]) : []),
    ...(siparis.siparisNo ? ([[t("Sipariş no"), `#${siparis.siparisNo}`]] as [string, string][]) : []),
    ...(siparis.sorumluAdi ? ([[t("Sorumlu"), siparis.sorumluAdi]] as [string, string][]) : []),
    ...(siparis.alici && (siparis.partyId || siparis.alici.il)
      ? ([
          [
            t("Alıcı"),
            [siparis.alici.ad, [siparis.alici.ilce, siparis.alici.il].filter(Boolean).join(" / ")].filter(Boolean).join(" · "),
          ],
        ] as [string, string][])
      : []),
  ];

  const tahsilEdilebilir = kalan > 0 && siparis.asama !== "iptal";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {baslikli && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 18, fontWeight: 600, color: c.textPrimary, lineHeight: 1.3 }}>
              {siparisBasligi(siparis, musteriAdiGoster, t) || t("Sipariş")}
            </h3>
            {onKapat && (
              <button
                onClick={onKapat}
                aria-label={t("Kapat")}
                title={t("Kapat")}
                style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 4, marginTop: -2 }}
              >
                <IconX size={18} color={c.textSecondary} />
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <AsamaRozeti asama={siparis.asama} />
            {(durum === "kismi" || durum === "iptal") && <DurumRozeti durum={durum} />}
          </div>
        </div>
      )}

      {/* Para durumu: işin özü. Tutar büyük, altında ödenen/kalan ve dolum çubuğu. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: baslikli ? 26 : 20, fontWeight: 600, color: c.textPrimary, fontVariantNumeric: "tabular-nums" }}>
            {fmtPara(siparis.tutar, para)}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: vadeRengi }}>{t(vade.metin, vade.degisken)}</span>
        </div>
        {siparis.asama !== "iptal" && (
          <>
            <div style={{ height: 6, borderRadius: 999, background: c.border, overflow: "hidden" }}>
              <div style={{ width: `${oran * 100}%`, height: "100%", background: c.success, borderRadius: 999 }} />
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: 14, color: c.textSecondary, fontVariantNumeric: "tabular-nums" }}>
              <span>
                {t("Ödenen")} <strong style={{ color: c.success, fontWeight: 600 }}>{fmtPara(odenen, para)}</strong>
              </span>
              {kalan > 0 && (
                <span>
                  {t("Kalan")} <strong style={{ color: c.textPrimary, fontWeight: 600 }}>{fmtPara(kalan, para)}</strong>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Asıl işler yukarıda: eskiden ayrıntının en altındaydı, okumadan bulunmuyordu. */}
      {mod === "tahsil" ? (
        <TahsilatFormu
          siparis={siparis}
          onKaydedildi={(s) => {
            setMod(null);
            onDegisti(s);
          }}
          onVazgec={() => setMod(null)}
        />
      ) : mod === "duzenle" ? (
        <SiparisFormu
          partyId={siparis.partyId}
          organizationId={siparis.organizationId}
          mevcut={siparis}
          onKaydedildi={(s) => {
            setMod(null);
            onDegisti(s);
          }}
          onVazgec={() => setMod(null)}
        />
      ) : (
        yazabilir && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {tahsilEdilebilir && (
              <button onClick={() => setMod("tahsil")} style={anaDugme}>
                {t("Tahsil et")}
              </button>
            )}
            {/* Tek tık onay: portaldan gelen sipariş "alındı"da bekler; aşama
                seçicisini aramadan onaylansın. Web sitesi siparişinde portala
                order.updated (approved) tetikleyiciyle gider (migration 188). */}
            {siparis.asama === "alindi" && asamaSecenekleri.includes("onaylandi") && (
              <button onClick={() => asamaDegistir("onaylandi")} style={tahsilEdilebilir ? dugme : anaDugme}>
                {t("Onayla")}
              </button>
            )}
            {siparis.asama !== "iptal" && (
              <button onClick={() => setMod("duzenle")} style={dugme}>
                {t("Düzenle")}
              </button>
            )}
            {siparis.asama !== "iptal" && (
              <select
                aria-label={t("Sipariş aşaması")}
                value={siparis.asama}
                onChange={(e) => asamaDegistir(e.target.value as SiparisAsamasi)}
                style={{ ...dugme, padding: "6px 10px" }}
              >
                {asamaSecenekleri.map((a) => (
                  <option key={a} value={a}>
                    {t(SIPARIS_ASAMASI_ETIKET[a])}
                  </option>
                ))}
              </select>
            )}
            <span style={{ flex: 1 }} />
            {silinebilir && (
              <button
                onClick={sil}
                aria-label={t("Siparişi sil")}
                title={t("Siparişi sil")}
                style={{ background: "transparent", border: "none", cursor: "pointer", display: "flex", padding: 6 }}
              >
                <IconTrash size={16} color={c.textSecondary} />
              </button>
            )}
          </div>
        )
      )}
      {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}

      <div style={bolum}>
        <span style={bolumBasligi}>{t("Tahsilatlar")}</span>
        {siparis.tahsilatlar.length === 0 && <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Henüz tahsilat yok.")}</span>}
        {siparis.tahsilatlar.map((x) => (
          <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ color: c.textPrimary }}>
                {fmtTarih(x.tarih)} · {t(ODEME_YONTEMI_ETIKET[x.odemeYontemi])}
              </span>
              {(x.evrakNo || x.evrakVadesi || x.createdByName) && (
                <span style={{ fontSize: 12, color: c.textSecondary }}>
                  {[x.evrakNo ? `No ${x.evrakNo}` : undefined, x.evrakVadesi ? fmtTarih(x.evrakVadesi) : undefined, x.createdByName]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </div>
            <span style={{ fontWeight: 600, color: c.success, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
              {fmtPara(x.tutar, para)}
            </span>
            {yazabilir && (
              <button
                onClick={() => geriAl(x.id)}
                style={{ fontSize: 12, padding: "2px 8px", borderRadius: 7, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, cursor: "pointer" }}
              >
                {t("Geri al")}
              </button>
            )}
          </div>
        ))}
      </div>

      {(siparis.fatura || yazabilir) && (
        <div style={bolum}>
          <SiparisFaturasi siparis={siparis} yazabilir={yazabilir} onDegisti={onDegisti} />
        </div>
      )}

      {siparis.kalemler.length > 0 && (
        <div style={bolum}>
          <span style={bolumBasligi}>{t("Ürünler")}</span>
          {siparis.kalemler.map((k, i) => (
            <div key={k.id ?? i} style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 14 }}>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {k.productName ?? k.aciklama ?? t("Ürün")}
                </span>
                <span style={{ fontSize: 12, color: c.textSecondary }}>
                  {k.miktar} × {fmtPara(k.birimFiyat, para)}
                </span>
              </div>
              <span style={{ color: c.textPrimary, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fmtPara(k.tutar, para)}</span>
            </div>
          ))}
          {sapma !== undefined && Math.abs(sapma) >= 0.01 && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {sapma < 0
                ? t("Katalog fiyatından %{oran} indirimli", { oran: Math.round(-sapma * 100) })
                : t("Katalog fiyatından %{oran} yüksek", { oran: Math.round(sapma * 100) })}
            </span>
          )}
        </div>
      )}

      <div style={bolum}>
        <span style={bolumBasligi}>{t("Sipariş bilgileri")}</span>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, auto) 1fr", gap: "6px 16px", fontSize: 14 }}>
          {kunye.map(([etiket, deger]) => (
            <Fragment key={etiket}>
              <span style={{ color: c.textSecondary }}>{etiket}</span>
              <span style={{ color: c.textPrimary, minWidth: 0, overflowWrap: "anywhere" }}>{deger}</span>
            </Fragment>
          ))}
        </div>
        {siparis.notlar && (
          <div style={{ fontSize: 14, color: c.textPrimary, whiteSpace: "pre-wrap", marginTop: 4 }}>{siparis.notlar}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Tahsilat girişi. Tutar kalanla dolu gelir — en sık iş "tamamı geldi";
 * kısmi ödemede kullanıcı rakamı değiştirir. Kalanı aşan tutar hem burada
 * hem sunucuda reddedilir (aynı fonksiyon: tahsilatTutariHatasi).
 */
function TahsilatFormu({
  siparis,
  onKaydedildi,
  onVazgec,
}: {
  siparis: MusteriSiparisi;
  onKaydedildi: (s: MusteriSiparisi) => void;
  onVazgec: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [tutar, setTutar] = useState(String(kalanTutar(siparis)));
  const [tarih, setTarih] = useState(bugunYerel());
  const [yontem, setYontem] = useState<OdemeYontemi>(siparis.odemeYontemi);
  const [evrakNo, setEvrakNo] = useState(siparis.evrakNo ?? "");
  const [evrakVadesi, setEvrakVadesi] = useState(siparis.evrakVadesi ?? "");
  const [hata, setHata] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const kaydet = async () => {
    const sayi = Number(tutar.replace(",", "."));
    const h = tahsilatTutariHatasi(siparis, sayi);
    if (h) {
      setHata(t(h));
      return;
    }
    setHata("");
    setKaydediliyor(true);
    try {
      onKaydedildi(
        await siparisApi.tahsilEt(siparis.id, {
          tutar: sayi,
          tarih,
          odemeYontemi: yontem,
          evrakNo: evrakliMi(yontem) ? evrakNo : undefined,
          evrakVadesi: evrakliMi(yontem) && evrakVadesi ? evrakVadesi : undefined,
        })
      );
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setKaydediliyor(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, border: `1px solid ${c.border}`, borderRadius: 8, padding: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Alan label={t("Gelen tutar ({para})", { para: siparis.paraBirimi })} style={{ flex: "1 1 120px" }}>
          <input inputMode="decimal" value={tutar} onChange={(e) => setTutar(e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Tarih")} style={{ flex: "1 1 130px" }}>
          <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Ödeme yöntemi")} style={{ flex: "1 1 130px" }}>
          <select value={yontem} onChange={(e) => setYontem(e.target.value as OdemeYontemi)} style={TAM_GENISLIK}>
            {ODEME_YONTEMLERI.map((y) => (
              <option key={y} value={y}>
                {t(ODEME_YONTEMI_ETIKET[y])}
              </option>
            ))}
          </select>
        </Alan>
      </div>
      {evrakliMi(yontem) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Alan label={yontem === "cek" ? t("Çek no") : t("Senet no")} style={{ flex: "1 1 120px" }}>
            <input value={evrakNo} onChange={(e) => setEvrakNo(e.target.value)} style={TAM_GENISLIK} />
          </Alan>
          <Alan label={yontem === "cek" ? t("Çek vadesi") : t("Senet vadesi")} style={{ flex: "1 1 130px" }}>
            <input type="date" value={evrakVadesi} onChange={(e) => setEvrakVadesi(e.target.value)} style={TAM_GENISLIK} />
          </Alan>
        </div>
      )}
      <span style={{ fontSize: 13, color: c.textSecondary }}>
        {t("Kasaya gelir olarak işlenir. Kalan: {tutar}", { tutar: fmtPara(kalanTutar(siparis), siparis.paraBirimi) })}
      </span>
      {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={kaydet}
          disabled={kaydediliyor}
          style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14 }}
        >
          {kaydediliyor ? t("Kaydediliyor…") : t("Tahsilatı kaydet")}
        </button>
        <button
          onClick={onVazgec}
          style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 14 }}
        >
          {t("Vazgeç")}
        </button>
      </div>
    </div>
  );
}

/**
 * Sağ sütundaki vade satırı: ödeme takibinin asıl sorusu "kimin peşine
 * düşeceğim" — kaç gün geciktiği ya da kaç gün kaldığı satırdan okunsun.
 * Önceden yalnızca "Gecikti" rozeti vardı, gün sayısı için satırı açmak
 * gerekiyordu (kullanıcı isteği, 2026-11-11).
 */
// dil:anahtar-baslangic — metinler kullanım yerinde t() ile çevriliyor
export function vadeDurumu(
  vadeTarihi: string,
  bugun: string,
  durum: ReturnType<typeof siparisDurumu>
): { metin: string; degisken?: Record<string, string | number>; ton: "kotu" | "dikkat" | "iyi" | "sade" } {
  if (durum === "iptal") return { metin: "İptal edildi", ton: "sade" };
  if (durum === "tahsil_edildi") return { metin: "Tahsil edildi", ton: "iyi" };
  const gun = gunFarki(bugun, vadeTarihi);
  if (gun < 0) return { metin: "{n} gün gecikti", degisken: { n: -gun }, ton: "kotu" };
  if (gun === 0) return { metin: "Bugün vadeli", ton: "dikkat" };
  if (gun <= 7) return { metin: "{n} gün kaldı", degisken: { n: gun }, ton: "dikkat" };
  return { metin: "Vade {tarih}", degisken: { tarih: fmtTarih(vadeTarihi) }, ton: "sade" };
}
// dil:anahtar-bitis

/** b − a, gün (YYYY-MM-DD; saat dilimi oynamasın diye UTC). */
export function gunFarki(a: string, b: string): number {
  const g = (x: string) => Date.UTC(Number(x.slice(0, 4)), Number(x.slice(5, 7)) - 1, Number(x.slice(8, 10)));
  return Math.round((g(b) - g(a)) / 86400000);
}
