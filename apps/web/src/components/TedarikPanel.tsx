import { useEffect, useMemo, useState } from "react";
import { TEDARIK_MODUL_KEY, type ModuleRecord, type Party, type ProjectFile } from "@projelio/shared";
import { api } from "../api/client";
import { filesApi } from "../api/files";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { useCanliTazele } from "../lib/liveRoom";
import { listeCercevesi, listeSatiri } from "../lib/listeStili";
import type { ModuleRecordConfig } from "../lib/moduleRecordConfigs";
import ModuleRecordsPanel from "./ModuleRecordsPanel";
import { BaglantiKartiModal, SatirSimgeleri } from "./CustomersPanel";
import EpostaGonderSecimi from "./EpostaGonderSecimi";
import FilePreviewModal from "./FilePreviewModal";
import { IconPlus, IconSend } from "./icons";

/** Talep formundaki tedarikçi alanı (bkz. shared moduleConfigs/operasyon.ts procurementConfig). */
const TEDARIKCI_ALANI = "supplierName";
/** "Talep edildi" ve "Sipariş verildi" — teslim alınmamış talep. */
const ACIK_DURUMLAR = new Set(["requested", "ordered"]);

/**
 * Tedarik modülü: Tedarikçiler + Talepler (kayıt listesi).
 *
 * Tedarikçiler Tedarik defterinde (party.modules 'oud_tedarik', 2026-10-12);
 * eskiden Müşteriler defterine `supplier` rolüyle giriyorlardı, o eski kartlar
 * da rolleri sayesinde burada listelenir (liste ucu iki defteri birlikte döner).
 * Sahte bir talep kaydı açmak yerine kartlar burada listelenir.
 *
 * Modül Tedarikçiler'de açılır: kullanıcı çoğunlukla "kime yazacağım" diye
 * gelir; satırdaki "Talep oluştur" Talepler'e geçip formu tedarikçi seçili açar.
 */
export default function TedarikPanel(props: {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  moduleKey: string;
  config: ModuleRecordConfig;
  canWrite: boolean;
}) {
  const c = useThemeColors();
  const t = useT();
  const [sekme, setSekme] = useState<"tedarikciler" | "talepler">("tedarikciler");
  // Talepler'e "şu tedarikçiye talep aç" isteği. Tedarikçiler'e dönünce
  // silinir: yoksa Talepler'e her dönüşte (panel yeniden kurulur) form yine açılırdı.
  const [taslak, setTaslak] = useState<{ data: Record<string, string>; anahtar: number } | undefined>();

  const sekmeyeGec = (s: "tedarikciler" | "talepler") => {
    if (s === "tedarikciler") setTaslak(undefined);
    setSekme(s);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {(["tedarikciler", "talepler"] as const).map((s) => (
          <button
            key={s}
            onClick={() => sekmeyeGec(s)}
            style={{
              fontSize: 13,
              padding: "5px 12px",
              borderRadius: 8,
              border: `1px solid ${sekme === s ? c.primary : c.border}`,
              background: sekme === s ? c.primary : "transparent",
              color: sekme === s ? c.onPrimary : c.textSecondary,
              cursor: "pointer",
            }}
          >
            {s === "talepler" ? t("Talepler") : t("Tedarikçiler")}
          </button>
        ))}
      </div>
      {sekme === "talepler" ? (
        <ModuleRecordsPanel {...props} onceDoldur={taslak} />
      ) : (
        <TedarikciListesi
          organizationId={props.organizationId}
          departmentId={props.departmentId}
          jobId={props.jobId}
          moduleKey={props.moduleKey}
          canWrite={props.canWrite}
          onTalepOlustur={(p) => {
            setTaslak({ data: { [TEDARIKCI_ALANI]: p.id }, anahtar: Date.now() });
            setSekme("talepler");
          }}
        />
      )}
    </div>
  );
}

/** Bir tedarikçinin talep özeti: açık talep sayısı ve en yeni açık talep (e-posta taslağı için). */
interface TalepOzeti {
  acik: number;
  toplam: number;
  sonAcik?: Record<string, unknown>;
}

function basHarfler(ad: string): string {
  return ad
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toLocaleUpperCase("tr"))
    .join("");
}

/**
 * Talep e-postasının konusu ve gövdesi. Açık bir talep varsa kalemleri ondan
 * doldurulur; yoksa boş bir şablon — kullanıcı yalnızca boşlukları doldurur.
 * Kullanıcının göreceği metin olduğu için Türkçe sabit; t() ile çevrilir.
 */
