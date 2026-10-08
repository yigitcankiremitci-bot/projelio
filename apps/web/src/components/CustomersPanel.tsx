import { useEffect, useMemo, useRef, useState } from "react";
import {
  BAGLANTI_MODUL_KEY,
  BAGLANTI_ONEMLERI,
  KARTVIZIT_SOSYAL,
  KARTVIZIT_SOSYAL_IKON,
  kartvizitSosyalNormallestir,
  WEB_SITESI_IKON,
  MUSTERI_MODUL_KEY,
  safeExternalUrl,
  type KartvizitSosyal,
  type KartvizitSosyalAnahtar,
  type BaglantiOnem,
  type DepartmentMember,
  type ModuleAccess,
  type JobMember,
  type Party,
  type PartyActivity,
  type PartyBaglanti,
  type PartyContact,
  type PartyDuplicate,
  type PartyDosyaRolu,
  type PartyGorevi,
  type ProjectFile,
  type PartyRole,
} from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import {
  ALL_ROLES,
  BAGLANTI_PROFILE,
  BAGLANTI_ROLES,
  ONEM_LABELS,
  ROLE_COLORS,
  ROLE_LABELS,
  profileFor,
} from "../lib/partyProfiles";
import { useUndo } from "../lib/undo";
import { FAB_PRIORITY, useFabAvailable, useProjectFabAction } from "../lib/projectFab";
import { IconIdCard, IconPaperclip, IconTrash, IconUpload, IconX } from "./icons";
import { useT } from "../lib/i18n";
import MusteriAlacakBorcu, { useMusteriAlacakBorcu } from "./butce/MusteriAlacakBorcu";
import { onLioActivity } from "../lib/liveRoom";
import MusteriExcelModal from "./MusteriExcelModal";
import { partyApi } from "../api/party";
import { filesApi } from "../api/files";
import { useCurrentUser } from "../lib/useCurrentUser";
import MusteriSiparisleri from "./musteri/MusteriSiparisleri";
import TahsilatTakibi from "./musteri/TahsilatTakibi";
import TaskFromRecordModal from "./TaskFromRecordModal";
import FilePreviewModal from "./FilePreviewModal";

interface Props {
  organizationId?: string;
  departmentId?: string;
  // Departman profilini seçmek için (Satış mı, Müşteri İlişkileri mi).
  departmentKey?: string;
  jobId?: string;
  canWrite?: boolean;
  /** crm_musteri ya da baglantilar — aynı panel, iki defter (migration 153). */
  moduleKey?: string;
}

type FormMode = { kind: "create" } | { kind: "edit"; party: Party } | null;

const TOOLBAR_THRESHOLD = 8;

function emptyForm() {
  return {
    displayName: "",
    partyType: "company",
    // Yalnızca kişi kartında: çalıştığı şirket ve görevi.
    kurum: "",
    unvan: "",
    // Şirket/kurum kartında: kurumdaki kişiler (party_contact). id'li olanlar kayıtlı.
    yetkililer: [] as YetkiliSatiri[],
    role: "lead" as PartyRole,
    email: "",
    phone: "",
    taxNumber: "",
    notes: "",
    website: "",
    // Kullanıcının yazdığı hâliyle ("@ad", tam adres); sunucu tutamaca çevirir.
    sosyal: {} as Partial<Record<KartvizitSosyalAnahtar, string>>,
    // Boş = kaydı açan üstlenir (sunucu varsayılanı).
    ownerUserId: "",
    // Yalnızca Bağlantılar.
    onem: "orta" as BaglantiOnem,
    tanismaYeri: "",
    tanismaTarihi: "",
    sonrakiTemas: "",
    iliskiNotu: "",
  };
}

const ONEM_SIRASI: Record<BaglantiOnem, number> = { yuksek: 0, orta: 1, dusuk: 2 };

interface YetkiliSatiri {
  id?: string;
  name: string;
  title: string;
  phone: string;
  email: string;
}
const bosYetkili = (): YetkiliSatiri => ({ name: "", title: "", phone: "", email: "" });

/** Yerel takvimde bugün, YYYY-MM-DD (toISOString UTC'ye kayar, gece yarısı yanlış gün verir). */
function bugunYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Formda her zaman görünen sosyal hesaplar; diğerleri "Başka hesap ekle" ile açılır.
const VARSAYILAN_SOSYAL: KartvizitSosyalAnahtar[] = ["linkedin", "instagram"];

/**
 * Fuar dönüşü kartlar art arda girilir; tanışma yeri ve tarihi her seferinde
 * aynıdır. Öneriler, bu defterdeki kartlardan (yer, tarih) çiftleri olarak
 * çıkarılır — en son açılan kartınki önce. Tarayıcıya değil kayıtlara
 * dayandığı için başka cihazda, ekip arkadaşının girdiğinde de çalışır.
 */
function tanismaOnerileri(parties: Party[]): { yer: string; tarih?: string }[] {
  const gorulen = new Set<string>();
  const sonuc: { yer: string; tarih?: string }[] = [];
  for (const p of [...parties].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const yer = p.baglanti?.tanismaYeri?.trim();
    if (!yer) continue;
    const tarih = p.baglanti?.tanismaTarihi;
    const anahtar = `${yer.toLocaleLowerCase("tr")}|${tarih ?? ""}`;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuc.push({ yer, tarih });
  }
  return sonuc;
}

function gunAyYil(ymd: string): string {
  return ymd.slice(0, 10).split("-").reverse().join(".");
}

/**
 * Müşteri modülü (crm_musteri) — ortak `party` varlığına açılan pencere.
 *
 * Bu panel module_records'a değil doğrudan party tablosuna yazar. Sebebi:
 * Satış ve Müşteri İlişkileri departmanları AYNI müşteri kaydını görmeli.
 * Önceden iki ayrı modül anahtarı iki ayrı kayıt tutuyordu ve aynı firma
 * iki kere giriliyordu.
 * Bkz. database/migrations/046_party_and_customer_merge.sql
 *
 * Bağlantı ve İlişkiler (baglantilar) da bu paneli kullanır: aynı tablo,
 * ayrı defter (migration 153). Farkları: sahiplik süzmesi yok, sipariş ve
 * tahsilat yok, kartta önem / tanışma yeri / sonraki temas / ilişki notu var.
 */
