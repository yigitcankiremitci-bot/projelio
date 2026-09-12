import { useEffect, useMemo, useState } from "react";
import type { ButceHedefi, Task } from "@projelio/shared";
import { BUDGET_SCOPE_LABEL } from "@projelio/shared";
import { api } from "../../api/client";
import { useThemeColors } from "../../theme/useThemeColors";
import { useT } from "../../lib/i18n";

interface Props {
  /** Sayfanın kendi kademesi — hedef listesi bunun altından geliyor. */
  scopeType: string;
  scopeId: string;
  hedefTur: string;
  hedefId: string;
  taskId: string;
  onChange: (secim: { hedefTur: string; hedefId: string; taskId: string }) => void;
}

/**
 * "Bu kayıt neyle ilgili?" — kaydın hangi kademeye ve hangi göreve yazılacağı.
 *
 * İKİ AŞAMALI, bilerek: önce kademe (iş / departman / proje / rutin), sonra
 * istenirse o kademenin bir görevi. Tek listede birleştirilseydi bir holdingin
 * altındaki binlerce görev tek seçim kutusuna dolar, hem ağır hem kullanışsız
 * olurdu — görevler ancak kademe seçildikten sonra, o kademenin kendi ucundan
 * yükleniyor.
 *
 * Hedef seçmek üstteki toplamı BOZMAZ: alt kademe zaten üste toplanıyor, yani
 * kayıt aşağı indiğinde şirketin rakamı değişmez, yalnızca detaylanır ve
 * projenin yöneticisi de görür. Bu yüzden seçim serbest bırakıldı.
 */