function talepEpostasi(p: Party, ozet: TalepOzeti | undefined, t: ReturnType<typeof useT>) {
  const d = ozet?.sonAcik;
  const kalem = (d?.itemName as string | undefined)?.trim() ?? "";
  const miktar = d?.quantity != null && d.quantity !== "" ? String(d.quantity) : "";
  const tarih = (d?.expectedDate as string | undefined) ?? "";
  const konu = kalem ? t("Fiyat ve teslim talebi: {kalem}", { kalem }) : t("Fiyat ve teslim talebi");
  const metin = [
    t("Merhaba {ad},", { ad: p.displayName }),
    "",
    t("Aşağıdaki ürün/hizmet için fiyat ve teslim süresi bilgisi rica ederiz:"),
    "",
    `- ${t("Ürün / Hizmet")}: ${kalem}`,
    `- ${t("Miktar")}: ${miktar}`,
    `- ${t("İstenen teslim tarihi")}: ${tarih}`,
    "",
    t("Teşekkürler, iyi çalışmalar."),
  ].join("\n");
  return { konu, metin };
}

function TedarikciListesi({
  organizationId,
  departmentId,
  jobId,
  moduleKey,
  canWrite,
  onTalepOlustur,
}: {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  moduleKey: string;
  canWrite: boolean;
  onTalepOlustur: (p: Party) => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [kartlar, setKartlar] = useState<Party[] | null>(null);
  const [talepler, setTalepler] = useState<ModuleRecord[]>([]);
  const [arama, setArama] = useState("");
  const [yeniAd, setYeniAd] = useState("");
  const [ekleniyor, setEkleniyor] = useState(false);
  const [hata, setHata] = useState("");
  const [acik, setAcik] = useState<string | null>(null);
  const [eposta, setEposta] = useState<{ p: Party; konu: string; metin: string } | null>(null);
  const [onizlenen, setOnizlenen] = useState<ProjectFile | null>(null);

  const kok = jobId ? `/jobs/${jobId}` : `/organizations/${organizationId}`;
  const yol = `${kok}/party`;
  const yukle = () => {
    api
      .get<Party[]>(`${yol}?role=supplier&ozet=1`)
      .then(setKartlar)
      .catch(() => setKartlar([]));
    // Talep sayıları bir kolaylık: okunamazsa liste yine açılır.
    api
      .get<ModuleRecord[]>(`${kok}/module-records?moduleKey=${encodeURIComponent(moduleKey)}`)
      .then(setTalepler)
      .catch(() => setTalepler([]));
  };
  useEffect(yukle, [kok, moduleKey]);
  useCanliTazele(yukle, [kok, moduleKey]);

  const ozetler = useMemo(() => {
    const m = new Map<string, TalepOzeti>();
    // En yeni talep önce: sonAcik ilk rastlanan açık talep olur.
    const sirali = [...talepler].filter((r) => !r.archivedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    for (const r of sirali) {
      const id = r.data[TEDARIKCI_ALANI];
      if (typeof id !== "string") continue;
      const o = m.get(id) ?? { acik: 0, toplam: 0 };
      o.toplam++;
      if (ACIK_DURUMLAR.has(String(r.data.status ?? "requested"))) {
        o.acik++;
        o.sonAcik ??= r.data;
      }
      m.set(id, o);
    }
    return m;
  }, [talepler]);

  const gorunen = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    const liste = (kartlar ?? []).filter((p) => !p.archivedAt);
    const suzulen = q
      ? liste.filter((p) =>
          [p.displayName, p.legalName, p.kurum, p.email, p.phone].filter(Boolean).join(" ").toLocaleLowerCase("tr").includes(q)
        )
      : liste;
    return [...suzulen].sort((a, b) => a.displayName.localeCompare(b.displayName, "tr"));
  }, [kartlar, arama]);

  const toplamAcik = useMemo(() => {
    let n = 0;
    for (const p of kartlar ?? []) n += ozetler.get(p.id)?.acik ?? 0;
    return n;
  }, [kartlar, ozetler]);

  // Talep formundaki seçicinin "yeni oluştur"u ile aynı: kart Tedarik
  // defterine tedarikçi rolüyle açılır.
  const ekle = async () => {
    const ad = yeniAd.trim();
    if (!ad) return;
    setEkleniyor(true);
    setHata("");
    try {
      await api.post(yol, {
        displayName: ad,
        partyType: "company",
        roles: ["supplier"],
        modul: TEDARIK_MODUL_KEY,
        ...(jobId ? {} : { departmentId }),
      });
      setYeniAd("");
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Tedarikçi eklenemedi"));
    } finally {
      setEkleniyor(false);
    }
  };

  const dosyaAc = (fileId: string) => {
    filesApi
      .getById(fileId)
      .then(setOnizlenen)
      .catch((err) => setHata(err instanceof Error ? err.message : t("Dosya açılamadı")));
  };

  const giris = {
    fontSize: 13,
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
  } as const;
  const eylem = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${c.border}`,
    background: "transparent",
    color: c.textPrimary,
    cursor: "pointer",
    whiteSpace: "nowrap",
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {kartlar !== null && kartlar.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: c.textSecondary }}>
            {t("{n} tedarikçi", { n: kartlar.filter((p) => !p.archivedAt).length })}
            {toplamAcik > 0 && (
              <>
                {" · "}
                <span style={{ color: c.warning }}>{t("{n} açık talep", { n: toplamAcik })}</span>
              </>
            )}
          </span>
          <input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder={t("Tedarikçi ara…")}
            style={{ ...giris, flex: "1 1 180px", marginLeft: "auto", maxWidth: 320 }}
          />
        </div>
      )}
      {canWrite && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input
            value={yeniAd}
            onChange={(e) => setYeniAd(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && ekle()}
            placeholder={t("Tedarikçi adı")}
            style={{ ...giris, flex: "1 1 200px" }}
          />
          <button
            onClick={ekle}
            disabled={ekleniyor || !yeniAd.trim()}
            style={{ fontSize: 13, padding: "6px 12px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer", opacity: ekleniyor || !yeniAd.trim() ? 0.6 : 1 }}
          >
            {t("+ Tedarikçi ekle")}
          </button>
        </div>
      )}
      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
      {kartlar === null ? (
        <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>
      ) : gorunen.length === 0 ? (
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          {arama
            ? t("Eşleşen tedarikçi yok.")
            : t("Henüz tedarikçi yok. Bağlantı ve İlişkiler'den \"Tedarikçi yap\" ile ya da buradan ekleyebilirsin.")}
        </span>
      ) : (
        <div style={listeCercevesi(c)}>
          {gorunen.map((p, i) => {
            const ozet = ozetler.get(p.id);
            const adres = p.email?.trim();
            const altSatir = [p.partyType === "person" ? p.kurum : p.legalName !== p.displayName ? p.legalName : undefined, p.phone, adres]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={p.id}
                style={{ ...listeSatiri(c, i), display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setAcik(p.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "transparent", border: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
                  >
                    <span
                      aria-hidden
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: "50%",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 13,
                        fontWeight: 600,
                        background: `${c.accent}26`,
                        color: c.accentDark,
                      }}
                    >
                      {basHarfler(p.displayName)}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: c.textPrimary }}>{p.displayName}</span>
                        {ozet && ozet.acik > 0 && (
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, color: c.warning, border: `1px solid ${c.warning}55` }}>
                            {t("{n} açık talep", { n: ozet.acik })}
                          </span>
                        )}
                        {ozet && ozet.acik === 0 && ozet.toplam > 0 && (
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, color: c.textSecondary, border: `1px solid ${c.border}` }}>
                            {t("{n} talep", { n: ozet.toplam })}
                          </span>
                        )}
                      </span>
                      {altSatir && (
                        <span style={{ fontSize: 12, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {altSatir}
                        </span>
                      )}
                    </span>
                  </button>
                  <SatirSimgeleri party={p} onDosya={dosyaAc} onKisiler={() => setAcik(p.id)} />
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingLeft: 44 }}>
                  {adres ? (
                    <button
                      type="button"
                      onClick={() => setEposta({ p, ...talepEpostasi(p, ozet, t) })}
                      title={t("Fiyat/teslim talebi hazır metinle açılır; nereden gönderileceğini seçersin.")}
                      style={{ ...eylem, borderColor: c.accent }}
                    >
                      <IconSend size={13} /> {t("Talep e-postası")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAcik(p.id)}
                      title={t("Kartta e-posta adresi yok")}
                      style={{ ...eylem, color: c.textSecondary }}
                    >
                      {t("E-posta adresi ekle")}
                    </button>
                  )}
                  {canWrite && (
                    <button type="button" onClick={() => onTalepOlustur(p)} style={eylem}>
                      <IconPlus size={13} /> {t("Talep oluştur")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {eposta && (
        <EpostaGonderSecimi
          to={eposta.p.email!.trim()}
          ad={eposta.p.displayName}
          konu={eposta.konu}
          metin={eposta.metin}
          onClose={() => setEposta(null)}
        />
      )}
      {onizlenen && <FilePreviewModal file={onizlenen} onClose={() => setOnizlenen(null)} />}
      {acik && (
        <BaglantiKartiModal
          partyId={acik}
          onClose={() => {
            setAcik(null);
            yukle();
          }}
        />
      )}
    </div>
  );
}
