import { useState } from "react";
import type { ProjectFile, SocialInspiration, SocialInspirationKind } from "@projelio/shared";
import { safeExternalUrl } from "@projelio/shared";
import { filesApi, uploadFile } from "../../api/files";
import { socialMediaApi, type SocialScope } from "../../api/socialMedia";
import { useT } from "../../lib/i18n";
import Modal from "../Modal";
import { MaddeListesi, useAnalizStilleri } from "./ortak";

interface Props {
  scope: SocialScope;
  ilhamlar: SocialInspiration[];
  canWrite: boolean;
  onDegisti: (ilhamlar: SocialInspiration[]) => void;
}

/**
 * İlham panosu: beğenilen hesaplar ve içerikler.
 *
 * BİLEREK ELLE: Projelio başka hesapların verisini otomatik çekmez (Instagram
 * koşulları + resmi yol Facebook Sayfası istiyor; bkz. 145_icerik_analizi.sql).
 * Kullanıcı bağlantıyı, gözlemini ve isterse referans videosunu ekler; Lio
 * bunlara bakarak "neden işliyor, sana nasıl uyar" der.
 */
export default function IlhamPanosu({ scope, ilhamlar, canWrite, onDegisti }: Props) {
  const t = useT();
  const { c, kart, ikincilDugme } = useAnalizStilleri();
  const [form, setForm] = useState<{ ilham?: SocialInspiration } | null>(null);
  const [calisan, setCalisan] = useState<string | null>(null);
  const [hata, setHata] = useState<{ id: string; mesaj: string } | null>(null);
  const [acik, setAcik] = useState<Set<string>>(new Set());

  const degistir = (yeni: SocialInspiration) => {
    const var_ = ilhamlar.some((i) => i.id === yeni.id);
    onDegisti(var_ ? ilhamlar.map((i) => (i.id === yeni.id ? yeni : i)) : [yeni, ...ilhamlar]);
  };

  const incele = async (ilham: SocialInspiration) => {
    setCalisan(ilham.id);
    setHata(null);
    try {
      const guncel = await socialMediaApi.ilhamAnalizi(ilham.id);
      degistir(guncel);
      setAcik((s) => new Set(s).add(guncel.id));
    } catch (err) {
      setHata({ id: ilham.id, mesaj: err instanceof Error ? err.message : t("Lio bir analiz üretemedi, tekrar dene.") });
    } finally {
      setCalisan(null);
    }
  };

  const sil = async (ilham: SocialInspiration) => {
    if (!window.confirm(t("Bu ilham kaydı silinsin mi? Yüklediğin referans dosyası dosyalarında kalır."))) return;
    try {
      await socialMediaApi.ilhamSil(ilham.id);
      onDegisti(ilhamlar.filter((i) => i.id !== ilham.id));
    } catch (err) {
      setHata({ id: ilham.id, mesaj: err instanceof Error ? err.message : t("Silinemedi") });
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 320px", fontSize: 12, color: c.textSecondary, lineHeight: 1.5 }}>
          {t(
            "Beğendiğin hesapları ve videoları buraya kaydet: bağlantısını, neyin dikkatini çektiğini ve istersen videonun kendisini ekle. Projelio başka hesaplardan otomatik veri toplamaz; Lio senin notlarına ve yüklediğin dosyaya bakar."
          )}
        </span>
        {canWrite && (
          <button
            type="button"
            onClick={() => setForm({})}
            style={{ ...ikincilDugme, borderColor: c.primary, color: c.primary }}
          >
            + {t("İlham ekle")}
          </button>
        )}
      </div>

      {ilhamlar.length === 0 && (
        <div style={{ ...kart, borderStyle: "dashed", fontSize: 13, color: c.textSecondary, lineHeight: 1.5 }}>
          {t(
            "Henüz ilham kaynağı yok. Örneğin: senin tarzında içerik üreten 5-10 hesap ve her birinden en çok izlenen 1-2 video iyi bir başlangıç."
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {ilhamlar.map((ilham) => {
          const link = safeExternalUrl(ilham.url);
          const analiz = ilham.lioAnaliz;
          const analizAcik = acik.has(ilham.id);
          return (
            <div key={ilham.id} style={{ ...kart, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    color: c.textSecondary,
                    border: `1px solid ${c.border}`,
                    borderRadius: 4,
                    padding: "1px 5px",
                  }}
                >
                  {ilham.kind === "account" ? t("Hesap") : t("İçerik")}
                </span>
                <span style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, flex: 1, minWidth: 0 }}>
                  {ilham.title}
                </span>
              </div>
              {(ilham.handle || link) && (
                <div style={{ display: "flex", gap: 8, fontSize: 12, flexWrap: "wrap" }}>
                  {ilham.handle && <span style={{ color: c.textSecondary }}>@{ilham.handle}</span>}
                  {link && (
                    <a href={link} target="_blank" rel="noreferrer" style={{ color: c.primary }}>
                      {t("Aç")} ↗
                    </a>
                  )}
                </div>
              )}
              {ilham.note && (
                <span style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {ilham.note}
                </span>
              )}
              {ilham.tags && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {ilham.tags
                    .split(",")
                    .map((e) => e.trim())
                    .filter(Boolean)
                    .map((e) => (
                      <span
                        key={e}
                        style={{ fontSize: 11, color: c.primary, background: `${c.primary}12`, borderRadius: 999, padding: "1px 8px" }}
                      >
                        {e}
                      </span>
                    ))}
                </div>
              )}
              {ilham.fileName && (
                <span style={{ fontSize: 12, color: c.textSecondary }}>📎 {ilham.fileName}</span>
              )}

              {analiz && (
                <button
                  type="button"
                  onClick={() =>
                    setAcik((s) => {
                      const y = new Set(s);
                      if (y.has(ilham.id)) y.delete(ilham.id);
                      else y.add(ilham.id);
                      return y;
                    })
                  }
                  style={{ ...ikincilDugme, alignSelf: "flex-start", border: "none", padding: 0, color: c.primary }}
                >
                  {analizAcik ? t("Lio'nun analizini gizle") : t("Lio'nun analizini göster")}
                </button>
              )}
              {analiz && analizAcik && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: 10,
                    borderRadius: 8,
                    background: `${c.primary}08`,
                  }}
                >
                  {analiz.gorulen && (
                    <span style={{ fontSize: 12, color: c.textSecondary, fontStyle: "italic" }}>
                      {t("Lio'nun gördüğü:")} {analiz.gorulen}
                    </span>
                  )}
                  {analiz.hook && (
                    <span style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5 }}>
                      <b>{t("Açılış (hook)")}:</b> {analiz.hook}
                    </span>
                  )}
                  {analiz.yapi && (
                    <span style={{ fontSize: 13, color: c.textPrimary, lineHeight: 1.5 }}>
                      <b>{t("Akış")}:</b> {analiz.yapi}
                    </span>
                  )}
                  <MaddeListesi baslik={t("Neden işliyor")} maddeler={analiz.nedenIsliyor} />
                  <MaddeListesi baslik={t("Senin hesabına uyarla")} maddeler={analiz.uyarla} renk={c.success} />
                  <span style={{ fontSize: 11, color: c.textSecondary }}>{t("{birim} birim", { birim: analiz.kredi })}</span>
                </div>
              )}

              {hata?.id === ilham.id && <span style={{ fontSize: 12, color: c.danger }}>{hata.mesaj}</span>}

              {canWrite && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: "auto" }}>
                  <button
                    type="button"
                    onClick={() => void incele(ilham)}
                    disabled={calisan !== null}
                    title={t("Lio Bakiyesi harcar.")}
                    style={{
                      ...ikincilDugme,
                      borderColor: c.primary,
                      color: c.primary,
                      opacity: calisan !== null ? 0.6 : 1,
                      cursor: calisan !== null ? "default" : "pointer",
                    }}
                  >
                    {calisan === ilham.id
                      ? ilham.fileMimeType?.startsWith("video/")
                        ? t("Lio videoyu izliyor…")
                        : t("Lio bakıyor…")
                      : analiz
                        ? t("Yeniden incele")
                        : t("Lio incelesin")}
                  </button>
                  <button type="button" onClick={() => setForm({ ilham })} style={ikincilDugme}>
                    {t("Düzenle")}
                  </button>
                  <button type="button" onClick={() => void sil(ilham)} style={{ ...ikincilDugme, color: c.danger }}>
                    {t("Sil")}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {form && (
        <IlhamFormu
          scope={scope}
          ilham={form.ilham}
          onClose={() => setForm(null)}
          onKaydedildi={(yeni) => {
            degistir(yeni);
            setForm(null);
          }}
        />
      )}
    </div>
  );
}

