import { useEffect, useMemo, useState } from "react";
import type { ModuleMember, ServiceAccount, ServiceAccountCategory, ServiceAccountList } from "@projelio/shared";
import { RECURRENCE_INTERVAL_LABEL, SERVICE_ACCOUNT_CATEGORIES, aylikToplamlar } from "@projelio/shared";
import { api } from "../../api/client";
import { hesaplarApi, kapsamYolu, type HesapKapsami } from "../../api/hesaplar";
import { useT } from "../../lib/i18n";
import {
  HESAPLAR_MODULE_KEY,
  HESAP_GIRIS_YONTEMLERI,
  HESAP_KATEGORILERI,
  HESAP_YETKI_GEREKCESI,
  hesapAdresi,
} from "../../lib/hesaplar";
import { sekmeleriAc } from "../../lib/topluLink";
import { useThemeColors } from "../../theme/useThemeColors";
import HesapKimlikModal from "./HesapKimlikModal";
import HesapModal from "./HesapModal";
import HesapPaylasModal from "./HesapPaylasModal";

interface Props {
  organizationId?: string;
  departmentId?: string;
  jobId?: string;
  canWrite?: boolean;
}

function paraYaz(tutar: number, birim: string): string {
  return `${tutar.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ${birim}`;
}

/**
 * Hesaplar modülü — üye olunan hesaplar tek listede.
 *
 * ÜÇ İŞİ BİR ARADA YAPIYOR ve üçü de aynı listeden okunuyor:
 *   Erişim   hangi hesaba kim girebiliyor, şifresi girilmiş mi
 *   Gider    hangi hesap ücretli, aylık yük ne kadar
 *   Adres    giriş sayfaları — tek düğmeyle hepsi açılıyor
 *
 * SIR LİSTEDE YOK: satırda yalnızca "şu kadar giriş kaydı var" yazıyor. Şifre
 * ayrı bir modalde, kilit açıldıktan sonra ve her gösterim kaydedilerek
 * gösteriliyor (bkz. HesapKimlikModal).
 *
 * Sunucu tarafı: backend/src/modules/hesaplar/
 */
