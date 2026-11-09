// Üye olmadan gezilen 3D stüdyo (adres: /misafir/studyo).
//
// Tanıtım sitesindeki (landing/) anasayfanın 3D stüdyo kartı buraya getirir.
// Sahne Stüdyom'un kendisi (components/ofis3d/OfisOyunu, `misafir` kipinde):
// sunucuya hiç istek atılmaz, düzenleme / mağaza / karakter düzenleme kapalı.
// Ziyaretçi odalara girer, istasyonlara bakar, kişileri görür; bir şeyi açmak
// ya da değiştirmek istediği an üyelik penceresi çıkar.
//
// Veri SABİT ve uydurma bir serbest çalışana ait (aşağıdaki ORNEK_ODALAR):
// gerçek bir hesaba bağlanmıyor, böylece herkese açık bir uç gerekmiyor ve
// kimsenin verisi ziyaretçiye gösterilmiyor.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import OfisOyunu, { type OyunDepartmani, type OyunHareketi } from "../components/ofis3d/OfisOyunu";
import { coverBackground } from "../lib/covers";
import { KASA_MODULU, KUPA_RAFI, PROJE_ONEKI } from "../lib/ofisOyunu";
import { yerelTarih } from "../lib/sakin";
import { useThemeColors } from "../theme/useThemeColors";
import "./Yeni.css";

/** Tanıtım sitesi; stüdyo oradan yeni sekmede açılıyor, dönüş yolu bu. */
const TANITIM_SITESI = "https://projelio.app";

const BEN = "misafir-ben";

function gunSonra(gun: number): string {
  const d = new Date();
  d.setDate(d.getDate() + gun);
  return yerelTarih(d);
}

function ornekOdalar(): OyunDepartmani[] {
  return [
    {
      id: "ornek-marka",
      ad: "Lale Kafe · Marka kimliği",
      tema: "tasarim",
      kapak: coverBackground(null, "ornek-marka"),
      moduller: [
        { key: `${PROJE_ONEKI}logo`, ad: "Logo ve renkler", bilgi: { biten: 5, toplam: 7, teslim: gunSonra(2), yaklasti: true } },
        { key: `${PROJE_ONEKI}menu`, ad: "Menü tasarımı", bilgi: { biten: 2, toplam: 6, teslim: gunSonra(9) } },
        { key: KASA_MODULU, ad: "Kasa" },
        {
          key: KUPA_RAFI,
          ad: "Biten projeler (2)",
          bilgi: {
            biten: 0,
            toplam: 0,
            kupa: 2,
            plaketler: [
              { projeId: "ornek-afis", ad: "Açılış afişi", tarih: gunSonra(-20) },
              { projeId: "ornek-sosyal", ad: "Sosyal medya şablonları", tarih: gunSonra(-41) },
            ],
          },
        },
      ],
      kisiler: [
        { id: BEN, ad: "Sen", yonetici: true, emek: 12, istasyon: `${PROJE_ONEKI}logo` },
        { id: "ornek-deniz", ad: "Deniz", emek: 4 },
      ],
      acikGorev: 6,
      gecikmis: 0,
    },
    {
      id: "ornek-film",
      ad: "Tanıtım filmi",
      tema: "video",
      kapak: coverBackground(null, "ornek-film"),
      moduller: [
        { key: `${PROJE_ONEKI}kurgu`, ad: "Kurgu", bilgi: { biten: 3, toplam: 8, teslim: gunSonra(-1), gecikti: true } },
        { key: `${PROJE_ONEKI}cekim`, ad: "Çekim planı", bilgi: { biten: 4, toplam: 4 } },
      ],
      kisiler: [
        { id: "ornek-ece", ad: "Ece", yonetici: true, emek: 7, istasyon: `${PROJE_ONEKI}kurgu` },
        { id: "ornek-mert", ad: "Mert", emek: 3 },
      ],
      acikGorev: 5,
      gecikmis: 1,
    },
    {
      id: "ornek-podcast",
      ad: "Haftalık podcast",
      tema: "muzik",
      kapak: coverBackground(null, "ornek-podcast"),
      moduller: [{ key: `${PROJE_ONEKI}bolum`, ad: "12. bölüm", bilgi: { biten: 1, toplam: 3, teslim: gunSonra(5) } }],
      kisiler: [{ id: "ornek-can", ad: "Can", yonetici: true, emek: 5 }],
      acikGorev: 2,
      gecikmis: 0,
    },
  ];
}

