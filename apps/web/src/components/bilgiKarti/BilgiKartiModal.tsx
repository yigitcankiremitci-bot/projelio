import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { BilgiKartiAlani, BilgiKartiKapsami, BilgiKartiSayfasi } from "@projelio/shared";
import { BELGE_DURUM_ETIKET, BILGI_KARTI_BELGE_ETIKET, belgeDurumu } from "@projelio/shared";
import { bilgiKartiApi, type BilgiKartiGirdisi } from "../../api/bilgiKarti";
import { useThemeColors } from "../../theme/useThemeColors";
import Modal from "../Modal";
import BelgeEkleModal from "./BelgeEkleModal";
import { KUNYE_BOLUMLERI, formDurumu, kartBosMu, kunyeDegeri, type KunyeAlani } from "./kunyeAlanlari";
import { IconCheck, IconCopy, IconEdit, IconExternalLink, IconFile, IconPlus, IconTrash } from "../icons";

type Sekme = "kunye" | "belgeler" | "ozet";

interface Props {
  scopeType: BilgiKartiKapsami;
  scopeId: string;
  onClose: () => void;
}

/**
 * Şirket bilgi kartı — künye, belgeler ve diğer modüllerden toplanan özet.
 *
 * NEDEN MODAL, SEKME DEĞİL: bu bilgiye ihtiyaç duyulduğu anlar hep BAŞKA bir
 * işin ortasında oluyor (teklif yazarken vergi numarası, kargo formunda adres,
 * ihalede sicil gazetesi). Ayrı bir sekme, kullanıcıyı yaptığı işten koparıp
 * geri dönmeye zorlardı; pencere kapanınca kaldığı yerde kalıyor.
 *
 * OKUMAK KOPYALAMAKTIR: her değere tıklanınca panoya kopyalanıyor. Kartın
 * varlık sebebinin yarısı bu — kullanıcı bu numaraları okumak için değil, bir
 * yere yazmak için açıyor.
 *
 * ÜÇ SEKME, ÜÇ SORU: "bilgi ne" (künye), "belgesi nerede" (belgeler),
 * "şirket ne durumda" (özet).
 */