export default function HesaplarPanel({ organizationId, departmentId, jobId, canWrite = true }: Props) {
  const c = useThemeColors();
  const t = useT();

  const kapsam: HesapKapsami = useMemo(
    () => (jobId ? { jobId } : { organizationId: organizationId as string, departmentId }),
    [jobId, organizationId, departmentId]
  );

  const [veri, setVeri] = useState<ServiceAccountList | null>(null);
  const [uyeler, setUyeler] = useState<{ id: string; label: string }[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");

  const [arama, setArama] = useState("");
  const [kategori, setKategori] = useState<ServiceAccountCategory | "">("");

  const [hesapModali, setHesapModali] = useState<{ hesap?: ServiceAccount | null } | null>(null);
  const [kimlikIcin, setKimlikIcin] = useState<ServiceAccount | null>(null);
  const [paylasimIcin, setPaylasimIcin] = useState<{ hesap?: ServiceAccount | null } | null>(null);
  /**
   * Açılamayan adresler. Doluysa liste gösteriliyor ve kullanıcı tek tek
   * açıyor: tarayıcı açılır pencere iznini tek tıklamada yalnızca bir sekme
   * için veriyor (bkz. lib/topluLink.ts).
   */
  const [engellenenler, setEngellenenler] = useState<{ hesap: ServiceAccount; url: string }[]>([]);

  const yukle = () => {
    setYukleniyor(true);
    const { taban } = kapsamYolu(kapsam);
    const uyeSorgu = `?moduleKey=${HESAPLAR_MODULE_KEY}${
      !("jobId" in kapsam) && kapsam.departmentId ? `&departmentId=${kapsam.departmentId}` : ""
    }`;
    Promise.all([
      hesaplarApi.liste(kapsam),
      api.get<ModuleMember[]>(`${taban}/module-members${uyeSorgu}`).catch(() => [] as ModuleMember[]),
    ])
      .then(([liste, ekip]) => {
        setVeri(liste);
        setUyeler(
          ekip
            .filter((m) => m.userId && m.status === "approved")
            .map((m) => ({ id: m.userId as string, label: m.fullName || m.email || m.username || "—" }))
        );
        setHata("");
      })
      .catch((err) => setHata(err instanceof Error ? err.message : t("Hesaplar yüklenemedi")))
      .finally(() => setYukleniyor(false));
  };

  useEffect(yukle, [organizationId, departmentId, jobId]);

  const hesaplar = veri?.accounts ?? [];

  const suzulmus = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase("tr");
    return hesaplar.filter((h) => {
      if (kategori && h.category !== kategori) return false;
      if (!q) return true;
      return [h.name, h.plan, h.url, h.ownerName].some((alan) =>
        (alan ?? "").toLocaleLowerCase("tr").includes(q)
      );
    });
  }, [hesaplar, arama, kategori]);

  /** Adresi olan hesaplar — toplu açma düğmesi bunları açıyor. */
  const acilabilir = useMemo(
    () =>
      suzulmus
        .map((hesap) => ({ hesap, url: hesapAdresi(hesap) }))
        .filter((x): x is { hesap: ServiceAccount; url: string } => x.url !== null),
    [suzulmus]
  );

  const toplamlar = useMemo(() => aylikToplamlar(hesaplar), [hesaplar]);

  const topluAc = () => {
    setEngellenenler(sekmeleriAc(acilabilir.map((x) => x.url)) ? [] : acilabilir);
  };

  const sil = async (hesap: ServiceAccount) => {
    if (
      !window.confirm(
        t("“{ad}” hesabı ve kayıtlı tüm giriş bilgileri silinsin mi? Geri getirilemez.", { ad: hesap.name })
      )
    ) {
      return;
    }
    try {
      await hesaplarApi.sil(hesap.id);
      yukle();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Hesap silinemedi"));
    }
  };

  const hayalet = {
    fontSize: 12,
    background: "transparent",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: "4px 10px",
    cursor: "pointer",
    color: c.textSecondary,
  } as const;

  const yonetici = veri?.canManage ?? false;
  const yazabilir = (veri?.canCreate ?? canWrite) && canWrite;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* ------------------------------------------------------------ Özet */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          {t("{n} hesap", { n: hesaplar.length })}
          {toplamlar.length > 0 && (
            <>
              {" · "}
              {t("aylık")} {toplamlar.map((x) => paraYaz(x.amount, x.currency)).join(" + ")}
            </>
          )}
          {veri?.budgetScopeName && ` · ${t("kasa: {kasa}", { kasa: veri.budgetScopeName })}`}
        </span>

        <div style={{ flex: 1 }} />

        <input
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          placeholder={t("Ara")}
          style={{ fontSize: 13, padding: "6px 8px", minWidth: 140 }}
        />
        <select
          value={kategori}
          onChange={(e) => setKategori(e.target.value as ServiceAccountCategory | "")}
          style={{ fontSize: 13, padding: "6px 8px" }}
        >
          <option value="">{t("Tüm kategoriler")}</option>
          {SERVICE_ACCOUNT_CATEGORIES.map((k) => (
            <option key={k} value={k}>
              {t(HESAP_KATEGORILERI[k].label)}
            </option>
          ))}
        </select>

        {acilabilir.length > 0 && (
          <button onClick={topluAc} style={hayalet} title={t("Adresi olan hesapların giriş sayfalarını açar")}>
            {t("Giriş adreslerini aç ({n})", { n: acilabilir.length })}
          </button>
        )}

        {yonetici && (
          <button onClick={() => setPaylasimIcin({ hesap: null })} style={hayalet}>
            {t("Tümünü paylaş")}
            {veri?.scopeGrants.filter((g) => g.active).length
              ? ` · ${veri.scopeGrants.filter((g) => g.active).length}`
              : ""}
          </button>
        )}

        {yazabilir && (
          <button
            onClick={() => setHesapModali({ hesap: null })}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              background: c.primary,
              color: c.onPrimary,
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            + {t("Hesap ekle")}
          </button>
        )}
      </div>

      {veri && !veri.cryptoReady && (
        <span style={{ fontSize: 12, color: c.danger }}>
          {t("Sunucuda şifreleme anahtarı tanımlı değil: giriş bilgileri kaydedilemez. Sistem yöneticinize bildirin.")}
        </span>
      )}

      {/* Açılamayan adresler — kullanıcı tek tek açıyor. */}
      {engellenenler.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "10px 12px",
            border: `1px solid ${c.border}`,
            borderRadius: 10,
            background: c.background,
          }}
        >
          <span style={{ fontSize: 12, color: c.textSecondary }}>
            {t("Tarayıcı sekmeleri engelledi. Adresleri tek tek açabilirsiniz ya da bu siteye açılır pencere izni verebilirsiniz.")}
          </span>
          {engellenenler.map(({ hesap, url }) => (
            <a
              key={hesap.id}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              style={{ fontSize: 13, color: c.primary }}
            >
              {hesap.name}
            </a>
          ))}
          <button onClick={() => setEngellenenler([])} style={{ ...hayalet, alignSelf: "flex-start" }}>
            {t("Kapat")}
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------ Liste */}
      {yukleniyor && <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Yükleniyor…")}</span>}

      {!yukleniyor && suzulmus.length === 0 && (
        <span style={{ fontSize: 13, color: c.textSecondary }}>
          {hesaplar.length === 0
            ? t("Henüz hesap eklenmemiş. Üye olduğunuz yazılım, bulut, banka ve kurum hesaplarını buraya ekleyin.")
            : t("Süzgece uyan hesap yok.")}
        </span>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {suzulmus.map((hesap) => {
          const adres = hesapAdresi(hesap);
          return (
            <div
              key={hesap.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "10px 12px",
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 11,
                    color: HESAP_KATEGORILERI[hesap.category].color,
                    border: `1px solid ${HESAP_KATEGORILERI[hesap.category].color}55`,
                    borderRadius: 6,
                    padding: "1px 6px",
                  }}
                >
                  {t(HESAP_KATEGORILERI[hesap.category].label)}
                </span>
                <span style={{ fontSize: 14, color: c.textPrimary, fontWeight: 500 }}>{hesap.name}</span>
                {hesap.isPaid && hesap.amount && hesap.billingInterval && (
                  <span style={{ fontSize: 12, color: c.accent }}>
                    {paraYaz(hesap.amount, hesap.currency)} · {t(RECURRENCE_INTERVAL_LABEL[hesap.billingInterval])}
                  </span>
                )}
                <div style={{ flex: 1 }} />
                {adres && (
                  <a href={adres} target="_blank" rel="noreferrer noopener" style={{ ...hayalet, textDecoration: "none" }}>
                    {t("Aç")}
                  </a>
                )}
                <button onClick={() => setKimlikIcin(hesap)} style={hayalet}>
                  {t("Giriş bilgileri")}
                  {hesap.credentialCount ? ` · ${hesap.credentialCount}` : ""}
                </button>
                {yonetici && (
                  <button onClick={() => setPaylasimIcin({ hesap })} style={hayalet}>
                    {t("Paylaş")}
                    {hesap.grantCount ? ` · ${hesap.grantCount}` : ""}
                  </button>
                )}
                {yazabilir && (
                  <>
                    <button onClick={() => setHesapModali({ hesap })} style={hayalet}>
                      {t("Düzenle")}
                    </button>
                    <button onClick={() => sil(hesap)} style={{ ...hayalet, color: c.danger }}>
                      {t("Sil")}
                    </button>
                  </>
                )}
              </div>

              <span style={{ fontSize: 12, color: c.textSecondary }}>
                {[
                  t(HESAP_GIRIS_YONTEMLERI[hesap.loginMethod].label),
                  hesap.plan,
                  hesap.ownerName ? t("Sorumlu: {kisi}", { kisi: hesap.ownerName }) : null,
                  hesap.credentialCount === 0 ? t("giriş bilgisi girilmemiş") : null,
                  hesap.isPaid && hesap.nextDueDate
                    ? t("sıradaki ödeme {tarih}", {
                        tarih: new Date(hesap.nextDueDate).toLocaleDateString("tr-TR", { dateStyle: "medium" }),
                      })
                    : null,
                  hesap.isPaid && !hesap.recurringPaymentId ? t("kasaya bağlı değil") : null,
                  hesap.revealReason && hesap.revealReason !== "admin"
                    ? t(HESAP_YETKI_GEREKCESI[hesap.revealReason])
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>

              {hesap.note && <span style={{ fontSize: 12, color: c.textSecondary }}>{hesap.note}</span>}
            </div>
          );
        })}
      </div>

      {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}

      {hesapModali && (
        <HesapModal
          kapsam={kapsam}
          hesap={hesapModali.hesap}
          kasaAdi={veri?.budgetScopeName}
          kasaYetkisi={veri?.canManageBudget ?? false}
          uyeler={uyeler}
          onClose={() => setHesapModali(null)}
          onKaydedildi={yukle}
        />
      )}

      {kimlikIcin && (
        <HesapKimlikModal
          hesap={kimlikIcin}
          canManage={yonetici}
          canWrite={yazabilir}
          onClose={() => setKimlikIcin(null)}
          onDegisti={yukle}
        />
      )}

      {paylasimIcin && (
        <HesapPaylasModal
          kapsam={kapsam}
          hesap={paylasimIcin.hesap}
          uyeler={uyeler}
          onClose={() => setPaylasimIcin(null)}
          onDegisti={yukle}
        />
      )}
    </div>
  );
}
