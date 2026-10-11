import { useEffect, useMemo, useState } from "react";
import type { Party } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { useCanliTazele } from "../lib/liveRoom";
import { listeCercevesi, listeSatiri } from "../lib/listeStili";
import type { ModuleRecordConfig } from "../lib/moduleRecordConfigs";
import ModuleRecordsPanel from "./ModuleRecordsPanel";
import { BaglantiKartiModal } from "./CustomersPanel";

/**
 * Tedarik modülü: Talepler (kayıt listesi) + Tedarikçiler.
 *
 * Tedarikçinin ayrı bir defteri yok — kart Müşteriler defterinde `supplier`
 * rolüyle durur (bkz. backend party/aktarim.ts). Bağlantılar'dan "Tedarikçi
 * yap" denen kart bu yüzden Tedarik'te hiçbir yerde görünmüyordu, yalnızca
 * talep formunun seçicisinde çıkıyordu (kullanıcı şikâyeti, 2026-10-11).
 * Sahte bir talep kaydı açmak yerine aynı kartlar burada listelenir.
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
  const [sekme, setSekme] = useState<"talepler" | "tedarikciler">("talepler");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {(["talepler", "tedarikciler"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSekme(s)}
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
        <ModuleRecordsPanel {...props} />
      ) : (
        <TedarikciListesi organizationId={props.organizationId} departmentId={props.departmentId} jobId={props.jobId} canWrite={props.canWrite} />
      )}
    </div>
  );
}

function TedarikciListesi({
  organizationId,
  departmentId,
  jobId,
  canWrite,
}: {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  canWrite: boolean;
}) {
  const c = useThemeColors();
  const t = useT();
  const [kartlar, setKartlar] = useState<Party[] | null>(null);
  const [arama, setArama] = useState("");
  const [yeniAd, setYeniAd] = useState("");
  const [ekleniyor, setEkleniyor] = useState(false);
  const [hata, setHata] = useState("");
  const [acik, setAcik] = useState<string | null>(null);

  const yol = jobId ? `/jobs/${jobId}/party` : `/organizations/${organizationId}/party`;
  const yukle = () => {
    api
      .get<Party[]>(`${yol}?role=supplier`)
      .then(setKartlar)
      .catch(() => setKartlar([]));
  };
  useEffect(yukle, [yol]);
  useCanliTazele(yukle, [yol]);

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

  // Talep formundaki seçicinin "yeni oluştur"u ile aynı: kart Müşteriler
  // defterine tedarikçi rolüyle açılır.
  const ekle = async () => {
    const ad = yeniAd.trim();
    if (!ad) return;
    setEkleniyor(true);
    setHata("");
    try {
      await api.post(yol, { displayName: ad, partyType: "company", roles: ["supplier"], ...(jobId ? {} : { departmentId }) });
      setYeniAd("");
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Tedarikçi eklenemedi"));
    } finally {
      setEkleniyor(false);
    }
  };

  const giris = {
    fontSize: 13,
    padding: "6px 8px",
    borderRadius: 6,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
  } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
      {(kartlar?.length ?? 0) > 8 && (
        <input value={arama} onChange={(e) => setArama(e.target.value)} placeholder={t("Ara…")} style={giris} />
      )}
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
          {gorunen.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setAcik(p.id)}
              style={{
                ...listeSatiri(c, i),
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                padding: "8px 12px",
                border: "none",
                borderTop: listeSatiri(c, i).borderTop,
                textAlign: "left",
                cursor: "pointer",
                color: c.textPrimary,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>{p.displayName}</span>
              {(p.phone || p.email || p.kurum) && (
                <span style={{ fontSize: 12, color: c.textSecondary }}>
                  {[p.partyType === "person" ? p.kurum : undefined, p.phone, p.email].filter(Boolean).join(" · ")}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
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