export default function BilgiKartiModal({ scopeType, scopeId, onClose }: Props) {
  const c = useThemeColors();
  const [sayfa, setSayfa] = useState<BilgiKartiSayfasi | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState("");
  const [sekme, setSekme] = useState<Sekme>("kunye");
  const [duzenleme, setDuzenleme] = useState(false);
  const [form, setForm] = useState<BilgiKartiGirdisi>({});
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kopyalanan, setKopyalanan] = useState<string | null>(null);
  const [belgeEkleniyor, setBelgeEkleniyor] = useState(false);

  const yukle = useCallback(async () => {
    try {
      const veri = await bilgiKartiApi.sayfa(scopeType, scopeId);
      setSayfa(veri);
      setForm(formDurumu(veri.kart));
      setHata("");
    } catch {
      setHata("Bilgi kartı açılamadı. Bu kartı görme yetkin olmayabilir.");
    } finally {
      setYukleniyor(false);
    }
  }, [scopeType, scopeId]);

  useEffect(() => {
    void yukle();
  }, [yukle]);

  const kopyala = (anahtar: string, deger: string) => {
    // Pano API'si güvensiz bağlamda (http) HİÇ tanımlı olmuyor; `?.` ile
    // çağırmak da yetmez, çünkü sonuç undefined olunca .then patlar.
    if (!navigator.clipboard) return;
    navigator.clipboard
      .writeText(deger)
      .then(() => {
        setKopyalanan(anahtar);
        window.setTimeout(() => setKopyalanan((k) => (k === anahtar ? null : k)), 1400);
      })
      // Erişim reddedilebilir; sessiz geçmek doğru: değer zaten ekranda.
      .catch(() => undefined);
  };

  const kaydet = async () => {
    setKaydediliyor(true);
    try {
      await bilgiKartiApi.guncelle(scopeType, scopeId, form);
      await yukle();
      setDuzenleme(false);
    } catch {
      setHata("Kaydedilemedi. Tekrar dene.");
    } finally {
      setKaydediliyor(false);
    }
  };

  const canEdit = sayfa?.yetki.canEdit === true;

  return (
    <Modal
      title={sayfa?.scopeName ?? "Bilgi kartı"}
      subtitle={scopeType === "organization" ? "Şirket bilgi kartı" : "İş bilgi kartı"}
      onClose={onClose}
      maxWidth={720}
      mobileFullScreen
      footer={
        duzenleme ? (
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => {
                setForm(formDurumu(sayfa?.kart ?? null));
                setDuzenleme(false);
              }}
              style={{
                flex: 1,
                padding: "11px 0",
                borderRadius: 8,
                border: `1px solid ${c.border}`,
                background: c.surface,
                color: c.textSecondary,
                fontSize: 16,
              }}
            >
              Vazgeç
            </button>
            <button
              type="button"
              data-primary
              onClick={kaydet}
              disabled={kaydediliyor}
              style={{
                flex: 2,
                padding: "11px 0",
                borderRadius: 8,
                border: "none",
                background: c.primary,
                color: c.onPrimary,
                fontSize: 16,
                fontWeight: 500,
              }}
            >
              {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        ) : undefined
      }
    >
      {yukleniyor && <p style={{ color: c.textSecondary, fontSize: 15 }}>Yükleniyor…</p>}
      {!yukleniyor && hata && <p style={{ color: c.danger, fontSize: 15 }}>{hata}</p>}

      {sayfa && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Basliklik sayfa={sayfa} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <SekmeDugmesi aktif={sekme === "kunye"} onClick={() => setSekme("kunye")} etiket="Künye" />
            <SekmeDugmesi
              aktif={sekme === "belgeler"}
              onClick={() => setSekme("belgeler")}
              etiket={`Belgeler${sayfa.belgeler.length ? ` (${sayfa.belgeler.length})` : ""}`}
            />
            <SekmeDugmesi aktif={sekme === "ozet"} onClick={() => setSekme("ozet")} etiket="Şirket özeti" />

            {sekme === "kunye" && canEdit && !duzenleme && (
              <button
                type="button"
                onClick={() => setDuzenleme(true)}
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: `1px solid ${c.border}`,
                  background: c.surface,
                  color: c.textSecondary,
                  fontSize: 14,
                }}
              >
                <IconEdit size={14} color={c.textSecondary} />
                Düzenle
              </button>
            )}
            {sekme === "belgeler" && canEdit && (
              <button
                type="button"
                onClick={() => setBelgeEkleniyor(true)}
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 12px",
                  borderRadius: 8,
                  border: `1px solid ${c.border}`,
                  background: c.surface,
                  color: c.textSecondary,
                  fontSize: 14,
                }}
              >
                <IconPlus size={14} color={c.textSecondary} />
                Belge ekle
              </button>
            )}
          </div>

          {sekme === "kunye" &&
            (duzenleme ? (
              <KunyeFormu
                form={form}
                onDegis={(key, value) => setForm((m) => ({ ...m, [key]: value }))}
                alanlar={sayfa.alanlar}
                scopeType={scopeType}
                scopeId={scopeId}
                onAlanlarDegisti={yukle}
              />
            ) : (
              <KunyeGorunumu
                sayfa={sayfa}
                kopyalanan={kopyalanan}
                onKopyala={kopyala}
                canEdit={canEdit}
                onDuzenle={() => setDuzenleme(true)}
              />
            ))}

          {sekme === "belgeler" && (
            <Belgeler
              sayfa={sayfa}
              canEdit={canEdit}
              onEkle={() => setBelgeEkleniyor(true)}
              onSil={async (id) => {
                await bilgiKartiApi.belgeSil(scopeType, scopeId, id).catch(() => undefined);
                await yukle();
              }}
            />
          )}

          {sekme === "ozet" && <Ozet sayfa={sayfa} onKapat={onClose} />}
        </div>
      )}

      {belgeEkleniyor && (
        <BelgeEkleModal
          scopeType={scopeType}
          scopeId={scopeId}
          onClose={() => setBelgeEkleniyor(false)}
          onEklendi={yukle}
        />
      )}
    </Modal>
  );
}

