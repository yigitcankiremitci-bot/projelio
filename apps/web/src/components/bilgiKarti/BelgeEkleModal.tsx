import { useEffect, useRef, useState } from "react";
import type { BilgiKartiBelgeTuru, BilgiKartiKapsami, ProjectFile } from "@projelio/shared";
import { BILGI_KARTI_BELGE_ETIKET, BILGI_KARTI_BELGE_TURLERI } from "@projelio/shared";
import { bilgiKartiApi } from "../../api/bilgiKarti";
import { filesApi, uploadFile, type FileFolder, type FileTarget } from "../../api/files";
import { useThemeColors } from "../../theme/useThemeColors";
import Modal from "../Modal";
import { IconFile, IconFolder, IconLink, IconUpload } from "../icons";

type Kaynak = "yukle" | "sec" | "baglanti";

interface Props {
  scopeType: BilgiKartiKapsami;
  scopeId: string;
  onClose: () => void;
  onEklendi: () => void;
}

/**
 * Karta belge ekleme.
 *
 * ÜÇ KAYNAK, çünkü belgeler gerçekte üç yerde duruyor:
 *   1. Kullanıcının bilgisayarında (vergi levhasının PDF'i) → yüklenir
 *   2. Zaten Projelio'da (muhasebe klasörüne konmuş sözleşme) → bağlanır,
 *      TAŞINMAZ: dosya klasöründe kalır, kartta da görünür (bkz. migration 095)
 *   3. Dışarıda (e-Devlet doğrulama adresi, muhasebecinin paylaştığı klasör)
 *      → bağlantı olarak kaydedilir; indirip yüklemenin anlamı yok, o adres
 *      zaten güncel olanı gösteriyor
 *
 * Yükleme bu pencerede BEKLENİYOR (kuyruğa verilmiyor): dosyanın kimliği
 * gelmeden belge kaydı yazılamıyor ve tek bir belge için kuyruk kurmak,
 * kullanıcının pencereyi kapatıp "eklendi mi?" diye merak etmesi demekti.
 */
