import { useEffect, useState } from "react";
import { faturalarApi, type FaturaKapsami } from "../api/faturalar";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";

interface Props {
  kapsam: FaturaKapsami;
  /** Pencerede görünecek modül adı ("Faturalar"). */
  baslik: string;
  onClose: () => void;
}

/** Son 12 ay, yeniden eskiye. Ay sonu işi geriye dönük yapılıyor; ileri ay anlamsız. */
function sonAylar(bugun = new Date()): string[] {
  const aylar: string[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(bugun.getFullYear(), bugun.getMonth() - i, 1);
    aylar.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return aylar;
}

function ayEtiketi(ay: string): string {
  const [yil, no] = ay.split("-");
  const adlar = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
  return `${adlar[Number(no) - 1]} ${yil}`;
}

/**
 * Ay sonu: bir ayın bütün belgelerini indirme ya da muhasebeciye yollama.
 *
 * İki eylem tek pencerede çünkü ikisi de aynı soruyu soruyor: "hangi ay?".
 * Ayrı ayrı yerlere konsaydı kullanıcı ayı iki kez seçerdi ve iki ekranda
 * farklı ay seçip yanlış dönemi gönderme ihtimali doğardı.
 */
export default function AyArsiviModal({ kapsam, baslik, onClose }: Props) {
  const c = useThemeColors();
  const t = useT();
  const aylar = sonAylar();
  const [ay, setAy] = useState(aylar[0]);
  const [alici, setAlici] = useState("");
  const [kayitSayisi, setKayitSayisi] = useState<number | null>(null);
  const [calisiyor, setCalisiyor] = useState<"indir" | "gonder" | null>(null);
  const [hata, setHata] = useState("");
  const [sonuc, setSonuc] = useState("");

  // Ay değişince özet yeniden okunuyor: "kaç fatura var" bilgisi olmadan
  // kullanıcı boş bir arşivi muhasebeciye gönderebiliyordu.
  useEffect(() => {
    let iptal = false;
    setKayitSayisi(null);
    faturalarApi
      .ayOzeti(kapsam, ay)
      .then((ozet) => {
        if (iptal) return;
        setKayitSayisi(ozet.kayitSayisi);
        // Bilgi kartındaki adres yalnızca ÖNERİ: kullanıcı yazdıysa ezilmiyor.
        setAlici((mevcut) => mevcut || ozet.muhasebeciEposta || "");
      })
      .catch(() => !iptal && setKayitSayisi(0));
    return () => {
      iptal = true;
    };
  }, [kapsam.scope, kapsam.scopeId, ay]);

  const indir = async () => {
    setHata("");
    setSonuc("");
    setCalisiyor("indir");
    try {
      await faturalarApi.arsiviIndir(kapsam, ay);
      setSonuc(t("Arşiv indirildi."));
    } catch (e: any) {
      setHata(e?.message ?? t("Arşiv indirilemedi."));
    } finally {
      setCalisiyor(null);
    }
  };

  const gonder = async () => {
    setHata("");
    setSonuc("");
    setCalisiyor("gonder");
    try {
      const cevap = await faturalarApi.gonder(kapsam, ay, alici.trim() || undefined);
      // Ekli mi bağlantılı mı gittiği SÖYLENİYOR: muhasebeci "ek yok" diye
      // yazdığında gönderenin ne olduğunu bilmesi gerekiyor.
      const nasil = cevap.ekOlarak
        ? t("{n} belge ek olarak gönderildi.", { n: String(cevap.belgeSayisi) })
        : t("{n} belge, indirme bağlantısıyla gönderildi (arşiv eke sığmadı).", {
            n: String(cevap.belgeSayisi),
          });
      const eksik = cevap.eksikKayitlar.length
        ? ` ${t("Belgesi yüklenmemiş {n} fatura var.", { n: String(cevap.eksikKayitlar.length) })}`
        : "";
      setSonuc(nasil + eksik);
    } catch (e: any) {
      setHata(e?.message ?? t("Gönderilemedi."));
    } finally {
      setCalisiyor(null);
    }
  };

  return (
    <Modal title={t("{modul} — ay sonu", { modul: baslik })} onClose={onClose} maxWidth={440} mobileFullScreen>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 12, color: c.textSecondary }}>{t("Dönem")}</label>
        <select value={ay} onChange={(e) => setAy(e.target.value)} style={{ fontSize: 14, padding: "7px 8px" }}>
          {aylar.map((a) => (
            <option key={a} value={a}>
              {ayEtiketi(a)}
            </option>
          ))}
        </select>

        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
          {kayitSayisi === null
            ? t("Yükleniyor…")
            : kayitSayisi === 0
              ? t("Bu dönemde fatura kaydı yok.")
              : t("Bu dönemde {n} fatura kaydı var.", { n: String(kayitSayisi) })}
        </p>

        <button
          data-primary
          onClick={() => void indir()}
          disabled={calisiyor !== null || kayitSayisi === 0}
          style={{
            padding: "9px 0",
            borderRadius: 8,
            border: "none",
            background: c.primary,
            color: c.onPrimary,
            fontSize: 14,
          }}
        >
          {calisiyor === "indir" ? t("Hazırlanıyor…") : t("Tüm faturaları indir")}
        </button>

        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 10 }}>
          <label style={{ fontSize: 12, color: c.textSecondary }}>{t("Muhasebeci e-postası")}</label>
          <input
            type="email"
            value={alici}
            onChange={(e) => setAlici(e.target.value)}
            placeholder="muhasebe@ornek.com"
            style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "7px 8px", marginTop: 4 }}
          />
          <button
            onClick={() => void gonder()}
            disabled={calisiyor !== null || kayitSayisi === 0}
            style={{ width: "100%", padding: "9px 0", fontSize: 14, marginTop: 8 }}
          >
            {calisiyor === "gonder" ? t("Gönderiliyor…") : t("Muhasebeciye gönder")}
          </button>
        </div>

        {hata && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{hata}</p>}
        {sonuc && <p style={{ color: c.textSecondary, fontSize: 13, margin: 0 }}>{sonuc}</p>}
      </div>
    </Modal>
  );
}
