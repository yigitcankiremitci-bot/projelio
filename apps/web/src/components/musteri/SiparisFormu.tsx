import { useEffect, useMemo, useState } from "react";
import {
  ODEME_YONTEMI_ETIKET,
  ODEME_YONTEMLERI,
  PRODUCT_UNIT_LABEL,
  evrakliMi,
  kalemTutari,
  kdvDahilFiyat,
  tahsilEdilen,
  vadeTarihiHesapla,
  type MusteriSiparisi,
  type OdemeYontemi,
  type Product,
  type SatisKanali,
} from "@projelio/shared";
import { api } from "../../api/client";
import { kanalApi, siparisApi, type KalemGovdesi, type SiparisGovdesi } from "../../api/party";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";
import { PARA_BIRIMLERI, fmtPara, fmtTarih } from "../butce/butceBicim";
import { Alan, TAM_GENISLIK, bugunYerel } from "./siparisOrtak";

/** Sık kullanılan vadeler; listede olmayan gün sayısı elle yazılır. */
const HAZIR_VADELER = [0, 15, 30, 45, 60, 90, 120];

interface KalemSatiri {
  productId: string;
  aciklama: string;
  miktar: string;
  birimFiyat: string;
}

function sayi(s: string): number {
  return Number(s.replace(/\s/g, "").replace(",", "."));
}

/**
 * Sipariş ekleme / düzenleme formu.
 *
 * Sipariş KALEMLİDİR (migration 168): her satır katalogdan bir ürün ya da
 * serbest bir açıklama. Ürün seçilince birim fiyat alanına KDV dahil katalog
 * fiyatı ipucu olarak düşer; boş bırakılırsa o fiyat kullanılır, yazılırsa
 * pazarlık edilmiş fiyat. Sipariş tutarı da yazılabilir ("toplam 2.427,30,
 * ürünler şunlar"): o zaman fiyatı boş kalemler kalanı katalog oranında
 * paylaşır — hesap sunucuda (SiparisService.kalemleriHazirla).
 *
 * Vade GÜN olarak girilir, tarih hesaplanıp önizlenir: satışta konuşulan dil
 * "60 gün vade", takvim tarihi değil. Kanal seçilince vade ve ödeme yöntemi
 * kanaldan gelir (kullanıcı daha önce değiştirmediyse).
 *
 * İki kapı: müşteri kartından (`partyId`) ya da Tahsilat ekranından
 * (`kapsamYolu`) — orada müşteri yoksa sipariş kanalın tek seferlik
 * alıcısına yazılır ve alıcı adı istenir.
 */
