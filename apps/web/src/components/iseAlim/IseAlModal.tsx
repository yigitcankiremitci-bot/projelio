import { useEffect, useRef, useState } from "react";
import type { EkipHesabiSecenekleri, IseAlimDaveti, User } from "@projelio/shared";
import { api } from "../../api/client";
import { iseAlimApi } from "../../api/iseAlim";
import { useT } from "../../lib/i18n";
import { useThemeColors } from "../../theme/useThemeColors";
import Modal from "../Modal";
import KadroSecimi, {
  DepartmanRolleri,
  GOREV_ONERILERI,
  baslangicDepartmanlari,
  kadroSeciminiTopla,
} from "../ekipHesaplari/KadroSecimi";

interface Props {
  organizationId: string;
  secenekler: EkipHesabiSecenekleri;
  /** Zaten ekipte olanlar aramada "ekipte" diye işaretlenir. */
  ekiptekiler: string[];
  onClose: () => void;
  onGonderildi: (davet: IseAlimDaveti) => void;
  /** Aranan kişinin hesabı yoksa Ekip Hesabı formuna geçilir. */
  onHesapAc: () => void;
}

/**
 * Şirketin "İşe al" formu (bkz. migration 143).
 *
 * Önceden "İşe al" yalnızca İK modülüne bir kayıt açıyordu ve kişi şirkete
 * hiç katılmıyordu. Burada kişi Projelio kullanıcıları arasından seçilir;
 * pozisyon, iş tanımı, departman/rol ve modüller tek formda belirlenir. Kişiye
 * davet gider, kabul edene kadar şirkette hiçbir şey göremez.
 *
 * Hesabı olmayan biri için yol Ekip Hesabı — arama sonuçsuz kalınca o seçenek
 * öne çıkar.
 */
