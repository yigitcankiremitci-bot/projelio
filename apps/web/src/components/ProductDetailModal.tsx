import { useCallback, useEffect, useMemo, useState } from "react";
import type { Product, ProductOverview } from "@projelio/shared";
import {
  MODULE_RECORD_CONFIGS,
  PRODUCT_KIND_LABEL,
  PRODUCT_STATUS_LABEL,
  URUN_STRATEJI_MODUL_KEY,
} from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import ProductForm from "./ProductForm";
import ModuleFormPanel from "./ModuleFormPanel";
import EntityDangerZone from "./EntityDangerZone";
import { IconCheck, IconExternalLink } from "./icons";
import { MODULE_FORM_CONFIGS } from "../lib/moduleForms";
import { coverBackground } from "../lib/covers";
import {
  birimKar,
  brutKarMarji,
  formatMiktar,
  formatPara,
  kartDolulugu,
  kdvDahilFiyat,
  stokDurumu,
} from "../lib/urunKarti";
import { useIsDesktop } from "../lib/useIsDesktop";
import { useT } from "../lib/i18n";
import { bicimDili } from "../lib/i18n/depo";

interface Props {
  organizationId: string;
  /** Liste ucundan gelen hâli: kart, özet yüklenene kadar boş görünmesin. */
  product: Product;
  onClose: () => void;
  /** Ürün değişti (kaydedildi, fotoğraf eklendi) — alttaki liste tazelensin. */
  onChanged: () => void;
  onArchived: () => void;
  onDeleted: () => void;
}

type Sekme = "genel" | "bilgiler" | "strateji" | "moduller";

const FORM_ID = "urun-karti-formu";

/**
 * Ürün kartı: bir ürün ya da hizmet hakkında bilinen HER ŞEY tek pencerede.
 *
 * Eskiden karta tıklamak doğrudan düzenleme formunu açıyordu; ürünü yalnızca
 * okumak isteyen biri (satışçı, müşteri temsilcisi) boş kutulardan oluşan bir
 * formun içinde bilgi arıyordu, stratejisi ise bambaşka bir modülde duruyordu.
 * Kart artık dört sekme:
 *
 *   Genel bakış — okunacak hâli: galeri, fiyat/kârlılık, stok, tedarikçi,
 *                 özellikler, strateji özeti, modüllerdeki izi
 *   Bilgiler    — düzenleme formu (yalnızca düzenleme yetkisi olana)
 *   Strateji    — Ürün Stratejisi modülünün BU ürüne ait kaydı, yerinde
 *                 yazılıp onaylanabilir
 *   Modüllerde  — ürünün adının/kodunun geçtiği tedarik, depo, kalite… kayıtları
 *
 * Veri tek istekte gelir (`GET /products/:id/overview`); modül kayıtları
 * sunucuda kullanıcının modül yetkisinden geçirilmiş olarak döner.
 */