export default function SiparisFormu({
  partyId,
  kapsamYolu,
  organizationId,
  mevcut,
  onKaydedildi,
  onVazgec,
}: {
  partyId?: string;
  /** Müşterisiz (kanal) sipariş için: /organizations/:id ya da /jobs/:id */
  kapsamYolu?: string;
  organizationId?: string;
  mevcut?: MusteriSiparisi;
  onKaydedildi: (s: MusteriSiparisi) => void;
  onVazgec: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const musterisiz = mevcut ? !mevcut.partyId : !partyId;
  const [f, setF] = useState(() => ({
    siparisNo: mevcut?.siparisNo ?? "",
    aciklama: mevcut?.aciklama ?? "",
    tutar: "",
    paraBirimi: mevcut?.paraBirimi ?? "TRY",
    siparisTarihi: mevcut?.siparisTarihi ?? bugunYerel(),
    vadeGun: String(mevcut?.vadeGun ?? 30),
    odemeYontemi: (mevcut?.odemeYontemi ?? "havale") as OdemeYontemi,
    evrakNo: mevcut?.evrakNo ?? "",
    evrakVadesi: mevcut?.evrakVadesi ?? "",
    notlar: mevcut?.notlar ?? "",
    kanalId: mevcut?.kanalId ?? "",
    aliciAdi: mevcut?.alici?.ad ?? "",
    aliciIl: mevcut?.alici?.il ?? "",
    aliciIlce: mevcut?.alici?.ilce ?? "",
  }));
  const [kalemler, setKalemler] = useState<KalemSatiri[]>(() =>
    mevcut?.kalemler.length
      ? mevcut.kalemler.map((k) => ({
          productId: k.productId ?? "",
          aciklama: k.aciklama ?? "",
          miktar: String(k.miktar),
          birimFiyat: String(k.birimFiyat),
        }))
      : [{ productId: "", aciklama: "", miktar: "1", birimFiyat: "" }]
  );
  // Vade ve yöntem kullanıcı tarafından değiştirildiyse kanal seçimi onları ezmesin.
  const [vadeElle, setVadeElle] = useState(!!mevcut);
  const [hata, setHata] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  // Katalog okunamazsa (taşeron, yetki) seçici gizlenir; kalem açıklamayla girilir.
  const [urunler, setUrunler] = useState<Product[] | null>(null);
  const [kanallar, setKanallar] = useState<SatisKanali[]>([]);
  useEffect(() => {
    if (!organizationId) return;
    let iptal = false;
    api
      .get<Product[]>(`/organizations/${organizationId}/products`)
      .then((l) => !iptal && setUrunler(l))
      .catch(() => !iptal && setUrunler([]));
    kanalApi
      .liste(`/organizations/${organizationId}`)
      .then((l) => !iptal && setKanallar(l))
      .catch(() => !iptal && setKanallar([]));
    return () => {
      iptal = true;
    };
  }, [organizationId]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const vadeGun = Math.max(0, Math.floor(Number(f.vadeGun) || 0));
  const tahsilatVar = !!mevcut && tahsilEdilen(mevcut) > 0;

  const urunOf = useMemo(() => new Map((urunler ?? []).map((u) => [u.id, u])), [urunler]);
  const katalogFiyati = (k: KalemSatiri) => {
    const u = k.productId ? urunOf.get(k.productId) : undefined;
    return u ? kdvDahilFiyat(u.price, u.taxRate) : undefined;
  };

  // Mevcut bağ arşivlenmiş bir ürünse listede yok; seçenek olarak yine görünsün
  // ki kaydetmek bağı sessizce koparmasın.
  const urunSecenekleri = useMemo(() => {
    const l = [...(urunler ?? [])];
    for (const k of mevcut?.kalemler ?? []) {
      if (k.productId && !l.some((u) => u.id === k.productId)) {
        l.push({ id: k.productId, name: k.productName ?? t("Arşivdeki ürün") } as Product);
      }
    }
    return l;
  }, [urunler, mevcut]);

  const kanalSec = (id: string) => {
    setF((x) => {
      const y = { ...x, kanalId: id };
      const k = kanallar.find((z) => z.id === id);
      if (k && !vadeElle) {
        y.vadeGun = String(k.varsayilanVadeGun);
        y.odemeYontemi = k.varsayilanOdemeYontemi;
      }
      return y;
    });
  };

  const kalemDegis = (i: number, alan: keyof KalemSatiri, v: string) =>
    setKalemler((l) => l.map((k, j) => (j === i ? { ...k, [alan]: v } : k)));

  // Formdaki toplam: fiyatı yazılmış ya da katalogda olan kalemlerden.
  // Sipariş tutarı elle yazıldıysa o geçerli, burada yalnızca karşılaştırılır.
  const kalemToplam = kalemler.reduce((t, k) => {
    const fiyat = k.birimFiyat.trim() ? sayi(k.birimFiyat) : katalogFiyati(k);
    const miktar = sayi(k.miktar || "1");
    return Number.isFinite(fiyat) && fiyat !== undefined && Number.isFinite(miktar) ? t + kalemTutari({ miktar, birimFiyat: fiyat }) : t;
  }, 0);
  const elleTutar = f.tutar.trim() ? sayi(f.tutar) : undefined;

  const kaydet = async () => {
    const govdeKalemler: KalemGovdesi[] = [];
    for (const k of kalemler) {
      if (!k.productId && !k.aciklama.trim() && !k.birimFiyat.trim()) continue;
      const miktar = sayi(k.miktar || "1");
      if (!Number.isFinite(miktar) || miktar <= 0) {
        setHata(t("Miktar geçerli bir sayı olmalı"));
        return;
      }
      if (!k.productId && !k.aciklama.trim()) {
        setHata(t("Ürünü seçilmeyen kalemin açıklaması olmalı"));
        return;
      }
      const birimFiyat = k.birimFiyat.trim() ? sayi(k.birimFiyat) : undefined;
      if (birimFiyat !== undefined && (!Number.isFinite(birimFiyat) || birimFiyat < 0)) {
        setHata(t("Birim fiyat geçerli bir sayı olmalı"));
        return;
      }
      govdeKalemler.push({
        productId: k.productId || null,
        aciklama: k.aciklama.trim() || undefined,
        miktar,
        birimFiyat,
      });
    }
    if (govdeKalemler.length === 0) {
      setHata(t("Siparişte en az bir kalem olmalı"));
      return;
    }
    if (elleTutar !== undefined && (!Number.isFinite(elleTutar) || elleTutar <= 0)) {
      setHata(t("Tutar sıfırdan büyük olmalı"));
      return;
    }
    if (musterisiz && !f.kanalId) {
      setHata(t("Müşterisi olmayan sipariş için satış kanalı seçilmeli"));
      return;
    }
    if (musterisiz && !f.aliciAdi.trim()) {
      setHata(t("Alıcının adı gerekli"));
      return;
    }
    const govde: SiparisGovdesi = {
      siparisNo: f.siparisNo,
      aciklama: f.aciklama,
      kalemler: govdeKalemler,
      tutar: elleTutar,
      paraBirimi: f.paraBirimi,
      siparisTarihi: f.siparisTarihi,
      vadeGun,
      odemeYontemi: f.odemeYontemi,
      evrakNo: f.evrakNo,
      evrakVadesi: f.evrakVadesi || undefined,
      notlar: f.notlar,
      kanalId: f.kanalId || null,
      alici: { ad: f.aliciAdi, il: f.aliciIl, ilce: f.aliciIlce },
    };
    setHata("");
    setKaydediliyor(true);
    try {
      const s = mevcut
        ? await siparisApi.guncelle(mevcut.id, govde)
        : partyId
          ? await siparisApi.ekle(partyId, govde)
          : await siparisApi.kapsamdaEkle(kapsamYolu!, govde);
      onKaydedildi(s);
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setKaydediliyor(false);
    }
  };

  const kucukDugme: React.CSSProperties = {
    fontSize: 12,
    color: c.primary,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    padding: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, background: c.background, borderRadius: 10, padding: 10 }}>
      {kanallar.length > 0 && (
        <Alan label={musterisiz ? t("Satış kanalı *") : t("Satış kanalı")}>
          <select value={f.kanalId} onChange={(e) => kanalSec(e.target.value)} style={TAM_GENISLIK}>
            <option value="">{musterisiz ? t("Kanal seç") : t("Belirtilmedi")}</option>
            {kanallar
              .filter((k) => k.aktif || k.id === f.kanalId)
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ad}
                </option>
              ))}
          </select>
        </Alan>
      )}
      {musterisiz && kanallar.length === 0 && (
        <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>
          {t("Müşterisi olmayan sipariş bir satış kanalına yazılır. Önce Kanallar sekmesinden bir kanal ekle.")}
        </p>
      )}
      {(musterisiz || f.aliciAdi) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Alan label={musterisiz ? t("Alıcı *") : t("Alıcı")} style={{ flex: "2 1 160px" }}>
            <input value={f.aliciAdi} onChange={(e) => set("aliciAdi", e.target.value)} placeholder={t("Ad soyad")} style={TAM_GENISLIK} />
          </Alan>
          <Alan label={t("İl")} style={{ flex: "1 1 90px" }}>
            <input value={f.aliciIl} onChange={(e) => set("aliciIl", e.target.value)} style={TAM_GENISLIK} />
          </Alan>
          <Alan label={t("İlçe")} style={{ flex: "1 1 90px" }}>
            <input value={f.aliciIlce} onChange={(e) => set("aliciIlce", e.target.value)} style={TAM_GENISLIK} />
          </Alan>
        </div>
      )}

      <Alan label={t("Kalemler")}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {kalemler.map((k, i) => {
            const liste = katalogFiyati(k);
            const u = k.productId ? urunOf.get(k.productId) : undefined;
            return (
              <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {urunSecenekleri.length > 0 && (
                  <select
                    value={k.productId}
                    onChange={(e) => kalemDegis(i, "productId", e.target.value)}
                    style={{ flex: "3 1 180px", minWidth: 0 }}
                  >
                    <option value="">{t("Katalogdan seçilmedi")}</option>
                    {urunSecenekleri.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.sku ? `${x.name} (${x.sku})` : x.name}
                      </option>
                    ))}
                  </select>
                )}
                {!k.productId && (
                  <input
                    value={k.aciklama}
                    onChange={(e) => kalemDegis(i, "aciklama", e.target.value)}
                    placeholder={t("Örn. 200 koli A4 kağıt")}
                    style={{ flex: "3 1 160px", minWidth: 0 }}
                  />
                )}
                <input
                  inputMode="decimal"
                  value={k.miktar}
                  onChange={(e) => kalemDegis(i, "miktar", e.target.value)}
                  aria-label={t("Miktar")}
                  title={u?.unit ? t(PRODUCT_UNIT_LABEL[u.unit]) : t("Miktar")}
                  style={{ flex: "0 1 60px", minWidth: 0 }}
                />
                <input
                  inputMode="decimal"
                  value={k.birimFiyat}
                  onChange={(e) => kalemDegis(i, "birimFiyat", e.target.value)}
                  aria-label={t("Birim fiyat")}
                  placeholder={liste !== undefined ? String(liste) : t("Birim fiyat")}
                  title={liste !== undefined ? t("Katalog fiyatı (KDV dahil): {fiyat}", { fiyat: fmtPara(liste, f.paraBirimi) }) : undefined}
                  style={{ flex: "1 1 90px", minWidth: 0 }}
                />
                {kalemler.length > 1 && (
                  <button
                    onClick={() => setKalemler((l) => l.filter((_, j) => j !== i))}
                    aria-label={t("Kalemi kaldır")}
                    style={{ ...kucukDugme, color: c.textSecondary, fontSize: 16 }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          <button
            onClick={() => setKalemler((l) => [...l, { productId: "", aciklama: "", miktar: "1", birimFiyat: "" }])}
            style={{ ...kucukDugme, alignSelf: "flex-start" }}
          >
            {t("+ Kalem ekle")}
          </button>
        </div>
      </Alan>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Alan label={t("Sipariş tutarı")} style={{ flex: "2 1 140px" }}>
          <input
            inputMode="decimal"
            value={f.tutar}
            onChange={(e) => set("tutar", e.target.value)}
            placeholder={kalemToplam > 0 ? String(Math.round(kalemToplam * 100) / 100) : t("Kalem toplamı")}
            style={TAM_GENISLIK}
          />
        </Alan>
        <Alan label={t("Para birimi")} style={{ flex: "1 1 90px" }}>
          <select
            value={f.paraBirimi}
            onChange={(e) => set("paraBirimi", e.target.value)}
            // Tahsilat defterde bu birimle duruyor; sunucu da değiştirmeyi reddediyor.
            disabled={tahsilatVar}
            style={TAM_GENISLIK}
          >
            {(PARA_BIRIMLERI.includes(f.paraBirimi) ? PARA_BIRIMLERI : [f.paraBirimi, ...PARA_BIRIMLERI]).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Alan>
      </div>
      <span style={{ fontSize: 12, color: c.textSecondary, marginTop: -4 }}>
        {elleTutar !== undefined
          ? t("Fiyatı boş kalemler tutarın kalanını katalog fiyatı oranında paylaşır.")
          : t("Boş bırakılırsa kalem toplamı: {tutar}", { tutar: fmtPara(kalemToplam, f.paraBirimi) })}
      </span>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Alan label={t("Sipariş no")} style={{ flex: "1 1 120px" }}>
          <input value={f.siparisNo} onChange={(e) => set("siparisNo", e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Sipariş tarihi")} style={{ flex: "1 1 140px" }}>
          <input type="date" value={f.siparisTarihi} onChange={(e) => set("siparisTarihi", e.target.value)} style={TAM_GENISLIK} />
        </Alan>
        <Alan label={t("Vade (gün)")} style={{ flex: "1 1 110px" }}>
          <input
            type="number"
            min={0}
            list="projelio-hazir-vadeler"
            value={f.vadeGun}
            onChange={(e) => {
              setVadeElle(true);
              set("vadeGun", e.target.value);
            }}
            style={TAM_GENISLIK}
          />
          <datalist id="projelio-hazir-vadeler">
            {HAZIR_VADELER.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Alan>
      </div>
      {f.siparisTarihi && (
        <span style={{ fontSize: 12, color: c.textSecondary, marginTop: -4 }}>
          {t("Vade tarihi: {tarih}", { tarih: fmtTarih(vadeTarihiHesapla(f.siparisTarihi, vadeGun)) })}
        </span>
      )}

      <Alan label={t("Ödeme yöntemi")}>
        <select
          value={f.odemeYontemi}
          onChange={(e) => {
            setVadeElle(true);
            set("odemeYontemi", e.target.value as OdemeYontemi);
          }}
          style={TAM_GENISLIK}
        >
          {ODEME_YONTEMLERI.map((y) => (
            <option key={y} value={y}>
              {t(ODEME_YONTEMI_ETIKET[y])}
            </option>
          ))}
        </select>
      </Alan>

      {evrakliMi(f.odemeYontemi) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Alan label={f.odemeYontemi === "cek" ? t("Çek no") : t("Senet no")} style={{ flex: "1 1 120px" }}>
            <input value={f.evrakNo} onChange={(e) => set("evrakNo", e.target.value)} style={TAM_GENISLIK} />
          </Alan>
          <Alan label={f.odemeYontemi === "cek" ? t("Çek vadesi") : t("Senet vadesi")} style={{ flex: "1 1 140px" }}>
            <input type="date" value={f.evrakVadesi} onChange={(e) => set("evrakVadesi", e.target.value)} style={TAM_GENISLIK} />
          </Alan>
        </div>
      )}

      <Alan label={t("Not")}>
        <textarea
          value={f.notlar}
          onChange={(e) => set("notlar", e.target.value)}
          rows={2}
          style={{ ...TAM_GENISLIK, resize: "vertical", fontFamily: "inherit" }}
        />
      </Alan>

      {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={kaydet}
          disabled={kaydediliyor}
          style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14 }}
        >
          {kaydediliyor ? t("Kaydediliyor…") : mevcut ? t("Güncelle") : t("Siparişi kaydet")}
        </button>
        <button
          onClick={onVazgec}
          style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 14 }}
        >
          {t("Vazgeç")}
        </button>
      </div>
    </div>
  );
}