/** Kartın tepesindeki şerit: kapak, ünvan, sektör ve son güncelleme. */
function Basliklik({ sayfa }: { sayfa: BilgiKartiSayfasi }) {
  const c = useThemeColors();
  const kart = sayfa.kart;
  const unvan = kart?.legalName || kart?.brandName || sayfa.scopeName;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: 14,
        borderRadius: 12,
        border: `1px solid ${c.border}`,
        background: c.background,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          flexShrink: 0,
          borderRadius: 10,
          overflow: "hidden",
          background: `${c.primary}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: c.primaryDark,
          fontSize: 20,
          fontWeight: 600,
        }}
      >
        {sayfa.coverImageUrl ? (
          <img src={sayfa.coverImageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          unvan.slice(0, 1).toUpperCase()
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 17, fontWeight: 500, color: c.textPrimary }}>{unvan}</p>
        <p style={{ margin: "3px 0 0", fontSize: 13, color: c.textSecondary }}>
          {[kart?.sector, kart?.city, kart?.taxNumber ? `VKN ${kart.taxNumber}` : null].filter(Boolean).join(" · ") ||
            "Künye henüz doldurulmadı"}
        </p>
        {kart?.updatedAt && (
          <p style={{ margin: "3px 0 0", fontSize: 12, color: c.textSecondary }}>
            Son güncelleme: {new Date(kart.updatedAt).toLocaleDateString("tr-TR")}
            {kart.updatedByName ? ` · ${kart.updatedByName}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

function SekmeDugmesi({ aktif, onClick, etiket }: { aktif: boolean; onClick: () => void; etiket: string }) {
  const c = useThemeColors();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 13px",
        borderRadius: 20,
        fontSize: 14,
        border: `1px solid ${aktif ? c.accent : c.border}`,
        background: aktif ? `${c.accent}1A` : c.surface,
        color: aktif ? c.accentDark : c.textSecondary,
      }}
    >
      {etiket}
    </button>
  );
}

// ------------------------------------------------------------------- Künye

