import { useEffect, useState } from "react";
import { fileLinksApi, type LinkSource, type LinkTargetKind, type LinkTargets } from "../api/files";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconFile, IconFolder, IconListCheck, IconUser } from "./icons";

interface Props {
  /** Bağlanacak kaynaklar (dosya ve/veya klasör). Hepsi aynı hedefe bağlanır. */
  sources: LinkSource[];
  onClose: () => void;
  onLinked?: () => void;
}

const BOS: LinkTargets = { projects: [], tasks: [], users: [], records: [] };

/**
 * "Bağla": dosyayı ya da klasörü bir projeye, göreve, kişiye ya da modül
 * kaydına iliştirir.
 *
 * TAŞIMA DEĞİL. Kaynak yerinde kalır; hedefin ekranında da görünmeye başlar
 * (bkz. migration 095). Kullanıcıya da böyle anlatılıyor — "bağla" sözcüğü
 * tek başına "taşındı mı?" sorusunu doğuruyor.
 *
 * İKİ ADIM. Önce TÜR, sonra öğe. Tek listede hepsini göstermek, birkaç yüz
 * görevi olan bir işte projeleri listenin dibine itiyor ve kullanıcı aradığını
 * hiç bulamıyordu — "liste çok kalabalık" şikâyeti tam olarak buydu.
 *
 * Aday listeleri SUNUCUDAN geliyor: hangi öğelerin uygun olduğu, bağlamanın
 * izin kurallarıyla aynı kurallardan çıkıyor. İstemcide ikinci bir kopya,
 * seçilebilen ama bağlanamayan satırlar demekti.
 */
export default function LinkFileModal({ sources, onClose, onLinked }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [tur, setTur] = useState<LinkTargetKind | null>(null);
  const [q, setQ] = useState("");
  const [targets, setTargets] = useState<LinkTargets>(BOS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Adaylar ilk kaynağın kapsamından: çoklu seçimde hepsi aynı ekrandan
  // geldiği için kapsamları da aynı.
  const kaynak = sources[0];

  useEffect(() => {
    if (!kaynak) return;
    let iptal = false;
    setLoading(true);
    fileLinksApi
      .targets(kaynak)
      .then((veri) => {
        if (!iptal) setTargets(veri);
      })
      .catch((e: Error) => !iptal && setError(e.message))
      .finally(() => !iptal && setLoading(false));
    return () => {
      iptal = true;
    };
  }, [kaynak?.fileId, kaynak?.folderId]);

  const bagla = async (kind: LinkTargetKind, targetId: string) => {
    setBusy(true);
    setError("");
    try {
      // Sırayla: sunucu her bağlantıyı ayrı doğruluyor ve biri reddedilirse
      // (ör. kapsam dışı) diğerleri yine de bağlanmış olmalı.
      for (const source of sources) await fileLinksApi.link(source, kind, targetId);
      onLinked?.();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? t("Bağlanamadı"));
    } finally {
      setBusy(false);
    }
  };

  const arama = q.trim().toLocaleLowerCase("tr");
  const suz = (metin: string) => !arama || metin.toLocaleLowerCase("tr").includes(arama);

  /** Tür kartlarının içeriği; sayısı sıfır olan tür hiç gösterilmiyor. */
  const turler: { kind: LinkTargetKind; label: string; sayi: number; ikon: React.ReactNode }[] = [
    {
      kind: "project",
      label: t("Proje"),
      sayi: targets.projects.length,
      ikon: <IconFolder size={18} color={c.accent} />,
    },
    {
      kind: "task",
      label: t("Görev / alt görev"),
      sayi: targets.tasks.length,
      ikon: <IconListCheck size={18} color={c.accent} />,
    },
    {
      kind: "module_record",
      label: t("Modül kaydı"),
      sayi: targets.records.length,
      ikon: <IconFile size={18} color={c.accent} />,
    },
    {
      kind: "user",
      label: t("Kişi"),
      sayi: targets.users.length,
      ikon: <IconUser size={18} color={c.accent} />,
    },
  ];

  /** Seçilen türün öğeleri: ortak satır biçimi. */
  const ogeler = (): { id: string; baslik: string; alt?: string }[] => {
    if (tur === "project") return targets.projects.filter((p) => suz(p.title)).map((p) => ({ id: p.id, baslik: p.title }));
    if (tur === "task")
      return targets.tasks
        .filter((g) => suz(g.title))
        // Alt görev olduğu belli olmalı: aynı adı taşıyan bir üst görev de
        // listede olabilir.
        .map((g) => ({ id: g.id, baslik: g.isSubtask ? `↳ ${g.title}` : g.title, alt: g.context }));
    if (tur === "module_record")
      return targets.records.filter((k) => suz(k.name)).map((k) => ({ id: k.id, baslik: k.name, alt: k.moduleKey }));
    if (tur === "user") return targets.users.filter((k) => suz(k.fullName)).map((k) => ({ id: k.id, baslik: k.fullName }));
    return [];
  };

  const liste = tur ? ogeler() : [];

  return (
    <Modal
      title={sources.length > 1 ? t("{sayi} öğeyi bağla", { sayi: sources.length }) : t("Bağla")}
      onClose={onClose}
      maxWidth={460}
    >
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 12px" }}>
        {t("Yerinde kalır; seçtiğin yerde de görünmeye başlar.")}
      </p>

      {error && <div style={{ color: c.danger, fontSize: 14, marginBottom: 10 }}>{error}</div>}

      {loading ? (
        <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</div>
      ) : !tur ? (
        // ── 1. ADIM: nereye?
        <>
          <div style={{ fontSize: 14, color: c.textPrimary, marginBottom: 10 }}>{t("Nereye bağlansın?")}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {turler.map((k) => (
              <button
                key={k.kind}
                type="button"
                disabled={k.sayi === 0}
                onClick={() => {
                  setTur(k.kind);
                  setQ("");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "11px 12px",
                  borderRadius: 10,
                  border: `1px solid ${c.border}`,
                  background: "transparent",
                  textAlign: "left",
                  cursor: k.sayi === 0 ? "not-allowed" : "pointer",
                  opacity: k.sayi === 0 ? 0.5 : 1,
                }}
              >
                {k.ikon}
                <span style={{ flex: 1, fontSize: 15, color: c.textPrimary }}>{k.label}</span>
                <span style={{ fontSize: 13, color: c.textSecondary }}>
                  {/* Sayı, boş bir türe tıklayıp boş liste görmeyi önlüyor. */}
                  {k.sayi}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        // ── 2. ADIM: hangisi?
        <>
          <button
            type="button"
            onClick={() => setTur(null)}
            style={{
              background: "transparent",
              border: "none",
              color: c.accent,
              cursor: "pointer",
              padding: 0,
              fontSize: 14,
              marginBottom: 10,
            }}
          >
            ← {t("Tür değiştir")}
          </button>

          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Ara")}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "9px 12px",
              borderRadius: 9,
              border: `1px solid ${c.border}`,
              background: c.surface,
              color: c.textPrimary,
              fontSize: 15,
              marginBottom: 12,
            }}
          />

          <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {liste.length === 0 ? (
              <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Eşleşen bir şey yok.")}</div>
            ) : (
              liste.map((oge) => (
                <button
                  key={oge.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void bagla(tur, oge.id)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 11px",
                    borderRadius: 9,
                    border: `1px solid ${c.border}`,
                    background: "transparent",
                    cursor: busy ? "wait" : "pointer",
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      color: c.textPrimary,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    {oge.baslik}
                  </span>
                  {oge.alt && <span style={{ fontSize: 12, color: c.textSecondary }}>{oge.alt}</span>}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