export default function BelgeEkleModal({ scopeType, scopeId, onClose, onEklendi }: Props) {
  const c = useThemeColors();
  const [kaynak, setKaynak] = useState<Kaynak>("yukle");
  const [docType, setDocType] = useState<BilgiKartiBelgeTuru>("vergi_levhasi");
  const [title, setTitle] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [note, setNote] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [secilenDosya, setSecilenDosya] = useState<ProjectFile | null>(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");
  const dosyaInput = useRef<HTMLInputElement>(null);

  const hedef: FileTarget = scopeType === "organization" ? { organizationId: scopeId } : { jobId: scopeId };

  const handleUpload = async (file: File) => {
    setHata("");
    setYukleniyor(true);
    try {
      const yuklenen = await uploadFile(hedef, file);
      setSecilenDosya(yuklenen);
      // Başlık boşsa dosya adından doldurulur: kullanıcı aynı şeyi iki kez
      // yazmasın. Yazdıysa dokunulmaz.
      setTitle((mevcut) => mevcut || yuklenen.name);
    } catch {
      setHata("Dosya yüklenemedi. Bulut deposu bağlı mı diye bak, sonra tekrar dene.");
    } finally {
      setYukleniyor(false);
    }
  };

  const kaydet = async () => {
    setHata("");
    if (kaynak === "baglanti" && !externalUrl.trim()) {
      setHata("Bağlantı adresi gerekiyor.");
      return;
    }
    if (kaynak !== "baglanti" && !secilenDosya) {
      setHata("Önce bir dosya seç.");
      return;
    }
    setKaydediliyor(true);
    try {
      await bilgiKartiApi.belgeEkle(scopeType, scopeId, {
        docType,
        title: title.trim() || (kaynak === "baglanti" ? BILGI_KARTI_BELGE_ETIKET[docType] : secilenDosya?.name),
        fileId: kaynak === "baglanti" ? undefined : secilenDosya?.id,
        externalUrl: kaynak === "baglanti" ? externalUrl.trim() : undefined,
        issuedOn,
        validUntil,
        note,
      });
      onEklendi();
      onClose();
    } catch {
      setHata("Belge eklenemedi. Tekrar dene.");
      setKaydediliyor(false);
    }
  };

  const sekme = (deger: Kaynak, etiket: string, ikon: React.ReactNode) => (
    <button
      key={deger}
      type="button"
      onClick={() => {
        setKaynak(deger);
        setHata("");
      }}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "9px 8px",
        borderRadius: 9,
        fontSize: 14,
        border: `1px solid ${kaynak === deger ? c.accent : c.border}`,
        background: kaynak === deger ? `${c.accent}1A` : c.surface,
        color: kaynak === deger ? c.accentDark : c.textSecondary,
      }}
    >
      {ikon}
      {etiket}
    </button>
  );

  return (
    <Modal
      title="Belge ekle"
      subtitle="Vergi levhası, imza sirküleri, sicil gazetesi…"
      onClose={onClose}
      maxWidth={560}
      mobileFullScreen
      footer={
        <button
          type="button"
          data-primary
          onClick={kaydet}
          disabled={kaydediliyor || yukleniyor}
          style={{
            width: "100%",
            background: c.primary,
            color: c.onPrimary,
            padding: "11px 0",
            borderRadius: 8,
            border: "none",
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          {kaydediliyor ? "Ekleniyor…" : "Belgeyi ekle"}
        </button>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {sekme("yukle", "Yükle", <IconUpload size={15} color={kaynak === "yukle" ? c.accentDark : c.textSecondary} />)}
          {sekme("sec", "Dosyalarımdan", <IconFile size={15} color={kaynak === "sec" ? c.accentDark : c.textSecondary} />)}
          {sekme("baglanti", "Bağlantı", <IconLink size={15} color={kaynak === "baglanti" ? c.accentDark : c.textSecondary} />)}
        </div>

        {kaynak === "yukle" && (
          <div>
            <input
              ref={dosyaInput}
              type="file"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => dosyaInput.current?.click()}
              disabled={yukleniyor}
              style={{
                width: "100%",
                padding: "22px 12px",
                borderRadius: 10,
                border: `1px dashed ${c.border}`,
                background: c.background,
                color: c.textSecondary,
                fontSize: 15,
              }}
            >
              {yukleniyor ? "Yükleniyor…" : secilenDosya ? `Seçildi: ${secilenDosya.name}` : "Bilgisayardan dosya seç"}
            </button>
          </div>
        )}

        {kaynak === "sec" && (
          <DosyaSecici
            scopeType={scopeType}
            scopeId={scopeId}
            secilen={secilenDosya}
            onSec={(dosya) => {
              setSecilenDosya(dosya);
              setTitle((mevcut) => mevcut || dosya.name);
            }}
          />
        )}

        {kaynak === "baglanti" && (
          <Alan etiket="Bağlantı adresi">
            <input
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              placeholder="https://…"
              style={{ width: "100%" }}
            />
          </Alan>
        )}

        <Alan etiket="Belge türü">
          <select value={docType} onChange={(e) => setDocType(e.target.value as BilgiKartiBelgeTuru)} style={{ width: "100%" }}>
            {BILGI_KARTI_BELGE_TURLERI.map((tur) => (
              <option key={tur} value={tur}>
                {BILGI_KARTI_BELGE_ETIKET[tur]}
              </option>
            ))}
          </select>
        </Alan>

        <Alan etiket="Belge adı">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={BILGI_KARTI_BELGE_ETIKET[docType]}
            style={{ width: "100%" }}
          />
        </Alan>

        <div style={{ display: "flex", gap: 12 }}>
          <Alan etiket="Düzenlenme tarihi">
            <input type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} style={{ width: "100%" }} />
          </Alan>
          <Alan etiket="Geçerlilik bitişi">
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={{ width: "100%" }} />
          </Alan>
        </div>

        <Alan etiket="Not (opsiyonel)">
          <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} />
        </Alan>

        {hata && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>}
      </div>
    </Modal>
  );
}