function KunyeGorunumu({
  sayfa,
  kopyalanan,
  onKopyala,
  canEdit,
  onDuzenle,
}: {
  sayfa: BilgiKartiSayfasi;
  kopyalanan: string | null;
  onKopyala: (anahtar: string, deger: string) => void;
  canEdit: boolean;
  onDuzenle: () => void;
}) {
  const c = useThemeColors();

  if (kartBosMu(sayfa.kart) && sayfa.alanlar.length === 0) {
    return (
      <div style={{ padding: "26px 18px", textAlign: "center", border: `1px dashed ${c.border}`, borderRadius: 12 }}>
        <p style={{ margin: 0, fontSize: 15, color: c.textSecondary }}>
          Bu kart henüz boş. Vergi dairesi, adres ve sicil bilgilerini bir kez girdiğinde ekipteki herkes buradan
          bulabilir.
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={onDuzenle}
            style={{
              marginTop: 14,
              padding: "9px 18px",
              borderRadius: 8,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              fontSize: 15,
            }}
          >
            Bilgileri gir
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {KUNYE_BOLUMLERI.map((bolum) => {
        const dolu = bolum.alanlar.filter((alan) => kunyeDegeri(sayfa.kart, alan) !== "");
        // Boş bölüm hiç çizilmiyor: okuma ekranında yarısı boş bir liste,
        // aradığı bilgiyi tarayan gözü yoruyor. Eksikler düzenleme formunda.
        if (dolu.length === 0) return null;
        return (
          <div key={bolum.key}>
            <BolumBasligi>{bolum.title}</BolumBasligi>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
              {dolu.map((alan) => (
                <DegerSatiri
                  key={String(alan.key)}
                  etiket={alan.label}
                  deger={kunyeDegeri(sayfa.kart, alan)}
                  kopyalandi={kopyalanan === String(alan.key)}
                  onKopyala={() => onKopyala(String(alan.key), kunyeDegeri(sayfa.kart, alan))}
                />
              ))}
            </div>
          </div>
        );
      })}

      {sayfa.alanlar.length > 0 && (
        <div>
          <BolumBasligi>Ek bilgiler</BolumBasligi>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {sayfa.alanlar.map((alan) => (
              <DegerSatiri
                key={alan.id}
                etiket={alan.label}
                deger={alan.value ?? ""}
                kopyalandi={kopyalanan === alan.id}
                onKopyala={() => onKopyala(alan.id, alan.value ?? "")}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BolumBasligi({ children }: { children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <p
      style={{
        margin: "0 0 8px",
        fontSize: 12,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color: c.textSecondary,
      }}
    >
      {children}
    </p>
  );
}

function DegerSatiri({
  etiket,
  deger,
  kopyalandi,
  onKopyala,
}: {
  etiket: string;
  deger: string;
  kopyalandi: boolean;
  onKopyala: () => void;
}) {
  const c = useThemeColors();
  return (
    <button
      type="button"
      onClick={onKopyala}
      title="Kopyalamak için tıkla"
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 10,
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${kopyalandi ? c.success : c.border}`,
        background: c.surface,
      }}
    >
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>{etiket}</span>
        <span style={{ display: "block", fontSize: 15, color: c.textPrimary, wordBreak: "break-word" }}>{deger}</span>
      </span>
      {kopyalandi ? (
        <IconCheck size={14} color={c.success} />
      ) : (
        <IconCopy size={14} color={c.textSecondary} />
      )}
    </button>
  );
}

function KunyeFormu({
  form,
  onDegis,
  alanlar,
  scopeType,
  scopeId,
  onAlanlarDegisti,
}: {
  form: BilgiKartiGirdisi;
  onDegis: (key: keyof BilgiKartiGirdisi, value: string) => void;
  alanlar: BilgiKartiAlani[];
  scopeType: BilgiKartiKapsami;
  scopeId: string;
  onAlanlarDegisti: () => Promise<void>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {KUNYE_BOLUMLERI.map((bolum) => (
        <div key={bolum.key}>
          <BolumBasligi>{bolum.title}</BolumBasligi>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {bolum.alanlar.map((alan) => (
              <FormAlani
                key={String(alan.key)}
                alan={alan}
                deger={form[alan.key] ?? ""}
                onDegis={(value) => onDegis(alan.key, value)}
              />
            ))}
          </div>
        </div>
      ))}

      <EkAlanlar alanlar={alanlar} scopeType={scopeType} scopeId={scopeId} onDegisti={onAlanlarDegisti} />
    </div>
  );
}

function FormAlani({ alan, deger, onDegis }: { alan: KunyeAlani; deger: string; onDegis: (v: string) => void }) {
  const c = useThemeColors();
  const ortak = {
    value: deger,
    placeholder: alan.placeholder,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onDegis(e.target.value),
    style: { width: "100%" },
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: alan.genis ? "1 / -1" : undefined }}>
      <label style={{ fontSize: 13, color: c.textSecondary }}>{alan.label}</label>
      {alan.tur === "multiline" ? (
        <textarea {...ortak} rows={3} />
      ) : (
        <input
          {...ortak}
          type={alan.tur === "date" ? "date" : alan.tur === "number" ? "number" : alan.tur ?? "text"}
          min={alan.tur === "number" ? 0 : undefined}
        />
      )}
    </div>
  );
}

/**
 * Kullanıcının kendi eklediği alanlar.
 *
 * Sabit künye ile aynı formda ama AYRI uçlardan kaydediliyor: künye tek satır,
 * bunlar ayrı kayıtlar. Kaydet'i beklemeden anında işleniyorlar — "ekle"ye
 * basıp Kaydet'e basmayı unutan kullanıcı, yazdığını kaybediyordu.
 */
function EkAlanlar({
  alanlar,
  scopeType,
  scopeId,
  onDegisti,
}: {
  alanlar: BilgiKartiAlani[];
  scopeType: BilgiKartiKapsami;
  scopeId: string;
  onDegisti: () => Promise<void>;
}) {
  const c = useThemeColors();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [isleniyor, setIsleniyor] = useState(false);

  const ekle = async () => {
    if (!label.trim()) return;
    setIsleniyor(true);
    await bilgiKartiApi.alanEkle(scopeType, scopeId, label.trim(), value.trim()).catch(() => undefined);
    setLabel("");
    setValue("");
    await onDegisti();
    setIsleniyor(false);
  };

  return (
    <div>
      <BolumBasligi>Ek bilgiler</BolumBasligi>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {alanlar.map((alan) => (
          <div key={alan.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              defaultValue={alan.label}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== alan.label) {
                  void bilgiKartiApi
                    .alanGuncelle(scopeType, scopeId, alan.id, { label: e.target.value.trim() })
                    .then(onDegisti)
                    .catch(() => undefined);
                }
              }}
              style={{ flex: 1, minWidth: 0 }}
            />
            <input
              defaultValue={alan.value ?? ""}
              onBlur={(e) => {
                if (e.target.value !== (alan.value ?? "")) {
                  void bilgiKartiApi
                    .alanGuncelle(scopeType, scopeId, alan.id, { value: e.target.value })
                    .then(onDegisti)
                    .catch(() => undefined);
                }
              }}
              style={{ flex: 2, minWidth: 0 }}
            />
            <button
              type="button"
              aria-label="Alanı sil"
              onClick={() => {
                void bilgiKartiApi.alanSil(scopeType, scopeId, alan.id).then(onDegisti).catch(() => undefined);
              }}
              style={{ background: "transparent", border: "none", padding: 6, display: "flex" }}
            >
              <IconTrash size={15} color={c.textSecondary} />
            </button>
          </div>
        ))}

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Alan adı (ör. Oda sicil no)"
            style={{ flex: 1, minWidth: 0 }}
          />
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Değer"
            style={{ flex: 2, minWidth: 0 }}
          />
          <button
            type="button"
            onClick={ekle}
            disabled={isleniyor || !label.trim()}
            aria-label="Alan ekle"
            style={{
              display: "flex",
              alignItems: "center",
              padding: 8,
              borderRadius: 8,
              border: `1px solid ${c.border}`,
              background: c.surface,
            }}
          >
            <IconPlus size={15} color={c.textSecondary} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- Belgeler

function Belgeler({
  sayfa,
  canEdit,
  onEkle,
  onSil,
}: {
  sayfa: BilgiKartiSayfasi;
  canEdit: boolean;
  onEkle: () => void;
  onSil: (id: string) => Promise<void>;
}) {
  const c = useThemeColors();

  if (sayfa.belgeler.length === 0) {
    return (
      <div style={{ padding: "26px 18px", textAlign: "center", border: `1px dashed ${c.border}`, borderRadius: 12 }}>
        <p style={{ margin: 0, fontSize: 15, color: c.textSecondary }}>
          Henüz belge yok. Vergi levhası, imza sirküleri ve sicil gazetesi burada dursun; her istendiğinde aranmasın.
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={onEkle}
            style={{
              marginTop: 14,
              padding: "9px 18px",
              borderRadius: 8,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              fontSize: 15,
            }}
          >
            Belge ekle
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sayfa.belgeler.map((belge) => {
        const durum = belgeDurumu(belge.validUntil);
        const adres = belge.externalUrl ?? belge.webViewLink;
        return (
          <div
            key={belge.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "11px 13px",
              borderRadius: 11,
              border: `1px solid ${durum === "doldu" ? c.danger : c.border}`,
              background: c.surface,
            }}
          >
            <IconFile size={18} color={c.textSecondary} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontSize: 15, color: c.textPrimary, wordBreak: "break-word" }}>{belge.title}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: c.textSecondary }}>
                {[
                  BILGI_KARTI_BELGE_ETIKET[belge.docType],
                  belge.issuedOn ? `Düzenlenme ${new Date(belge.issuedOn).toLocaleDateString("tr-TR")}` : null,
                  belge.validUntil ? `Geçerlilik ${new Date(belge.validUntil).toLocaleDateString("tr-TR")}` : null,
                  belge.externalUrl ? "Dış bağlantı" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {belge.note && <p style={{ margin: "2px 0 0", fontSize: 12.5, color: c.textSecondary }}>{belge.note}</p>}
            </div>

            {durum !== "gecerli" && (
              <span
                style={{
                  fontSize: 11.5,
                  whiteSpace: "nowrap",
                  padding: "3px 9px",
                  borderRadius: 20,
                  color: durum === "doldu" ? c.danger : c.warning,
                  background: `${durum === "doldu" ? c.danger : c.warning}1A`,
                }}
              >
                {BELGE_DURUM_ETIKET[durum]}
              </span>
            )}

            {adres && (
              <a
                href={adres}
                target="_blank"
                rel="noreferrer"
                aria-label="Belgeyi aç"
                style={{ display: "flex", padding: 6 }}
              >
                <IconExternalLink size={16} color={c.textSecondary} />
              </a>
            )}
            {canEdit && (
              <button
                type="button"
                aria-label="Belgeyi karttan kaldır"
                title="Karttan kaldırır, dosyayı silmez"
                onClick={() => void onSil(belge.id)}
                style={{ background: "transparent", border: "none", padding: 6, display: "flex" }}
              >
                <IconTrash size={15} color={c.textSecondary} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------- Özet

function Ozet({ sayfa, onKapat }: { sayfa: BilgiKartiSayfasi; onKapat: () => void }) {
  const c = useThemeColors();

  if (sayfa.ozet.sections.length === 0) {
    return <p style={{ fontSize: 15, color: c.textSecondary, margin: 0 }}>Özetlenecek veri bulunamadı.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {sayfa.ozet.sections.map((bolum) => (
        <div key={bolum.key}>
          <BolumBasligi>{bolum.title}</BolumBasligi>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {bolum.rows.map((satir) => {
              const govde = (
                <>
                  <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>{satir.label}</span>
                  <span style={{ display: "block", fontSize: 15, color: c.textPrimary, wordBreak: "break-word" }}>
                    {satir.value}
                  </span>
                </>
              );
              const kutu: React.CSSProperties = {
                display: "block",
                padding: "10px 12px",
                borderRadius: 10,
                border: `1px solid ${c.border}`,
                background: c.surface,
                textAlign: "left",
              };
              // Bağlantılı satır kullanıcıyı ilgili ekrana götürüyor; kart
              // kapanmazsa arkada açık kalıp gidilen sayfanın üstünü örterdi.
              return satir.href ? (
                <Link key={satir.key} to={satir.href} onClick={onKapat} style={kutu}>
                  {govde}
                </Link>
              ) : (
                <div key={satir.key} style={kutu}>
                  {govde}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
