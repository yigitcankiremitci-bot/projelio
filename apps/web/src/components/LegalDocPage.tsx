import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { backState, useBackTarget } from "../lib/backTarget";
import {
  LEGAL_LANG_KEY,
  LEGAL_UI,
  initialLegalLang,
  legalDocs,
  type LegalDocKind,
  type LegalLang,
} from "../lib/legal";
import { useThemeColors } from "../theme/useThemeColors";

/**
 * Yasal metinlerin ortak sayfası — gizlilik politikası ve kullanıcı sözleşmesi
 * aynı kabuğu paylaşır. Metin `lib/legal/` altında durur; burası yalnızca çizer.
 *
 * Sayfalar herkese açıktır: App.tsx'teki `isAuthScreen` listesinde oldukları
 * için token olmadan da görüntülenirler. Meta (WhatsApp Business Platform) gibi
 * platformlar yayın incelemesinde giriş gerektirmeyen bir politika ve sözleşme
 * adresi zorunlu tutuyor.
 *
 * GERİ BAĞLANTISI: hedef sabit "/login" idi ve metni Ayarlar'dan açan kullanıcı
 * okuduktan sonra giriş ekranına düşüyordu. Oturumu kapanmıyordu (token yerinde
 * duruyor, Login sayfası da silmiyor) ama çıkarılmış gibi görünüyordu. Artık
 * nereden gelindiği `lib/backTarget.ts` ile taşınıyor: bağlantıyı veren taraf
 * `backState(...)` geçiriyor, sayfa onu okuyor. Doğrudan girildiyse (paylaşılan
 * adres, platform incelemesi) `from` olmaz; o zaman oturumu olan anasayfaya,
 * olmayan giriş ekranına döner.
 */
export default function LegalDocPage({ kind }: { kind: LegalDocKind }) {
  const c = useThemeColors();
  const [lang, setLang] = useState<LegalLang>(initialLegalLang);
  const hasToken = !!localStorage.getItem("projelio_token");
  const back = useBackTarget(
    hasToken ? { to: "/", label: "Anasayfa" } : { to: "/login", label: "Giriş sayfası" }
  );

  useEffect(() => {
    localStorage.setItem(LEGAL_LANG_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const doc = legalDocs[kind];
  const text = doc.text[lang];
  const ui = LEGAL_UI[lang];
  // Diğer metinlere köprü: belgeler birbirine atıf yapıyor, okuyanın adresi
  // elle yazmasına gerek kalmasın. Üç belge var (politika, sözleşme,
  // aydınlatma metni); hangisindeysek kalan ikisi listelenir — eskiden tek bir
  // "diğeri" vardı ve üçüncü belge eklenince biri hep erişilemez kalıyordu.
  const others = (Object.keys(legalDocs) as LegalDocKind[]).filter((k) => k !== kind);

  const h2 = {
    color: c.textPrimary,
    fontSize: 19,
    fontWeight: 600,
    margin: "30px 0 8px",
  } as const;

  const p = {
    color: c.textSecondary,
    fontSize: 15.5,
    lineHeight: 1.65,
    margin: "0 0 10px",
  } as const;

  function langButton(value: LegalLang, label: string) {
    const active = lang === value;
    return (
      <button
        type="button"
        onClick={() => setLang(value)}
        aria-pressed={active}
        style={{
          border: `1px solid ${active ? c.primary : c.border}`,
          background: active ? c.primary : "transparent",
          color: active ? "#fff" : c.textSecondary,
          borderRadius: 8,
          padding: "5px 12px",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: c.background, padding: "40px 24px 64px" }}>
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          margin: "0 auto",
          background: c.surface,
          border: `1px solid ${c.border}`,
          borderRadius: 14,
          padding: "40px 36px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img src="/logo.png" alt="Projelio" style={{ width: 40, height: 40 }} />
            <h1 style={{ color: c.textPrimary, fontSize: 26, fontWeight: 600, margin: 0 }}>
              {text.title}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {langButton("tr", "Türkçe")}
            {langButton("en", "English")}
          </div>
        </div>

        <p style={{ ...p, marginBottom: 4 }}>{text.lede}</p>
        <p style={{ ...p, fontSize: 14, marginBottom: 0 }}>
          {ui.updated}: {text.effective}
        </p>

        {doc.sections[lang].map((s) => (
          <section key={s.h}>
            <h2 style={h2}>{s.h}</h2>
            {s.p.map((paragraph, i) => (
              <p key={i} style={p}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        <div
          style={{
            marginTop: 36,
            paddingTop: 20,
            borderTop: `1px solid ${c.border}`,
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          {/* Türkçede gelinen sayfanın adı yazar ("← Ayarlar"); İngilizce metinde
              Türkçe bir sayfa adı tuhaf kaçacağı için orada genel karşılık. */}
          <Link to={back.to} style={{ fontSize: 15.5, color: c.primary }}>
            ← {lang === "tr" ? back.label : ui.back}
          </Link>
          {/* Diğer metne geçerken geri hedefi de taşınır: sözleşmeden politikaya
              atlayan kullanıcı yine Ayarlar'a döner, giriş ekranına düşmez. */}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {others.map((k) => (
              <Link key={k} to={legalDocs[k].path} state={backState(back)} style={{ fontSize: 15.5, color: c.primary }}>
                {legalDocs[k].text[lang].title} →
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