export default function ProductDetailModal({ organizationId, product: ilk, onClose, onChanged, onArchived, onDeleted }: Props) {
  const c = useThemeColors();
  const t = useT();
  const genis = useIsDesktop();

  const [ozet, setOzet] = useState<ProductOverview | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [sekme, setSekme] = useState<Sekme>("genel");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  // Form kaydedildikten sonra yeni değerlerle baştan kurulsun diye anahtar.
  const [formSurumu, setFormSurumu] = useState(0);
  const [seciliFoto, setSeciliFoto] = useState(0);

  const yukle = useCallback(() => {
    setHata("");
    return api
      .get<ProductOverview>(`/products/${ilk.id}/overview`)
      .then((veri) => {
        setOzet(veri);
        setSeciliFoto((i) => Math.min(i, Math.max(0, (veri.product.images?.length ?? 1) - 1)));
      })
      .catch((err) => setHata(err instanceof Error ? err.message : t("Ürün kartı yüklenemedi")))
      .finally(() => setYukleniyor(false));
    // `t` bilerek bağımlılıkta değil: dil değişince kartı yeniden çekmeye gerek yok.
  }, [ilk.id]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const product = ozet?.product ?? ilk;
  const canManage = ozet?.canManage ?? false;
  const hizmet = product.kind === "service";

  const doluluk = useMemo(
    () =>
      kartDolulugu(product, {
        enabled: ozet?.strategy.enabled ?? false,
        yazili: !!ozet?.strategy.record && Object.keys(ozet.strategy.record.data ?? {}).length > 0,
      }),
    [product, ozet]
  );
  const tamamlanan = doluluk.filter((m) => m.tamam).length;

  const sekmeler: Array<{ key: Sekme; label: string }> = [
    { key: "genel", label: t("Genel bakış") },
    ...(canManage ? [{ key: "bilgiler" as const, label: t("Bilgiler") }] : []),
    { key: "strateji", label: t("Strateji") },
    {
      key: "moduller",
      label: ozet?.related.length ? t("Modüllerde ({n})", { n: ozet.related.length }) : t("Modüllerde"),
    },
  ];

  const altBaslik = [t(PRODUCT_KIND_LABEL[product.kind ?? "product"]), product.category, product.brand]
    .filter(Boolean)
    .join(" · ");

  // ------------------------------------------------------------------ parçalar

  const kutu = (baslik: string, icerik: React.ReactNode, eylem?: React.ReactNode) => (
    <section
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{baslik}</h3>
        {eylem}
      </div>
      {icerik}
    </section>
  );

  const baglantiDugmesi = (etiket: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      style={{ background: "transparent", border: "none", padding: 0, fontSize: 13.5, color: c.accentDark, fontWeight: 500 }}
    >
      {etiket}
    </button>
  );

  const rozet = (metin: string, renk: string) => (
    <span
      style={{
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 500,
        color: renk,
        border: `1px solid ${renk}55`,
        background: `${renk}12`,
        whiteSpace: "nowrap",
      }}
    >
      {metin}
    </span>
  );

  const bilgiSatiri = (etiket: string, deger: React.ReactNode) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14.5, padding: "7px 0", borderBottom: `1px solid ${c.border}` }}>
      <span style={{ color: c.textSecondary }}>{etiket}</span>
      <span style={{ color: c.textPrimary, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{deger}</span>
    </div>
  );

  const metrik = (etiket: string, deger: string | null, ek?: { renk?: string; not?: string }) => (
    <div style={{ padding: "10px 12px", borderRadius: 10, background: c.background, minWidth: 0 }}>
      <div style={{ fontSize: 12.5, color: c.textSecondary }}>{etiket}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: deger ? ek?.renk ?? c.textPrimary : c.textSecondary, marginTop: 2 }}>
        {deger ?? "—"}
      </div>
      {ek?.not && <div style={{ fontSize: 12, color: ek.renk ?? c.textSecondary, marginTop: 2 }}>{ek.not}</div>}
    </div>
  );

  // ------------------------------------------------------------------ genel bakış

  const galeri = () => {
    const fotolar = (product.images ?? []).filter((img) => img.url);
    const secili = fotolar[seciliFoto] ?? fotolar[0];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <div
          style={{
            position: "relative",
            aspectRatio: "4 / 3",
            borderRadius: 12,
            overflow: "hidden",
            border: `1px solid ${c.border}`,
            background: secili ? c.background : coverBackground(product.coverImageUrl, product.id),
          }}
        >
          {secili ? (
            // "contain": kartta alan dar olduğu için kırpılıyordu (bkz. ProductCard);
            // burada ürünün TAMAMI görünmeli.
            <img src={secili.url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 14, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.4)" }}>{t("Henüz fotoğraf yok")}</span>
              {canManage && (
                <button type="button" onClick={() => setSekme("bilgiler")} style={{ fontSize: 13 }}>
                  {t("Fotoğraf ekle")}
                </button>
              )}
            </div>
          )}
        </div>
        {fotolar.length > 1 && (
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
            {fotolar.map((img, index) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setSeciliFoto(index)}
                aria-label={t("{n}. fotoğrafı göster", { n: index + 1 })}
                aria-pressed={index === seciliFoto}
                style={{
                  flexShrink: 0,
                  width: 64,
                  height: 48,
                  padding: 0,
                  borderRadius: 8,
                  overflow: "hidden",
                  border: `2px solid ${index === seciliFoto ? c.primary : "transparent"}`,
                  background: c.background,
                }}
              >
                <img src={img.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const genelBakis = () => {
    const fiyat = formatPara(product.price, product.currency);
    const kdvli = kdvDahilFiyat(product.price, product.taxRate);
    const marj = brutKarMarji(product.price, product.costPrice);
    const kar = birimKar(product.price, product.costPrice);
    const stok = stokDurumu(product.stockQuantity, product.minStock);
    const strateji = ozet?.strategy;
    const stratejiVerisi = strateji?.record?.data ?? {};
    const stratejiAlanlari = ["positioning", "differentiator", "targetSegment", "successMetric"]
      .map((key) => MODULE_FORM_CONFIGS[URUN_STRATEJI_MODUL_KEY]?.fields.find((f) => f.key === key))
      .filter((f): f is NonNullable<typeof f> => !!f && String(stratejiVerisi[f.key] ?? "").trim() !== "");

    const modulSayilari = new Map<string, number>();
    for (const r of ozet?.related ?? []) modulSayilari.set(r.moduleName, (modulSayilari.get(r.moduleName) ?? 0) + 1);

    const stokRengi = stok === "tukendi" ? c.danger : stok === "kritik" ? c.warning : c.success;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: genis ? "minmax(0, 1.05fr) minmax(0, 1fr)" : "minmax(0, 1fr)", gap: 18 }}>
          {galeri()}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {rozet(t(PRODUCT_STATUS_LABEL[product.status]), product.status === "active" ? c.success : c.textSecondary)}
              {!hizmet && stok === "tukendi" && rozet(t("Stok tükendi"), c.danger)}
              {!hizmet && stok === "kritik" && rozet(t("Kritik stok"), c.warning)}
            </div>

            <div>
              <div style={{ fontSize: 28, fontWeight: 500, color: fiyat ? c.textPrimary : c.textSecondary, lineHeight: 1.2 }}>
                {fiyat ?? t("Fiyat belirtilmedi")}
              </div>
              {fiyat && (
                <div style={{ fontSize: 13.5, color: c.textSecondary, marginTop: 3 }}>
                  {kdvli !== null
                    ? t("KDV hariç · KDV dahil {tutar} (%{oran})", {
                        tutar: formatPara(kdvli, product.currency) ?? "",
                        oran: String(product.taxRate ?? ""),
                      })
                    : t("KDV hariç")}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
              {metrik(t("Maliyet"), formatPara(product.costPrice, product.currency))}
              {metrik(t("Birim kâr"), formatPara(kar, product.currency), kar !== null && kar < 0 ? { renk: c.danger } : undefined)}
              {metrik(
                t("Brüt marj"),
                marj !== null ? `%${marj.toFixed(1).replace(".", ",")}` : null,
                marj !== null && marj < 0 ? { renk: c.danger } : undefined
              )}
              {!hizmet &&
                metrik(
                  t("Stok"),
                  formatMiktar(product.stockQuantity, product),
                  stok === "kritik" || stok === "tukendi"
                    ? {
                        renk: stokRengi,
                        not:
                          product.minStock !== undefined
                            ? t("Kritik seviye: {miktar}", { miktar: formatMiktar(product.minStock, product) ?? "" })
                            : undefined,
                      }
                    : undefined
                )}
              {metrik(hizmet ? t("Teslim / başlama") : t("Teslim süresi"), product.leadTime ?? null)}
              {metrik(t("Garanti"), product.warranty ?? null)}
            </div>

            {(product.sku || product.barcode || product.category || product.brand) && (
              <div>
                {product.sku && bilgiSatiri(t("Stok kodu"), product.sku)}
                {product.barcode && bilgiSatiri(t("Barkod"), product.barcode)}
                {product.category && bilgiSatiri(t("Kategori"), product.category)}
                {product.brand && bilgiSatiri(t("Marka"), product.brand)}
              </div>
            )}

            {ozet?.supplier && (
              <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${c.border}`, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontSize: 12.5, color: c.textSecondary }}>{t("Tedarikçi")}</span>
                <span style={{ fontSize: 15, color: c.textPrimary, fontWeight: 500 }}>{ozet.supplier.displayName}</span>
                <span style={{ fontSize: 13.5, color: c.textSecondary, display: "flex", flexWrap: "wrap", gap: "2px 12px" }}>
                  {ozet.supplier.phone && <a href={`tel:${ozet.supplier.phone}`} style={{ color: "inherit" }}>{ozet.supplier.phone}</a>}
                  {ozet.supplier.email && <a href={`mailto:${ozet.supplier.email}`} style={{ color: "inherit" }}>{ozet.supplier.email}</a>}
                </span>
              </div>
            )}

            {product.productUrl && (
              <a
                href={product.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14.5, color: c.accentDark, fontWeight: 500, alignSelf: "flex-start" }}
              >
                <IconExternalLink size={15} color={c.accentDark} />
                {t("Ürün sayfasını aç")}
              </a>
            )}
          </div>
        </div>

        {canManage && tamamlanan < doluluk.length && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              background: `${c.accent}14`,
              border: `1px solid ${c.accent}40`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 14.5, fontWeight: 600, color: c.textPrimary }}>
                {t("Kart {tamam}/{toplam} dolu", { tamam: tamamlanan, toplam: doluluk.length })}
              </strong>
              {baglantiDugmesi(t("Eksikleri tamamla"), () => setSekme("bilgiler"))}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {doluluk
                .filter((m) => !m.tamam)
                .map((m) => (
                  <span key={m.etiket} style={{ fontSize: 13, color: c.textSecondary, padding: "2px 8px", borderRadius: 999, background: c.surface, border: `1px solid ${c.border}` }}>
                    {t(m.etiket)}
                  </span>
                ))}
            </div>
          </div>
        )}

        {product.description &&
          kutu(
            t("Açıklama"),
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: c.textPrimary, whiteSpace: "pre-wrap" }}>{product.description}</p>
          )}

        {(product.features.length > 0 || product.specs.length > 0) && (
          <div style={{ display: "grid", gridTemplateColumns: genis && product.features.length > 0 && product.specs.length > 0 ? "1fr 1fr" : "1fr", gap: 14 }}>
            {product.features.length > 0 &&
              kutu(
                t("Öne çıkan özellikler"),
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                  {product.features.map((ozellik) => (
                    <li key={ozellik} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 15, color: c.textPrimary, lineHeight: 1.45 }}>
                      <span style={{ flexShrink: 0, marginTop: 2 }}>
                        <IconCheck size={15} color={c.success} />
                      </span>
                      <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{ozellik}</span>
                    </li>
                  ))}
                </ul>
              )}
            {product.specs.length > 0 &&
              kutu(
                t("Teknik özellikler"),
                <div>{product.specs.map((spec, i) => <div key={`${spec.label}-${i}`}>{bilgiSatiri(spec.label, spec.value)}</div>)}</div>
              )}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: genis ? "1fr 1fr" : "1fr", gap: 14 }}>
          {kutu(
            t("Strateji"),
            !strateji ? (
              <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Yükleniyor…")}</span>
            ) : !strateji.enabled ? (
              <span style={{ fontSize: 14, color: c.textSecondary }}>{t("Ürün Stratejisi modülü bu şirkette açık değil.")}</span>
            ) : stratejiAlanlari.length === 0 ? (
              <span style={{ fontSize: 14, color: c.textSecondary }}>
                {strateji.record?.draftData ? t("Strateji taslakta, henüz onaylanmadı.") : t("Bu ürün için henüz strateji yazılmadı.")}
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stratejiAlanlari.map((f) => (
                  <div key={f.key}>
                    <div style={{ fontSize: 12.5, color: c.textSecondary }}>{t(f.label)}</div>
                    <div
                      style={{
                        fontSize: 14.5,
                        color: c.textPrimary,
                        lineHeight: 1.5,
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {String(stratejiVerisi[f.key])}
                    </div>
                  </div>
                ))}
              </div>
            ),
            strateji?.enabled && strateji.access.canRead ? baglantiDugmesi(t("Stratejiyi aç"), () => setSekme("strateji")) : undefined
          )}

          {kutu(
            t("Modüllerde"),
            modulSayilari.size === 0 ? (
              <span style={{ fontSize: 14, color: c.textSecondary }}>
                {yukleniyor ? t("Yükleniyor…") : t("Bu ürün henüz tedarik, depo, kalite gibi modül kayıtlarında geçmiyor.")}
              </span>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {[...modulSayilari].map(([ad, sayi]) => (
                  <span key={ad} style={{ fontSize: 13.5, padding: "4px 10px", borderRadius: 999, background: c.background, color: c.textPrimary }}>
                    {t(ad)} · {sayi}
                  </span>
                ))}
              </div>
            ),
            modulSayilari.size > 0 ? baglantiDugmesi(t("Kayıtları gör"), () => setSekme("moduller")) : undefined
          )}
        </div>

        {product.notes &&
          kutu(
            t("İç not"),
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: c.textPrimary, whiteSpace: "pre-wrap" }}>{product.notes}</p>
          )}
      </div>
    );
  };

  // ------------------------------------------------------------------ diğer sekmeler

  const stratejiSekmesi = () => {
    const strateji = ozet?.strategy;
    const config = MODULE_FORM_CONFIGS[URUN_STRATEJI_MODUL_KEY];
    if (!strateji || !config) return <p style={{ color: c.textSecondary }}>{t("Yükleniyor…")}</p>;
    if (!strateji.enabled) {
      return (
        <div style={{ padding: 20, borderRadius: 12, border: `1px dashed ${c.border}`, color: c.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
          {t("Ürün Stratejisi modülü bu şirkette açık değil. Pazarlama departmanının modüllerinden açıldığında her ürünün stratejisi burada yazılır: konumlandırma, hedef segment, rakipler, satış kanalları ve başarı ölçütü.")}
        </div>
      );
    }
    if (!strateji.access.canRead) {
      return <p style={{ color: c.textSecondary, fontSize: 15 }}>{t("Ürün Stratejisi modülünü görme yetkin yok.")}</p>;
    }
    return (
      <ModuleFormPanel
        organizationId={organizationId}
        departmentId={strateji.departmentId}
        moduleKey={URUN_STRATEJI_MODUL_KEY}
        config={config}
        canWrite={strateji.access.canWrite}
        canApprove={strateji.access.canManageTeam}
        fixedScopeRef={product.id}
      />
    );
  };

  const modullerSekmesi = () => {
    const iliskili = ozet?.related ?? [];
    if (iliskili.length === 0) {
      return (
        <div style={{ padding: 20, borderRadius: 12, border: `1px dashed ${c.border}`, color: c.textSecondary, fontSize: 15, lineHeight: 1.6 }}>
          {yukleniyor
            ? t("Yükleniyor…")
            : t("Bu ürünün adı ya da stok kodu henüz hiçbir modül kaydında geçmiyor. Tedarik, depo, sevkiyat, kalite, reklam, satış ve destek kayıtlarında ürün adını yazdığında burada görünür.")}
        </div>
      );
    }
    const gruplar = new Map<string, typeof iliskili>();
    for (const r of iliskili) gruplar.set(r.moduleName, [...(gruplar.get(r.moduleName) ?? []), r]);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13.5, color: c.textSecondary, lineHeight: 1.5 }}>
          {t("Kayıtlar ürünün adı ya da stok kodu geçtiği için listelendi. Yalnızca görme yetkin olan modüller gösterilir.")}
        </p>
        {[...gruplar].map(([ad, kayitlar]) =>
          kutu(
            `${t(ad)} (${kayitlar.length})`,
            <div style={{ display: "flex", flexDirection: "column" }}>
              {kayitlar.map(({ record, matchedBy, moduleKey }) => {
                const config = MODULE_RECORD_CONFIGS[moduleKey];
                const baslik = config?.summary(record.data) || t("Kayıt");
                const detay = config?.detail?.(record.data);
                return (
                  <div
                    key={record.id}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "9px 0", borderBottom: `1px solid ${c.border}` }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, color: c.textPrimary, overflowWrap: "anywhere" }}>{baslik}</div>
                      {detay && <div style={{ fontSize: 13, color: c.textSecondary, marginTop: 2 }}>{detay}</div>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3, flexShrink: 0 }}>
                      <span style={{ fontSize: 12.5, color: c.textSecondary }}>
                        {new Date(record.createdAt).toLocaleDateString(bicimDili())}
                      </span>
                      <span style={{ fontSize: 11.5, color: c.textSecondary }}>
                        {matchedBy === "sku" ? t("stok kodu eşleşti") : t("ad eşleşti")}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
        {ozet?.relatedTruncated && (
          <p style={{ margin: 0, fontSize: 13.5, color: c.textSecondary }}>{t("Yalnızca en yeni kayıtlar gösteriliyor.")}</p>
        )}
      </div>
    );
  };

  return (
    <Modal
      title={product.name}
      subtitle={altBaslik}
      onClose={onClose}
      maxWidth={1100}
      mobileFullScreen
      footer={
        sekme === "bilgiler" && canManage ? (
          <button
            type="submit"
            form={FORM_ID}
            disabled={kaydediliyor}
            style={{ width: "100%", background: c.primary, color: c.onPrimary, padding: "11px 0", borderRadius: 8, border: "none", fontSize: 17, fontWeight: 500 }}
          >
            {kaydediliyor ? t("Kaydediliyor…") : t("Kaydet")}
          </button>
        ) : undefined
      }
    >
      <div
        role="tablist"
        aria-label={t("Ürün kartı bölümleri")}
        style={{ display: "flex", gap: 4, borderBottom: `1px solid ${c.border}`, marginBottom: 16, overflowX: "auto" }}
      >
        {sekmeler.map((s) => {
          const secili = s.key === sekme;
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={secili}
              onClick={() => setSekme(s.key)}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `2px solid ${secili ? c.accent : "transparent"}`,
                borderRadius: 0,
                padding: "9px 12px",
                marginBottom: -1,
                fontSize: 15,
                fontWeight: secili ? 600 : 400,
                color: secili ? c.textPrimary : c.textSecondary,
                whiteSpace: "nowrap",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {hata && <p style={{ color: c.danger, fontSize: 15, margin: "0 0 12px" }}>{hata}</p>}

      {sekme === "genel" && genelBakis()}

      {sekme === "bilgiler" && canManage && (
        <>
          <ProductForm
            key={`${product.id}-${formSurumu}`}
            formId={FORM_ID}
            organizationId={organizationId}
            departmentId={product.departmentId}
            product={product}
            onBusyChange={setKaydediliyor}
            onImagesChanged={(guncel) => {
              setOzet((o) => (o ? { ...o, product: guncel } : o));
              onChanged();
            }}
            onSaved={() => {
              void yukle().then(() => {
                setFormSurumu((n) => n + 1);
                setSekme("genel");
              });
              onChanged();
            }}
          />
          <EntityDangerZone
            entityLabel={t("Ürün/Hizmeti", { ctx: "nesne" })}
            resourcePath={`/products/${product.id}`}
            onArchive={async () => {
              await api.patch(`/products/${product.id}/archive`, {});
              onArchived();
            }}
            // DELETE isteğini EntityDangerZone geciktirmeli olarak atar (bkz.
            // resourcePath); burada yalnızca silme sonrası arayüz davranışı kalır.
            onDelete={async () => onDeleted()}
            archiveMessage={t("\"{name}\" ürün/hizmetini arşive eklemek istediğine emin misin?", { name: product.name })}
            deleteMessage={t("\"{name}\" ürün/hizmetini silmek istediğine emin misin? Bu işlem geri alınamaz.", { name: product.name })}
          />
        </>
      )}

      {sekme === "strateji" && stratejiSekmesi()}
      {sekme === "moduller" && modullerSekmesi()}
    </Modal>
  );
}