function Alan({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  const c = useThemeColors();
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <label style={{ fontSize: 14, color: c.textSecondary }}>{etiket}</label>
      {children}
    </div>
  );
}

/**
 * Kapsamın dosya ağacında gezinip bir dosya seçme.
 *
 * Düz liste yetmiyordu: belgeler çoğu şirkette "Resmî evraklar" gibi bir
 * klasörün içinde duruyor ve kökte hiç görünmüyorlar.
 */
function DosyaSecici({
  scopeType,
  scopeId,
  secilen,
  onSec,
}: {
  scopeType: BilgiKartiKapsami;
  scopeId: string;
  secilen: ProjectFile | null;
  onSec: (dosya: ProjectFile) => void;
}) {
  const c = useThemeColors();
  const [klasorler, setKlasorler] = useState<FileFolder[]>([]);
  const [dosyalar, setDosyalar] = useState<ProjectFile[]>([]);
  const [yol, setYol] = useState<FileFolder[]>([]);
  const [yukleniyor, setYukleniyor] = useState(true);

  const acikKlasor = yol[yol.length - 1];

  useEffect(() => {
    let iptal = false;
    setYukleniyor(true);
    const owner = { kind: scopeType === "organization" ? ("organization" as const) : ("job" as const), id: scopeId };
    Promise.all([
      filesApi.folders(owner, acikKlasor?.id).catch(() => [] as FileFolder[]),
      scopeType === "organization"
        ? filesApi.listByOrganization(scopeId, acikKlasor?.id).catch(() => [] as ProjectFile[])
        : filesApi.listByJob(scopeId, { folderId: acikKlasor?.id }).catch(() => [] as ProjectFile[]),
    ]).then(([k, d]) => {
      if (iptal) return;
      setKlasorler(k);
      setDosyalar(d);
      setYukleniyor(false);
    });
    return () => {
      iptal = true;
    };
  }, [scopeType, scopeId, acikKlasor?.id]);

  return (
    <div style={{ border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          padding: "8px 10px",
          borderBottom: `1px solid ${c.border}`,
          background: c.background,
          fontSize: 13,
          color: c.textSecondary,
        }}
      >
        <button type="button" onClick={() => setYol([])} style={{ background: "none", border: "none", color: c.textSecondary, padding: 0 }}>
          Kök
        </button>
        {yol.map((klasor, i) => (
          <span key={klasor.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            /
            <button
              type="button"
              onClick={() => setYol(yol.slice(0, i + 1))}
              style={{ background: "none", border: "none", color: c.textSecondary, padding: 0 }}
            >
              {klasor.name}
            </button>
          </span>
        ))}
      </div>

      <div style={{ maxHeight: 220, overflowY: "auto" }}>
        {yukleniyor && <p style={{ padding: 12, margin: 0, fontSize: 14, color: c.textSecondary }}>Yükleniyor…</p>}
        {!yukleniyor && klasorler.length === 0 && dosyalar.length === 0 && (
          <p style={{ padding: 12, margin: 0, fontSize: 14, color: c.textSecondary }}>Bu klasörde dosya yok.</p>
        )}
        {klasorler.map((klasor) => (
          <button
            key={klasor.id}
            type="button"
            onClick={() => setYol([...yol, klasor])}
            style={satirStili(c, false)}
          >
            <IconFolder size={16} color={c.textSecondary} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{klasor.name}</span>
          </button>
        ))}
        {dosyalar.map((dosya) => (
          <button key={dosya.id} type="button" onClick={() => onSec(dosya)} style={satirStili(c, secilen?.id === dosya.id)}>
            <IconFile size={16} color={secilen?.id === dosya.id ? c.accentDark : c.textSecondary} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dosya.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function satirStili(c: ReturnType<typeof useThemeColors>, secili: boolean): React.CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    border: "none",
    borderBottom: `1px solid ${c.border}`,
    background: secili ? `${c.accent}1A` : "transparent",
    color: secili ? c.accentDark : c.textPrimary,
    fontSize: 14,
    textAlign: "left",
  };
}
