import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DepartmanGecisiDurumu, EkipHesabi, EkipHesabiSecenekleri } from "@projelio/shared";
import { gecisSeciminiDogrula, KUCUK_SIRKET_SINIRI } from "@projelio/shared";
import { api } from "../api/client";
import { ekipHesaplariApi } from "../api/ekipHesaplari";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { departmanAdi } from "../lib/departmanAdi";
import { notifySidebarChanged } from "../lib/sidebarEvents";
import Modal from "./Modal";
import EkipHesabiModal from "./ekipHesaplari/EkipHesabiModal";

/**
 * Mevcut şirketlerin departman kuralına BİR KERELİK geçişi (migration 173,
 * backend modules/departman-gecisi).
 *
 * Kural öncesi kurulan her şirketin sahibine çıkar: kuralı anlatır, ekip
 * büyüklüğüne göre hangi departmanları tutacağını sorar. Tutulmayanların
 * kişileri, görevleri, dosyaları ve modül kayıtları Yönetim departmanına
 * taşınır, departman SİLİNİR (kullanıcı kararı, 2026-11-01).
 *
 * "Ekibe kişi ekleyeceğim" Ekip Hesapları formunu açar: kişi eklendikçe
 * tutulabilecek departman sayısı artar, pencere yeni sayıyla geri gelir.
 * "Daha sonra" yalnızca bu oturumda kapatır — geçiş tamamlanana kadar bir
 * sonraki girişte yine çıkar.
 */

type Adim = "secim" | "onay" | "kisi" | "bitti";

