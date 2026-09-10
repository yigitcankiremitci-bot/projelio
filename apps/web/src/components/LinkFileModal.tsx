import { useEffect, useState } from "react";
import { fileLinksApi, type LinkSource, type LinkTargetKind, type LinkTargets } from "../api/files";
import { useT } from "../lib/i18n";
import { useThemeColors } from "../theme/useThemeColors";
import Modal from "./Modal";
import { IconFile, IconListCheck, IconUser } from "./icons";

interface Props {
  /** Bağlanacak kaynaklar (dosya ve/veya klasör). Hepsi aynı hedefe bağlanır. */
  sources: LinkSource[];
  onClose: () => void;
  onLinked?: () => void;
}

const BOS: LinkTargets = { tasks: [], users: [], records: [] };

/**
 * "Bağla": dosyayı ya da KLASÖRÜ bir göreve, kişiye ya da modül kaydına
 * iliştirir.
 *
 * TAŞIMA DEĞİL. Dosya klasöründe kalır; hedefin ekranında da görünmeye başlar
 * (bkz. migration 095). Kullanıcıya da böyle anlatılıyor — "bağla" sözcüğü
 * tek başına "taşındı mı?" sorusunu doğuruyor.
 *
 * Aday listeleri SUNUCUDAN geliyor: hangi görevlerin/kişilerin uygun olduğu,
 * bağlamanın izin kurallarıyla aynı kurallardan çıkıyor. İstemcide ikinci bir
 * kopya, seçilebilen ama bağlanamayan satırlar demekti.
 */
export default function LinkFileModal({ sources, onClose, onLinked }: Props) {
  const c = useThemeColors();
  const t = useT();
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
    // Arama sunucuda süzülüyor; kullanıcı yazdıkça istek atmamak için
    // yalnızca ilk yükleme sunucuya gidiyor, sonrası yerelde daraltılıyor.
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

  const gorevler = targets.tasks.filter((g) => suz(g.title));
  const kisiler = targets.users.filter((k) => suz(k.fullName));
  const kayitlar = targets.records.filter((k) => suz(k.name));
  const bosMu = !loading && !gorevler.length && !kisiler.length && !kayitlar.length;

  const satir = (
    key: string,
    ikon: React.ReactNode,
    baslik: string,
    alt: string | undefined,
    onClick: () => void
  ) => (
    <button
      key={key}
      type="button"
      disabled={busy}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "9px 11px",
        borderRadius: 9,
        border: `1px solid ${c.border}`,
        background: "transparent",
        cursor: busy ? "wait" : "pointer",
      }}
    >
      {ikon}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontSize: 15,
            color: c.textPrimary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {baslik}
        </span>
        {alt && <span style={{ display: "block", fontSize: 12, color: c.textSecondary }}>{alt}</span>}
      </span>
    </button>
  );

  const bolum = (baslik: string, icerik: React.ReactNode[]) =>
    icerik.length > 0 && (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: c.textSecondary, margin: "0 0 6px 2px" }}>{baslik}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{icerik}</div>
      </div>
    );

  return (
    <Modal
      title={sources.length > 1 ? t("{sayi} öğeyi bağla", { sayi: sources.length }) : t("Bağla")}
      onClose={onClose}
      maxWidth={460}
    >
      <p style={{ fontSize: 14, color: c.textSecondary, margin: "0 0 12px" }}>
        {t("Yerinde kalır; seçtiğin yerde de görünmeye başlar.")}
      </p>

      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t("Görev, kişi ya da kayıt ara")}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "9px 12px",
          borderRadius: 9,
          border: `1px solid ${c.border}`,
          background: c.surface,
          color: c.textPrimary,
          fontSize: 15,
          marginBottom: 14,
        }}
      />

      {error && <div style={{ color: c.danger, fontSize: 14, marginBottom: 10 }}>{error}</div>}

      <div style={{ maxHeight: 360, overflowY: "auto" }}>
        {loading ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>{t("Yükleniyor…")}</div>
        ) : bosMu ? (
          <div style={{ color: c.textSecondary, fontSize: 15 }}>
            {t("Bağlanabilecek bir öğe bulunamadı.")}
          </div>
        ) : (
          <>
            {bolum(
              t("Görevler"),
              gorevler.map((g) =>
                satir(
                  `task-${g.id}`,
                  <IconListCheck size={16} color={c.textSecondary} />,
                  // Alt görev olduğu belli olmalı: aynı adı taşıyan bir üst
                  // görev de listede olabilir.
                  g.isSubtask ? `↳ ${g.title}` : g.title,
                  g.context,
                  () => void bagla("task", g.id)
                )
              )
            )}
            {bolum(
              t("Kişiler"),
              kisiler.map((k) =>
                satir(
                  `user-${k.id}`,
                  <IconUser size={16} color={c.textSecondary} />,
                  k.fullName,
                  undefined,
                  () => void bagla("user", k.id)
                )
              )
            )}
            {bolum(
              t("Modül kayıtları"),
              kayitlar.map((k) =>
                satir(
                  `record-${k.id}`,
                  <IconFile size={16} color={c.textSecondary} />,
                  k.name,
                  k.moduleKey,
                  () => void bagla("module_record", k.id)
                )
              )
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