export default function CustomersPanel({
  organizationId,
  departmentId,
  departmentKey,
  jobId,
  canWrite = true,
  moduleKey,
}: Props) {
  const c = useThemeColors();
  const t = useT();
  const baglantiModu = moduleKey === BAGLANTI_MODUL_KEY;
  const profile = baglantiModu ? BAGLANTI_PROFILE : profileFor(departmentKey);
  const rolSecenekleri = baglantiModu ? BAGLANTI_ROLES : ALL_ROLES;

  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Formdan çıkarılan kayıtlı kişiler: kaydedince arşivlenir.
  const [silinenYetkililer, setSilinenYetkililer] = useState<string[]>([]);
  // Web sitesi ve sosyal hesaplar herkese gerekmiyor: kapalı bir bölüm,
  // dolu alan varsa açık gelir.
  const [sosyalAcik, setSosyalAcik] = useState(false);
  // Formda seçilen kartvizit: kart kaydedildikten sonra karta yüklenir.
  const [kartvizit, setKartvizit] = useState<File | null>(null);
  const [ekDosyalar, setEkDosyalar] = useState<File[]>([]);
  // Form kapandıktan sonra görünmesi gereken uyarı (kart açıldı, kartvizit yüklenemedi).
  const [bildirim, setBildirim] = useState("");
  // Listedeki kartvizit simgesinden açılan dosya.
  const [onizlenen, setOnizlenen] = useState<ProjectFile | null>(null);
  const dosyaAc = (fileId: string) => {
    filesApi
      .getById(fileId)
      .then(setOnizlenen)
      // Kartı görmek, dosyanın durduğu departman klasörünü görmek demek değil.
      .catch((err) => setBildirim(err instanceof Error ? err.message : t("Dosya açılamadı")));
  };
  const [duplicates, setDuplicates] = useState<PartyDuplicate[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<PartyRole | "">(profile.defaultRole ?? "");
  const [onemFiltre, setOnemFiltre] = useState<BaglantiOnem | "">("");
  const [openPartyId, setOpenPartyId] = useState<string | null>(null);
  const { pushUndo } = useUndo();
  const { user } = useCurrentUser();

  // Yönetici hepsini görür, müşteriyi çalışana atar ve raporu görür; çalışan
  // yalnızca kendisine atananları görür. Karar sunucunun (musterilerim ucu).
  const [yonetici, setYonetici] = useState(false);
  const [gorunum, setGorunum] = useState<"musteriler" | "tahsilat">("musteriler");
  const [sorumluFiltre, setSorumluFiltre] = useState("");
  const [ekip, setEkip] = useState<{ id: string; ad: string }[]>([]);

  const scopePath = jobId ? `/jobs/${jobId}/party` : `/organizations/${organizationId}/party`;
  const kapsamYolu = jobId ? `/jobs/${jobId}` : `/organizations/${organizationId}`;

  // Yalnızca İLK yüklemede "Yükleniyor…" gösterilir. Kaydetme/arşivleme
  // sonrası tazelemede de gösterilince liste bir an yok olup geri geliyor,
  // kaydırma başa dönüyordu — sayfa kendi kendine yenileniyor gibi görünüyordu.
  const load = (ilk = false) => {
    if (ilk === true) setLoading(true);
    const istek = baglantiModu
      ? partyApi.baglantilarim(kapsamYolu, jobId ? undefined : departmentId).then((r) => ({ kartlar: r.baglantilar, yonetici: r.yonetici }))
      : partyApi.musterilerim(scopePath, jobId ? undefined : departmentId).then((r) => ({ kartlar: r.musteriler, yonetici: r.yonetici }));
    istek
      .then((r) => {
        setParties(r.kartlar);
        setYonetici(r.yonetici);
      })
      .catch(() => setParties([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => load(true), [scopePath, departmentId, baglantiModu]);

  // Atanabilecek kişiler: departmanın ya da işin ekibi. Şirket düzeyinde
  // (departmansız) açılan panelde ekip listesi yok; orada yönetici yalnızca
  // kendini ya da kartın mevcut sorumlusunu seçebilir.
  useEffect(() => {
    if (!yonetici) return;
    const yol = jobId ? `/jobs/${jobId}/members` : departmentId ? `/departments/${departmentId}/members` : null;
    if (!yol) return;
    api
      .get<(DepartmentMember | JobMember)[]>(yol)
      .then((m) =>
        setEkip(
          m
            .filter((x: any) => x.userId && (x.status ?? "approved") === "approved")
            .map((x: any) => ({ id: x.userId as string, ad: x.fullName ?? x.username ?? x.email ?? t("İsimsiz") }))
        )
      )
      .catch(() => setEkip([]));
  }, [yonetici, jobId, departmentId]);

  /** Sorumlu seçicisinin seçenekleri: ekip + ben + listede sorumlusu görünenler. */
  const sorumluSecenekleri = useMemo(() => {
    const m = new Map<string, string>();
    for (const k of ekip) m.set(k.id, k.ad);
    if (user) m.set(user.id, m.get(user.id) ?? t("Ben"));
    for (const p of parties) if (p.ownerUserId && !m.has(p.ownerUserId)) m.set(p.ownerUserId, p.ownerName ?? t("İsimsiz"));
    return Array.from(m.entries())
      .map(([id, ad]) => ({ id, ad }))
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
  }, [ekip, parties, user?.id]);

  // Müşteriler'de "Bağlantılara ekle" yalnızca orada da yazabilene gösterilir;
  // karar yine sunucuda (bkz. backend baglanti-erisim.ts deftereEklemeHatasi).
  const [baglantiYazar, setBaglantiYazar] = useState(false);
  useEffect(() => {
    if (baglantiModu || !canWrite) return setBaglantiYazar(false);
    api
      .get<ModuleAccess>(`${kapsamYolu}/module-access?moduleKey=${BAGLANTI_MODUL_KEY}`)
      .then((a) => setBaglantiYazar(a.canWrite))
      .catch(() => setBaglantiYazar(false));
  }, [kapsamYolu, baglantiModu, canWrite]);

  // Excel şablonu Lio'ya verilince kartlar Lio'nun tarafında açılıyor; kullanıcı
  // bu ekrandaysa listeyi kendisi tazelemek zorunda kalmasın.
  useEffect(() => onLioActivity(() => load()), [scopePath]);

  // Şablon indirme ve doldurulmuş dosyayı yükleme aynı pencerede (bkz. MusteriExcelModal).
  const [excelAcik, setExcelAcik] = useState(false);

  // Departman değişince o departmanın varsayılan rol filtresi uygulanır.
  useEffect(() => setRoleFilter(profile.defaultRole ?? ""), [profile.defaultRole]);

  const bugun = bugunYmd();
  const oneriler = useMemo(() => (baglantiModu ? tanismaOnerileri(parties) : []), [parties, baglantiModu]);
  const yerOnerileri = useMemo(() => Array.from(new Set(oneriler.map((o) => o.yer))), [oneriler]);
  // Kurum önerileri: daha önce yazılmış kurumlar + listedeki kurum kartlarının adları.
  const kurumOnerileri = useMemo(
    () =>
      Array.from(
        new Set(
          parties
            .flatMap((p) => [p.kurum, p.partyType !== "person" ? p.displayName : undefined])
            .filter((x): x is string => !!x?.trim())
        )
      ).sort((a, b) => a.localeCompare(b, "tr")),
    [parties]
  );
  // Görünür sosyal alanlar: varsayılanlar + kullanıcının açtıkları + kayıtta dolu olanlar.
  const [ekSosyal, setEkSosyal] = useState<KartvizitSosyalAnahtar[]>([]);
  const gorunenSosyal = KARTVIZIT_SOSYAL.map((s) => s.anahtar).filter(
    (k) => VARSAYILAN_SOSYAL.includes(k) || ekSosyal.includes(k) || !!form.sosyal[k]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const suzulen = parties.filter((p) => {
      if (roleFilter && !p.roles.includes(roleFilter)) return false;
      if (onemFiltre && p.baglanti?.onem !== onemFiltre) return false;
      if (sorumluFiltre && (sorumluFiltre === "-" ? !!p.ownerUserId : p.ownerUserId !== sorumluFiltre)) return false;
      if (!q) return true;
      return [p.displayName, p.legalName, p.kurum, p.unvan, p.email, p.phone, p.taxNumber, p.baglanti?.tanismaYeri]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(q);
    });
    if (!baglantiModu) return suzulen;
    // Önce önem, sonra en yakın temas tarihi (tarihsizler sona), sonra ad:
    // fuar dönüşü "kime önce dönmeliyim" sorusunun cevabı listenin başı olsun.
    return [...suzulen].sort((a, b) => {
      const o = ONEM_SIRASI[a.baglanti?.onem ?? "orta"] - ONEM_SIRASI[b.baglanti?.onem ?? "orta"];
      if (o) return o;
      const ta = a.baglanti?.sonrakiTemas ?? "9999";
      const tb = b.baglanti?.sonrakiTemas ?? "9999";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.displayName.localeCompare(b.displayName, "tr");
    });
  }, [parties, search, roleFilter, onemFiltre, sorumluFiltre, baglantiModu]);

  const hasActiveFilter =
    search.trim() !== "" || roleFilter !== (profile.defaultRole ?? "") || sorumluFiltre !== "" || onemFiltre !== "";
  const showToolbar = parties.length > TOOLBAR_THRESHOLD || hasActiveFilter;

  const stats = useMemo(
    () =>
      baglantiModu
        ? [
            { label: t("Toplam"), value: String(parties.length) },
            { label: t("Yüksek önem"), value: String(parties.filter((p) => p.baglanti?.onem === "yuksek").length) },
            {
              label: t("Temas zamanı gelen"),
              value: String(parties.filter((p) => p.baglanti?.sonrakiTemas && p.baglanti.sonrakiTemas <= bugun).length),
            },
          ]
        : [
            { label: t("Toplam"), value: String(parties.length) },
            { label: t("Müşteri"), value: String(parties.filter((p) => p.roles.includes("customer")).length) },
            { label: t("Potansiyel"), value: String(parties.filter((p) => p.roles.includes("lead")).length) },
          ],
    [parties, baglantiModu, bugun]
  );

  // ============================================================ Eylemler

  const openCreate = () => {
    setForm({
      ...emptyForm(),
      // Fuarda tanışılan çoğu zaman bir KİŞİ; şirketi Kurum alanına yazılır.
      partyType: baglantiModu ? "person" : "company",
      role: profile.defaultRole ?? (baglantiModu ? "contact" : "lead"),
      // En son girilen yer ve tarih hazır gelir; değiştirmek tek tık.
      tanismaYeri: oneriler[0]?.yer ?? "",
      tanismaTarihi: oneriler[0]?.tarih ?? "",
    });
    setEkSosyal([]);
    setKartvizit(null);
    setEkDosyalar([]);
    setSilinenYetkililer([]);
    setSosyalAcik(false);
    setDuplicates([]);
    setError("");
    setFormMode({ kind: "create" });
  };

  const openEdit = (p: Party) => {
    setForm({
      displayName: p.displayName,
      partyType: p.partyType,
      role: p.roles[0] ?? "lead",
      email: p.email ?? "",
      phone: p.phone ?? "",
      taxNumber: p.taxNumber ?? "",
      notes: p.notes ?? "",
      ownerUserId: p.ownerUserId ?? "",
      website: p.website ?? "",
      sosyal: { ...p.sosyal },
      kurum: p.kurum ?? "",
      unvan: p.unvan ?? "",
      onem: p.baglanti?.onem ?? "orta",
      tanismaYeri: p.baglanti?.tanismaYeri ?? "",
      tanismaTarihi: p.baglanti?.tanismaTarihi ?? "",
      sonrakiTemas: p.baglanti?.sonrakiTemas ?? "",
      iliskiNotu: p.baglanti?.iliskiNotu ?? "",
      yetkililer: [],
    });
    setDuplicates([]);
    setError("");
    setKartvizit(null);
    setEkDosyalar([]);
    setSilinenYetkililer([]);
    setSosyalAcik(!!p.website || Object.values(p.sosyal ?? {}).some(Boolean));
    setFormMode({ kind: "edit", party: p });
    // Kayıtlı kişiler formda düzenlenebilsin (unvan, iletişim).
    if (p.partyType !== "person") {
      api
        .get<PartyContact[]>(`/party/${p.id}/contacts`)
        .then((kisiler) =>
          setForm((f) => ({
            ...f,
            yetkililer: kisiler.map((k) => ({
              id: k.id,
              name: k.name,
              title: k.title ?? "",
              phone: k.phone ?? "",
              email: k.email ?? "",
            })),
          }))
        )
        .catch(() => {});
    }
  };

  const closeForm = () => {
    setFormMode(null);
    setDuplicates([]);
    setError("");
  };

  // Ekleme sayfanın "+" düğmesinden. Panelin başlığındaki ikinci düğme kalktı;
  // modal içinde (bkz. Modal.tsx) "+" ulaşılamadığı için orada geri gelir.
  const fabAvailable = useFabAvailable();
  useProjectFabAction(
    canWrite && fabAvailable ? { label: baglantiModu ? t("Bağlantı ekle") : t("Müşteri ekle"), onClick: openCreate } : null,
    [canWrite, fabAvailable, organizationId, departmentId, jobId, baglantiModu],
    FAB_PRIORITY.panel
  );

  /**
   * Ada göre kopya kontrolü, kullanıcı adı yazmayı bitirdiğinde çalışır.
   * Engelleyici değil: "ABC Ltd" iki ayrı şube olabilir, karar kullanıcınındır.
   */
  const checkDuplicates = async () => {
    if (!form.displayName.trim() && !form.taxNumber.trim() && !form.email.trim()) return;
    try {
      const found = await api.post<PartyDuplicate[]>(`${scopePath}/check-duplicates`, {
        displayName: form.displayName,
        taxNumber: form.taxNumber || undefined,
        email: form.email || undefined,
        excludeId: formMode?.kind === "edit" ? formMode.party.id : undefined,
        ...(departmentId && !jobId ? { departmentId } : {}),
      });
      setDuplicates(found);
    } catch {
      setDuplicates([]);
    }
  };

  const handleSave = async () => {
    if (!form.displayName.trim()) {
      setError(t("Ad gerekli"));
      return;
    }
    // Sosyal hesap biçimi kaydetmeden önce denetlenir; sunucu da aynı kuralla reddeder.
    const sosyal: KartvizitSosyal = {};
    for (const [k, v] of Object.entries(form.sosyal) as [KartvizitSosyalAnahtar, string][]) {
      const tutamac = kartvizitSosyalNormallestir(k, v ?? "");
      if (tutamac === null) {
        setError(t("{hesap} hesabı tanınmadı", { hesap: KARTVIZIT_SOSYAL.find((x) => x.anahtar === k)?.ad ?? k }));
        return;
      }
      if (tutamac) sosyal[k] = tutamac;
    }
    setError("");
    setBildirim("");
    setSaving(true);
    try {
      const kisi = form.partyType === "person";
      const payload = {
        website: form.website.trim(),
        // Kurum kartında bu alanlar yok; tür kuruma çevrilirse temizlenir.
        kurum: kisi ? form.kurum : "",
        unvan: kisi ? form.unvan : "",
        sosyal,
        displayName: form.displayName.trim(),
        partyType: form.partyType,
        roles: [form.role],
        email: form.email || undefined,
        phone: form.phone || undefined,
        taxNumber: form.taxNumber || undefined,
        // Bağlantılar'da genel not alanı yok: kart müşteriye dönüşünce satış
        // ekibi `notes`'u okur. Not ilişki notuna yazılır (yalnızca bu modül).
        ...(baglantiModu ? {} : { notes: form.notes || undefined }),
        ...(baglantiModu
          ? {
              modul: BAGLANTI_MODUL_KEY,
              baglanti: {
                onem: form.onem,
                tanismaYeri: form.tanismaYeri,
                tanismaTarihi: form.tanismaTarihi,
                sonrakiTemas: form.sonrakiTemas,
                iliskiNotu: form.iliskiNotu,
              } satisfies Partial<PartyBaglanti>,
            }
          : {}),
        // Yalnızca yönetici gönderir: çalışanın alanı yok, sunucu da başkasına
        // atamayı reddediyor. Boş = oluştururken "ben", düzenlerken dokunma.
        ...(yonetici && form.ownerUserId ? { ownerUserId: form.ownerUserId } : {}),
        ...(departmentId && !jobId ? { departmentId } : {}),
      };
      let partyId: string | undefined;
      if (formMode?.kind === "edit") {
        // Düzenlemede roller korunur: mevcut rollerin üzerine seçilen eklenir,
        // hiçbiri silinmez (bkz. party-dedup.ts addRole).
        const merged = Array.from(new Set([...formMode.party.roles, form.role]));
        await api.patch(`/party/${formMode.party.id}`, { ...payload, roles: merged });
        partyId = formMode.party.id;
      } else {
        const yeni = await api.post<Party>(scopePath, payload);
        partyId = yeni.id;
      }
      // Şirket/kurum kişileri: yeniler eklenir, kayıtlılar güncellenir,
      // formdan çıkarılanlar arşivlenir. İlk kişi yeni kartta birincil olur.
      if (partyId && form.partyType !== "person") {
        const doluSatirlar = form.yetkililer.filter((y) => y.name.trim());
        for (const [i, y] of doluSatirlar.entries()) {
          const govde = { name: y.name, title: y.title, phone: y.phone, email: y.email };
          if (y.id) await api.patch(`/party-contacts/${y.id}`, govde);
          else await api.post(`/party/${partyId}/contacts`, { ...govde, isPrimary: formMode?.kind !== "edit" && i === 0 });
        }
        for (const id of silinenYetkililer) await api.delete(`/party-contacts/${id}`).catch(() => {});
      }
      if (kartvizit && partyId) {
        await partyApi.dosyaEkle(partyId, kartvizit, jobId ? undefined : departmentId, "kartvizit").catch((err) =>
          setBildirim(
            t("Kart kaydedildi ama kartvizit yüklenemedi: {sebep}", {
              sebep: err instanceof Error ? err.message : t("bilinmeyen hata"),
            })
          )
        );
      }
      if (ekDosyalar.length && partyId) {
        const yuklenemeyen: string[] = [];
        for (const f of ekDosyalar) {
          await partyApi.dosyaEkle(partyId, f, jobId ? undefined : departmentId, "ek").catch(() => yuklenemeyen.push(f.name));
        }
        if (yuklenemeyen.length) {
          setBildirim(t("Kart kaydedildi ama şu dosyalar yüklenemedi: {liste}", { liste: yuklenemeyen.join(", ") }));
        }
      }
      closeForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (p: Party) => {
    await api.delete(`/party/${p.id}`).catch(() => {});
    if (openPartyId === p.id) setOpenPartyId(null);
    load();
    pushUndo({
      label: baglantiModu ? t("Bağlantı arşivleme") : t("Müşteri arşivleme"),
      run: async () => {
        await api.patch(`/party/${p.id}/restore`, {});
        load();
      },
      redo: async () => {
        await api.delete(`/party/${p.id}`);
        load();
      },
    });
  };

  // Form açılınca görünür alana kaydırılır: üstte de açılsa altta da, kullanıcı
  // açıldığını görmeli.
  const formRef = useRef<HTMLDivElement>(null);
  const formAnahtari = formMode ? (formMode.kind === "edit" ? formMode.party.id : "yeni") : null;
  useEffect(() => {
    if (formAnahtari) formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [formAnahtari]);

  // Form tek blok: yeni kayıtta listenin üstünde, düzenlemede DÜZENLENEN SATIRIN
  // ALTINDA açılır. Eskiden hep üstte açılıyordu; uzun listenin sonundaki kişiye
  // "Düzenle" deyince form ekranın dışında kalıyor, açıldığı bile anlaşılmıyordu.
  const formAlani = formMode ? (
        <div
          ref={formRef}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: c.background,
            borderRadius: 10,
            padding: 10,
            // Satırın içinde açıldığında listeden ayrılsın.
            border: formMode.kind === "edit" ? `1px solid ${c.primary}` : "none",
            scrollMarginTop: 12,
          }}
        >
          {formMode.kind === "edit" && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {t("Düzenleniyor: {ad}", { ad: formMode.party.displayName })}
            </span>
          )}

          <Field
            label={
              form.partyType === "person"
                ? t("Ad soyad *")
                : form.partyType === "institution"
                  ? t("Kurum adı *")
                  : t("Şirket adı *")
            }
          >
            <input
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              onBlur={checkDuplicates}
              placeholder={baglantiModu ? t("Örn. Ayşe Yılmaz ya da ABC Ajans") : t("Örn. ABC Yazılım Ltd. Şti.")}
              style={{ width: "100%" }}
            />
          </Field>

          <div style={{ display: "flex", gap: 8 }}>
            <Field label={t("Tür")} style={{ flex: 1 }}>
              <select
                value={form.partyType}
                onChange={(e) => {
                  const tur = e.target.value;
                  setForm((f) => ({
                    ...f,
                    partyType: tur,
                    // Şirket/kurum seçilince ilk kişi satırı hazır gelsin.
                    yetkililer: tur !== "person" && !f.yetkililer.length ? [bosYetkili()] : f.yetkililer,
                  }));
                }}
                style={{ width: "100%" }}
              >
                <option value="person">{t("Kişi")}</option>
                <option value="company">{t("Şirket")}</option>
                <option value="institution">{t("Kurum", { ctx: "kartTuru" })}</option>
              </select>
            </Field>
            <Field label={t("Rol")} style={{ flex: 1 }}>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as PartyRole }))}
                style={{ width: "100%" }}
              >
                {rolSecenekleri.map((r) => (
                  <option key={r} value={r}>
                    {t(ROLE_LABELS[r], { ctx: "rol" })}
                  </option>
                ))}
              </select>
            </Field>
            {baglantiModu && (
              <Field label={t("Önem")} style={{ flex: 1 }}>
                <select
                  value={form.onem}
                  onChange={(e) => setForm((f) => ({ ...f, onem: e.target.value as BaglantiOnem }))}
                  style={{ width: "100%" }}
                >
                  {BAGLANTI_ONEMLERI.map((o) => (
                    <option key={o} value={o}>
                      {t(ONEM_LABELS[o])}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {form.partyType === "person" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Field label={t("Şirket / kurum")} style={{ flex: "2 1 180px" }}>
                <input
                  value={form.kurum}
                  onChange={(e) => setForm((f) => ({ ...f, kurum: e.target.value }))}
                  list="party-kurumlar"
                  placeholder={t("Çalıştığı şirket ya da kurum")}
                  maxLength={200}
                  style={{ width: "100%" }}
                />
                <datalist id="party-kurumlar">
                  {kurumOnerileri.map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </Field>
              <Field label={t("Unvan")} style={{ flex: "1 1 140px" }}>
                <input
                  value={form.unvan}
                  onChange={(e) => setForm((f) => ({ ...f, unvan: e.target.value }))}
                  placeholder={t("Örn. Pazarlama Müdürü")}
                  maxLength={150}
                  style={{ width: "100%" }}
                />
              </Field>
            </div>
          )}

          {form.partyType !== "person" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Kişiler")}</span>
              {form.yetkililer.map((y, i) => {
                const degistir = (alan: keyof YetkiliSatiri, deger: string) =>
                  setForm((f) => ({
                    ...f,
                    yetkililer: f.yetkililer.map((x, j) => (j === i ? { ...x, [alan]: deger } : x)),
                  }));
                return (
                  <div
                    key={y.id ?? `yeni-${i}`}
                    style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", paddingBottom: 6, borderBottom: `1px solid ${c.border}` }}
                  >
                    <input value={y.name} onChange={(e) => degistir("name", e.target.value)} placeholder={t("Ad soyad")} style={{ flex: "2 1 140px" }} />
                    <input value={y.title} onChange={(e) => degistir("title", e.target.value)} placeholder={t("Unvan")} style={{ flex: "1 1 110px" }} />
                    <input value={y.phone} onChange={(e) => degistir("phone", e.target.value)} placeholder={t("Telefon")} style={{ flex: "1 1 110px" }} />
                    <input value={y.email} onChange={(e) => degistir("email", e.target.value)} placeholder={t("E-posta")} style={{ flex: "2 1 150px" }} />
                    <button
                      type="button"
                      onClick={() => {
                        if (y.id) setSilinenYetkililer((l) => [...l, y.id!]);
                        setForm((f) => ({ ...f, yetkililer: f.yetkililer.filter((_, j) => j !== i) }));
                      }}
                      aria-label={t("Kişiyi çıkar")}
                      title={t("Kişiyi çıkar")}
                      style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
                    >
                      <IconX size={14} color={c.textSecondary} />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, yetkililer: [...f.yetkililer, bosYetkili()] }))}
                style={{ alignSelf: "flex-start", fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
              >
                {t("+ Kişi ekle")}
              </button>
            </div>
          )}

          {baglantiModu && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Field label={t("Nerede tanışıldı")} style={{ flex: "2 1 180px" }}>
                <input
                  value={form.tanismaYeri}
                  onChange={(e) => {
                    const yer = e.target.value;
                    // Bilinen bir yer seçildiyse ve tarih boşsa, o yerin tarihi de gelsin.
                    const eslesen = oneriler.find((o) => o.yer === yer && o.tarih);
                    setForm((f) => ({ ...f, tanismaYeri: yer, tanismaTarihi: f.tanismaTarihi || eslesen?.tarih || "" }));
                  }}
                  list="baglanti-tanisma-yerleri"
                  placeholder={t("Örn. İstanbul Fuarı 2026")}
                  maxLength={200}
                  style={{ width: "100%" }}
                />
                <datalist id="baglanti-tanisma-yerleri">
                  {yerOnerileri.map((y) => (
                    <option key={y} value={y} />
                  ))}
                </datalist>
              </Field>
              <Field label={t("Tanışma tarihi")} style={{ flex: "1 1 130px" }}>
                <input
                  type="date"
                  value={form.tanismaTarihi}
                  onChange={(e) => setForm((f) => ({ ...f, tanismaTarihi: e.target.value }))}
                  style={{ width: "100%" }}
                />
              </Field>
              {oneriler.length > 0 && (
                <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: c.textSecondary }}>{t("Son kullanılanlar:")}</span>
                  {oneriler.slice(0, 4).map((o) => {
                    const secili = form.tanismaYeri === o.yer && (form.tanismaTarihi || undefined) === o.tarih;
                    return (
                      <button
                        key={`${o.yer}|${o.tarih ?? ""}`}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, tanismaYeri: o.yer, tanismaTarihi: o.tarih ?? "" }))}
                        style={{
                          fontSize: 11,
                          padding: "2px 8px",
                          borderRadius: 999,
                          border: `1px solid ${secili ? c.primary : c.border}`,
                          background: secili ? c.primary : "transparent",
                          color: secili ? c.onPrimary : c.textSecondary,
                          cursor: "pointer",
                        }}
                      >
                        {o.tarih ? `${o.yer} · ${gunAyYil(o.tarih)}` : o.yer}
                      </button>
                    );
                  })}
                </div>
              )}
              <Field label={t("Sonraki temas")} style={{ flex: "1 1 130px" }}>
                <input
                  type="date"
                  value={form.sonrakiTemas}
                  onChange={(e) => setForm((f) => ({ ...f, sonrakiTemas: e.target.value }))}
                  style={{ width: "100%" }}
                />
              </Field>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Field label={t("E-posta")} style={{ flex: 1 }}>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                onBlur={checkDuplicates}
                style={{ width: "100%" }}
              />
            </Field>
            <Field label={t("Telefon")} style={{ flex: 1 }}>
              <input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                style={{ width: "100%" }}
              />
            </Field>
          </div>

          <button
            type="button"
            onClick={() => setSosyalAcik((a) => !a)}
            aria-expanded={sosyalAcik}
            style={{ alignSelf: "flex-start", fontSize: 12, color: c.textSecondary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            {sosyalAcik ? "▾" : "▸"} {t("Web sitesi ve sosyal medya")}
            {!sosyalAcik && (form.website || Object.values(form.sosyal).some(Boolean)) ? ` · ${t("dolu")}` : ""}
          </button>
          {sosyalAcik && (
          <>
          <Field label={t("Web sitesi")}>
            <input
              value={form.website}
              onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              placeholder={t("Örn. ornek.com")}
              style={{ width: "100%" }}
            />
          </Field>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {gorunenSosyal.map((k) => {
              const tanim = KARTVIZIT_SOSYAL.find((s) => s.anahtar === k)!;
              return (
                <Field key={k} label={tanim.ad} style={{ flex: "1 1 160px" }}>
                  <input
                    value={form.sosyal[k] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, sosyal: { ...f.sosyal, [k]: e.target.value } }))}
                    placeholder={t("@{ornek} ya da profil adresi", { ornek: tanim.ornek })}
                    style={{ width: "100%" }}
                  />
                </Field>
              );
            })}
          </div>
          {gorunenSosyal.length < KARTVIZIT_SOSYAL.length && (
            <select
              value=""
              onChange={(e) => e.target.value && setEkSosyal((l) => [...l, e.target.value as KartvizitSosyalAnahtar])}
              style={{ alignSelf: "flex-start", fontSize: 12, padding: "4px 6px" }}
              aria-label={t("Başka hesap ekle")}
            >
              <option value="">{t("+ Başka hesap ekle")}</option>
              {KARTVIZIT_SOSYAL.filter((s) => !gorunenSosyal.includes(s.anahtar)).map((s) => (
                <option key={s.anahtar} value={s.anahtar}>
                  {s.ad}
                </option>
              ))}
            </select>
          )}
          </>
          )}

          {/* Bağlantılar'da fatura kesilmiyor; hızlı girişte fazladan alan olmasın. */}
          {!baglantiModu && (
            <Field label={t("Vergi / TC No")}>
              <input
                value={form.taxNumber}
                onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))}
                onBlur={checkDuplicates}
                placeholder={t("Fatura kesilecekse gerekli")}
                style={{ width: "100%" }}
              />
            </Field>
          )}

          {yonetici && (
            <Field label={t("Sorumlu çalışan")}>
              <select
                value={form.ownerUserId}
                onChange={(e) => setForm((f) => ({ ...f, ownerUserId: e.target.value }))}
                style={{ width: "100%" }}
              >
                {formMode.kind === "create" && <option value="">{t("Ben")}</option>}
                {formMode.kind === "edit" && !form.ownerUserId && <option value="">{t("Seçilmedi")}</option>}
                {/* Oluştururken "Ben" en üstte zaten var; kendi adı ikinci kez çıkmasın. */}
                {sorumluSecenekleri.filter((k) => formMode.kind === "edit" || k.id !== user?.id).map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.ad}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {baglantiModu ? (
            <Field label={t("İlişki notu — yalnızca bu modülde görünür")}>
              <textarea
                value={form.iliskiNotu}
                onChange={(e) => setForm((f) => ({ ...f, iliskiNotu: e.target.value }))}
                rows={3}
                placeholder={t("Örn. Rakip ama ihracat tarafında birlikte iş yapılabilir.")}
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
            </Field>
          ) : (
            <Field label={t("Not")}>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
              />
            </Field>
          )}

          {duplicates.length > 0 && (
            <div
              style={{
                fontSize: 12,
                color: c.textSecondary,
                background: c.surface,
                border: `1px solid ${c.border}`,
                borderRadius: 8,
                padding: "8px 10px",
              }}
            >
              <strong style={{ color: c.textPrimary }}>{t("Bu kaydı daha önce girmiş olabilirsin:")}</strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {duplicates.map((d) => (
                  <li key={d.party.id}>
                    {d.party.displayName}
                    {d.severity === "block" ? t(" — aynı vergi numarası, kayıt açılamaz") : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {baglantiModu && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Field label={t("Kartvizit (fotoğraf ya da PDF)")} style={{ flex: "1 1 200px" }}>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setKartvizit(e.target.files?.[0] ?? null)}
                  style={{ fontSize: 12 }}
                />
              </Field>
              <Field label={t("Ek dosyalar (teklif, katalog…)")} style={{ flex: "1 1 200px" }}>
                <input
                  type="file"
                  multiple
                  onChange={(e) => setEkDosyalar(Array.from(e.target.files ?? []))}
                  style={{ fontSize: 12 }}
                />
              </Field>
            </div>
          )}

          {error && <p style={{ color: c.danger, fontSize: 13, margin: 0 }}>{error}</p>}
          {/* Vazgeçme yolu formun İÇİNDE: eskiden başlıktaki ekleme düğmesi
              "Vazgeç"e dönüşüyordu, o düğme "+"a taşınınca formu kapatmanın
              yolu kalmıyordu. */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, fontSize: 14 }}
            >
              {saving ? t("Kaydediliyor…") : formMode.kind === "edit" ? t("Güncelle") : t("Kaydet")}
            </button>
            <button
              onClick={closeForm}
              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, fontSize: 14 }}
            >
              {t("Vazgeç")}
            </button>
          </div>
        </div>
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <h5 style={{ fontSize: 14, fontWeight: 500, color: c.textPrimary, margin: 0 }}>
            {baglantiModu ? t("Bağlantı ve İlişkiler") : t("Müşteriler")}
          </h5>
          {profile.key !== "base" && !baglantiModu && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>{t(profile.label)}</span>
          )}
        </div>
        {!canWrite ? (
          <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Salt görüntüleme")}</span>
        ) : (
          !fabAvailable && (
            <button
              onClick={() => (formMode ? closeForm() : openCreate())}
              style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
            >
              {formMode ? t("Vazgeç") : baglantiModu ? t("+ Bağlantı ekle") : t("+ Müşteri ekle")}
            </button>
          )
        )}
      </div>

      {bildirim && <p style={{ color: c.warning, fontSize: 13, margin: 0 }}>{bildirim}</p>}
      {onizlenen && <FilePreviewModal file={onizlenen} onClose={() => setOnizlenen(null)} />}

      {/* Tahsilat takibi: ay ay vadesi gelen siparişler + yöneticiye rapor.
          Bağlantılar'da sipariş yok; sekme de yok. */}
      {!baglantiModu && (
      <div style={{ display: "flex", gap: 6 }}>
        {(["musteriler", "tahsilat"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGorunum(g)}
            style={{
              fontSize: 13,
              padding: "5px 12px",
              borderRadius: 8,
              border: `1px solid ${gorunum === g ? c.primary : c.border}`,
              background: gorunum === g ? c.primary : "transparent",
              color: gorunum === g ? c.onPrimary : c.textSecondary,
              cursor: "pointer",
            }}
          >
            {g === "musteriler" ? t("Müşteriler") : t("Tahsilat takibi")}
          </button>
        ))}
      </div>
      )}

      {gorunum === "tahsilat" && !baglantiModu ? (
        <TahsilatTakibi kapsamYolu={kapsamYolu} departmentId={jobId ? undefined : departmentId} />
      ) : (
      <>
      {!loading && !yonetici && !baglantiModu && parties.length > 0 && (
        <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Sana atanmış müşteriler listeleniyor.")}</span>
      )}

      {/* Bağlantılar'ın şablonu ayrı: önem, tanışma yeri, sonraki temas, ilişki notu. */}
      {canWrite && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setExcelAcik(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 16px",
              borderRadius: 8,
              border: `1px solid ${c.primary}`,
              background: "transparent",
              color: c.primary,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <IconUpload size={16} /> {t("Excel ile toplu ekle")}
          </button>
          <span style={{ flex: "1 1 200px", fontSize: 12, color: c.textSecondary }}>
            {baglantiModu
              ? t("Fuar dönüşü kartvizitleri tek seferde girmek için: şablonu indirin, doldurun, aynı yerden yükleyin.")
              : t("Şablonu indirin, doldurun, aynı yerden yükleyin — her satır bir müşteri kartı olur.")}
          </span>
        </div>
      )}

      {excelAcik && (
        <MusteriExcelModal
          scopePath={scopePath}
          departmentId={departmentId}
          baglanti={baglantiModu}
          onClose={() => setExcelAcik(false)}
          onDone={() => load()}
        />
      )}

      {!loading && parties.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "6px 12px",
                borderRadius: 8,
                background: c.background,
                border: `1px solid ${c.border}`,
                minWidth: 84,
              }}
            >
              <span style={{ fontSize: 11, color: c.textSecondary }}>{t(s.label)}</span>
              <span style={{ fontSize: 15, fontWeight: 500, color: c.textPrimary }}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      {showToolbar && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Ara…")}
            style={{ flex: "1 1 140px", minWidth: 120, fontSize: 13, padding: "5px 8px" }}
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as PartyRole | "")}
            style={{ fontSize: 13, padding: "5px 6px" }}
          >
            <option value="">{t("Rol: tümü")}</option>
            {rolSecenekleri.map((r) => (
              <option key={r} value={r}>
                {t(ROLE_LABELS[r], { ctx: "rol" })}
              </option>
            ))}
          </select>
          {baglantiModu && (
            <select
              value={onemFiltre}
              onChange={(e) => setOnemFiltre(e.target.value as BaglantiOnem | "")}
              style={{ fontSize: 13, padding: "5px 6px" }}
              aria-label={t("Önem")}
            >
              <option value="">{t("Önem: tümü")}</option>
              {BAGLANTI_ONEMLERI.map((o) => (
                <option key={o} value={o}>
                  {t(ONEM_LABELS[o])}
                </option>
              ))}
            </select>
          )}
          {yonetici && (
            <select
              value={sorumluFiltre}
              onChange={(e) => setSorumluFiltre(e.target.value)}
              style={{ fontSize: 13, padding: "5px 6px" }}
              aria-label={t("Sorumlu")}
            >
              <option value="">{t("Sorumlu: tümü")}</option>
              <option value="-">{t("Sorumlusu olmayanlar")}</option>
              {sorumluSecenekleri.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.ad}
                </option>
              ))}
            </select>
          )}
          {hasActiveFilter && (
            <button
              onClick={() => {
                setSearch("");
                setRoleFilter(profile.defaultRole ?? "");
                setSorumluFiltre("");
                setOnemFiltre("");
              }}
              style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
            >
              {t("Temizle")}
            </button>
          )}
        </div>
      )}

      {formMode?.kind === "create" && formAlani}

      {loading ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
      ) : parties.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
          {baglantiModu
            ? t("Henüz bağlantı yok. Fuarda, toplantıda tanıştığın kişileri buraya ekle; müşteri listesine karışmazlar.")
            : t("Henüz müşteri kaydı yok. Satış ve Müşteri İlişkileri aynı listeyi görür.")}
          {canWrite && fabAvailable ? t(' Eklemek için sayfadaki "+" düğmesini kullan.') : ""}
        </p>
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Aramanla eşleşen kayıt yok.")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {hasActiveFilter && (
            <span style={{ fontSize: 12, color: c.textSecondary }}>
              {t("{n} / {toplam} kayıt", { n: visible.length, toplam: parties.length })}
            </span>
          )}
          {/* Satırlar tek bir çerçevede: aralarında ince çizgi, arka plan sıra
              sıra değişir — simgeler ve rozetler eklenince ayrı kutular birbirine
              karışıyordu, göz satırı takip edemiyordu. Renkler paletten. */}
          <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${c.border}`, borderRadius: 10, overflow: "hidden" }}>
          {visible.map((p, i) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                flexDirection: "column",
                borderTop: i === 0 ? "none" : `1px solid ${c.border}`,
                background: i % 2 === 0 ? c.surface : c.background,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpenPartyId(openPartyId === p.id ? null : p.id)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, color: c.textPrimary }}>{p.displayName}</span>
                    {p.roles.map((r) => (
                      <span
                        key={r}
                        style={{
                          fontSize: 10,
                          padding: "1px 6px",
                          borderRadius: 6,
                          color: ROLE_COLORS[r],
                          border: `1px solid ${ROLE_COLORS[r]}40`,
                        }}
                      >
                        {t(ROLE_LABELS[r], { ctx: "rol" })}
                      </span>
                    ))}
                    {baglantiModu && p.baglanti?.onem === "yuksek" && (
                      <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, background: c.accent, color: c.onPrimary }}>
                        {t("Yüksek önem")}
                      </span>
                    )}
                    {baglantiModu && p.baglanti?.sonrakiTemas && (
                      <TemasRozeti tarih={p.baglanti.sonrakiTemas} bugun={bugun} />
                    )}
                  </div>
                  {(profile.detail(p) || yonetici) && (
                    <div style={{ fontSize: 12, color: c.textSecondary, marginTop: 2 }}>
                      {[profile.detail(p), yonetici ? p.ownerName ?? t("Sorumlu yok") : undefined].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </button>
                <SatirSimgeleri party={p} onDosya={dosyaAc} />
                {canWrite && (
                  <>
                    <button
                      onClick={() => (formMode?.kind === "edit" && formMode.party.id === p.id ? closeForm() : openEdit(p))}
                      style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      {formMode?.kind === "edit" && formMode.party.id === p.id ? t("Kapat") : t("Düzenle")}
                    </button>
                    <button
                      onClick={() => handleArchive(p)}
                      aria-label={t("Arşivle")}
                      title={t("Arşivle")}
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      <IconTrash size={14} color={c.textSecondary} />
                    </button>
                  </>
                )}
              </div>

              {formMode?.kind === "edit" && formMode.party.id === p.id && (
                <div style={{ padding: "0 10px 10px" }}>{formAlani}</div>
              )}

              {openPartyId === p.id && !(formMode?.kind === "edit" && formMode.party.id === p.id) && <PartyDetail
                  party={p}
                  baglantiModu={baglantiModu}
                  baglantiYazar={baglantiYazar}
                  departmentId={jobId ? undefined : departmentId}
                  onDegisti={() => load()}
                  canWrite={canWrite}
                  // Sipariş/tahsilat yazma hakkı sorumluluktan gelir (bkz.
                  // backend siparis-erisim.ts): modülde salt okur olan satışçı
                  // da kendisine atanan müşterinin tahsilatını girer.
                  siparisYazar={yonetici || (!!user && p.ownerUserId === user.id)}
                  profile={profile.primaryActionLabel}
                  // Bağlantılar'da alacak-borç sekmesi yok; hook'a şirket verilmezse sekme çıkmaz.
                  organizationId={baglantiModu ? undefined : organizationId}
                />}
            </div>
          ))}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const c = useThemeColors();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, ...style }}>
      <label style={{ fontSize: 12, color: c.textSecondary }}>{label}</label>
      {children}
    </div>
  );
}

/**
 * Sonraki temas tarihi: geçtiyse kırmızı, bugünse vurgulu, ileride sade.
 * Tarih karşılaştırması metinle (YYYY-MM-DD sözlük sırası = takvim sırası).
 */
function TemasRozeti({ tarih, bugun }: { tarih: string; bugun: string }) {
  const c = useThemeColors();
  const t = useT();
  const gecti = tarih < bugun;
  const bugunMu = tarih === bugun;
  const renk = gecti ? c.danger : bugunMu ? c.accent : c.textSecondary;
  const [y, a, g] = tarih.split("-");
  return (
    <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 6, color: renk, border: `1px solid ${renk}60` }}>
      {bugunMu ? t("Bugün temas") : gecti ? t("Temas gecikti · {tarih}", { tarih: `${g}.${a}.${y}` }) : t("Temas · {tarih}", { tarih: `${g}.${a}.${y}` })}
    </span>
  );
}

/**
 * Müşteri kartının altı: temas geçmişi ve kurumdaki kişiler.
 *
 * Geçmiş akışına diğer modüller de yazar (fatura kesildi, destek talebi
 * açıldı) — "modüller birbirini besliyor" tezinin görünür yüzü burasıdır.
 */
function PartyDetail({
  party,
  baglantiModu,
  baglantiYazar,
  departmentId,
  onDegisti,
  canWrite,
  siparisYazar,
  profile,
  organizationId,
}: {
  party: Party;
  baglantiModu: boolean;
  /** Müşteriler'de: kullanıcı Bağlantılar'a da yazabiliyor mu ("Bağlantılara ekle"). */
  baglantiYazar: boolean;
  /** Takip görevi departmanın görev listesine yazılır; departman dışında (serbest çalışan) görev köprüsü yok. */
  departmentId?: string;
  onDegisti: () => void;
  canWrite: boolean;
  siparisYazar: boolean;
  profile: string;
  organizationId?: string;
}) {
  const c = useThemeColors();
  const t = useT();
  const [tab, setTab] = useState<"activity" | "contacts" | "alacakBorc" | "siparisler" | "iliski" | "gorevler">(
    baglantiModu ? "iliski" : "siparisler"
  );
  const [gorevler, setGorevler] = useState<PartyGorevi[]>([]);
  const [gorevAcik, setGorevAcik] = useState(false);
  // "Müşteri yap" iki adımlı: kart satış ekibinin listesine de girer ve geri
  // alma düğmesi yok — tek tıkla olmamalı.
  const [defterSoru, setDefterSoru] = useState(false);
  const [defterHata, setDefterHata] = useState("");
  const hedefDefter = baglantiModu ? MUSTERI_MODUL_KEY : BAGLANTI_MODUL_KEY;
  const defterButonu =
    canWrite && !party.modules.includes(hedefDefter) && (baglantiModu || baglantiYazar);

  const deftereEkle = async () => {
    setBusy(true);
    setDefterHata("");
    try {
      await partyApi.deftereEkle(party.id, hedefDefter);
      setDefterSoru(false);
      onDegisti();
      load();
    } catch (err) {
      setDefterHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setBusy(false);
    }
  };
  const [siparisSayisi, setSiparisSayisi] = useState(0);
  // null = şirket kartı değil ya da kullanıcının alacak/borç defterini görme
  // yetkisi yok; sekme o zaman hiç çıkmaz (bkz. useMusteriAlacakBorcu).
  const alacakBorc = useMusteriAlacakBorcu(party, organizationId);
  const [activities, setActivities] = useState<PartyActivity[]>([]);
  const [contacts, setContacts] = useState<PartyContact[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get<PartyActivity[]>(`/party/${party.id}/activities`).then(setActivities).catch(() => setActivities([]));
    api.get<PartyContact[]>(`/party/${party.id}/contacts`).then(setContacts).catch(() => setContacts([]));
    if (baglantiModu) partyApi.gorevler(party.id).then(setGorevler).catch(() => setGorevler([]));
  };

  useEffect(load, [party.id]);

  const addActivity = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api.post(`/party/${party.id}/activities`, { type: "not", summary: draft.trim() });
      setDraft("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const addContact = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await api.post(`/party/${party.id}/contacts`, { name: draft.trim() });
      setDraft("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const tabStyle = (active: boolean) => ({
    fontSize: 12,
    padding: "3px 8px",
    borderRadius: 6,
    border: "none",
    cursor: "pointer",
    background: active ? c.primary : "transparent",
    color: active ? "#fff" : c.textSecondary,
  });

  return (
    <div
      style={{
        margin: "4px 0 2px 10px",
        padding: "10px 12px",
        borderLeft: `2px solid ${c.border}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {baglantiModu ? (
          <>
            <button onClick={() => setTab("iliski")} style={tabStyle(tab === "iliski")}>
              {t("İlişki")}
            </button>
            <button onClick={() => setTab("gorevler")} style={tabStyle(tab === "gorevler")}>
              {t("Görevler")} {gorevler.length > 0 && `(${gorevler.length})`}
            </button>
          </>
        ) : (
          <button onClick={() => setTab("siparisler")} style={tabStyle(tab === "siparisler")}>
            {t("Siparişler")} {siparisSayisi > 0 && `(${siparisSayisi})`}
          </button>
        )}
        <button onClick={() => setTab("activity")} style={tabStyle(tab === "activity")}>
          {t("Geçmiş")} {activities.length > 0 && `(${activities.length})`}
        </button>
        <button onClick={() => setTab("contacts")} style={tabStyle(tab === "contacts")}>
          {t("Kişiler")} {contacts.length > 0 && `(${contacts.length})`}
        </button>
        {alacakBorc.kayitlar && (
          <button onClick={() => setTab("alacakBorc")} style={tabStyle(tab === "alacakBorc")}>
            {t("Alacak-Borç")} {alacakBorc.kayitlar.length > 0 && `(${alacakBorc.kayitlar.length})`}
          </button>
        )}
      </div>

      {canWrite && (tab === "activity" || tab === "contacts") && (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
          {tab === "activity" ? (
            // Temas notu iki satır: "aradım, katalog istedi, 15'inde dönülecek"
            // tek satıra sığmıyordu. Enter ekler, Shift+Enter alt satıra geçer.
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={profile}
              rows={2}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addActivity();
                }
              }}
              style={{ flex: 1, fontSize: 13, padding: "5px 8px", resize: "vertical", fontFamily: "inherit" }}
            />
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("Kişi adı")}
              onKeyDown={(e) => e.key === "Enter" && addContact()}
              style={{ flex: 1, fontSize: 13, padding: "5px 8px" }}
            />
          )}
          <button
            onClick={tab === "activity" ? addActivity : addContact}
            disabled={busy || !draft.trim()}
            style={{
              fontSize: 12,
              padding: "5px 12px",
              borderRadius: 6,
              border: "none",
              background: c.primary,
              color: c.onPrimary,
              cursor: "pointer",
            }}
          >
            {t("Ekle")}
          </button>
        </div>
      )}

      <KartBaglantilari party={party} />

      {defterButonu && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12 }}>
          {!defterSoru ? (
            <button
              onClick={() => setDefterSoru(true)}
              style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: `1px solid ${c.primary}`, background: "transparent", color: c.primary, cursor: "pointer" }}
            >
              {baglantiModu ? t("Müşteri yap") : t("Bağlantılara ekle")}
            </button>
          ) : (
            <>
              <span style={{ color: c.textSecondary, flex: "1 1 220px" }}>
                {baglantiModu
                  ? t("Kart Müşteriler listesinde de görünecek. İlişki notu satış ekibine açılmaz.")
                  : t("Kart Bağlantı ve İlişkiler listesinde de görünecek.")}
              </span>
              <button
                onClick={deftereEkle}
                disabled={busy}
                style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
              >
                {t("Onayla")}
              </button>
              <button
                onClick={() => setDefterSoru(false)}
                style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, cursor: "pointer" }}
              >
                {t("Vazgeç")}
              </button>
            </>
          )}
          {defterHata && <span style={{ color: c.danger, flexBasis: "100%" }}>{defterHata}</span>}
        </div>
      )}

      {tab === "iliski" ? (
        <>
          <IliskiOzeti baglanti={party.baglanti} />
          <KartDosyalari party={party} canWrite={canWrite} departmentId={departmentId} onDegisti={onDegisti} />
        </>
      ) : tab === "gorevler" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {canWrite && departmentId && (
            <button
              onClick={() => setGorevAcik(true)}
              style={{ alignSelf: "flex-start", fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
            >
              {t("+ Takip görevi aç")}
            </button>
          )}
          {gorevler.length === 0 ? (
            <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>
              {departmentId
                ? t("Bu bağlantı için açılmış görev yok.")
                : t("Takip görevi departman içinden açılır.")}
            </p>
          ) : (
            gorevler.map((g) => (
              <div key={g.id} style={{ display: "flex", gap: 6, fontSize: 12, alignItems: "baseline" }}>
                <span style={{ color: g.status === "completed" ? c.success : c.textSecondary }}>
                  {g.status === "completed" ? "✓" : "○"}
                </span>
                <span
                  style={{
                    flex: 1,
                    color: c.textPrimary,
                    textDecoration: g.status === "completed" ? "line-through" : undefined,
                  }}
                >
                  {g.title}
                  {g.assignedToName && <span style={{ color: c.textSecondary }}> · {g.assignedToName}</span>}
                </span>
                {g.deadline && (
                  <span style={{ color: c.textSecondary }}>{g.deadline.slice(0, 10).split("-").reverse().join(".")}</span>
                )}
              </div>
            ))
          )}
          {gorevAcik && departmentId && (
            <TaskFromRecordModal
              departmentId={departmentId}
              moduleKey={BAGLANTI_MODUL_KEY}
              moduleTitle={t("Bağlantı ve İlişkiler")}
              recordId={party.id}
              defaultTitle={t("{ad} ile görüş", { ad: party.displayName })}
              defaultDeadline={party.baglanti?.sonrakiTemas}
              existingCount={gorevler.length}
              onClose={() => setGorevAcik(false)}
              onCreated={load}
            />
          )}
        </div>
      ) : tab === "siparisler" ? (
        <MusteriSiparisleri party={party} yazabilir={siparisYazar} onSayi={setSiparisSayisi} />
      ) : tab === "alacakBorc" && alacakBorc.kayitlar && organizationId ? (
        <MusteriAlacakBorcu
          party={party}
          organizationId={organizationId}
          kayitlar={alacakBorc.kayitlar}
          yazabilir={alacakBorc.yazabilir}
          yenile={alacakBorc.yenile}
        />
      ) : tab === "activity" ? (
        activities.length === 0 ? (
          <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>{t("Henüz temas kaydı yok.")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {activities.map((a) => (
              <div key={a.id} style={{ fontSize: 12, color: c.textPrimary }}>
                <span style={{ color: c.textSecondary }}>{a.occurredAt.slice(0, 10)} · </span>
                {a.summary}
                {a.userName && <span style={{ color: c.textSecondary }}> — {a.userName}</span>}
              </div>
            ))}
          </div>
        )
      ) : contacts.length === 0 ? (
        <p style={{ fontSize: 12, color: c.textSecondary, margin: 0 }}>{t("Henüz kişi eklenmemiş.")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {contacts.map((ct) => (
            <div key={ct.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ flex: 1, color: c.textPrimary }}>
                {ct.name}
                {ct.title && <span style={{ color: c.textSecondary }}> · {ct.title}</span>}
                {ct.isPrimary && <span style={{ color: c.primary }}> {t("· birincil")}</span>}
                {(ct.phone || ct.email) && (
                  <span style={{ display: "block", color: c.textSecondary }}>
                    {ct.phone && (
                      <a href={`tel:${ct.phone.replace(/[^\d+]/g, "")}`} style={{ color: c.primary, textDecoration: "none" }}>
                        {ct.phone}
                      </a>
                    )}
                    {ct.phone && ct.email && " · "}
                    {ct.email && (
                      <a href={`mailto:${ct.email}`} style={{ color: c.primary, textDecoration: "none" }}>
                        {ct.email}
                      </a>
                    )}
                  </span>
                )}
              </span>
              {canWrite && (
                <button
                  onClick={async () => {
                    await api.delete(`/party-contacts/${ct.id}`);
                    load();
                  }}
                  aria-label={t("Kişiyi çıkar")}
                  style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
                >
                  <IconX size={12} color={c.textSecondary} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Bağlantı kartının "İlişki" sekmesi: tanışma bilgisi ve ilişki notu (düzenleme formdan). */
function IliskiOzeti({ baglanti }: { baglanti?: PartyBaglanti }) {
  const c = useThemeColors();
  const t = useT();
  const gun = (v?: string) => (v ? v.split("-").reverse().join(".") : undefined);
  const satirlar: [string, string | undefined][] = [
    [t("Önem"), baglanti ? t(ONEM_LABELS[baglanti.onem]) : undefined],
    [t("Nerede tanışıldı"), baglanti?.tanismaYeri],
    [t("Tanışma tarihi"), gun(baglanti?.tanismaTarihi)],
    [t("Sonraki temas"), gun(baglanti?.sonrakiTemas)],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      {satirlar
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k}>
            <span style={{ color: c.textSecondary }}>{k}: </span>
            <span style={{ color: c.textPrimary }}>{v}</span>
          </div>
        ))}
      {baglanti?.iliskiNotu ? (
        <p style={{ margin: "4px 0 0", color: c.textPrimary, whiteSpace: "pre-wrap" }}>{baglanti.iliskiNotu}</p>
      ) : (
        <p style={{ margin: "4px 0 0", color: c.textSecondary }}>{t("İlişki notu yok. Düzenle ile ekleyebilirsin.")}</p>
      )}
    </div>
  );
}

/** Kartın web sitesi ve sosyal hesapları. Adresler tutamaçtan üretilir, kullanıcının yazdığı URL href'e girmez. */
function KartBaglantilari({ party }: { party: Party }) {
  const c = useThemeColors();
  const site = safeExternalUrl(party.website);
  const hesaplar = KARTVIZIT_SOSYAL.filter((s) => party.sosyal?.[s.anahtar]);
  if (!site && !hesaplar.length) return null;
  const link = { fontSize: 12, color: c.primary, textDecoration: "none" } as const;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
      {site && (
        <a href={site} target="_blank" rel="noopener noreferrer" style={link}>
          {party.website!.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
      )}
      {hesaplar.map((s) => {
        const tutamac = party.sosyal[s.anahtar]!;
        return (
          <a key={s.anahtar} href={s.adres(tutamac)} target="_blank" rel="noopener noreferrer" style={link}>
            {s.ad}: {s.gorunen(tutamac)}
          </a>
        );
      })}
    </div>
  );
}

/**
 * Kartın kartvizit dosyaları. Dosya departmanın "Kartvizitler" klasöründe
 * durur, karta bağlıdır (bkz. backend PartyService.dosyaEkle). Görmek için
 * dosyanın klasörüne de erişim gerekir; erişilemeyen dosya listede çıkmaz.
 */
function KartDosyalari({
  party,
  canWrite,
  departmentId,
  onDegisti,
}: {
  party: Party;
  canWrite: boolean;
  departmentId?: string;
  /** Listedeki simgeler tazelensin. */
  onDegisti: () => void;
}) {
  const t = useT();
  const [dosyalar, setDosyalar] = useState<{ rol: PartyDosyaRolu; dosya: ProjectFile }[]>([]);
  const [acik, setAcik] = useState<ProjectFile | null>(null);

  const yukle = () => {
    partyApi.dosyalar(party.id).then(setDosyalar).catch(() => setDosyalar([]));
  };
  useEffect(yukle, [party.id]);
  const degisti = () => {
    yukle();
    onDegisti();
  };

  const ortak = { party, canWrite, departmentId, onAc: setAcik, onDegisti: degisti };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
      <DosyaBolumu
        {...ortak}
        rol="kartvizit"
        baslik={t("Kartvizit")}
        ekleMetni={t("+ Kartvizit ekle")}
        accept="image/*,application/pdf"
        dosyalar={dosyalar.filter((d) => d.rol === "kartvizit").map((d) => d.dosya)}
      />
      <DosyaBolumu
        {...ortak}
        rol="ek"
        baslik={t("Dosyalar")}
        ekleMetni={t("+ Dosya ekle")}
        dosyalar={dosyalar.filter((d) => d.rol === "ek").map((d) => d.dosya)}
      />
      {acik && <FilePreviewModal file={acik} onClose={() => setAcik(null)} />}
    </div>
  );
}

/** Kartvizit ya da ek dosya bölümü: liste + ekle + karttan kaldır. */
function DosyaBolumu({
  party,
  canWrite,
  departmentId,
  rol,
  baslik,
  ekleMetni,
  accept,
  dosyalar,
  onAc,
  onDegisti,
}: {
  party: Party;
  canWrite: boolean;
  departmentId?: string;
  rol: PartyDosyaRolu;
  baslik: string;
  ekleMetni: string;
  accept?: string;
  dosyalar: ProjectFile[];
  onAc: (d: ProjectFile) => void;
  onDegisti: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");
  const girdi = useRef<HTMLInputElement>(null);

  const ekle = async (secilen: FileList | null) => {
    if (!secilen?.length) return;
    setYukleniyor(true);
    setHata("");
    // Birden çok dosya sırayla: biri düşerse diğerleri yine yüklensin.
    const hatalar: string[] = [];
    for (const f of Array.from(secilen)) {
      await partyApi
        .dosyaEkle(party.id, f, departmentId, rol)
        .catch((err) => hatalar.push(`${f.name}: ${err instanceof Error ? err.message : t("Yüklenemedi")}`));
    }
    setHata(hatalar.join(" · "));
    setYukleniyor(false);
    onDegisti();
  };

  const kaldir = async (d: ProjectFile) => {
    await partyApi.dosyaKaldir(party.id, d.id).catch(() => {});
    onDegisti();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: c.textSecondary }}>
          {baslik}
          {dosyalar.length > 0 && ` (${dosyalar.length})`}
        </span>
        {canWrite && (
          <button
            onClick={() => girdi.current?.click()}
            disabled={yukleniyor}
            style={{ fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            {yukleniyor ? t("Yükleniyor…") : ekleMetni}
          </button>
        )}
        <input
          ref={girdi}
          type="file"
          accept={accept}
          multiple={rol === "ek"}
          style={{ display: "none" }}
          onChange={(e) => {
            void ekle(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {dosyalar.map((d) => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            onClick={() => onAc(d)}
            style={{ flex: 1, textAlign: "left", fontSize: 12, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            {d.name}
          </button>
          {canWrite && (
            <button
              onClick={() => kaldir(d)}
              aria-label={t("Karttan kaldır")}
              title={t("Karttan kaldır")}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 2 }}
            >
              <IconX size={12} color={c.textSecondary} />
            </button>
          )}
        </div>
      ))}
      {hata && <span style={{ color: c.danger }}>{hata}</span>}
    </div>
  );
}

/**
 * Liste satırındaki küçük simgeler: kartvizit/dosya, web sitesi, sosyal
 * hesaplar. Tıklayınca gider; satırın kendisi (kartı açma) tetiklenmez.
 * Adresler tutamaçtan üretilir (KARTVIZIT_SOSYAL), kullanıcının yazdığı URL
 * href'e girmez; web sitesi safeExternalUrl'den geçer.
 */
function SatirSimgeleri({ party, onDosya }: { party: Party; onDosya: (fileId: string) => void }) {
  const c = useThemeColors();
  const t = useT();
  const site = safeExternalUrl(party.website);
  // Dar ekranda satır taşmasın: en çok 4 hesap; tamamı kartın içinde görünür.
  const hesaplar = KARTVIZIT_SOSYAL.filter((s) => party.sosyal?.[s.anahtar]).slice(0, 4);
  if (!site && !hesaplar.length && !party.sonKartvizitId && !party.sonEkId) return null;

  const simge = (ic: string) => (
    <svg
      viewBox="0 0 24 24"
      width={15}
      height={15}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      // Sabit çizim (shared/kartvizit.ts), kullanıcı verisi değil.
      dangerouslySetInnerHTML={{ __html: ic }}
    />
  );
  const kutu = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    borderRadius: 6,
    color: c.textSecondary,
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
  } as const;
  const durdur = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
      {party.sonKartvizitId && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDosya(party.sonKartvizitId!);
          }}
          title={
            party.kartvizitSayisi && party.kartvizitSayisi > 1
              ? t("Kartvizit ({n} dosya)", { n: party.kartvizitSayisi })
              : t("Kartvizit")
          }
          aria-label={t("Kartvizit")}
          style={kutu}
        >
          <IconIdCard size={15} />
        </button>
      )}
      {party.sonEkId && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDosya(party.sonEkId!);
          }}
          title={t("Ek dosyalar ({n}) — son ekleneni açar", { n: party.ekSayisi ?? 1 })}
          aria-label={t("Ek dosyalar")}
          style={kutu}
        >
          <IconPaperclip size={15} />
        </button>
      )}
      {site && (
        <a href={site} target="_blank" rel="noopener noreferrer" onClick={durdur} title={party.website} aria-label={t("Web sitesi")} style={kutu}>
          {simge(WEB_SITESI_IKON)}
        </a>
      )}
      {hesaplar.map((s) => {
        const tutamac = party.sosyal[s.anahtar]!;
        return (
          <a
            key={s.anahtar}
            href={s.adres(tutamac)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={durdur}
            title={`${s.ad}: ${s.gorunen(tutamac)}`}
            aria-label={s.ad}
            style={kutu}
          >
            {simge(KARTVIZIT_SOSYAL_IKON[s.anahtar])}
          </a>
        );
      })}
    </div>
  );
}