function IlhamFormu({
  scope,
  ilham,
  onClose,
  onKaydedildi,
}: {
  scope: SocialScope;
  ilham?: SocialInspiration;
  onClose: () => void;
  onKaydedildi: (ilham: SocialInspiration) => void;
}) {
  const t = useT();
  const { c, alan, birincilDugme, ikincilDugme } = useAnalizStilleri();
  const [kind, setKind] = useState<SocialInspirationKind>(ilham?.kind ?? "post");
  const [title, setTitle] = useState(ilham?.title ?? "");
  const [url, setUrl] = useState(ilham?.url ?? "");
  const [handle, setHandle] = useState(ilham?.handle ?? "");
  const [note, setNote] = useState(ilham?.note ?? "");
  const [tags, setTags] = useState(ilham?.tags ?? "");
  const [dosya, setDosya] = useState<{ id: string; name: string } | null>(
    ilham?.fileId ? { id: ilham.fileId, name: ilham.fileName ?? t("Ekli dosya") } : null
  );
  const [yukleniyor, setYukleniyor] = useState(false);
  const [yuzdeYuklenen, setYuzdeYuklenen] = useState(0);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState("");

  // Composer'daki kural: dosya iş ya da departman klasörüne gider; departmansız
  // organizasyon kapsamında yükleme hedefi yok.
  const hedef = "jobId" in scope ? { jobId: scope.jobId } : scope.departmentId ? { departmentId: scope.departmentId } : null;

  const yukle = async (file: File | undefined) => {
    if (!file || !hedef) return;
    setYukleniyor(true);
    setHata("");
    let oturum: string | undefined;
    try {
      let yuklenen: ProjectFile;
      try {
        yuklenen = await uploadFile(hedef, file, {}, (r) => setYuzdeYuklenen(Math.round(r * 100)), undefined, (id) => {
          oturum = id;
        });
      } catch (err) {
        // Büyük videoda son parçanın yanıtı düşebiliyor; dosya oluşmuş olabilir
        // (bkz. SocialPostComposer.yukle).
        const sonuc = oturum ? await filesApi.reconcileSession(oturum, false).catch(() => null) : null;
        if (sonuc?.status !== "completed") throw err;
        yuklenen = sonuc.file;
      }
      setDosya({ id: yuklenen.id, name: yuklenen.name });
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Dosya yüklenemedi"));
    } finally {
      setYukleniyor(false);
    }
  };

  const kaydet = async () => {
    setKaydediliyor(true);
    setHata("");
    const govde = {
      kind,
      title: title.trim(),
      url: url.trim(),
      handle: handle.trim(),
      note: note.trim(),
      tags: tags.trim(),
      fileId: dosya?.id ?? null,
    };
    try {
      onKaydedildi(
        ilham ? await socialMediaApi.ilhamGuncelle(ilham.id, govde) : await socialMediaApi.ilhamEkle(scope, govde)
      );
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setKaydediliyor(false);
    }
  };

  const etiket = (metin: string) => <span style={{ fontSize: 12, color: c.textSecondary }}>{metin}</span>;

  return (
    <Modal
      title={ilham ? t("İlham kaynağını düzenle") : t("İlham ekle")}
      onClose={onClose}
      maxWidth={560}
      mobileFullScreen
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={ikincilDugme}>
            {t("Vazgeç")}
          </button>
          <button
            type="button"
            data-primary
            onClick={() => void kaydet()}
            disabled={kaydediliyor || yukleniyor || (!title.trim() && !url.trim() && !handle.trim())}
            style={{ ...birincilDugme, opacity: kaydediliyor || yukleniyor ? 0.6 : 1 }}
          >
            {kaydediliyor ? t("Kaydediliyor…") : t("Kaydet")}
          </button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["post", "account"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              style={{
                ...ikincilDugme,
                borderColor: kind === k ? c.primary : c.border,
                color: kind === k ? c.primary : c.textSecondary,
                background: kind === k ? `${c.primary}12` : "transparent",
              }}
            >
              {k === "post" ? t("Tek içerik (video/gönderi)") : t("Takip ettiğim hesap")}
            </button>
          ))}
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {etiket(t("Başlık"))}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={kind === "post" ? t("ör. Soruyla açılan 30 sn'lik tarif videosu") : t("ör. Ev yemekleri yapan hesap")}
            style={alan}
          />
        </label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "2 1 220px" }}>
            {etiket(t("Bağlantı"))}
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://instagram.com/…" style={alan} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 140px" }}>
            {etiket(t("Kullanıcı adı"))}
            <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@" style={alan} />
          </label>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {etiket(t("Notun"))}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={5}
            placeholder={t(
              "Ne dikkatini çekti? İlk saniyelerde ne oluyor, nasıl bitiyor, kaç izlenme almış, yorumlarda ne konuşuluyor?"
            )}
            style={{ ...alan, resize: "vertical", lineHeight: 1.5 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {etiket(t("Etiketler (virgülle)"))}
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder={t("ör. hook, eğitici, kısa")} style={alan} />
        </label>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {etiket(t("Referans video ya da görsel (isteğe bağlı)"))}
          {dosya ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, color: c.textPrimary }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>📎 {dosya.name}</span>
              <button type="button" onClick={() => setDosya(null)} style={{ ...ikincilDugme, color: c.danger }}>
                {t("Kaldır")}
              </button>
            </div>
          ) : hedef ? (
            <input
              type="file"
              accept="video/*,image/*"
              disabled={yukleniyor}
              onChange={(e) => void yukle(e.target.files?.[0])}
              style={{ fontSize: 13 }}
            />
          ) : (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {t("Dosya yüklemek için modülü bir departman içinden aç; organizasyon genelinde yükleme klasörü yok.")}
            </span>
          )}
          {yukleniyor && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Yükleniyor… {n}", { n: `${yuzdeYuklenen}%` })}</span>
          )}
          <span style={{ fontSize: 11, color: c.textSecondary, lineHeight: 1.5 }}>
            {t(
              "Lio videonun karelerine ve konuşmasına bakar. Yalnızca incelemek için hakkın olan içerikleri yükle; dosya kendi klasörünüzde saklanır."
            )}
          </span>
        </div>

        {hata && <span style={{ fontSize: 12, color: c.danger }}>{hata}</span>}
      </div>
    </Modal>
  );
}