const ORNEK_HAREKETLER: OyunHareketi[] = [
  { id: "h1", kim: "Deniz", ne: "renk paletini bitirdi" },
  { id: "h2", kim: "Ece", ne: "kurgunun ilk yarısını yükledi" },
  { id: "h3", kim: "Can", ne: "bölüm notlarını tamamladı" },
];

export default function MisafirStudyo() {
  const c = useThemeColors();
  const odalar = useMemo(ornekOdalar, []);
  const cevrimici = useMemo(() => new Set([BEN, "ornek-deniz", "ornek-ece"]), []);
  // Odadaki bir şeyi açmak üyelik ister: neyin açılmak istendiği pencerede yazar.
  const [kilit, setKilit] = useState<string | null>(null);
  const modulAdi = (odaId: string, key: string) => odalar.find((o) => o.id === odaId)?.moduller?.find((m) => m.key === key)?.ad;

  const hap = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    height: 38,
    padding: "0 14px",
    borderRadius: 19,
    fontSize: 14,
    fontWeight: 500,
    textDecoration: "none",
    whiteSpace: "nowrap",
  } as const;

  return (
    <div className="yn misafir-studyo">
      <OfisOyunu
        kapsam="misafir"
        studyo
        misafir
        departmanlar={odalar}
        bugunToplanti={null}
        bitenGorev={24}
        hareketler={ORNEK_HAREKETLER}
        cevrimici={cevrimici}
        benId={BEN}
        onOdaSayfasi={(id) => setKilit(odalar.find((o) => o.id === id)?.ad ?? "Bu sayfa")}
        onModulAc={(odaId, key) => setKilit(modulAdi(odaId, key) ?? "Bu bölüm")}
      />

      {/* Oyunun düğmeleri üst köşelerde, son hareketler sol altta, ipucu sağ altta: bizimkiler alt ortada. */}
      <div style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: 16, zIndex: 50, display: "flex", gap: 8 }}>
        <a href={TANITIM_SITESI} style={{ ...hap, background: c.surface, color: c.textPrimary, border: `1px solid ${c.border}` }}>
          <img src="/logo.png" alt="" width={18} height={18} />
          Projelio
        </a>
        <Link to="/register" style={{ ...hap, background: c.accent, color: c.surface }}>
          Kendi stüdyonu kur
        </Link>
      </div>

      {kilit && (
        <div
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && setKilit(null)}
          style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(26,31,41,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="misafir-studyo-kilit"
            style={{ width: "min(400px, 100%)", padding: 22, borderRadius: 14, background: c.surface, border: `1px solid ${c.border}`, color: c.textPrimary, boxShadow: "0 18px 50px rgba(0,0,0,0.4)" }}
          >
            <h2 id="misafir-studyo-kilit" style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 500 }}>
              {kilit} üyelikle açılır
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 14, lineHeight: 1.5, color: c.textSecondary }}>
              Burası örnek bir stüdyo. Üye olunca her işin bir oda, her projen bir istasyon olur; ekibin masasında çalışırken görünür.
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <Link to="/register" style={{ ...hap, flex: 1, justifyContent: "center", borderRadius: 8, background: c.accent, color: c.surface }}>
                Ücretsiz üye ol
              </Link>
              <button
                type="button"
                onClick={() => setKilit(null)}
                style={{ ...hap, flex: 1, justifyContent: "center", borderRadius: 8, background: "transparent", color: c.textPrimary, border: `1px solid ${c.border}`, cursor: "pointer" }}
              >
                Gezmeye devam
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
