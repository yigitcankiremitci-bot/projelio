import { useEffect, useState } from "react";
import { API_URL, api, ApiError } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";

interface DeletionPreview {
  /** Doluysa silme yapılamaz; metin ne yapılması gerektiğini anlatır. */
  blocker: string | null;
  /** İş, organizasyon ve gruplar — içlerinde başka kimse olmayanlar. */
  silinecekIsler: string[];
  korunacakIsler: string[];
}

interface Props {
  /** Şifresiz (Google ile açılmış) hesapta şifre alanı gösterilmez. */
  hasPassword: boolean;
  onClose: () => void;
}

/**
 * Hesap silme onayı.
 *
 * NEDEN ÖNİZLEME VAR: silme geri alınamıyor ve sonucu kişiye göre değişiyor —
 * tek kişilik işler gerçekten siliniyor, ekipli olanlar kalıyor
 * (bkz. backend account-deletion.rules.ts). Kullanıcı neyi kaybedeceğini
 * görmeden onay vermemeli; "hesabımı sil" düğmesine basıp ne olduğunu sonradan
 * öğrenmek kabul edilemez.
 *
 * NEDEN AYRICA YAZDIRIYORUZ: şifre zaten isteniyor ama şifre "ben olduğumu"
 * kanıtlıyor, "bunu istediğimi" değil. Yanlışlıkla silmeye karşı ikinci bir
 * kasıt adımı gerekiyor.
 */
const ONAY_METNI = "HESABIMI SİL";

/**
 * Silmeden önce sunulan alternatifler.
 *
 * NEDEN VAR: "hesabımı sil" çoğu zaman asıl derdin kendisi değil, sonucu —
 * bildirim yoğunluğu, bir sorunun çözülmemiş olması ya da sadece ara verme
 * isteği. Bunlar ayrı ayrı çözülebilir şeyler ve hiçbiri veri kaybı gerektirmiyor.
 * Kullanıcıyı tutmak için engel koymuyoruz; sadece daha ucuz seçenekleri
 * gösteriyoruz. "Devam et" düğmesi her zaman görünür ve tek tık uzakta.
 */
const TEKLIFLER = [
  {
    baslik: "Bildirimler mi çok geliyor?",
    metin: "Günlük özet ve hatırlatmaları ayarlardan tek tek kapatabilirsin; hesabını silmene gerek yok.",
    dugme: "Bildirim ayarları",
    hedef: "/settings?sekme=ritim",
  },
  {
    baslik: "Bir sorun mu yaşadın?",
    metin: "Yaşadığın şeyi bize yaz — çoğu şey çözülebiliyor ve cevabı ayarlardaki destek bölümünden görürsün.",
    dugme: "Destek'e yaz",
    hedef: "/settings?sekme=destek",
  },
  {
    baslik: "Sadece ara mı vermek istiyorsun?",
    metin: "Hesabını silmeden de uzak durabilirsin: veri kaybı olmaz, döndüğünde her şey yerinde olur.",
    dugme: null,
    hedef: null,
  },
];