export default function DepartmanGecisiModal() {
  const c = useThemeColors();
  const t = useT();
  const navigate = useNavigate();
  const [bekleyen, setBekleyen] = useState<{ organizationId: string; name: string }[] | null>(null);
  const [durum, setDurum] = useState<DepartmanGecisiDurumu | null>(null);
  const [tutulan, setTutulan] = useState<Set<string>>(new Set());
  const [adim, setAdim] = useState<Adim>("secim");
  const [kapali, setKapali] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [secenekler, setSecenekler] = useState<EkipHesabiSecenekleri | null>(null);
  const [sonAcilan, setSonAcilan] = useState<{ hesap: EkipHesabi; sifre: string; epostaGonderildi: boolean } | null>(null);
  const [sonuc, setSonuc] = useState<{ silinen: number; bulutKalan: number } | null>(null);

  useEffect(() => {
    api
      .get<{ organizationId: string; name: string }[]>("/departman-gecisi/bekleyenler")
      .then(setBekleyen)
      .catch(() => setBekleyen([]));
  }, []);

  const orgId = bekleyen?.[0]?.organizationId;

  /** Durumu yükler; ilk yüklemede kişisi olan departmanlar sınır kadar seçili gelir. */
  const yukle = useCallback(
    (onSecim: boolean) => {
      if (!orgId) return;
      api
        .get<DepartmanGecisiDurumu>(`/organizations/${orgId}/departman-gecisi`)
        .then((d) => {
          setDurum(d);
          setTutulan((onceki) => {
            const kisili = [...d.departmanlar].filter((x) => x.kisiSayisi > 0).sort((a, b) => b.kisiSayisi - a.kisiSayisi);
            const kalan = onSecim
              ? kisili
              : kisili.filter((x) => onceki.has(x.id));
            return new Set(kalan.slice(0, d.sinir ?? kalan.length).map((x) => x.id));
          });
        })
        .catch(() => setDurum(null));
    },
    [orgId]
  );

  useEffect(() => {
    setAdim("secim");
    setSonuc(null);
    yukle(true);
  }, [yukle]);

  if (kapali || !orgId || !durum) return null;

  const tutulanDizi = [...tutulan];
  const hata = gecisSeciminiDogrula(durum, tutulanDizi);
  const doldu = durum.sinir !== null && tutulan.size >= durum.sinir;
  const silinecek = durum.departmanlar.filter((d) => !tutulan.has(d.id));

  const degistir = (id: string, secili: boolean) =>
    setTutulan((o) => {
      const yeni = new Set(o);
      if (secili) yeni.add(id);
      else yeni.delete(id);
      return yeni;
    });

  const kisiEkle = async () => {
    setError("");
    try {
      setSecenekler(await ekipHesaplariApi.secenekler(orgId));
      setAdim("kisi");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Ekip Hesapları açılamadı."));
    }
  };

  const uygula = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.post<{ silinen: number; bulut: { tasinan: number; kalan: number } }>(
        `/organizations/${orgId}/departman-gecisi`,
        { tutulan: tutulanDizi }
      );
      setSonuc({ silinen: r.silinen, bulutKalan: r.bulut.kalan });
      setAdim("bitti");
      notifySidebarChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Geçiş tamamlanamadı; hiçbir departman silinmedi. Tekrar dene."));
    } finally {
      setBusy(false);
    }
  };

  const bitir = () => {
    const id = orgId;
    setBekleyen((b) => (b ? b.slice(1) : b));
    setDurum(null);
    // Silinen departmanların sayfası açık kalmasın: şirketin anasayfasına.
    navigate(`/organizations/${id}`);
  };

  const dugme = (birincil: boolean) => ({
    padding: "10px 14px",
    borderRadius: 8,
    border: birincil ? "none" : `1px solid ${c.border}`,
    background: birincil ? c.primary : "transparent",
    color: birincil ? c.onPrimary : c.textPrimary,
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  });
  const metin = { fontSize: 14, color: c.textPrimary, margin: 0, lineHeight: 1.55 } as const;
  const ikincil = { fontSize: 13, color: c.textSecondary, margin: 0, lineHeight: 1.5 } as const;

  if (adim === "kisi" && secenekler) {
    return (
      <EkipHesabiModal
        kapsam={{ organizationId: orgId, secenekler }}
        onClose={() => {
          setAdim("secim");
          yukle(false);
        }}
        onAcildi={(s) => {
          setSonAcilan(s);
          setAdim("secim");
          yukle(false);
        }}
      />
    );
  }

  if (sonAcilan) {
    // Şifre yalnızca bu ekranda bir kez görünür (bkz. SirketEkibiPanel).
    return (
      <Modal title={t("{ad} için hesap açıldı", { ad: sonAcilan.hesap.fullName })} onClose={() => setSonAcilan(null)} maxWidth={440}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13, color: c.textPrimary }}>
          <span style={{ color: c.textSecondary }}>
            {sonAcilan.epostaGonderildi
              ? t("{eposta} adresine giriş bağlantısı gönderildi. Kişi bağlantıya tıklayınca doğrudan hesabına girer.", {
                  eposta: sonAcilan.hesap.email,
                })
              : t("Hesap açıldı ama e-posta gönderilemedi. Ekip Hesapları modülünden bağlantıyı yeniden gönderebilirsin.")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ color: c.textSecondary }}>{t("Şifre")}:</span>
            <code style={{ fontSize: 13, padding: "2px 6px", border: `1px solid ${c.border}`, borderRadius: 6 }}>{sonAcilan.sifre}</code>
          </div>
          <span style={{ fontSize: 11, color: c.textSecondary }}>
            {t("Şifre bu ekrandan çıkınca bir daha gösterilmez. Kişiye e-posta dışında bir yoldan ilet.")}
          </span>
          <button onClick={() => setSonAcilan(null)} style={{ ...dugme(true), alignSelf: "flex-end" }}>
            {t("Departmanlara dön")}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={t("Departmanlar artık ekiple büyüyor")} subtitle={durum.organizationName} onClose={() => setKapali(true)} maxWidth={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {adim === "secim" && (
          <>
            <p style={metin}>
              {t("Projelio'da departman artık ilk kişisiyle açılıyor: yönetici dışında biri olmadan departman olmuyor. {sinir} kişiden küçük şirketlerde departman sayısı, yönetici dışındaki kişi sayısını geçemiyor. Küçük ekipte işler Yönetim'de birlikte yürür.", {
                sinir: KUCUK_SIRKET_SINIRI,
              })}
            </p>
            <p style={ikincil}>
              {durum.sinir === null
                ? t("Ekibinde yönetici dışında {kisi} kişi var: istediğin kadar departman tutabilirsin.", { kisi: durum.kisiSayisi })
                : durum.sinir === 0
                ? t("Ekibinde henüz yönetici dışında kimse yok: departmanların hepsi Yönetim'de birleşecek. Önce ekibe kişi eklersen o kişilerle departman tutabilirsin.")
                : t("Ekibinde yönetici dışında {kisi} kişi var: en çok {sinir} departman tutabilirsin.", {
                    kisi: durum.kisiSayisi,
                    sinir: durum.sinir,
                  })}
            </p>

            {durum.departmanlar.length === 0 ? (
              <p style={ikincil}>{t("Şirketinde Yönetim dışında departman yok; değişecek bir şey yok.")}</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {durum.departmanlar.map((d) => {
                  const secili = tutulan.has(d.id);
                  const bos = d.kisiSayisi === 0;
                  const kilitli = bos || (!secili && doldu);
                  return (
                    <label
                      key={d.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        border: `1px solid ${secili ? c.accent : c.border}`,
                        borderRadius: 8,
                        opacity: kilitli ? 0.55 : 1,
                        cursor: kilitli ? "not-allowed" : "pointer",
                      }}
                    >
                      <input type="checkbox" checked={secili} disabled={kilitli} onChange={(e) => degistir(d.id, e.target.checked)} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: c.textPrimary }}>
                        {departmanAdi(d.name, t)}
                        <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>
                          {bos
                            ? t("Yönetici dışında kimse yok · {gorev} görev · {dosya} dosya", { gorev: d.gorevSayisi, dosya: d.dosyaSayisi })
                            : t("{kisi} kişi · {gorev} görev · {dosya} dosya", {
                                kisi: d.kisiSayisi,
                                gorev: d.gorevSayisi,
                                dosya: d.dosyaSayisi,
                              })}
                        </span>
                      </span>
                      <span style={{ fontSize: 12, color: secili ? c.accent : c.textSecondary, whiteSpace: "nowrap" }}>
                        {secili ? t("Kalacak") : t("Yönetim'e geçecek")}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <p style={ikincil}>
              {t("Tutmadığın departmanların kişileri, görevleri, dosyaları, bütçesi ve modül kayıtları Yönetim departmanına taşınır; departmanın kendisi silinir.")}
            </p>

            {(hata || error) && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{t(error || hata!)}</p>}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setKapali(true)} style={{ ...dugme(false), marginRight: "auto" }}>
                {t("Daha sonra")}
              </button>
              <button onClick={() => void kisiEkle()} style={dugme(false)}>
                {t("Ekibe kişi ekleyeceğim")}
              </button>
              <button
                onClick={() => (silinecek.length ? setAdim("onay") : void uygula())}
                disabled={Boolean(hata) || busy}
                style={{ ...dugme(true), opacity: hata ? 0.6 : 1 }}
              >
                {silinecek.length ? t("Devam et") : busy ? t("Kaydediliyor…") : t("Anladım")}
              </button>
            </div>
          </>
        )}

        {adim === "onay" && (
          <>
            <p style={metin}>
              {t("Şu departmanlar silinecek, içindeki her şey Yönetim'e taşınacak:")}
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: c.textPrimary, lineHeight: 1.6 }}>
              {silinecek.map((d) => (
                <li key={d.id}>
                  {departmanAdi(d.name, t)}
                  <span style={{ color: c.textSecondary }}>
                    {" "}
                    · {t("{kisi} kişi · {gorev} görev · {dosya} dosya", { kisi: d.kisiSayisi, gorev: d.gorevSayisi, dosya: d.dosyaSayisi })}
                  </span>
                </li>
              ))}
            </ul>
            <p style={ikincil}>
              {t("Bu işlem geri alınamaz. Kişiler Yönetim'e aynı rolleriyle geçer; bir departman yöneticisi Yönetim'de de yönetici olur. Buluttaki dosyalar Yönetim klasörüne taşınmaya çalışılır, taşınamayanlar eski klasöründe kalır ama Projelio'da Yönetim'de görünür.")}
            </p>
            {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setAdim("secim")} disabled={busy} style={dugme(false)}>
                {t("Geri")}
              </button>
              <button onClick={() => void uygula()} disabled={busy} style={{ ...dugme(true), background: c.danger }}>
                {busy ? t("Taşınıyor…") : t("{n} departmanı sil ve Yönetim'e taşı", { n: silinecek.length })}
              </button>
            </div>
          </>
        )}

        {adim === "bitti" && sonuc && (
          <>
            <p style={metin}>
              {sonuc.silinen
                ? t("{n} departmanın içeriği Yönetim'e taşındı ve departmanlar silindi.", { n: sonuc.silinen })
                : t("Tamam — departmanların kurala uygun.")}
            </p>
            {sonuc.bulutKalan > 0 && (
              <p style={ikincil}>
                {t("{n} dosya ya da klasör bulutta eski yerinde kaldı (farklı hesapta ya da taşınamadı). Projelio'da Yönetim'de görünüyorlar.", {
                  n: sonuc.bulutKalan,
                })}
              </p>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={bitir} style={dugme(true)}>
                {t("Tamam")}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
