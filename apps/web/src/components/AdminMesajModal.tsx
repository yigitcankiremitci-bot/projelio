import { useMemo, useState } from "react";
import {
  ADMIN_MESAJ_SINIRI,
  adminMesajiniDogrula,
  gercekEpostaMi,
  type AdminKullaniciSatiri,
  type AdminMesajSonucu,
  type ThemeColors,
} from "@projelio/shared";
import { useThemeColors } from "../theme/useThemeColors";
import { adminKullanicilar } from "../api/adminKullanicilar";
import { useT } from "../lib/i18n";
import Modal from "./Modal";

/**
 * Admin > Kullanıcılar: seçili kişilere bildirim ve/veya e-posta.
 *
 * Kimin hangi kanaldan ALMAYACAĞI gönderimden ÖNCE gösteriliyor (demo ve
 * silinmiş hesaplar e-posta almaz) — "200 kişiye gönderdim" sanıp 8'inin
 * atlandığını sonradan öğrenmek yanıltıcı olurdu. Asıl karar sunucuda
 * (admin-mesaj.service.ts); buradaki sayım aynı ortak fonksiyonlardan geçiyor.
 *
 * Gönder düğmesi Enter'a bağlı DEĞİL (data-primary yok): mesaj geri alınamaz
 * ve çok satırlı alanda ⌘Enter kazara toplu gönderime dönüşmemeli.
 */