export default function IseAlModal({ organizationId, secenekler, ekiptekiler, onClose, onGonderildi, onHesapAc }: Props) {
  const c = useThemeColors();
  const t = useT();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [kisi, setKisi] = useState<User | null>(null);
  const [pozisyon, setPozisyon] = useState("");
  const [isTanimi, setIsTanimi] = useState("");
  const [departmanlar, setDepartmanlar] = useState<DepartmanRolleri>(() => baslangicDepartmanlari(secenekler));
  const [moduller, setModuller] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = query.trim().replace(/^@/, "");
    if (!term) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      api
        .get<User[]>(`/users/search?q=${encodeURIComponent(term)}`)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const gonder = async () => {
    setError("");
    if (!kisi) return setError(t("İşe alınacak kişiyi seç."));
    const kadro = kadroSeciminiTopla(secenekler, departmanlar, moduller);
    if (kadro.departmanlar.length === 0) return setError(t("En az bir departman seç."));
    setBusy(true);
    try {
      const davet = await iseAlimApi.davetEt(organizationId, {
        userId: kisi.id,
        pozisyon: pozisyon.trim() || undefined,
        isTanimi: isTanimi.trim() || undefined,
        ...kadro,
      });
      onGonderildi(davet);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Davet gönderilemedi. Tekrar dene."));
    } finally {
      setBusy(false);
    }
  };

  const etiket = (metin: string) => <label style={{ fontSize: 12, color: c.textSecondary }}>{metin}</label>;
  const ipucu = (metin: string) => <span style={{ fontSize: 11, color: c.textSecondary }}>{metin}</span>;
  const alan = { fontSize: 13, padding: "6px 8px", width: "100%", boxSizing: "border-box" as const } as const;
  const bolum = (baslik: string) => (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
        color: c.textPrimary,
        marginTop: 6,
        paddingBottom: 4,
        borderBottom: `1px solid ${c.border}`,
      }}
    >
      {baslik}
    </div>
  );
  const kucukDugme = {
    fontSize: 13,
    background: "transparent",
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    padding: "6px 14px",
    cursor: "pointer",
    color: c.textSecondary,
    whiteSpace: "nowrap" as const,
  };
  const linkDugme = {
    background: "transparent",
    border: "none",
    padding: 0,
    color: c.accent,
    cursor: "pointer",
    fontSize: 12,
    textAlign: "left" as const,
  };

  return (
    <Modal
      title={t("İşe al")}
      subtitle={t("Kişiye davet gider; kabul ettiğinde seçtiğin departmanlara ve modüllere erişir.")}
      onClose={onClose}
      maxWidth={680}
      mobileFullScreen
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, alignItems: "center" }}>
          {error && <span style={{ fontSize: 12, color: c.danger, marginRight: "auto" }}>{error}</span>}
          <button onClick={onClose} style={kucukDugme}>
            {t("Vazgeç")}
          </button>
          <button
            data-primary
            onClick={gonder}
            disabled={busy || !kisi}
            style={{
              fontSize: 13,
              padding: "6px 14px",
              background: c.primary,
              color: c.onPrimary,
              border: "none",
              borderRadius: 8,
              cursor: busy || !kisi ? "default" : "pointer",
              opacity: busy || !kisi ? 0.6 : 1,
            }}
          >
            {busy ? t("Davet gönderiliyor…") : t("İşe al ve davet gönder")}
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* ------------------------------------------------------------ Kişi */}
        {bolum(t("Kişi"))}
        {kisi ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${c.accent}`, borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: c.textPrimary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {kisi.fullName}
              </div>
              <div style={{ fontSize: 12, color: c.textSecondary }}>@{kisi.username}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setKisi(null);
                setQuery("");
              }}
              style={{ ...linkDugme, color: c.textSecondary, fontSize: 13 }}
            >
              {t("Değiştir")}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <input
              type="text"
              placeholder={t("Ad, kullanıcı adı (@) veya e-posta ile ara…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              style={alan}
            />
            {query.trim() && (
              <div style={{ border: `1px solid ${c.border}`, borderRadius: 8, maxHeight: 220, overflowY: "auto" }}>
                {searching ? (
                  <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, padding: "10px 12px" }}>{t("Aranıyor…")}</p>
                ) : results.length === 0 ? (
                  <p style={{ fontSize: 13, color: c.textSecondary, margin: 0, padding: "10px 12px" }}>{t("Sonuç bulunamadı.")}</p>
                ) : (
                  results.map((u) => {
                    const ekipte = ekiptekiler.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setKisi(u);
                          setResults([]);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 12px",
                          background: "transparent",
                          border: "none",
                          borderBottom: `1px solid ${c.border}`,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, color: c.textPrimary }}>{u.fullName}</div>
                          <div style={{ fontSize: 12, color: c.textSecondary }}>@{u.username}</div>
                        </div>
                        {/* Seçilebilir: ekipteki biri başka bir departmana da alınabilir. */}
                        {ekipte && <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Ekipte")}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}
            <button type="button" onClick={onHesapAc} style={linkDugme}>
              {t("Projelio'da hesabı yok mu? Hesabını sen aç →")}
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------ Pozisyon */}
        {bolum(t("Pozisyon ve iş tanımı"))}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {etiket(t("Pozisyon"))}
          <input
            value={pozisyon}
            onChange={(e) => setPozisyon(e.target.value)}
            list="ise-al-pozisyonlar"
            maxLength={120}
            placeholder={t("Satış temsilcisi")}
            style={alan}
          />
          <datalist id="ise-al-pozisyonlar">
            {GOREV_ONERILERI.map((g) => (
              <option key={g} value={t(g)} />
            ))}
          </datalist>
          {ipucu(t("Kadroda unvan olarak görünür; yetkiyi değiştirmez."))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {etiket(t("İş tanımı"))}
          <textarea
            value={isTanimi}
            onChange={(e) => setIsTanimi(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t("Sorumlulukları, çalışma düzeni, başlangıç tarihi…")}
            style={{ ...alan, resize: "vertical" }}
          />
          {ipucu(t("Kişi daveti açınca okur."))}
        </div>

        <KadroSecimi
          secenekler={secenekler}
          departmanlar={departmanlar}
          setDepartmanlar={setDepartmanlar}
          moduller={moduller}
          setModuller={setModuller}
          bolum={bolum}
        />
      </div>
    </Modal>
  );
}