export default function DeleteAccountModal({ hasPassword, onClose }: Props) {
  const c = useThemeColors();
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [sifre, setSifre] = useState("");
  const [onay, setOnay] = useState("");
  const [hata, setHata] = useState("");
  const [siliniyor, setSiliniyor] = useState(false);
  const [indiriliyor, setIndiriliyor] = useState(false);
  /** İki adım: önce alternatifler, sonra onay. */
  const [adim, setAdim] = useState<"teklifler" | "onay">("teklifler");

  useEffect(() => {
    api
      .get<DeletionPreview>("/users/me/deletion-preview")
      .then(setPreview)
      .catch((e) => setHata(e instanceof Error ? e.message : "Bilgiler alınamadı."))
      .finally(() => setYukleniyor(false));
  }, []);

  const sil = async () => {
    setHata("");
    setSiliniyor(true);
    try {
      await api.delete("/users/me", hasPassword ? { password: sifre } : {});
      // Oturum artık geçersiz; giriş ekranına dönüyoruz.
      localStorage.removeItem("projelio_token");
      window.location.href = "/login";
    } catch (e) {
      setHata(e instanceof ApiError ? e.message : "Hesap silinemedi. Tekrar dene.");
      setSiliniyor(false);
    }
  };

  const veriyiIndir = async () => {
    setIndiriliyor(true);
    setHata("");
    try {
      // Excel ikili veri: api.get JSON bekliyor, o yüzden doğrudan fetch.
      const token = localStorage.getItem("projelio_token");
      const res = await fetch(`${API_URL}/users/me/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Dosya oluşturulamadı.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `projelio-verilerim-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setHata(e instanceof Error ? e.message : "Veriler indirilemedi.");
    } finally {
      setIndiriliyor(false);
    }
  };

  const hazir = onay.trim() === ONAY_METNI && (!hasPassword || sifre.length > 0) && !preview?.blocker;

  return (
    <Modal title="Hesabını sil" onClose={onClose}>
      {yukleniyor ? (
        <p style={{ color: c.textSecondary, fontSize: 15 }}>Bilgiler yükleniyor…</p>
      ) : preview?.blocker ? (
        <>
          <p style={{ color: c.textPrimary, fontSize: 15, lineHeight: 1.6, margin: "0 0 16px" }}>{preview.blocker}</p>
          <button onClick={onClose} style={{ ...dugme(c.border, c.textPrimary), width: "100%" }}>
            Anladım
          </button>
        </>
      ) : adim === "teklifler" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ color: c.textPrimary, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            Gitmeden önce: aşağıdakilerden biri işine yarayabilir. Hiçbiri değilse aşağıdan devam et.
          </p>

          {TEKLIFLER.map((t) => (
            <div key={t.baslik} style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: "11px 13px" }}>
              <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: c.textPrimary }}>{t.baslik}</p>
              <p style={{ margin: 0, fontSize: 14, color: c.textSecondary, lineHeight: 1.6 }}>{t.metin}</p>
              {t.dugme && t.hedef && (
                <a
                  href={t.hedef}
                  style={{ display: "inline-block", marginTop: 8, fontSize: 14, color: c.primary }}
                >
                  {t.dugme} →
                </a>
              )}
            </div>
          ))}

          <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: c.textPrimary }}>
              Verilerini yanına al
            </p>
            <p style={{ margin: 0, fontSize: 14, color: c.textSecondary, lineHeight: 1.6 }}>
              Görevlerin, işlerin, projelerin ve bütçe kayıtların tek bir Excel dosyasında. Silsen de
              elinde kalır.
            </p>
            <button
              onClick={veriyiIndir}
              disabled={indiriliyor}
              style={{ ...dugme(c.border, c.textPrimary), marginTop: 8, fontSize: 14 }}
            >
              {indiriliyor ? "Hazırlanıyor…" : "Excel olarak indir"}
            </button>
          </div>

          {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ ...dugme(c.border, c.textPrimary), flex: 1 }}>
              Vazgeçtim
            </button>
            <button onClick={() => setAdim("onay")} style={{ ...dugme(c.border, c.danger), flex: 1 }}>
              Yine de sil
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <p style={{ color: c.textPrimary, fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            Hesabın hemen kapanacak, ama verilerin <strong>30 gün</strong> daha duracak.
          </p>

          <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, padding: "11px 13px" }}>
            <p style={{ margin: 0, fontSize: 14, color: c.textSecondary, lineHeight: 1.6 }}>
              Fikrin değişirse bu 30 gün içinde <strong style={{ color: c.textPrimary }}>aynı e-posta ve
              şifreyle giriş yapman yeterli</strong> — hesabın olduğu gibi geri açılır, hiçbir şey kaybolmaz.
              Bu bilgiyi e-postayla da göndereceğiz.
            </p>
          </div>

          <p style={{ color: c.textSecondary, fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            30 gün dolduğunda kişisel verilerin (bildirimler, kişisel yapılacaklar, bağlı Drive/OneDrive
            hesapların, Lio sohbetlerin) kalıcı olarak silinir. Ekip arkadaşlarınla birlikte çalıştığın
            işlerdeki görev, yorum ve bütçe kayıtları organizasyonda kalır; adın yerine
            “Silinmiş kullanıcı” görünür.
          </p>

          {preview && preview.silinecekIsler.length > 0 && (
            <div style={{ border: `1px solid ${c.danger}`, borderRadius: 10, padding: "10px 12px" }}>
              <p style={{ margin: "0 0 6px", fontSize: 14, color: c.danger, fontWeight: 600 }}>
                30 gün sonra bunlar tamamen silinecek (içlerinde senden başka kimse yok):
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: c.textPrimary }}>
                {preview.silinecekIsler.map((ad) => (
                  <li key={ad}>{ad}</li>
                ))}
              </ul>
            </div>
          )}

          {preview && preview.korunacakIsler.length > 0 && (
            <p style={{ color: c.textSecondary, fontSize: 14, margin: 0, lineHeight: 1.6 }}>
              Şu işler ekibinde başka üyeler olduğu için <strong>korunacak</strong>:{" "}
              {preview.korunacakIsler.join(", ")}.
            </p>
          )}

          {hasPassword && (
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, color: c.textSecondary }}>
              Şifren
              <input
                type="password"
                value={sifre}
                onChange={(e) => setSifre(e.target.value)}
                autoComplete="current-password"
                style={girdi(c)}
              />
            </label>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 14, color: c.textSecondary }}>
            Onaylamak için <strong style={{ color: c.textPrimary }}>{ONAY_METNI}</strong> yaz
            <input value={onay} onChange={(e) => setOnay(e.target.value)} style={girdi(c)} />
          </label>

          {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setAdim("teklifler")} style={{ ...dugme(c.border, c.textPrimary), flex: 1 }}>
              Geri
            </button>
            <button
              onClick={sil}
              disabled={!hazir || siliniyor}
              style={{
                ...dugme(c.danger, "#fff"),
                flex: 1,
                background: hazir && !siliniyor ? c.danger : c.border,
                cursor: hazir && !siliniyor ? "pointer" : "not-allowed",
              }}
            >
              {siliniyor ? "Kapatılıyor…" : "Hesabımı kapat"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function dugme(kenar: string, renk: string) {
  return {
    padding: "10px 16px",
    borderRadius: 8,
    border: `1px solid ${kenar}`,
    background: "transparent",
    color: renk,
    fontSize: 15,
    cursor: "pointer",
  } as const;
}

function girdi(c: { border: string; surface: string; textPrimary: string }) {
  return {
    padding: "9px 11px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 15,
  } as const;
}