export default function AdminMesajModal({
  alicilar,
  onClose,
  onGonderildi,
}: {
  alicilar: AdminKullaniciSatiri[];
  onClose: () => void;
  onGonderildi?: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [bildirim, setBildirim] = useState(true);
  const [eposta, setEposta] = useState(false);
  const [baslik, setBaslik] = useState("");
  const [mesaj, setMesaj] = useState("");
  const [link, setLink] = useState("");
  const [gonderiliyor, setGonderiliyor] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [sonuc, setSonuc] = useState<AdminMesajSonucu | null>(null);

  const sayim = useMemo(() => {
    const canli = alicilar.filter((a) => !a.anonimlestirildi);
    return {
      silinmis: alicilar.length - canli.length,
      bildirim: canli.length,
      eposta: canli.filter((a) => gercekEpostaMi(a.email)).length,
      epostaAtlanan: canli.filter((a) => !gercekEpostaMi(a.email)).length,
    };
  }, [alicilar]);

  const dogrulama = adminMesajiniDogrula({ bildirim, eposta, baslik, mesaj, link });
  const alici = alicilar.length === 1 ? alicilar[0] : null;

  const gonder = async () => {
    if ("hata" in dogrulama) {
      setHata(t(dogrulama.hata));
      return;
    }
    setGonderiliyor(true);
    setHata(null);
    try {
      const r = await adminKullanicilar.mesajGonder(
        alicilar.map((a) => a.id),
        dogrulama.temiz
      );
      setSonuc(r);
      onGonderildi?.();
    } catch (err: any) {
      setHata(err?.message ?? t("Mesaj gönderilemedi."));
    } finally {
      setGonderiliyor(false);
    }
  };

  const baslikMetni = alici
    ? t("{ad} kullanıcısına mesaj", { ad: alici.fullName })
    : t("{n} kullanıcıya mesaj", { n: alicilar.length });

  return (
    <Modal title={baslikMetni} subtitle={alici?.email} onClose={onClose} maxWidth={560} mobileFullScreen>
      {sonuc ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {bildirim && (
            <SonucSatiri
              c={c}
              etiket={t("Bildirim")}
              metin={t("{n} kişiye gönderildi", { n: sonuc.bildirim.gonderilen })}
              hata={sonuc.bildirim.basarisiz ? t("{n} başarısız", { n: sonuc.bildirim.basarisiz }) : undefined}
            />
          )}
          {eposta && (
            <SonucSatiri
              c={c}
              etiket={t("E-posta")}
              metin={t("{n} kişiye gönderildi", { n: sonuc.eposta.gonderilen })}
              hata={sonuc.eposta.basarisiz ? t("{n} başarısız", { n: sonuc.eposta.basarisiz }) : undefined}
              not={sonuc.eposta.atlanan ? t("{n} demo/geçersiz adres atlandı", { n: sonuc.eposta.atlanan }) : undefined}
            />
          )}
          {sonuc.atlananSilinmis > 0 && (
            <p style={{ fontSize: 13.5, color: c.textSecondary, margin: 0 }}>
              {t("{n} silinmiş hesap atlandı.", { n: sonuc.atlananSilinmis })}
            </p>
          )}
          {eposta && sonuc.eposta.basarisiz > 0 && sonuc.eposta.gonderilen === 0 && (
            <p style={{ fontSize: 13.5, color: c.danger, margin: 0, lineHeight: 1.5 }}>
              {t("Hiçbir e-posta gönderilemedi. Sunucuda RESEND_API_KEY ve EMAIL_FROM ayarlarını kontrol et.")}
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
            <button type="button" onClick={onClose} style={dugme(c, "birincil")}>
              {t("Kapat")}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={etiketStili(c)}>{t("Kanal")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <label style={secimStili(c)}>
                <input type="checkbox" checked={bildirim} onChange={(e) => setBildirim(e.target.checked)} />
                {t("Uygulama bildirimi")}
                <span style={{ color: c.textSecondary }}>· {sayim.bildirim}</span>
              </label>
              <label style={secimStili(c)}>
                <input type="checkbox" checked={eposta} onChange={(e) => setEposta(e.target.checked)} />
                {t("E-posta")}
                <span style={{ color: c.textSecondary }}>· {sayim.eposta}</span>
              </label>
            </div>
            {(sayim.silinmis > 0 || (eposta && sayim.epostaAtlanan > 0)) && (
              <p style={{ fontSize: 13, color: c.textSecondary, margin: "6px 0 0", lineHeight: 1.5 }}>
                {[
                  sayim.silinmis > 0 ? t("{n} silinmiş hesap hiçbir kanaldan almaz.", { n: sayim.silinmis }) : "",
                  eposta && sayim.epostaAtlanan > 0
                    ? t("{n} demo ya da geçersiz adrese e-posta gitmez.", { n: sayim.epostaAtlanan })
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              </p>
            )}
          </div>

          <label>
            <div style={etiketStili(c)}>{t("Başlık")}</div>
            <input
              autoFocus
              value={baslik}
              maxLength={ADMIN_MESAJ_SINIRI.baslik}
              onChange={(e) => setBaslik(e.target.value)}
              placeholder={t("Ör. Planlı bakım duyurusu")}
              style={alanStili(c)}
            />
          </label>

          <label>
            <div style={etiketStili(c)}>{t("Mesaj")}</div>
            <textarea
              value={mesaj}
              maxLength={ADMIN_MESAJ_SINIRI.mesaj}
              onChange={(e) => setMesaj(e.target.value)}
              rows={7}
              style={{ ...alanStili(c), resize: "vertical", lineHeight: 1.5 }}
            />
            <div style={{ fontSize: 12, color: c.textSecondary, textAlign: "right", marginTop: 2 }}>
              {mesaj.length} / {ADMIN_MESAJ_SINIRI.mesaj}
            </div>
          </label>

          <label>
            <div style={etiketStili(c)}>{t("Bağlantı (isteğe bağlı)")}</div>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/settings · https://…" style={alanStili(c)} />
          </label>

          {eposta && (
            <p style={{ fontSize: 12.5, color: c.textSecondary, margin: 0, lineHeight: 1.5 }}>
              {t("E-posta hesapla ilgili bilgilendirme içindir. Kampanya ve pazarlama mesajları için alıcının ayrıca izin vermiş olması gerekir.")}
            </p>
          )}

          {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button type="button" onClick={onClose} style={dugme(c, "ikincil")}>
              {t("Vazgeç")}
            </button>
            <button
              type="button"
              onClick={gonder}
              disabled={gonderiliyor || "hata" in dogrulama}
              style={{ ...dugme(c, "birincil"), opacity: gonderiliyor || "hata" in dogrulama ? 0.55 : 1 }}
            >
              {gonderiliyor ? t("Gönderiliyor…") : t("Gönder")}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SonucSatiri({ c, etiket, metin, hata, not }: { c: ThemeColors; etiket: string; metin: string; hata?: string; not?: string }) {
  return (
    <div style={{ fontSize: 14.5, color: c.textPrimary, lineHeight: 1.5 }}>
      <strong style={{ fontWeight: 600 }}>{etiket}:</strong> {metin}
      {hata && <span style={{ color: c.danger }}> · {hata}</span>}
      {not && <span style={{ color: c.textSecondary }}> · {not}</span>}
    </div>
  );
}

function etiketStili(c: ThemeColors): React.CSSProperties {
  return { fontSize: 13, color: c.textSecondary, marginBottom: 5 };
}

function secimStili(c: ThemeColors): React.CSSProperties {
  return { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14.5, color: c.textPrimary, cursor: "pointer" };
}

function alanStili(c: ThemeColors): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 11px",
    borderRadius: 9,
    border: `1px solid ${c.border}`,
    fontSize: 14.5,
    color: c.textPrimary,
    background: c.background,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };
}

function dugme(c: ThemeColors, tur: "birincil" | "ikincil"): React.CSSProperties {
  return {
    padding: "8px 16px",
    borderRadius: 9,
    fontSize: 14,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1px solid ${tur === "birincil" ? c.accent : c.border}`,
    background: tur === "birincil" ? c.accent : c.surface,
    color: tur === "birincil" ? c.onPrimary : c.textPrimary,
  };
}