export default function HedefSecici({ scopeType, scopeId, hedefTur, hedefId, taskId, onChange }: Props) {
  const c = useThemeColors();
  const t = useT();
  const [hedefler, setHedefler] = useState<ButceHedefi[]>([]);
  const [gorevler, setGorevler] = useState<Task[]>([]);
  const [gorevlerYukleniyor, setGorevlerYukleniyor] = useState(false);

  useEffect(() => {
    api
      .get<ButceHedefi[]>(`/budget/scope/${scopeType}/${scopeId}/targets`)
      .then(setHedefler)
      .catch(() => setHedefler([]));
  }, [scopeType, scopeId]);

  // Seçili hedefin kendisi: görev seçicinin açılıp açılmayacağını o söylüyor.
  const secili = useMemo(
    () => hedefler.find((h) => h.scopeType === hedefTur && h.scopeId === hedefId),
    [hedefler, hedefTur, hedefId]
  );

  // Görevler yalnızca gerektiğinde ve yalnızca seçilen kademeden çekiliyor.
  useEffect(() => {
    if (!secili?.gorevAlir) {
      setGorevler([]);
      return;
    }
    const yol =
      secili.scopeType === "project"
        ? `/projects/${secili.scopeId}/tasks`
        : `/departments/${secili.scopeId}/tasks`;
    let iptal = false;
    setGorevlerYukleniyor(true);
    api
      .get<Task[]>(yol)
      .then((liste) => {
        if (!iptal) setGorevler(liste);
      })
      .catch(() => {
        if (!iptal) setGorevler([]);
      })
      .finally(() => {
        if (!iptal) setGorevlerYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, [secili?.scopeType, secili?.scopeId, secili?.gorevAlir]);

  /**
   * Alt görevler üst görevinin adıyla birlikte ve onun hemen altında.
   * Düz bir listede "Kapak tasarımı" adlı üç alt görev birbirinden ayırt
   * edilemezdi.
   */
  const gorevSecenekleri = useMemo(() => {
    const ustler = gorevler.filter((g) => !g.parentTaskId);
    const altlar = gorevler.filter((g) => g.parentTaskId);
    const liste: { id: string; etiket: string }[] = [];
    for (const ust of ustler) {
      liste.push({ id: ust.id, etiket: ust.title });
      for (const alt of altlar.filter((a) => a.parentTaskId === ust.id)) {
        liste.push({ id: alt.id, etiket: `↳ ${alt.title}` });
      }
    }
    // Üstü listede olmayan alt görevler (yetki ya da süzgeç yüzünden) kaybolmasın.
    const eklenen = new Set(liste.map((l) => l.id));
    for (const alt of altlar) {
      if (!eklenen.has(alt.id)) liste.push({ id: alt.id, etiket: `↳ ${alt.title}` });
    }
    return liste;
  }, [gorevler]);

  const kademeSec = (deger: string) => {
    const [tur, id] = deger.split("|");
    // Kademe değişince görev seçimi düşer: eski görev yeni kademede yaşamıyor.
    onChange({ hedefTur: tur ?? "", hedefId: id ?? "", taskId: "" });
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <select
        value={hedefTur && hedefId ? `${hedefTur}|${hedefId}` : ""}
        onChange={(e) => kademeSec(e.target.value)}
        style={{ flex: 1, minWidth: 160 }}
        aria-label={t("Bu kayıt neyle ilgili?")}
      >
        <option value="">{t("Neyle ilgili? (isteğe bağlı)")}</option>
        {hedefler.map((h) => (
          <option key={`${h.scopeType}|${h.scopeId}`} value={`${h.scopeType}|${h.scopeId}`}>
            {t(BUDGET_SCOPE_LABEL[h.scopeType])} · {h.ad}
          </option>
        ))}
      </select>

      {secili?.gorevAlir && (
        <select
          value={taskId}
          onChange={(e) => onChange({ hedefTur, hedefId, taskId: e.target.value })}
          style={{ flex: 1, minWidth: 160 }}
          disabled={gorevlerYukleniyor}
          aria-label={t("Görev")}
        >
          <option value="">
            {gorevlerYukleniyor ? t("Görevler yükleniyor…") : t("Görev seç (isteğe bağlı)")}
          </option>
          {gorevSecenekleri.map((g) => (
            <option key={g.id} value={g.id}>
              {g.etiket}
            </option>
          ))}
        </select>
      )}

      {/* Bilgi notu yalnızca kayıt başka bir kademeye yazılacaksa: aksi hâlde
          her kullanıcıya her seferinde okunacak bir cümle koymak gürültü. */}
      {secili && !(secili.scopeType === scopeType && secili.scopeId === scopeId) && (
        <p style={{ fontSize: 11.5, color: c.textSecondary, margin: 0, width: "100%" }}>
          {t("Kayıt seçilen yerin defterine yazılır ve buraya toplanarak gelir.")}
        </p>
      )}
    </div>
  );
}

/**
 * Düzenlemede yalnızca GÖREV BAĞI değiştirilebilir.
 *
 * Kademe seçici burada yok, bilerek: kaydı başka bir şirkete/projeye taşımak
 * iki kademenin geçmiş toplamını aynı anda değiştirir ve farkı kimse göremez
 * (bkz. ButceKademeService.guncelle). Görev bağı ise zararsız — hiçbir toplamı
 * oynatmaz, yalnızca "bu masraf neydi" sorusunu cevaplar.
 *
 * Kaydın kendi kademesi proje ya da departman değilse (şirket/holding/iş
 * kaydı) altında görev yaşamaz; bileşen hiç çizilmez.
 */
export function GorevBagiDuzenle({
  kayit,
  taskId,
  onChange,
}: {
  kayit: { projectId?: string; departmentId?: string };
  taskId: string;
  onChange: (taskId: string) => void;
}) {
  const t = useT();
  const [gorevler, setGorevler] = useState<Task[]>([]);
  const [yukleniyor, setYukleniyor] = useState(false);

  const yol = kayit.projectId
    ? `/projects/${kayit.projectId}/tasks`
    : kayit.departmentId
      ? `/departments/${kayit.departmentId}/tasks`
      : "";

  useEffect(() => {
    if (!yol) return;
    let iptal = false;
    setYukleniyor(true);
    api
      .get<Task[]>(yol)
      .then((liste) => {
        if (!iptal) setGorevler(liste);
      })
      .catch(() => {
        if (!iptal) setGorevler([]);
      })
      .finally(() => {
        if (!iptal) setYukleniyor(false);
      });
    return () => {
      iptal = true;
    };
  }, [yol]);

  if (!yol) return null;

  return (
    <select
      value={taskId}
      onChange={(e) => onChange(e.target.value)}
      disabled={yukleniyor}
      style={{ flex: 1, minWidth: 160 }}
      aria-label={t("Görev")}
    >
      <option value="">{yukleniyor ? t("Görevler yükleniyor…") : t("Görev seç (isteğe bağlı)")}</option>
      {gorevler.map((g) => (
        <option key={g.id} value={g.id}>
          {g.parentTaskId ? `↳ ${g.title}` : g.title}
        </option>
      ))}
    </select>
  );
}
