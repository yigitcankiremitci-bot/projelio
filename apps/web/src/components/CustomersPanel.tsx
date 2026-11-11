import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BAGLANTI_MODUL_KEY,
  BAGLANTI_ONEMLERI,
  KARTVIZIT_SOSYAL,
  EPOSTA_IKON,
  KARTVIZIT_SOSYAL_IKON,
  TELEFON_IKON,
  kartvizitSosyalNormallestir,
  WEB_SITESI_IKON,
  MUSTERI_MODUL_KEY,
  acilisSekmesiCoz,
  modulSekmeleri,
  GORUSME_TURU_ETIKETI,
  aramaDurumu,
  potansiyelMusteriMi,
  ozelSiraAnahtari,
  safeExternalUrl,
  type BaglantiListeKaydi,
  type MusteriPortalOzeti,
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
  type PartyAktarimHedefi,
  type PartyAktarimSecenegi,
  type PartyDosyaRolu,
  type PartyGorevi,
  type ProjectFile,
  type PartyRole,
  type PartyOzelSiralar,
} from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import type { ThemeColors } from "@projelio/shared";
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
import { IconCalendar, InlineIcon, IconEdit, IconHome, IconIdCard, IconMap, IconPaperclip, IconSortDescending, IconTrash, IconUpload, IconUser, IconX } from "./icons";
import { useT } from "../lib/i18n";
import MusteriAlacakBorcu, { useMusteriAlacakBorcu } from "./butce/MusteriAlacakBorcu";
import { useCanliTazele } from "../lib/liveRoom";
import { timeAgo } from "../lib/dates";
import { useIsWide } from "../lib/useIsDesktop";
import { listeCercevesi } from "../lib/listeStili";
import MusteriExcelModal from "./MusteriExcelModal";
import { acilisApi, partyApi, portalApi } from "../api/party";
import { filesApi } from "../api/files";
import { useCurrentUser } from "../lib/useCurrentUser";
import MusteriSiparisleri from "./musteri/MusteriSiparisleri";
import MusteriPortali from "./musteri/MusteriPortali";
import TahsilatTakibi from "./musteri/TahsilatTakibi";
import MusteriKunyesi from "./musteri/MusteriKunyesi";
import { onayla } from "../lib/onay";
// Harita ancak "Haritada göster"e basılınca yüklenir: il sınırlarının verisi
// (~110 KB) Müşteriler ekranını her açanın paketine girmesin.
const MusteriHaritasi = lazy(() => import("./musteri/MusteriHaritasi"));
import GorusmeNotlari from "./musteri/GorusmeNotlari";
import KartDosyaSecici from "./musteri/KartDosyaSecici";
import KartDosyaOnizleme from "./musteri/KartDosyaOnizleme";
import { BaglantiListeSekmeleri, KartListeleri, PARTY_SURUKLE } from "./BaglantiListeleri";
import TaskFromRecordModal from "./TaskFromRecordModal";
import FilePreviewModal from "./FilePreviewModal";
import Modal from "./Modal";
import { FiltreBasligi, FiltreBolumu, HarfIzgarasi, SecimListesi, basHarf, filtrePaneliStili, sayarakSecenekler } from "./musteri/FiltrePaneli";
import { sorumluAdi } from "../lib/partySorumlu";
import { useModulGeriHapi } from "../lib/modulGeri";
import EpostaGonderSecimi from "./EpostaGonderSecimi";

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
    // Kartın girdiği listeler (migration 163/170); kaydedince fark uygulanır.
    listeIdleri: [] as string[],
  };
}

const ONEM_SIRASI: Record<BaglantiOnem, number> = { yuksek: 0, orta: 1, dusuk: 2 };

type Siralama = "onem" | "ad" | "yeni" | "temas" | "kurum" | "arama" | "ozel";
// dil:anahtar-baslangic
const SIRALAMA_ETIKETI: Record<Siralama, string> = {
  ozel: "Özel sıra",
  onem: "Önem",
  ad: "Ad (A–Z)",
  yeni: "Son eklenen",
  temas: "Sonraki temas",
  kurum: "Şirket / kurum",
  arama: "Aranacaklar önce",
};
// dil:anahtar-bitis

/** Kullanıcının seçtiği sıralama, modül başına bu tarayıcıda hatırlanır (kaybolsa da olur). */
function siralamaOku(anahtar: string, varsayilan: Siralama, gecerli: Siralama[]): Siralama {
  try {
    const v = localStorage.getItem(anahtar) as Siralama | null;
    return v && gecerli.includes(v) ? v : varsayilan;
  } catch {
    return varsayilan;
  }
}

/**
 * Özel sıra: kart sürüklenerek dizildiğinde kaydedilen kimlik sırası
 * (migration 170). Sırada olmayan kart (sonradan eklenen) sona, ada göre.
 */
function sirala(liste: Party[], s: Siralama, ozel?: string[]): Party[] {
  const ad = (a: Party, b: Party) => a.displayName.localeCompare(b.displayName, "tr");
  const yer = s === "ozel" ? new Map((ozel ?? []).map((id, i) => [id, i])) : undefined;
  return [...liste].sort((a, b) => {
    switch (s) {
      case "ozel": {
        const ya = yer!.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const yb = yer!.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return ya !== yb ? ya - yb : ad(a, b);
      }
      case "ad":
        return ad(a, b);
      case "yeni":
        return b.createdAt.localeCompare(a.createdAt) || ad(a, b);
      case "temas": {
        // Tarihsizler sona.
        const ta = a.baglanti?.sonrakiTemas ?? "9999";
        const tb = b.baglanti?.sonrakiTemas ?? "9999";
        return ta !== tb ? (ta < tb ? -1 : 1) : ad(a, b);
      }
      case "arama": {
        // Arama listesi: önce planlı aramalar (gecikmiş en üstte), sonra hiç
        // aranmamışlar, sonra en uzun süredir aranmayanlar.
        const pa = a.sonrakiArama ?? "9999";
        const pb = b.sonrakiArama ?? "9999";
        if (pa !== pb) return pa < pb ? -1 : 1;
        const sa = a.temas?.sonTemas?.occurredAt ?? "";
        const sb = b.temas?.sonTemas?.occurredAt ?? "";
        return sa !== sb ? (sa < sb ? -1 : 1) : ad(a, b);
      }
      case "kurum": {
        // Şirket kartında kurum kendi adı; kurumsuzlar sona.
        const ka = (a.partyType !== "person" ? a.displayName : a.kurum) ?? "\uffff";
        const kb = (b.partyType !== "person" ? b.displayName : b.kurum) ?? "\uffff";
        return ka.localeCompare(kb, "tr") || ad(a, b);
      }
      default: {
        // Önem, sonra en yakın temas, sonra ad: "kime önce dönmeliyim".
        const o = ONEM_SIRASI[a.baglanti?.onem ?? "orta"] - ONEM_SIRASI[b.baglanti?.onem ?? "orta"];
        if (o) return o;
        const ta = a.baglanti?.sonrakiTemas ?? "9999";
        const tb = b.baglanti?.sonrakiTemas ?? "9999";
        return ta !== tb ? (ta < tb ? -1 : 1) : ad(a, b);
      }
    }
  });
}

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
  // Geniş ekranda özet kutuları ve sıralama sağdaki dar sütuna geçer (bkz. yanSutun).
  const genisEkran = useIsWide();
  // Panelin kendi genişliği: sütun sayısı buna göre (bkz. ikiBolme).
  const kokRef = useRef<HTMLDivElement>(null);
  const [kokGenislik, setKokGenislik] = useState(0);
  useEffect(() => {
    const el = kokRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setKokGenislik(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
  // Kartın hangi sekmede açılacağı (kişi sayısı simgesi → Kişiler).
  const [detaySekmesi, setDetaySekmesi] = useState<"contacts" | undefined>();
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
  // Süz penceresi (rol, önem, sorumlu, sıralama) açık mı.
  const [suzAcik, setSuzAcik] = useState(false);
  // Potansiyel müşterilerin kendi sekmesi var: Satış profilinin "lead"
  // varsayılanı artık bir filtre değil, panelin Potansiyel sekmesinde açılması.
  const varsayilanRol: PartyRole | "" = !baglantiModu && profile.defaultRole === "lead" ? "" : profile.defaultRole ?? "";
  // Açılış sekmesi kişinin tercihi (migration 169); seçmediyse modülün ilk
  // sekmesi — Tahsilat takibi (kullanıcı isteği, 2026-10-20). Önceden
  // Müşteriler'di, satış departmanında Potansiyel.
  const ilkGorunum = acilisSekmesiCoz(MUSTERI_MODUL_KEY, undefined) as "musteriler" | "potansiyel" | "tahsilat";
  const [roleFilter, setRoleFilter] = useState<PartyRole | "">(varsayilanRol);
  const [onemFiltre, setOnemFiltre] = useState<BaglantiOnem | "">("");
  const [openPartyId, setOpenPartyId] = useState<string | null>(null);
  const { pushUndo } = useUndo();
  const { user } = useCurrentUser();

  // Yönetici hepsini görür, müşteriyi çalışana atar ve raporu görür; çalışan
  // yalnızca kendisine atananları görür. Karar sunucunun (musterilerim ucu).
  const [yonetici, setYonetici] = useState(false);
  // Potansiyel: anlaşma yapılmamış kartlar (bkz. potansiyelMusteriMi). Aynı
  // tablo, aynı kart; "Müşteriye dönüştür" yalnızca rolü değiştirir.
  const [gorunum, setGorunum] = useState<"musteriler" | "potansiyel" | "tahsilat">(ilkGorunum);
  // Kişinin kaydettiği açılış sekmesi (null: kaydetmemiş, varsayılan geçerli).
  // Tercih gelene kadar içerik çizilmez: önce varsayılan sekme açılıp sonra
  // tercihe atlasaydı tahsilat listesi boşuna yüklenir, ekran sıçrardı.
  const [kayitliAcilis, setKayitliAcilis] = useState<string | null>(null);
  const [acilisHazir, setAcilisHazir] = useState(baglantiModu);
  // Sorumlunun ADI (bkz. lib/partySorumlu): "-" = sorumlusu olmayanlar.
  const [sorumluFiltre, setSorumluFiltre] = useState("");
  // Soldaki ayrıntılı filtreler (kullanıcı isteği, 2026-11-11).
  const [ilSec, setIlSec] = useState<string[]>([]);
  const [ilceSec, setIlceSec] = useState<string[]>([]);
  const [harfSec, setHarfSec] = useState("");
  const [takipSec, setTakipSec] = useState<"" | "gecikti" | "bugun" | "planli" | "hic">("");
  const [iletisimSec, setIletisimSec] = useState<"" | "telefonsuz" | "epostasiz">("");
  const [ekip, setEkip] = useState<{ id: string; ad: string }[]>([]);

  const scopePath = jobId ? `/jobs/${jobId}/party` : `/organizations/${organizationId}/party`;
  const kapsamYolu = jobId ? `/jobs/${jobId}` : `/organizations/${organizationId}`;

  // Bağlantı listeleri (oynatma listesi gibi sekmeler, bkz. BaglantiListeleri).
  // Açık sekme bu tarayıcıda kapsam başına hatırlanır (kaybolsa da olur).
  // Migration 170'ten beri Müşteriler'de de: listeler üç sekmede ortak.
  const [listeler, setListeler] = useState<BaglantiListeKaydi[]>([]);
  const [ozelSiralar, setOzelSiralar] = useState<PartyOzelSiralar>({});
  const listeModulu = baglantiModu ? BAGLANTI_MODUL_KEY : MUSTERI_MODUL_KEY;
  const listeAnahtari = `projelio_${baglantiModu ? "baglanti" : "musteri"}_listesi_${kapsamYolu}`;
  // Müşteriler'de seçim HATIRLANMAZ: listeler üç sekmede ortak ve hatırlanan
  // bir liste Potansiyel'i de süzüyordu — Bağlantılar'dan potansiyele
  // aktarılan kart, o listede olmadığı için "kayboldu" (kullanıcı şikâyeti,
  // 2026-10-28). Bağlantılar'da eskisi gibi hatırlanır.
  const [seciliListe, setSeciliListeHam] = useState<string>(() => {
    if (!baglantiModu) return "";
    try {
      return localStorage.getItem(listeAnahtari) ?? "";
    } catch {
      return "";
    }
  });
  const setSeciliListe = (id: string) => {
    setSeciliListeHam(id);
    if (!baglantiModu) return;
    try {
      localStorage.setItem(listeAnahtari, id);
    } catch {
      /* gizli pencere: hatırlamasa da olur */
    }
  };
  // Silinmiş ya da başka kapsamın listesi hatırlandıysa Tümü'ne dönülür.
  const etkinListe = listeler.some((l) => l.id === seciliListe) ? seciliListe : "";

  // Yalnızca İLK yüklemede "Yükleniyor…" gösterilir. Kaydetme/arşivleme
  // sonrası tazelemede de gösterilince liste bir an yok olup geri geliyor,
  // kaydırma başa dönüyordu — sayfa kendi kendine yenileniyor gibi görünüyordu.
  const load = (ilk = false) => {
    if (ilk === true) setLoading(true);
    const istek = baglantiModu
      ? partyApi.baglantilarim(kapsamYolu, jobId ? undefined : departmentId).then((r) => {
          setListeler(r.listeler ?? []);
          setOzelSiralar(r.ozelSiralar ?? {});
          return { kartlar: r.baglantilar, yonetici: r.yonetici };
        })
      : partyApi.musterilerim(scopePath, jobId ? undefined : departmentId).then((r) => {
          setListeler(r.listeler ?? []);
          setOzelSiralar(r.ozelSiralar ?? {});
          return { kartlar: r.musteriler, yonetici: r.yonetici };
        });
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
  // Canlı: Lio'nun eklediği kart (WhatsApp'tan da), aynı sayfadaki başkasının
  // değişikliği, soket yeniden bağlanması ve uygulamaya geri dönüş listeyi
  // tazeler — sayfayı yenilemek gerekmesin (bkz. useCanliTazele).
  useCanliTazele(() => load(), [scopePath, departmentId, baglantiModu]);

  // Şablon indirme ve doldurulmuş dosyayı yükleme aynı pencerede (bkz. MusteriExcelModal).
  const [excelAcik, setExcelAcik] = useState(false);
  const [haritaAcik, setHaritaAcik] = useState(false);
  // Anasayfadaki harita kartı buraya ?harita=1 ile gelir. Liste yüklenmeden açılırsa
  // harita boş görünürdü; parametre de silinir ki yenileyince kapatılan harita geri gelmesin.
  const [aramaParametreleri, setAramaParametreleri] = useSearchParams();
  const haritaIstendi = aramaParametreleri.get("harita") === "1";
  // Anasayfa kartının sekmesinden gelindiyse: ?sekme= (Müşteriler) ya da ?liste= (Bağlantılar).
  // Bir kez okunur ve adresten silinir; yenileyince kişinin kendi tercihi geçerli olsun.
  const istenenSekme = useRef<string | null>(
    (() => {
      const s = aramaParametreleri.get("sekme");
      return s === "musteriler" || s === "potansiyel" || s === "tahsilat" ? s : null;
    })()
  );
  useEffect(() => {
    const liste = aramaParametreleri.get("liste");
    if (!aramaParametreleri.has("sekme") && !liste) return;
    if (liste) setSeciliListe(liste);
    setAramaParametreleri(
      (once) => {
        const yeni = new URLSearchParams(once);
        yeni.delete("sekme");
        yeni.delete("liste");
        return yeni;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // ?il=<plaka>: karttaki bir ile tıklanınca pencere o ilin ilçeleriyle açılır.
  const [haritaAcilisIli, setHaritaAcilisIli] = useState<number | undefined>();
  useEffect(() => {
    if (loading || !haritaIstendi) return;
    const plaka = Number(aramaParametreleri.get("il"));
    setHaritaAcilisIli(plaka >= 1 && plaka <= 81 ? plaka : undefined);
    setHaritaAcik(true);
    setAramaParametreleri(
      (once) => {
        const yeni = new URLSearchParams(once);
        yeni.delete("harita");
        yeni.delete("il");
        return yeni;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, haritaIstendi]);
  // Haritanın yan listesinden açılan kart (harita penceresinin üstünde).
  const [haritaKartiId, setHaritaKartiId] = useState<string | null>(null);

  // Departman değişince o departmanın varsayılan rol filtresi uygulanır.
  useEffect(() => {
    setRoleFilter(varsayilanRol);
  }, [profile.defaultRole]);

  useEffect(() => {
    if (baglantiModu) return;
    let iptal = false;
    setAcilisHazir(false);
    acilisApi
      .oku(kapsamYolu, MUSTERI_MODUL_KEY)
      .then((r) => {
        if (iptal) return;
        // Anasayfa kartındaki sekmeden gelindiyse (?sekme=) o sekme, kayıtlı tercihin önünde.
        const istenen = istenenSekme.current;
        istenenSekme.current = null;
        setGorunum((istenen ?? r.sekme ?? ilkGorunum) as typeof gorunum);
        setKayitliAcilis(r.kayitli ? r.sekme ?? null : null);
      })
      .catch(() => !iptal && setGorunum(ilkGorunum))
      .finally(() => !iptal && setAcilisHazir(true));
    return () => {
      iptal = true;
    };
  }, [kapsamYolu, baglantiModu]);

  const acilisYap = async (g: typeof gorunum, etiket: string) => {
    if ((kayitliAcilis ?? ilkGorunum) === g) return;
    if (!(await onayla(t("Modül her açılışta \"{sekme}\" sekmesinde açılsın mı?", { sekme: etiket })))) return;
    try {
      const r = await acilisApi.kaydet(kapsamYolu, MUSTERI_MODUL_KEY, g);
      setKayitliAcilis(r.sekme);
    } catch (err) {
      setBildirim(err instanceof Error ? err.message : t("Kaydedilemedi"));
    }
  };

  const bugun = bugunYmd();
  // "Özel sıra" kart sürüklenince kendiliğinden seçilir; elle de seçilebilir.
  const siralamaSecenekleri: Siralama[] = baglantiModu
    ? ["onem", "ad", "yeni", "temas", "kurum", "ozel"]
    : ["ad", "yeni", "kurum", "arama", "ozel"];
  const siralamaAnahtari = `projelio_party_siralama_${baglantiModu ? "baglantilar" : "musteri"}`;
  const [siralama, setSiralama] = useState<Siralama>(() =>
    siralamaOku(siralamaAnahtari, baglantiModu ? "onem" : "ad", siralamaSecenekleri)
  );
  const siralamaSec = (s: Siralama) => {
    setSiralama(s);
    try {
      localStorage.setItem(siralamaAnahtari, s);
    } catch {
      /* gizli pencere: hatırlamasa da olur */
    }
  };
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

  // Açık sekmenin kartları (liste süzgecinden önce). Bağlantılar'da sekme
  // yok, hepsi; Tahsilat takibinde liste sayıları bütün kartlardan.
  const sekmeTabani = useMemo(
    () =>
      baglantiModu || gorunum === "tahsilat"
        ? parties
        : parties.filter((p) => (gorunum === "potansiyel") === potansiyelMusteriMi(p)),
    [parties, baglantiModu, gorunum]
  );
  const sekmeKartlari = useMemo(
    () => (etkinListe ? sekmeTabani.filter((p) => p.listeIdleri?.includes(etkinListe)) : sekmeTabani),
    [sekmeTabani, etkinListe]
  );
  // Liste sekmelerindeki sayılar açık sekmeye göre: "Fuar 2026" Potansiyel'de 12, Müşteriler'de 3.
  const listeSayilari = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of sekmeTabani) for (const id of p.listeIdleri ?? []) m[id] = (m[id] ?? 0) + 1;
    return m;
  }, [sekmeTabani]);
  // Tahsilat takibi seçili listenin müşterilerinin siparişlerine daralır.
  const tahsilatSuzgeci = useMemo(
    () => (etkinListe ? new Set(sekmeKartlari.map((p) => p.id)) : undefined),
    [etkinListe, sekmeKartlari]
  );
  const ozelAnahtar = ozelSiraAnahtari(baglantiModu ? "baglantilar" : gorunum, etkinListe);
  const potansiyelSayisi = useMemo(() => parties.filter(potansiyelMusteriMi).length, [parties]);
  // Müşteriler sekmesinin rol seçicisinde "Potansiyel" yok: o kartlar kendi sekmesinde.
  const filtreRolleri = baglantiModu ? rolSecenekleri : rolSecenekleri.filter((r) => r !== "lead");

  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    const suzulen = sekmeKartlari.filter((p) => {
      // Potansiyel sekmesinde rol filtresi YOK: Müşteri İlişkileri'nin
      // varsayılan "Müşteri" filtresi oradaki herkesi gizliyordu, seçici de o
      // sekmede saklı olduğu için kullanıcı filtreyi kaldıramıyordu.
      if (roleFilter && gorunum !== "potansiyel" && !p.roles.includes(roleFilter)) return false;
      if (onemFiltre && p.baglanti?.onem !== onemFiltre) return false;
      if (sorumluFiltre) {
        const ad = sorumluAdi(p);
        if (sorumluFiltre === "-" ? !!ad : ad !== sorumluFiltre) return false;
      }
      if (ilSec.length && !ilSec.includes(ilAdi(p) ?? "")) return false;
      if (ilceSec.length && !ilceSec.includes(ilceAdi(p) ?? "")) return false;
      if (harfSec && basHarf(p.displayName) !== harfSec) return false;
      if (takipSec) {
        const d = aramaDurumu(p.sonrakiArama, bugun);
        if (takipSec === "gecikti" && d !== "gecikti") return false;
        if (takipSec === "bugun" && d !== "bugun") return false;
        if (takipSec === "planli" && !p.sonrakiArama) return false;
        if (takipSec === "hic" && p.temas?.sonTemas) return false;
      }
      if (iletisimSec === "telefonsuz" && p.phone) return false;
      if (iletisimSec === "epostasiz" && p.email) return false;
      if (!q) return true;
      return [p.displayName, p.legalName, p.kurum, p.unvan, p.email, p.phone, p.taxNumber, p.baglanti?.tanismaYeri]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(q);
    });
    return sirala(suzulen, siralama, ozelSiralar[ozelAnahtar]);
  }, [sekmeKartlari, search, roleFilter, onemFiltre, sorumluFiltre, ilSec, ilceSec, harfSec, takipSec, iletisimSec, bugun, siralama, gorunum, ozelSiralar, ozelAnahtar]);

  // Harita listedekileri gösterir (süzgeçler uygulanmış hâliyle); Tahsilat
  // takibinde seçili listenin müşterilerini.
  const haritaKartlari = gorunum === "tahsilat" && !baglantiModu ? sekmeKartlari.filter((p) => !p.archivedAt) : visible;

  // ---------------------------------------------------------------- Sürükle-bırak
  // Kart satırı: (1) başka bir satırın üstüne bırakılınca sıra değişir ve
  // "Özel sıra"ya geçilir, sıra kaydedilir; (2) liste sekmesinin üstüne
  // bırakılınca o listeye taşınır (kullanıcı isteği, 2026-10-26). Dokunmatik
  // ekranda HTML sürükleme yok: orada kartın içindeki liste düğmeleri kalır.
  const surukleVar = canWrite;
  const [suruklenen, setSuruklenen] = useState<string | null>(null);
  const [birakmaYeri, setBirakmaYeri] = useState<{ id: string; once: boolean } | null>(null);

  const siraTasi = (id: string, hedefId: string, once: boolean) => {
    if (id === hedefId) return;
    // Taban, ekrandaki sıranın SÜZGEÇSİZ hâli: arama açıkken sürüklemek
    // görünmeyen kartları sıradan düşürmesin.
    const taban = sirala(sekmeKartlari, siralama, ozelSiralar[ozelAnahtar]).map((p) => p.id);
    const kalan = taban.filter((x) => x !== id);
    let i = kalan.indexOf(hedefId);
    if (i < 0) return;
    if (!once) i++;
    kalan.splice(i, 0, id);
    setOzelSiralar((o) => ({ ...o, [ozelAnahtar]: kalan }));
    siralamaSec("ozel");
    partyApi
      .siraKaydet(kapsamYolu, listeModulu, ozelAnahtar, kalan)
      .catch((err) => setBildirim(err instanceof Error ? err.message : t("Sıra kaydedilemedi")));
  };

  /** Liste sekmesine bırakılan kart: açık listeden çıkıp hedefe geçer ("" = Tümü: yalnızca çıkar). */
  const listeyeBirak = async (hedef: string, partyId: string) => {
    const kaynak = etkinListe;
    if (hedef === kaynak) return;
    const p = parties.find((x) => x.id === partyId);
    const ad = (id: string) => listeler.find((l) => l.id === id)?.ad ?? "";
    // Önce ekranda: sunucu yanıtını beklemeden kart yerini değiştirsin.
    setParties((liste) =>
      liste.map((x) =>
        x.id !== partyId
          ? x
          : { ...x, listeIdleri: [...new Set([...(x.listeIdleri ?? []).filter((l) => l !== kaynak), ...(hedef ? [hedef] : [])])] }
      )
    );
    try {
      if (hedef) await partyApi.listeyeEkle(hedef, [partyId]);
      if (kaynak) await partyApi.listedenCikar(kaynak, [partyId]);
      const kart = p?.displayName ?? t("Kart");
      setBildirim(
        hedef
          ? t("{ad}, \"{liste}\" listesine taşındı.", { ad: kart, liste: ad(hedef) })
          : t("{ad}, \"{liste}\" listesinden çıkarıldı.", { ad: kart, liste: ad(kaynak) })
      );
    } catch (err) {
      setBildirim(err instanceof Error ? err.message : t("Kaydedilemedi"));
    }
    load();
  };

  const hasActiveFilter =
    search.trim() !== "" ||
    roleFilter !== varsayilanRol ||
    sorumluFiltre !== "" ||
    onemFiltre !== "" ||
    ilSec.length > 0 ||
    ilceSec.length > 0 ||
    harfSec !== "" ||
    takipSec !== "" ||
    iletisimSec !== "";
  // Varsayılan filtre her şeyi gizlediyse de araç çubuğu çıkar; yoksa "eşleşen
  // kayıt yok" yazar ve filtreyi değiştirecek bir yer kalmazdı.
  const showToolbar =
    sekmeKartlari.length > TOOLBAR_THRESHOLD || hasActiveFilter || (sekmeKartlari.length > 0 && visible.length === 0);

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
      // Müşteriler'de açık sekme belirler: Potansiyel'den eklenen kart potansiyel.
      role: baglantiModu ? profile.defaultRole ?? "contact" : gorunum === "potansiyel" ? "lead" : "customer",
      // En son girilen yer ve tarih hazır gelir; değiştirmek tek tık.
      tanismaYeri: oneriler[0]?.yer ?? "",
      tanismaTarihi: oneriler[0]?.tarih ?? "",
      // Bir liste açıkken eklenen kart o listeye girer (formda değiştirilebilir).
      listeIdleri: etkinListe ? [etkinListe] : [],
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
      listeIdleri: p.listeIdleri ?? [],
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
  // Sekmeye göre: Tahsilat'ta yeni sipariş (müşteri formun içinde seçilir,
  // müşterisiz de oradan), Müşteriler'de müşteri, Potansiyel'de potansiyel.
  const [yeniSiparisIstegi, setYeniSiparisIstegi] = useState(0);
  const tahsilatSekmesi = !baglantiModu && gorunum === "tahsilat";
  const ekleEtiketi = baglantiModu
    ? t("Bağlantı ekle")
    : tahsilatSekmesi
      ? t("Sipariş ekle")
      : gorunum === "potansiyel"
        ? t("Potansiyel müşteri ekle")
        : t("Müşteri ekle");
  // Sipariş hakkı müşteriden ya da kanaldan gelir (sunucu doğrular); salt
  // okur çalışan da kendisine atanan müşteriye sipariş girer — "+" onda da çıkar.
  useProjectFabAction(
    fabAvailable && (canWrite || tahsilatSekmesi)
      ? { label: ekleEtiketi, onClick: tahsilatSekmesi ? () => setYeniSiparisIstegi((n) => n + 1) : openCreate }
      : null,
    [canWrite, fabAvailable, organizationId, departmentId, jobId, baglantiModu, gorunum],
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
      let sonRoller: PartyRole[] = [form.role];
      if (formMode?.kind === "edit") {
        // Düzenlemede roller korunur: mevcut rollerin üzerine seçilen eklenir,
        // hiçbiri silinmez (bkz. party-dedup.ts addRole).
        const merged = Array.from(new Set([...formMode.party.roles, form.role]));
        await api.patch(`/party/${formMode.party.id}`, { ...payload, roles: merged });
        sonRoller = merged;
        partyId = formMode.party.id;
      } else {
        const yeni = await api.post<Party>(scopePath, payload);
        partyId = yeni.id;
      }
      // Listeler: formdaki seçimle kartın mevcut üyelikleri arasındaki fark.
      // Yeni kartta varsayılan açık liste — yoksa eklendiği anda açık
      // sekmeden kaybolurdu.
      if (partyId) {
        const onceki = formMode?.kind === "edit" ? formMode.party.listeIdleri ?? [] : [];
        const id = partyId;
        for (const l of form.listeIdleri.filter((x) => !onceki.includes(x))) await partyApi.listeyeEkle(l, [id]).catch(() => {});
        for (const l of onceki.filter((x) => !form.listeIdleri.includes(x))) await partyApi.listedenCikar(l, [id]).catch(() => {});
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
      // Kart açık sekmeden düştüyse (potansiyel kaydedildi, rol müşteriye
      // çevrildi) kaybolmuş gibi görünmesin: onun sekmesine geçilir.
      if (!baglantiModu) setGorunum(potansiyelMusteriMi({ roles: sonRoller }) ? "potansiyel" : "musteriler");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Listeden sil. Kart başka bir listede de duruyorsa (Bağlantılar + Müşteriler,
   * Bağlantılar + Tedarik) yalnızca BU listeden çıkar, öbüründe kalır; yalnızca
   * buradaysa arşivlenir. Her durumda önce onay sorulur — eskiden tek tıkla,
   * sorusuz arşivliyordu ve kart iki listeden birden kayboluyordu (kullanıcı
   * şikâyeti, 2026-10-12).
   */
  const handleArchive = async (p: Party) => {
    const defter = baglantiModu ? BAGLANTI_MODUL_KEY : MUSTERI_MODUL_KEY;
    const baskaDefterde = p.modules.some((m) => m !== defter);
    const soru = baskaDefterde
      ? baglantiModu
        ? t("{ad} Bağlantı ve İlişkiler listesinden çıkarılsın mı? Kart diğer listelerde kalır.", { ad: p.displayName })
        : t("{ad} Müşteriler listesinden çıkarılsın mı? Kart diğer listelerde (Bağlantılar, Tedarik) kalır.", { ad: p.displayName })
      : t("{ad} silinsin mi? Kart arşive kaldırılır; hemen ardından Geri Al ile geri getirebilirsin.", { ad: p.displayName });
    if (!(await onayla(soru))) return;
    let sonuc: "defterdenCikti" | "arsivlendi";
    try {
      sonuc = (await api.delete<{ sonuc: "defterdenCikti" | "arsivlendi" }>(`/party/${p.id}?modul=${defter}`))?.sonuc ?? "arsivlendi";
    } catch (err) {
      setBildirim(err instanceof Error ? err.message : t("Silinemedi"));
      return;
    }
    if (openPartyId === p.id) setOpenPartyId(null);
    load();
    pushUndo({
      label: sonuc === "defterdenCikti" ? t("Listeden çıkarma") : baglantiModu ? t("Bağlantı arşivleme") : t("Müşteri arşivleme"),
      run: async () => {
        if (sonuc === "defterdenCikti") await partyApi.deftereEkle(p.id, defter);
        else await api.patch(`/party/${p.id}/restore`, {});
        load();
      },
      redo: async () => {
        await api.delete(`/party/${p.id}?modul=${defter}`);
        load();
      },
    });
  };

  /** Anlaşma yapıldı: kart aynı kalır, Müşteriler sekmesine geçer. Geri alınabilir. */
  const [donusturulen, setDonusturulen] = useState<string | null>(null);
  const musteriyeDonustur = async (p: Party) => {
    setDonusturulen(p.id);
    setBildirim("");
    try {
      await partyApi.musteriyeDonustur(p.id);
      setBildirim(t("{ad} müşteriye dönüştürüldü; artık Müşteriler sekmesinde.", { ad: p.displayName }));
      if (openPartyId === p.id) setOpenPartyId(null);
      load();
      pushUndo({
        label: t("Müşteriye dönüştürme"),
        // Geri almak eski rolleri olduğu gibi yazar (müşteri rolü düşer).
        run: async () => {
          await api.patch(`/party/${p.id}`, { roles: p.roles });
          load();
        },
        redo: async () => {
          await partyApi.musteriyeDonustur(p.id);
          load();
        },
      });
    } catch (err) {
      setBildirim(err instanceof Error ? err.message : t("Dönüştürülemedi"));
    } finally {
      setDonusturulen(null);
    }
  };

  // Form tek blok; ekleme ve düzenlemede modal pencerenin içinde açılır.
  const formAlani = formMode ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: c.background,
            borderRadius: 10,
            padding: 10,

          }}
        >


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
              <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Kişiler")}</span>
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
                style={{ alignSelf: "flex-start", fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
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
                  <span style={{ fontSize: 12, color: c.textSecondary }}>{t("Son kullanılanlar:")}</span>
                  {oneriler.slice(0, 4).map((o) => {
                    const secili = form.tanismaYeri === o.yer && (form.tanismaTarihi || undefined) === o.tarih;
                    return (
                      <button
                        key={`${o.yer}|${o.tarih ?? ""}`}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, tanismaYeri: o.yer, tanismaTarihi: o.tarih ?? "" }))}
                        style={{
                          fontSize: 12,
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
            style={{ alignSelf: "flex-start", fontSize: 13, color: c.textSecondary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
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
              style={{ alignSelf: "flex-start", fontSize: 13, padding: "4px 6px" }}
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
                fontSize: 13,
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

          {/* Liste seçimi düzenleme penceresinde de (kullanıcı isteği, 2026-10-27). */}
          {listeler.length > 0 && (
            <Field label={t("Listeler")}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {listeler.map((l) => {
                  const secili = form.listeIdleri.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          listeIdleri: secili ? f.listeIdleri.filter((x) => x !== l.id) : [...f.listeIdleri, l.id],
                        }))
                      }
                      style={{
                        fontSize: 13,
                        padding: "3px 10px",
                        borderRadius: 999,
                        border: `1px ${secili ? "solid" : "dashed"} ${secili ? c.primary : c.border}`,
                        background: secili ? `${c.primary}1A` : "transparent",
                        color: secili ? c.primary : c.textSecondary,
                        cursor: "pointer",
                      }}
                    >
                      {secili ? "✓ " : "+ "}
                      {l.ad}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {/* Dosyalar müşteri ve potansiyel kartında da (kullanıcı isteği, 2026-10-26). */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Field label={t("Kartvizit (fotoğraf ya da PDF)")} style={{ flex: "1 1 200px" }}>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setKartvizit(e.target.files?.[0] ?? null)}
                style={{ fontSize: 13 }}
              />
            </Field>
            <Field label={t("Ek dosyalar (teklif, katalog…)")} style={{ flex: "1 1 200px" }}>
              <input
                type="file"
                multiple
                onChange={(e) => setEkDosyalar(Array.from(e.target.files ?? []))}
                style={{ fontSize: 13 }}
              />
            </Field>
          </div>

          {error && <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{error}</p>}
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
          {/* Silme yalnızca kartın en altında: eskiden her satırda Düzenle'nin
              hemen yanında bir çöp kutusu vardı, yanlış tıklamayla müşteri
              silindi (kullanıcı şikâyeti, 2026-11-03). */}
          {formMode.kind === "edit" && canWrite && (
            <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 12, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={async () => {
                  const p = formMode.party;
                  closeForm();
                  await handleArchive(p);
                }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${c.danger}60`, background: "transparent", color: c.danger, fontSize: 14, cursor: "pointer" }}
              >
                <IconTrash size={14} color={c.danger} />
                {baglantiModu ? t("Bağlantıyı sil") : t("Müşteriyi sil")}
              </button>
            </div>
          )}
        </div>
  ) : null;

  // İki bölmeli düzen (geniş ekran): liste solda, seçili kartın tamamı sağda.
  // Kart eskiden satırın İÇİNDE açılıyordu: listeyi aşağı itiyor, nerede
  // bitip listenin nerede başladığı seçilemiyordu, başka müşteriye geçmek için
  // önce kapatmak gerekiyordu (kullanıcı şikâyeti, 2026-11-11). Dar ekranda
  // kart tam ekran pencerede açılır.
  // Sütun sayısı ekranın değil PANELİN genişliğine göre: yan menü açıkken
  // pencere geniş olsa da panel daralıyor, üç sütun sıkışıyordu.
  // Sekme boşsa (ör. henüz potansiyel yok) ikinci sütun açılmaz: boş listenin
  // yanında "Bir müşteri seç" kutusu anlamsız duruyordu.
  const ikiBolme = kokGenislik >= 760 && !loading && sekmeKartlari.length > 0;
  // Ayrıntılı filtreler geniş panelde solda sabit; daha darda "Süz" penceresinde.
  const filtreSolda = ikiBolme && kokGenislik >= 1100;
  // Sol filtre sütunu varken arama da her zaman var: az kartlı sekmede
  // (Potansiyel, Bağlantılar) araç çubuğu gizlendiği için bu sekmeler
  // Müşteriler'den farklı görünüyordu (kullanıcı isteği, 2026-11-11).
  const aracCubugu = showToolbar || filtreSolda;
  const seciliKart = openPartyId ? parties.find((p) => p.id === openPartyId) : undefined;
  const musteriSayisi = parties.length - potansiyelSayisi;
  // Kart penceresinin başlığı genel: kartın adı künyede büyük yazıyor,
  // pencere başlığında da yazınca ad iki kez alt alta çıkıyordu.
  const kartBasligi = baglantiModu ? t("Bağlantı kartı") : t("Müşteri kartı");
  // Süz penceresindeki etkin filtre sayısı (arama hariç: o hep görünür).
  const etkinFiltre =
    (roleFilter !== varsayilanRol ? 1 : 0) +
    (sorumluFiltre !== "" ? 1 : 0) +
    (onemFiltre !== "" ? 1 : 0) +
    ilSec.length +
    ilceSec.length +
    (harfSec ? 1 : 0) +
    (takipSec ? 1 : 0) +
    (iletisimSec ? 1 : 0);
  const filtreleriTemizle = () => {
    setRoleFilter(varsayilanRol);
    setSorumluFiltre("");
    setOnemFiltre("");
    setIlSec([]);
    setIlceSec([]);
    setHarfSec("");
    setTakipSec("");
    setIletisimSec("");
  };

  const kartiAc = (id: string) => {
    setDetaySekmesi(undefined);
    // İki bölmede seçili satıra yeniden basmak kartı kapatmaz: sağ bölme
    // boşalınca sayfa zıplıyordu. Pencere düzeninde kapatma pencerenin işi.
    setOpenPartyId(id);
  };

  const kartDetayi = (p: Party) => (
    <PartyDetail
      key={`${p.id}-${detaySekmesi ?? ""}`}
      ilkSekme={detaySekmesi}
      party={p}
      baglantiModu={baglantiModu}
      baglantiYazar={baglantiYazar}
      departmentId={jobId ? undefined : departmentId}
      onDegisti={() => load()}
      canWrite={canWrite}
      // Sipariş/tahsilat yazma hakkı sorumluluktan gelir (bkz. backend
      // siparis-erisim.ts): modülde salt okur olan satışçı da kendisine atanan
      // müşterinin tahsilatını girer.
      siparisYazar={yonetici || (!!user && p.ownerUserId === user.id)}
      profile={profile.primaryActionLabel}
      // Bağlantılar'da alacak-borç sekmesi yok; hook'a şirket verilmezse sekme çıkmaz.
      organizationId={baglantiModu ? undefined : organizationId}
      sirketId={jobId ? undefined : organizationId}
      listeler={listeler}
      kapsamYolu={kapsamYolu}
    />
  );

  const siralamaSecici = () => (
    // "Sırala:" yazısı yok — seçenek adları zaten sıralama olduğunu söylüyor
    // (kullanıcı isteği, 2026-10-12); ekran okuyucu için aria-label.
    <select
      value={siralama}
      onChange={(e) => siralamaSec(e.target.value as Siralama)}
      aria-label={t("Sırala")}
      title={t("Sırala")}
      style={{ fontSize: 14, padding: "6px 8px" }}
    >
      {siralamaSecenekleri.map((s) => (
        <option key={s} value={s}>
          {t(SIRALAMA_ETIKETI[s])}
        </option>
      ))}
    </select>
  );

  // Satırın tek alt satırı: şehir · telefon · (yöneticiye) sorumlu. Rol, durum
  // ve kaynak ("excel") her satırda aynıydı; göz 318 kez aynı dört kelimeyi
  // okuyordu (kullanıcı şikâyeti, 2026-11-11). Bağlantılar'da kişinin unvanı ve
  // tanışma yeri asıl bilgi olduğu için profil metni kalır.
  const satirAlti = (p: Party): string => {
    // Ekleyen değil sorumlu (bkz. lib/partySorumlu).
    const sorumlu = yonetici && !sorumluFiltre ? sorumluAdi(p) ?? t("Sorumlu yok") : undefined;
    if (baglantiModu) return [profile.detail(p), sorumlu].filter(Boolean).join(" · ");
    const sehir = [p.address?.district, p.address?.city].filter(Boolean).join(" / ");
    return [sehir, p.phone ?? p.email, sorumlu].filter(Boolean).join(" · ");
  };
  // Ayrıntılı filtrelerin içeriği: geniş ekranda soldaki sütunda, darda Süz
  // penceresinde aynı bileşenler. Sayılar açık sekmenin (ve listenin)
  // kartlarından; bir filtre seçilince öteki filtrelerin sayıları değişmez,
  // ilçe listesi ise seçili illere daralır.
  const filtreIcerigi = (pencerede: boolean) => {
    const taban = sekmeKartlari;
    const iller = sayarakSecenekler(taban.map(ilAdi));
    const ilceTaban = ilSec.length ? taban.filter((p) => ilSec.includes(ilAdi(p) ?? "")) : taban;
    const ilceler = sayarakSecenekler(ilceTaban.map(ilceAdi));
    const harfler = new Map<string, number>();
    for (const p of taban) {
      const h = basHarf(p.displayName);
      harfler.set(h, (harfler.get(h) ?? 0) + 1);
    }
    const sorumlular = sayarakSecenekler(taban.map((p) => sorumluAdi(p)));
    const sorumsuz = taban.filter((p) => !sorumluAdi(p)).length;
    const say = (f: (p: Party) => boolean) => taban.filter(f).length;
    const takipSecenekleri = [
      { deger: "gecikti", etiket: t("Araması gecikenler"), sayi: say((p) => aramaDurumu(p.sonrakiArama, bugun) === "gecikti"), renk: c.danger },
      { deger: "bugun", etiket: t("Bugün aranacaklar"), sayi: say((p) => aramaDurumu(p.sonrakiArama, bugun) === "bugun") },
      { deger: "planli", etiket: t("Planlı araması olanlar"), sayi: say((p) => !!p.sonrakiArama) },
      { deger: "hic", etiket: t("Hiç görüşülmemiş"), sayi: say((p) => !p.temas?.sonTemas) },
    ].filter((o) => o.sayi > 0 || takipSec === o.deger);
    const roller = filtreRolleri
      .map((r) => ({ deger: r, etiket: t(ROLE_LABELS[r], { ctx: "rol" }), sayi: say((p) => p.roles.includes(r)) }))
      .filter((o) => o.sayi > 0 || roleFilter === o.deger);
    const iletisim = [
      { deger: "telefonsuz", etiket: t("Telefonu olmayanlar"), sayi: say((p) => !p.phone) },
      { deger: "epostasiz", etiket: t("E-postası olmayanlar"), sayi: say((p) => !p.email) },
    ].filter((o) => o.sayi > 0 || iletisimSec === o.deger);
    return (
      <>
        <FiltreBasligi etkin={etkinFiltre} onTemizle={filtreleriTemizle} />
        {!baglantiModu && takipSecenekleri.length > 0 && (
          <FiltreBolumu baslik={t("Takip")}>
            <SecimListesi
              secenekler={takipSecenekleri}
              secili={takipSec ? [takipSec] : []}
              onDegis={(v) => setTakipSec((v[0] ?? "") as typeof takipSec)}
            />
          </FiltreBolumu>
        )}
        {baglantiModu && (
          <FiltreBolumu baslik={t("Önem")}>
            <SecimListesi
              secenekler={BAGLANTI_ONEMLERI.map((o) => ({ deger: o, etiket: t(ONEM_LABELS[o]), sayi: say((p) => p.baglanti?.onem === o) }))}
              secili={onemFiltre ? [onemFiltre] : []}
              onDegis={(v) => setOnemFiltre((v[0] ?? "") as BaglantiOnem | "")}
            />
          </FiltreBolumu>
        )}
        {iller.length > 1 && (
          <FiltreBolumu baslik={t("İl")}>
            <SecimListesi
              coklu
              secenekler={iller}
              secili={ilSec}
              onDegis={(v) => {
                setIlSec(v);
                setIlceSec([]);
              }}
              ilkGoster={5}
            />
          </FiltreBolumu>
        )}
        {ilceler.length > 1 && (
          <FiltreBolumu baslik={t("İlçe")}>
            <SecimListesi coklu secenekler={ilceler} secili={ilceSec} onDegis={setIlceSec} ilkGoster={6} />
          </FiltreBolumu>
        )}
        {taban.length > 1 && (
          <FiltreBolumu baslik={t("Baş harf")}>
            <HarfIzgarasi sayilar={harfler} secili={harfSec} onSec={setHarfSec} />
          </FiltreBolumu>
        )}
        {sorumlular.length + (sorumsuz ? 1 : 0) > 1 && (
          <FiltreBolumu baslik={t("Sorumlu")}>
            <SecimListesi
              secenekler={[...sorumlular, ...(sorumsuz ? [{ deger: "-", etiket: t("Sorumlusu yok"), sayi: sorumsuz }] : [])]}
              secili={sorumluFiltre ? [sorumluFiltre] : []}
              onDegis={(v) => setSorumluFiltre(v[0] ?? "")}
            />
          </FiltreBolumu>
        )}
        {gorunum !== "potansiyel" && roller.length > 1 && (
          <FiltreBolumu baslik={t("Rol")}>
            <SecimListesi
              secenekler={roller}
              secili={roleFilter ? [roleFilter] : []}
              onDegis={(v) => setRoleFilter((v[0] ?? "") as PartyRole | "")}
            />
          </FiltreBolumu>
        )}
        {iletisim.length > 0 && (
          <FiltreBolumu baslik={t("Eksik bilgi")}>
            <SecimListesi
              secenekler={iletisim}
              secili={iletisimSec ? [iletisimSec] : []}
              onDegis={(v) => setIletisimSec((v[0] ?? "") as typeof iletisimSec)}
            />
          </FiltreBolumu>
        )}
        {pencerede && visible.length > 1 && <FiltreBolumu baslik={t("Sırala")}>{siralamaSecici()}</FiltreBolumu>}
      </>
    );
  };

  // Rozet yalnızca açık sekmenin zaten söylemediği rolde: Müşteriler sekmesinde
  // "Müşteri", Potansiyel'de "Potansiyel" yazmak bilgi değil.
  const rozetGizli = (r: PartyRole) =>
    !baglantiModu && ((gorunum === "musteriler" && r === "customer") || (gorunum === "potansiyel" && r === "lead"));

  const dugme = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "8px 14px",
    borderRadius: 8,
    border: `1px solid ${c.border}`,
    background: c.surface,
    color: c.textPrimary,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  } as const;

  // Görünüm seçici (Tahsilat · Müşteriler · Potansiyel): bitişik seçici,
  // liste haplarıyla aynı biçimde olsaydı hangisinin neyi süzdüğü belli
  // olmazdı. Üstte ortada duruyor (aşağıda).
  // Telefon genişliği: görünüm seçici tam satır, harita düğmesi yalnızca
  // simge — liste hapları ile harita tek satıra sığsın.
  const dar = kokGenislik > 0 && kokGenislik < 520;
  // Modül sayfasında açıldıysa geri hapı sekmelerin altında (bkz. lib/modulGeri).
  const geriHapi = useModulGeriHapi();
  const gorunumSecici = baglantiModu ? undefined : (
    <div
      role="tablist"
      style={{ display: dar ? "flex" : "inline-flex", flex: dar ? 1 : undefined, padding: 3, gap: 2, borderRadius: 10, background: c.surface, border: `1px solid ${c.border}`, maxWidth: "100%", overflowX: "auto" }}
    >
      {(modulSekmeleri(MUSTERI_MODUL_KEY) as readonly (typeof gorunum)[]).map((g) => {
        const aktif = gorunum === g;
        const sayi = g === "musteriler" ? musteriSayisi : g === "potansiyel" ? potansiyelSayisi : undefined;
        return (
          <button
            key={g}
            role="tab"
            aria-selected={aktif}
            onClick={() => setGorunum(g)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: dar ? 1 : undefined,
              gap: 6,
              padding: "7px 14px",
              borderRadius: 7,
              border: "none",
              background: aktif ? c.primary : "transparent",
              color: aktif ? c.onPrimary : c.textSecondary,
              fontSize: 14,
              fontWeight: aktif ? 600 : 500,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {g === "musteriler" ? t("Müşteriler") : g === "potansiyel" ? t("Potansiyel") : t("Tahsilat")}
            {sayi !== undefined && !loading && (
              <span style={{ fontSize: 12, opacity: 0.8, fontVariantNumeric: "tabular-nums" }}>{sayi}</span>
            )}
          </button>
        );
      })}
    </div>
  );
  // Ekle düğmesi (sayfada "+" yoksa) ve salt görüntüleme notu da aynı satırın sağında.
  const ekleDugmesi = (
    <>
        {!canWrite ? (
          <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Salt görüntüleme")}</span>
        ) : (
          !fabAvailable && (
            <button
              onClick={() => (formMode ? closeForm() : openCreate())}
              style={{ ...dugme, border: "none", background: c.primary, color: c.onPrimary, fontWeight: 600 }}
            >
              {formMode
                ? t("Vazgeç")
                : baglantiModu
                  ? t("+ Bağlantı ekle")
                  : gorunum === "potansiyel"
                    ? t("+ Potansiyel müşteri ekle")
                    : t("+ Müşteri ekle")}
            </button>
          )
        )}
    </>
  );

  return (
    // Geniş ekranda (yan menü kapalıyken) panel sayfanın soluna yapışıp sağda
    // koca bir boşluk bırakıyordu; en geniş hâli sınırlı ve ortada
    // (kullanıcı isteği, 2026-11-11).
    <div ref={kokRef} style={{ display: "flex", flexDirection: "column", gap: 12, width: "100%", maxWidth: 1640, margin: "0 auto" }}>
      {bildirim && <p style={{ color: c.warning, fontSize: 14, margin: 0 }}>{bildirim}</p>}
      {onizlenen && <FilePreviewModal file={onizlenen} onClose={() => setOnizlenen(null)} />}

      {/* Görünüm seçici kendi satırında, ortada (kullanıcı isteği, 2026-11-11:
          "sekmeler üstte ortalansın") — başlık da üst şeritte ortada; ikisi
          aynı eksende. Telefonda tam genişlik. */}
      {/* Geri hapı aynı satırın solunda: kendi satırını kaplıyordu (kullanıcı
          isteği, 2026-11-11). Eşit yan sütunlar (1fr) seçiciyi tam ortada
          tutar. Telefonda ikisi bir satıra sığmıyor; orada hap aşağıda kalır. */}
      {gorunumSecici &&
        (dar ? (
          <div style={{ display: "flex", justifyContent: "center" }}>{gorunumSecici}</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 12 }}>
            <div style={{ justifySelf: "start", minWidth: 0 }}>{geriHapi}</div>
            {gorunumSecici}
            <span />
          </div>
        ))}

      {/* Listeler (gruplar): Bağlantılar'da ve Müşteriler'in üç sekmesinde ortak. */}
      {(baglantiModu || acilisHazir) && (
        <BaglantiListeSekmeleri
          listeler={listeler}
          secili={etkinListe}
          onSec={setSeciliListe}
          toplam={sekmeTabani.length}
          sayilar={listeSayilari}
          gorunenIdler={gorunum === "tahsilat" && !baglantiModu ? sekmeKartlari.map((p) => p.id) : visible.map((p) => p.id)}
          kapsamYolu={kapsamYolu}
          canWrite={canWrite}
          onDegisti={() => load()}
          modul={listeModulu}
          onBirak={surukleVar ? listeyeBirak : undefined}
          // Açılış sekmesi ve harita liste sekmelerinin sağında: üst çubukta
          // telefonda kendi satırını kaplıyorlardı.
          // Görünüm seçicisi olmayan defterde (Bağlantılar) geri hapı liste
          // haplarının solunda: ayrı satır kaplamasın.
          sol={!gorunumSecici && geriHapi ? geriHapi : undefined}
          sag={
            <>
          {!baglantiModu && (() => {
              const acilis = (kayitliAcilis ?? ilkGorunum) === gorunum;
              const etiket = gorunum === "musteriler" ? t("Müşteriler") : gorunum === "potansiyel" ? t("Potansiyel") : t("Tahsilat takibi");
              return (
                <button
                  onClick={() => !acilis && acilisYap(gorunum, etiket)}
                  aria-label={acilis ? t("Açılış sekmesi") : t("Açılış sekmesi yap")}
                  title={acilis ? t("Modül bu sekmeyle açılıyor") : t("Modül bu sekmeyle açılsın")}
                  style={{ display: "inline-flex", padding: 8, borderRadius: 8, border: "none", background: "transparent", cursor: acilis ? "default" : "pointer", opacity: acilis ? 0.9 : 0.5 }}
                >
                  <IconHome size={16} color={acilis ? c.primary : c.textSecondary} filled={acilis} />
                </button>
              );
          })()}
      {/* Haritada göster her sekmede (kullanıcı isteği, 2026-10-26 — araç
          çubuğunun içindeydi; 8'den az kartta araç çubuğu çıkmadığı için
          bazı hesaplarda hiç görünmüyordu). */}
      {haritaKartlari.length > 0 && (
        // Büyük ve dolu: sık kullanılan bir görünüm, küçük simge olarak
        // gözden kaçıyordu (kullanıcı isteği, 2026-11-11).
        <button
          onClick={() => setHaritaAcik(true)}
          title={t("Listedekileri il il haritada göster")}
          aria-label={t("Haritada göster")}
          style={{ ...dugme, padding: dar ? "8px 11px" : "8px 16px", fontSize: 15, fontWeight: 600, border: "none", background: c.primary, color: c.onPrimary }}
        >
          <IconMap size={19} color={c.onPrimary} />
          {!dar && t("Haritada göster")}
        </button>
      )}
      {ekleDugmesi}
            </>
          }
        />
      )}

      {geriHapi && dar && gorunumSecici && <div style={{ alignSelf: "flex-start" }}>{geriHapi}</div>}

      {/* Liste süzgeci açıkken bu açıkça yazılır: yoksa listede olmayan kartlar
          kaybolmuş sanılıyordu (bkz. seciliListe). */}
      {etkinListe && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, color: c.textSecondary }}>
          <span>
            {t("Yalnızca \"{liste}\" listesindekiler gösteriliyor ({n} / {toplam}).", {
              liste: listeler.find((l) => l.id === etkinListe)?.ad ?? "",
              n: sekmeKartlari.length,
              toplam: sekmeTabani.length,
            })}
          </span>
          <button
            onClick={() => setSeciliListe("")}
            style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            {t("Tümünü göster")}
          </button>
        </div>
      )}

      {haritaAcik && (
        <Suspense fallback={null}>
          <MusteriHaritasi musteriler={haritaKartlari} baglanti={baglantiModu} acilisIli={haritaAcilisIli} onKapat={() => {
            setHaritaAcik(false);
            setHaritaAcilisIli(undefined);
          }} onMusteriAc={(p) => setHaritaKartiId(p.id)} />
        </Suspense>
      )}
      {(() => {
        // Kart, listedeki güncel kayıttan: kartta yapılan değişiklik (load) pencereye de yansısın.
        const p = haritaKartiId ? parties.find((x) => x.id === haritaKartiId) : undefined;
        if (!p) return null;
        return (
          <Modal title={kartBasligi} onClose={() => setHaritaKartiId(null)} maxWidth={1040} mobileFullScreen>
            {kartDetayi(p)}
          </Modal>
        );
      })()}

      {!acilisHazir ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
      ) : gorunum === "tahsilat" && !baglantiModu ? (
        <TahsilatTakibi
          kapsamYolu={kapsamYolu}
          departmentId={jobId ? undefined : departmentId}
          sorumluSecenekleri={sorumluSecenekleri}
          musteriSecenekleri={parties
            .filter((p) => !p.archivedAt)
            .map((p) => ({ id: p.id, ad: p.displayName }))
            .sort((a, b) => a.ad.localeCompare(b.ad, "tr"))}
          yeniSiparisIstegi={yeniSiparisIstegi}
          fabVar={fabAvailable}
          partySuzgeci={tahsilatSuzgeci}
          surukle={surukleVar && listeler.length > 0}
          filtreSolda={kokGenislik >= 1100}
        />
      ) : (
      <>
      {excelAcik && (
        <MusteriExcelModal
          scopePath={scopePath}
          departmentId={departmentId}
          baglanti={baglantiModu}
          potansiyel={!baglantiModu && gorunum === "potansiyel"}
          onClose={() => setExcelAcik(false)}
          listeler={listeler}
          acikListeId={etkinListe || undefined}
          onDone={(listeId) => {
            // Yüklenen liste kendi sekmesinde açılır: mevcut bağlantılara karışmadan görünsün.
            if (listeId) setSeciliListe(listeId);
            load();
          }}
        />
      )}

      {/* Ekleme ve düzenleme modal pencerede: listenin içinde açılan form uzun
          listede kayboluyor, satırları itip kaydırıyordu (kullanıcı isteği). */}
      {formMode && (
        <Modal
          title={
            formMode.kind === "edit"
              ? t("Düzenle: {ad}", { ad: formMode.party.displayName })
              : form.role === "lead" && !baglantiModu
                ? t("Potansiyel müşteri ekle")
                : ekleEtiketi
          }
          onClose={closeForm}
          maxWidth={640}
          mobileFullScreen
        >
          {formAlani}
        </Modal>
      )}

      {/* Dar ekranda kart tam ekran pencerede (bkz. ikiBolme). */}
      {!ikiBolme && seciliKart && (
        <Modal title={kartBasligi} onClose={() => setOpenPartyId(null)} maxWidth={1040} mobileFullScreen>
          {kartDetayi(seciliKart)}
        </Modal>
      )}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
      {/* ---- En sol: ayrıntılı filtreler ---- */}
      {filtreSolda && (
        // Yapışkan: sayfa kayarken yalnızca liste kaysın, filtreler yerinde
        // dursun (kullanıcı isteği, 2026-11-11). Panel ekrandan uzun
        // olabiliyor — eskiden bu yüzden yapışkan değildi, alt bölümlerine
        // inilemiyordu; artık ekran boyuyla sınırlı ve kendi içinde kayıyor.
        <aside
          style={{
            ...filtrePaneliStili(c),
            width: 236,
            flexShrink: 0,
            position: "sticky",
            top: 72,
            maxHeight: "calc(100vh - 88px)",
            overflowY: "auto",
            scrollbarWidth: "thin",
            boxSizing: "border-box",
          }}
        >
          {/* Bağlantılar'ın özeti (yüksek önem, temas zamanı gelen) geniş
              ekranda filtrelerin başında; listenin üstünde satır kaplamasın. */}
          {baglantiModu && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 12, borderBottom: `1px solid ${c.border}` }}>
              {stats.map((s) => (
                <div key={s.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: c.textSecondary }}>
                  <span>{t(s.label)}</span>
                  <strong style={{ color: c.textPrimary, fontWeight: 600 }}>{s.value}</strong>
                </div>
              ))}
            </div>
          )}
          {filtreIcerigi(false)}
        </aside>
      )}
      {/* ---- Liste: arama + satırlar ---- */}
      {/* İki bölmede liste genişler, kart ~600 px'te kalır: kart listeden
          çok büyüktü, adlar listede iki satıra bölünüyordu (kullanıcı
          isteği, 2026-11-11). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, ...(ikiBolme ? { flex: "1 1 0", minWidth: 340 } : { width: "100%", minWidth: 0 }) }}>
      {aracCubugu && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", position: "relative" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={baglantiModu ? t("Bağlantı ara…") : t("Müşteri ara…")}
            aria-label={t("Ara")}
            style={{ flex: 1, minWidth: 0, fontSize: 15, padding: "9px 12px", borderRadius: 8 }}
          />
          {filtreSolda ? (
            visible.length > 1 && siralamaSecici()
          ) : (
            // Filtreler tek düğmenin arkasında: dar ekranda listenin önüne
            // geçmesin (kullanıcı şikâyeti, 2026-11-11).
            <button
              onClick={() => setSuzAcik((a) => !a)}
              aria-expanded={suzAcik}
              style={{ ...dugme, padding: "9px 12px", ...(etkinFiltre > 0 ? { borderColor: c.primary, color: c.primary } : {}) }}
            >
              <IconSortDescending size={16} color={etkinFiltre > 0 ? c.primary : c.textSecondary} />
              {genisEkran || etkinFiltre > 0 ? (etkinFiltre > 0 ? t("Süz ({n})", { n: etkinFiltre }) : t("Süz")) : null}
            </button>
          )}
          {suzAcik && !filtreSolda && (
            <>
              {/* Dışarı tıklayınca kapansın. */}
              <div onClick={() => setSuzAcik(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div
                style={{
                  ...filtrePaneliStili(c),
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  zIndex: 41,
                  width: 300,
                  maxWidth: "calc(100vw - 32px)",
                  // Pencere ekrandan taşmasın; uzun içerik pencerenin içinde kayar.
                  maxHeight: "70vh",
                  overflowY: "auto",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                }}
              >
                {filtreIcerigi(true)}
              </div>
            </>
          )}
        </div>
      )}

      {!loading && !yonetici && !baglantiModu && parties.length > 0 && (
        <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Sana atanmış müşteriler listeleniyor.")}</span>
      )}
      {/* Bağlantılar'ın özeti (yüksek önem, temas zamanı gelen) sekmelerde
          yazmayan bilgi; tek satır metin. Müşteriler'in sayıları sekmelerde. */}
      {baglantiModu && !loading && parties.length > 0 && !filtreSolda && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: c.textSecondary }}>
          {stats.map((s) => (
            <span key={s.label}>
              {t(s.label)} <strong style={{ color: c.textPrimary, fontWeight: 600 }}>{s.value}</strong>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
      ) : parties.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {baglantiModu
            ? t("Henüz bağlantı yok. Fuarda, toplantıda tanıştığın kişileri buraya ekle; müşteri listesine karışmazlar.")
            : t("Henüz müşteri kaydı yok. Satış ve Müşteri İlişkileri aynı listeyi görür.")}
          {canWrite && fabAvailable ? t(' Eklemek için sayfadaki "+" düğmesini kullan.') : ""}
        </p>
      ) : sekmeKartlari.length === 0 && etkinListe ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {t("Bu listede bu sekmeye ait kart yok. Kartı tutup liste sekmesinin üstüne bırakabilir ya da kartın içinden listeye ekleyebilirsin.")}
        </p>
      ) : sekmeKartlari.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>
          {gorunum === "potansiyel"
            ? t("Henüz potansiyel müşteri yok. Anlaşması yapılmamış ama yakın olan kişi ve firmaları buraya ekle; anlaşma olunca tek tıkla müşteriye dönüştür.")
            : potansiyelSayisi
              ? t("Bu sekmede müşteri yok; {n} kart Potansiyel sekmesinde. Anlaşması yapılmış olanları oradan müşteriye dönüştürebilirsin.", { n: potansiyelSayisi })
              : t("Henüz müşteri yok. Potansiyel müşteriler kendi sekmesinde; anlaşma olunca müşteriye dönüştürülür.")}
          {canWrite && fabAvailable ? t(' Eklemek için sayfadaki "+" düğmesini kullan.') : ""}
          {gorunum !== "potansiyel" && potansiyelSayisi > 0 && (
            <button
              onClick={() => setGorunum("potansiyel")}
              style={{ marginLeft: 6, fontSize: 14, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
            >
              {t("Potansiyel sekmesine geç")}
            </button>
          )}
        </p>
      ) : visible.length === 0 ? (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Aramanla eşleşen kayıt yok.")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(hasActiveFilter || (!aracCubugu && visible.length > 1)) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {hasActiveFilter && (
                <span style={{ fontSize: 13, color: c.textSecondary }}>
                  {t("{n} / {toplam} kayıt", { n: visible.length, toplam: sekmeKartlari.length })}
                </span>
              )}
              {!aracCubugu && visible.length > 1 && <span style={{ marginLeft: "auto" }}>{siralamaSecici()}</span>}
            </div>
          )}
          {/* Satırlar tek bir çerçevede, aralarında ince çizgi. Sıra sıra
              değişen zemin (listeSatiri) burada yok: açılan kartla birlikte
              ayrı tonlar üst üste biniyor, göz yoruyordu (kullanıcı şikâyeti,
              2026-11-11). Seçili satır hafif zemin + soldaki vurgu çizgisiyle. */}
          <div style={{ ...listeCercevesi(c), background: c.surface }}>
          {visible.map((p, i) => {
            const secili = openPartyId === p.id;
            const rozetler = p.roles.filter((r) => !rozetGizli(r));
            const alt = satirAlti(p);
            return (
            <div
              key={p.id}
              draggable={surukleVar}
              onDragStart={(e) => {
                e.dataTransfer.setData(PARTY_SURUKLE, p.id);
                e.dataTransfer.effectAllowed = "move";
                setSuruklenen(p.id);
              }}
              onDragEnd={() => {
                setSuruklenen(null);
                setBirakmaYeri(null);
              }}
              onDragOver={(e) => {
                if (!suruklenen || !e.dataTransfer.types.includes(PARTY_SURUKLE)) return;
                e.preventDefault();
                const kutu = e.currentTarget.getBoundingClientRect();
                const once = e.clientY < kutu.top + kutu.height / 2;
                if (birakmaYeri?.id !== p.id || birakmaYeri.once !== once) setBirakmaYeri({ id: p.id, once });
              }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData(PARTY_SURUKLE);
                if (!id) return;
                e.preventDefault();
                siraTasi(id, p.id, birakmaYeri?.id === p.id ? birakmaYeri.once : true);
                setSuruklenen(null);
                setBirakmaYeri(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "11px 14px 11px 11px",
                background: secili ? `color-mix(in srgb, ${c.primary} 12%, ${c.surface})` : c.surface,
                borderTop: i === 0 ? "none" : `1px solid ${c.border}`,
                borderLeft: `3px solid ${secili ? c.primary : "transparent"}`,
                cursor: surukleVar ? "grab" : undefined,
                opacity: suruklenen === p.id ? 0.45 : 1,
                // Bırakılacak yer: satırın üst ya da alt kenarında vurgu çizgisi.
                boxShadow:
                  birakmaYeri?.id === p.id && suruklenen && suruklenen !== p.id
                    ? `inset 0 ${birakmaYeri.once ? 3 : -3}px 0 ${c.primary}`
                    : undefined,
              }}
            >
              {/* Baş harf yuvarlağı: 318 benzer satırda göz bir çapa bulsun. */}
              <span
                aria-hidden
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 600,
                  color: c.primary,
                  background: `color-mix(in srgb, ${c.primary} 16%, ${c.surface})`,
                }}
              >
                {basHarfler(p.displayName)}
              </span>
              <button
                type="button"
                onClick={() => kartiAc(p.id)}
                aria-current={secili || undefined}
                style={{ flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: secili ? 600 : 500,
                      color: c.textPrimary,
                      lineHeight: 1.3,
                      // Ad iki satıra kadar kırılır: dar sol bölmede uzun firma
                      // adları ("… ECZ/BAYINDIR-İZMİR ECZ. …") tek satırda
                      // ayırt edilemeyecek kadar kesiliyordu.
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      overflowWrap: "anywhere",
                      minWidth: 0,
                    }}
                    title={p.displayName}
                  >
                    {p.displayName}
                  </span>
                  {rozetler.map((r) => (
                    <span key={r} style={{ ...rozetStili(ROLE_COLORS[r], c), flexShrink: 0 }}>
                      {t(ROLE_LABELS[r], { ctx: "rol" })}
                    </span>
                  ))}
                  {baglantiModu && p.baglanti?.onem === "yuksek" && (
                    <span style={{ fontSize: 12, padding: "1px 7px", borderRadius: 6, background: c.accent, color: c.onPrimary, flexShrink: 0 }}>
                      {t("Yüksek önem")}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3, minWidth: 0, flexWrap: "wrap" }}>
                  {alt && (
                    <span style={{ fontSize: 13, color: c.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                      {alt}
                    </span>
                  )}
                  {!baglantiModu && p.sonrakiArama && <AramaRozeti tarih={p.sonrakiArama} bugun={bugun} />}
                  {baglantiModu && p.baglanti?.sonrakiTemas && <TemasRozeti tarih={p.baglanti.sonrakiTemas} bugun={bugun} />}
                  {!baglantiModu && !p.sonrakiArama && p.temas?.sonTemas && <SonTemasSatiri p={p} />}
                </div>
              </button>
              <SatirSimgeleri
                party={p}
                onDosya={dosyaAc}
                onKisiler={() => {
                  // Kişi sayısına basınca kart Kişiler sekmesinde açılır.
                  setDetaySekmesi("contacts");
                  setOpenPartyId(p.id);
                }}
              />
              {canWrite && !baglantiModu && potansiyelMusteriMi(p) && (
                <button
                  onClick={() => musteriyeDonustur(p)}
                  disabled={donusturulen === p.id}
                  title={t("Anlaşma yapıldı: kartı müşteriye dönüştür")}
                  style={{
                    flexShrink: 0,
                    fontSize: 13,
                    padding: "4px 9px",
                    borderRadius: 6,
                    border: `1px solid ${ROLE_COLORS.customer}60`,
                    background: "transparent",
                    color: rozetStili(ROLE_COLORS.customer, c).color,
                    cursor: donusturulen === p.id ? "default" : "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {donusturulen === p.id ? t("Dönüştürülüyor…") : t("Müşteriye dönüştür")}
                </button>
              )}
              {canWrite && (
                // Silme düğmesi satırda yok: düzenleme kartının en altında (bkz. formAlani).
                <button
                  onClick={() => openEdit(p)}
                  aria-label={t("Düzenle")}
                  title={t("Düzenle")}
                  style={{ display: "inline-flex", padding: 6, background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}
                >
                  <IconEdit size={16} color={c.textSecondary} />
                </button>
              )}
            </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Toplu ekleme en altta ve sade: her gün kullanılan bir düğme değil,
          listenin önünde dikkat çekmesin. Bağlantılar'ın şablonu ayrı (önem,
          tanışma yeri, sonraki temas, ilişki notu). */}
      {canWrite && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 4 }}>
          <button
            onClick={() => setExcelAcik(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 10px",
              borderRadius: 6,
              border: `1px solid ${c.border}`,
              background: "transparent",
              color: c.textSecondary,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            <IconUpload size={14} /> {t("Excel ile toplu ekle")}
          </button>
          <span style={{ flex: "1 1 200px", fontSize: 12, color: c.textSecondary }}>
            {baglantiModu
              ? t("Fuar dönüşü kartvizitleri tek seferde girmek için: şablonu indirin, doldurun, aynı yerden yükleyin.")
              : t("Şablonu indirin, doldurun, aynı yerden yükleyin — her satır bir müşteri kartı olur.")}
          </span>
        </div>
      )}
      </div>

      {/* ---- Sağ bölme: seçili kartın tamamı ---- */}
      {ikiBolme && (
        <section
          aria-label={seciliKart ? seciliKart.displayName : undefined}
          style={{
            flex: "0 1 600px",
            minWidth: 380,
            boxSizing: "border-box",
            // Liste kayarken kart yerinde kalsın; uzun kart kendi içinde kayar.
            // 72: sayfanın sabit üst çubuğu (eski özet sütunuyla aynı pay).
            position: "sticky",
            top: 72,
            maxHeight: "calc(100vh - 88px)",
            overflowY: "auto",
            padding: "22px 26px",
            borderRadius: 12,
            background: c.surface,
            border: `1px solid ${c.border}`,
          }}
        >
          {seciliKart ? (
            kartDetayi(seciliKart)
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 280, textAlign: "center" }}>
              <IconUser size={28} color={c.textSecondary} />
              <span style={{ fontSize: 15, fontWeight: 600, color: c.textPrimary }}>
                {baglantiModu ? t("Bir bağlantı seç") : t("Bir müşteri seç")}
              </span>
              <span style={{ fontSize: 14, color: c.textSecondary, maxWidth: 320 }}>
                {t("Soldaki listeden birine tıkla; künyesi, görüşmeleri ve siparişleri burada açılır.")}
              </span>
            </div>
          )}
        </section>
      )}
      </div>
      </>
      )}
    </div>
  );
}

/** "--KARABENEK ECZ/BAYINDIR" → "KE": harf dışı işaretler atlanır. */
function basHarfler(ad: string): string {
  return (
    ad
      .replace(/[^\p{L}\s]/gu, " ")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w.charAt(0))
      .join("")
      .toLocaleUpperCase("tr") || "?"
  );
}

/**
 * Rol rozeti: rengin yazı rengiyle karışımı. ROLE_COLORS koyu tonlar; karanlık
 * temada koyu yeşil yazı koyu zeminde 3,3:1 kalıyordu (en az 4,5 gerekir).
 * textPrimary ile karıştırmak açık temada koyulaştırır, koyu temada açar.
 */
function rozetStili(renk: string, c: ThemeColors): React.CSSProperties {
  const yazi = `color-mix(in srgb, ${renk} 55%, ${c.textPrimary})`;
  return {
    fontSize: 12,
    padding: "1px 7px",
    borderRadius: 6,
    color: yazi,
    border: `1px solid ${renk}55`,
    whiteSpace: "nowrap",
  };
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
      <label style={{ fontSize: 13, color: c.textSecondary }}>{label}</label>
      {children}
    </div>
  );
}

/**
 * Sonraki temas tarihi: geçtiyse kırmızı, bugünse vurgulu, ileride sade.
 * Tarih karşılaştırması metinle (YYYY-MM-DD sözlük sırası = takvim sırası).
 */
/** Müşteriler satırında tekrar arama günü (bkz. GorusmeNotlari). */
function AramaRozeti({ tarih, bugun }: { tarih: string; bugun: string }) {
  const c = useThemeColors();
  const t = useT();
  const durum = aramaDurumu(tarih, bugun);
  const renk = durum === "gecikti" ? c.danger : durum === "bugun" ? c.accent : c.textSecondary;
  const [y, a, g] = tarih.split("-");
  return (
    <span style={{ fontSize: 12, padding: "1px 6px", borderRadius: 6, color: renk, border: `1px solid ${renk}60` }}>
      <InlineIcon><IconCalendar size={12} /></InlineIcon>
      {durum === "bugun"
        ? t("Bugün aranacak")
        : durum === "gecikti"
          ? t("Arama gecikti · {tarih}", { tarih: `${g}.${a}.${y}` })
          : t("Tekrar ara · {tarih}", { tarih: `${g}.${a}.${y}` })}
    </span>
  );
}

/** Müşteriler satırında son görüşme: "Arama · 2 gün önce · 3 not". */
function SonTemasSatiri({ p }: { p: Party }) {
  const c = useThemeColors();
  const t = useT();
  const o = p.temas!;
  const son = o.sonTemas!;
  return (
    // Satırın alt satırında, şehir/telefonun yanında aynı satırda durur.
    <span style={{ fontSize: 13, color: c.textSecondary, display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      <span style={{ color: son.type === "ulasilamadi" ? c.danger : c.textSecondary }}>
        {t(GORUSME_TURU_ETIKETI[son.type])} · {timeAgo(son.occurredAt)}
      </span>
      {o.ulasilamadiSerisi >= 2 && <span style={{ color: c.danger }}>{t("({n}. deneme)", { n: o.ulasilamadiSerisi })}</span>}
      {o.notSayisi > 1 && <span>· {t("{n} not", { n: o.notSayisi })}</span>}
    </span>
  );
}

function TemasRozeti({ tarih, bugun }: { tarih: string; bugun: string }) {
  const c = useThemeColors();
  const t = useT();
  const gecti = tarih < bugun;
  const bugunMu = tarih === bugun;
  const renk = gecti ? c.danger : bugunMu ? c.accent : c.textSecondary;
  const [y, a, g] = tarih.split("-");
  return (
    <span style={{ fontSize: 12, padding: "1px 6px", borderRadius: 6, color: renk, border: `1px solid ${renk}60` }}>
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
  ilkSekme,
  baglantiModu,
  baglantiYazar,
  departmentId,
  onDegisti,
  canWrite,
  siparisYazar,
  profile,
  organizationId,
  sirketId,
  listeler,
  kapsamYolu,
}: {
  party: Party;
  /** Listeden yeni liste açmak için (`/organizations/:id` ya da `/jobs/:id`). */
  kapsamYolu?: string;
  /** Kapsamdaki listeler (kartın içinden ekle / çıkar — dokunmatik ekranda sürüklemenin yerine). */
  listeler?: BaglantiListeKaydi[];
  /** Takip görevinin açılabileceği şirket (departman seçimi görev penceresinde). */
  sirketId?: string;
  ilkSekme?: "contacts";
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
  // Görüşme notları eskiden sekmelerin ÜSTÜNDE hep açıktı; künye + not +
  // görüşmeler + sekmeler alt alta yığılınca sekmeler kartın dibinde
  // kayboluyordu (kullanıcı şikâyeti, 2026-11-11). Artık ilk sekme o: kart
  // açılınca yine ilk görünen görüşmeler.
  const [tab, setTab] = useState<"gorusmeler" | "activity" | "contacts" | "alacakBorc" | "siparisler" | "portal" | "iliski" | "gorevler" | "dosyalar">(
    ilkSekme ?? (baglantiModu ? "iliski" : "gorusmeler")
  );
  const [gorevler, setGorevler] = useState<PartyGorevi[]>([]);
  const [gorevAcik, setGorevAcik] = useState(false);
  // "Müşteri yap" iki adımlı: kart satış ekibinin listesine de girer ve geri
  // alma düğmesi yok — tek tıkla olmamalı.
  const [defterSoru, setDefterSoru] = useState(false);
  // Kartın içindeki kişi e-postası: nereden gönderileceği sorulur (bkz. EpostaGonderSecimi).
  const [epostaSecimi, setEpostaSecimi] = useState<{ to: string; ad?: string } | null>(null);
  const [defterHata, setDefterHata] = useState("");
  const hedefDefter = baglantiModu ? MUSTERI_MODUL_KEY : BAGLANTI_MODUL_KEY;
  // Bağlantılar'da defter düğmesinin yerini "Aktar" alır (müşteri, tedarikçi,
  // rakip analizi, ortaklık — bkz. AktarimSecenekleri); Müşteriler'de
  // "Bağlantılara ekle" kalır.
  const defterButonu = canWrite && !baglantiModu && !party.modules.includes(hedefDefter) && baglantiYazar;

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
  // Web portalı (B2B, migration 188): yalnızca şirkette etkin web sitesi
  // bağlantısı varsa. Önceden Siparişler sekmesinin içinde duruyordu ve
  // yönetici "portal hesabı aç"ı bulamadı (kullanıcı şikâyeti, 2026-11-09) —
  // artık kendi sekmesi ve kartın tepesinde belirgin bir düğmesi var.
  const [portal, setPortal] = useState<MusteriPortalOzeti | null>(null);
  const [portalYeni, setPortalYeni] = useState(false);
  useEffect(() => {
    if (baglantiModu) return;
    let iptal = false;
    portalApi
      .ozet(party.id)
      .then((o) => !iptal && setPortal(o))
      .catch(() => !iptal && setPortal(null));
    return () => {
      iptal = true;
    };
  }, [party.id, baglantiModu]);
  const portalVar = !!portal && portal.baglantilar.length > 0;
  const portalHesabi = portal?.kullanicilar.filter((k) => k.durum === "aktif").length ?? 0;
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

  // Sekmeler alt çizgili bir çubuk: önceden dolu renkli haplardı ve üstteki
  // kutularla aynı görünüyordu; açılan alan üst üste binmiş aynı renkli
  // şeritlere dönüyordu (kullanıcı şikâyeti, 2026-10-27).
  // Sekmeler büyük ve tek satır: 13 px yazı + 2 px dolgu ile hedef küçüktü,
  // sekmeler iki satıra kırılınca hangisinin seçili olduğu karışıyordu
  // (kullanıcı şikâyeti, 2026-11-11). Sığmazsa çubuk yana kayar.
  const tabStyle = (active: boolean) => ({
    fontSize: 14,
    padding: "10px 2px",
    marginBottom: -1,
    border: "none",
    borderBottom: `2px solid ${active ? c.primary : "transparent"}`,
    cursor: "pointer",
    background: "transparent",
    color: active ? c.primary : c.textSecondary,
    fontWeight: active ? 600 : 500,
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  });
  // Künyenin altındaki bölümler kutu değil, ince bir çizgiyle ayrılır.
  const bolum = { borderTop: `1px solid ${c.border}`, paddingTop: 12 } as const;

  return (
    <div
      style={{
        // Kartın kendi zemini, kenarı ve dolgusu yok: geniş ekranda sağ
        // bölme, dar ekranda pencere çerçeveler. Eskiden satırın içinde kendi
        // renginde (acilanAlan) gölgeli bir kutuydu, içindeki künye ayrı bir
        // kutu, onun içindeki özetler bir kutu daha — üç katman göz yoruyordu
        // (kullanıcı şikâyeti, 2026-11-11).
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Künye: iletişim, adres, vergi ve sipariş özeti — önceden yalnızca
          düzenleme formunda görünüyordu (bkz. MusteriKunyesi). */}
      <MusteriKunyesi party={party} siparisOzetiGoster={!baglantiModu} />
      {/* Web sitesi ve sosyal hesaplar künyenin hemen altında: eskiden
          sekmelerin altında, içerikle karışık duruyordu. */}
      <KartBaglantilari party={party} />
      {portalVar && (portalHesabi > 0 || portal!.yazabilir) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {portalHesabi === 0 ? (
            <button
              onClick={() => {
                setTab("portal");
                setPortalYeni(true);
              }}
              style={{ fontSize: 14, fontWeight: 600, padding: "7px 16px", borderRadius: 8, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
            >
              {t("Portal hesabı aç")}
            </button>
          ) : (
            <button
              onClick={() => setTab("portal")}
              style={{ fontSize: 14, fontWeight: 500, padding: "6px 14px", borderRadius: 8, border: `1px solid ${c.primary}`, background: "transparent", color: c.primary, cursor: "pointer" }}
            >
              {t("Web portalı · {n} hesap", { n: portalHesabi })}
            </button>
          )}
          {portalHesabi === 0 && (
            <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Bu müşteri portalda görünmüyor; hesap açılınca görünür.")}</span>
          )}
        </div>
      )}
      {/* Dosyalar özette küçük resimleriyle; tıklayınca önizleme. */}
      <KartDosyaOnizleme party={party} onTumu={() => setTab(baglantiModu ? "iliski" : "dosyalar")} />
      {/* Liste kartın tepesinde: hangi gruptaysa görünsün, buradan taşınsın. */}
      {listeler && (
        <KartListeleri
          partyId={party.id}
          listeler={listeler}
          uyeOlduklari={party.listeIdleri ?? []}
          canWrite={canWrite}
          onDegisti={onDegisti}
          kapsamYolu={kapsamYolu}
          modul={baglantiModu ? BAGLANTI_MODUL_KEY : MUSTERI_MODUL_KEY}
        />
      )}
      {/* Kartın genel notu Müşteriler'de yalnızca düzenleme formunda duruyordu;
          Bağlantılar'dan aktarılan ilişki notu da buraya yazıldığı için açık
          kartta görünmesi şart (kullanıcı şikâyeti, 2026-10-11). */}
      {!baglantiModu && party.notes?.trim() && (
        <div style={{ fontSize: 14, ...bolum }}>
          <span style={{ fontSize: 13, color: c.textSecondary }}>{t("Not")}</span>
          <p style={{ margin: "4px 0 0", color: c.textPrimary, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{party.notes}</p>
        </div>
      )}
      {/* Sekmeler sığmazsa alt satıra iner: yana kaydırınca çubuğun altında
          kaydırma çubuğu çıkıyor, sekmeye basmayı zorlaştırıyordu
          (kullanıcı şikâyeti, 2026-11-11). */}
      <div style={{ display: "flex", flexWrap: "wrap", columnGap: 22, rowGap: 0, borderBottom: `1px solid ${c.border}`, marginTop: 4 }}>
        {/* Aramalar ve görüşmeler, yazanı ve tarihiyle (bkz. GorusmeNotlari). */}
        {!baglantiModu && (
          <button onClick={() => setTab("gorusmeler")} style={tabStyle(tab === "gorusmeler")}>
            {t("Görüşmeler")} {(party.temas?.notSayisi ?? 0) > 0 && `(${party.temas!.notSayisi})`}
          </button>
        )}
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
          <>
            <button onClick={() => setTab("siparisler")} style={tabStyle(tab === "siparisler")}>
              {t("Siparişler")} {siparisSayisi > 0 && `(${siparisSayisi})`}
            </button>
            {portalVar && (
              <button onClick={() => setTab("portal")} style={tabStyle(tab === "portal")}>
                {t("Web portalı")} {portalHesabi > 0 && `(${portalHesabi})`}
              </button>
            )}
            {/* Bağlantılar'da dosyalar İlişki sekmesinde; müşteride kendi sekmesi
                (kullanıcı isteği, 2026-10-26 — müşteriye dosya eklenemiyordu). */}
            <button onClick={() => setTab("dosyalar")} style={tabStyle(tab === "dosyalar")}>
              {t("Dosyalar")} {(party.ekSayisi ?? 0) + (party.kartvizitSayisi ?? 0) > 0 && `(${(party.ekSayisi ?? 0) + (party.kartvizitSayisi ?? 0)})`}
            </button>
          </>
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

      {/* Müşteriler'de not yukarıdaki Görüşme notları'ndan eklenir; Geçmiş yalnızca okunur günlük. */}
      {canWrite && (tab === "contacts" || (tab === "activity" && baglantiModu)) && (
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
              style={{ flex: 1, fontSize: 14, padding: "5px 8px", resize: "vertical", fontFamily: "inherit" }}
            />
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("Kişi adı")}
              onKeyDown={(e) => e.key === "Enter" && addContact()}
              style={{ flex: 1, fontSize: 14, padding: "5px 8px" }}
            />
          )}
          <button
            onClick={tab === "activity" ? addActivity : addContact}
            disabled={busy || !draft.trim()}
            style={{
              fontSize: 13,
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

      {tab === "gorusmeler" && !baglantiModu ? (
        <GorusmeNotlari party={party} canWrite={canWrite} onDegisti={() => { onDegisti(); load(); }} />
      ) : tab === "iliski" ? (
        <>
          <IliskiOzeti baglanti={party.baglanti} />
          <KartDosyalari party={party} canWrite={canWrite} departmentId={departmentId} onDegisti={onDegisti} />
        </>
      ) : tab === "dosyalar" ? (
        <KartDosyalari party={party} canWrite={canWrite} departmentId={departmentId} onDegisti={onDegisti} />
      ) : tab === "gorevler" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {canWrite && (departmentId || sirketId) && (
            <button
              onClick={() => setGorevAcik(true)}
              style={{ alignSelf: "flex-start", fontSize: 13, padding: "4px 10px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
            >
              {t("+ Takip görevi aç")}
            </button>
          )}
          {gorevler.length === 0 ? (
            <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>
              {departmentId || sirketId
                ? t("Bu bağlantı için açılmış görev yok.")
                : t("Takip görevi departman içinden açılır.")}
            </p>
          ) : (
            gorevler.map((g) => (
              <div key={g.id} style={{ display: "flex", gap: 6, fontSize: 13, alignItems: "baseline" }}>
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
          {gorevAcik && (departmentId || sirketId) && (
            <TaskFromRecordModal
              departmentId={departmentId}
              organizationId={sirketId}
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
      ) : tab === "portal" && portal && portalVar ? (
        <MusteriPortali
          party={party}
          ozet={portal}
          onOzet={setPortal}
          yeniAcik={portalYeni}
          onYeniKapandi={() => setPortalYeni(false)}
        />
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
          <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Henüz temas kaydı yok.")}</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {activities.map((a) => (
              <div key={a.id} style={{ fontSize: 13, color: c.textPrimary }}>
                <span style={{ color: c.textSecondary }}>{a.occurredAt.slice(0, 10)} · </span>
                {a.summary || t(GORUSME_TURU_ETIKETI[a.type])}
                {a.userName && <span style={{ color: c.textSecondary }}> — {a.userName}</span>}
              </div>
            ))}
          </div>
        )
      ) : contacts.length === 0 ? (
        <p style={{ fontSize: 13, color: c.textSecondary, margin: 0 }}>{t("Henüz kişi eklenmemiş.")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {contacts.map((ct) => (
            <div key={ct.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
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
                      <button
                        type="button"
                        onClick={() => setEpostaSecimi({ to: ct.email!, ad: ct.name })}
                        style={{
                          color: c.primary,
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        {ct.email}
                      </button>
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
      {/* Kartı başka deftere taşıma işleri en altta, çizgiyle ayrı: eskiden
          sekmelerle içeriğin ARASINDA duruyordu ve sekmeye ait sanılıyordu. */}
      {(defterButonu || (baglantiModu && canWrite)) && (
        <div style={{ ...bolum, display: "flex", flexDirection: "column", gap: 10 }}>
          {baglantiModu && canWrite && <AktarimSecenekleri party={party} onDegisti={onDegisti} />}
          {defterButonu && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 13 }}>
          {!defterSoru ? (
            <button
              onClick={() => setDefterSoru(true)}
              style={{ fontSize: 13, padding: "4px 10px", borderRadius: 6, border: `1px solid ${c.primary}`, background: "transparent", color: c.primary, cursor: "pointer" }}
            >
              {baglantiModu ? t("Müşteri yap") : t("Bağlantılara ekle")}
            </button>
          ) : (
            <>
              <span style={{ color: c.textSecondary, flex: "1 1 220px" }}>
                {baglantiModu
                  ? t("Kart Müşteriler listesinde de görünecek; ilişki notu kartın notuna eklenir ve satış ekibi görür.")
                  : t("Kart Bağlantı ve İlişkiler listesinde de görünecek.")}
              </span>
              <button
                onClick={deftereEkle}
                disabled={busy}
                style={{ fontSize: 13, padding: "4px 10px", borderRadius: 6, border: "none", background: c.primary, color: c.onPrimary, cursor: "pointer" }}
              >
                {t("Onayla")}
              </button>
              <button
                onClick={() => setDefterSoru(false)}
                style={{ fontSize: 13, padding: "4px 10px", borderRadius: 6, border: `1px solid ${c.border}`, background: "transparent", color: c.textSecondary, cursor: "pointer" }}
              >
                {t("Vazgeç")}
              </button>
            </>
          )}
          {defterHata && <span style={{ color: c.danger, flexBasis: "100%" }}>{defterHata}</span>}
        </div>
          )}
        </div>
      )}
      {epostaSecimi && (
        <EpostaGonderSecimi to={epostaSecimi.to} ad={epostaSecimi.ad} onClose={() => setEpostaSecimi(null)} />
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
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
  const link = { fontSize: 13, color: c.primary, textDecoration: "none" } as const;
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
  const c = useThemeColors();
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
      {/* Yeni kullanıcı dosyaların nereye gittiğini buradan öğrenir. Drive
          bağlı değilse kart yine kaydedilir; yalnızca dosya saklanmaz. */}
      <span style={{ fontSize: 12, color: c.textSecondary }}>
        {t("Kartvizit ve dosyalar bağlı Google Drive ya da OneDrive hesabına kaydedilir (Ayarlar > Bağlı hesaplar). Bağlı değilse kartın bilgileri yine kaydedilir.")}
      </span>
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
  const [seciciAcik, setSeciciAcik] = useState(false);
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: c.textSecondary }}>
          {baslik}
          {dosyalar.length > 0 && ` (${dosyalar.length})`}
        </span>
        {canWrite && (
          <button
            onClick={() => girdi.current?.click()}
            disabled={yukleniyor}
            style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            {yukleniyor ? t("Yükleniyor…") : ekleMetni}
          </button>
        )}
        {/* Ek dosya Projelio'da zaten duruyorsa yeniden yüklenmez, yerinden bağlanır. */}
        {canWrite && rol === "ek" && (
          <button
            onClick={() => setSeciciAcik(true)}
            style={{ fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
          >
            {t("+ Projelio'dan seç")}
          </button>
        )}
        {seciciAcik && <KartDosyaSecici partyId={party.id} onClose={() => setSeciciAcik(false)} onBaglandi={onDegisti} />}
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
            style={{ flex: 1, textAlign: "left", fontSize: 13, color: c.primary, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
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
export function SatirSimgeleri({
  party,
  onDosya,
  onKisiler,
}: {
  party: Party;
  onDosya: (fileId: string) => void;
  onKisiler: () => void;
}) {
  const c = useThemeColors();
  const t = useT();
  // "E-posta gönder" doğrudan mailto değil: önce nereden gönderileceği sorulur.
  const [epostaSecimi, setEpostaSecimi] = useState(false);
  const site = safeExternalUrl(party.website);
  // Hepsi gösterilir; dar ekranda simge grubu alt satıra kayar (flexWrap).
  const hesaplar = KARTVIZIT_SOSYAL.filter((s) => party.sosyal?.[s.anahtar]);
  const telefon = party.phone?.replace(/[^\d+]/g, "");
  const eposta = party.email?.trim();
  const kisi = party.partyType !== "person" ? party.contactCount ?? 0 : 0;
  if (!site && !hesaplar.length && !party.sonKartvizitId && !party.sonEkId && !telefon && !eposta && !kisi) return null;

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
  // Simgenin yanındaki küçük sayı (kişi, dosya): birden fazlaysa görünür.
  const sayi = (n?: number) =>
    n && n > 1 ? <span style={{ fontSize: 12, marginLeft: 1, color: c.textSecondary }}>{n}</span> : null;
  const sayacli = { ...kutu, width: "auto", minWidth: 24, padding: "0 3px" } as const;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {kisi > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onKisiler();
          }}
          title={t("{n} kişi kayıtlı", { n: kisi })}
          aria-label={t("{n} kişi kayıtlı", { n: kisi })}
          style={sayacli}
        >
          <IconUser size={15} />
          <span style={{ fontSize: 12, marginLeft: 1, color: c.textSecondary }}>{kisi}</span>
        </button>
      )}
      {telefon && (
        <a href={`tel:${telefon}`} onClick={durdur} title={party.phone} aria-label={t("Ara")} style={kutu}>
          {simge(TELEFON_IKON)}
        </a>
      )}
      {eposta && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEpostaSecimi(true);
          }}
          title={eposta}
          aria-label={t("E-posta gönder")}
          style={kutu}
        >
          {simge(EPOSTA_IKON)}
        </button>
      )}
      {epostaSecimi && eposta && (
        // Pencere portalda ama React olayları ağaçta yukarı kabarır: satırın
        // "kartı aç" tıklamasına ulaşmasın.
        <div onClick={durdur} style={{ display: "contents" }}>
          <EpostaGonderSecimi to={eposta} ad={party.displayName} onClose={() => setEpostaSecimi(false)} />
        </div>
      )}
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
          style={sayacli}
        >
          <IconIdCard size={15} />
          {sayi(party.kartvizitSayisi)}
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
          style={sayacli}
        >
          <IconPaperclip size={15} />
          {sayi(party.ekSayisi)}
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

// dil:anahtar-baslangic
const AKTARIM_ETIKETI: Record<PartyAktarimHedefi, string> = {
  musteri: "Müşteri yap",
  potansiyel: "Potansiyel müşteri yap",
  tedarikci: "Tedarikçi yap",
  rakip: "Rakip analizine ekle",
  ortaklik: "Ortaklığa ekle",
};
const AKTARIM_YAPILDI: Record<PartyAktarimHedefi, string> = {
  musteri: "Müşteri",
  potansiyel: "Potansiyel müşteri",
  tedarikci: "Tedarikçi",
  rakip: "Rakip analizinde",
  ortaklik: "Ortaklıkta",
};
const AKTARIM_ACIKLAMA: Record<PartyAktarimHedefi, string> = {
  musteri: "Kart Müşteriler listesinde de görünecek; ilişki notu kartın notuna eklenir ve satış ekibi görür.",
  potansiyel: "Kart Müşteriler'de potansiyel müşteri olarak görünecek; ilişki notu kartın notuna eklenir.",
  tedarikci: "Kart Tedarik > Tedarikçiler'de görünecek (Müşteriler'e girmez); ilişki notu kartın notuna eklenir.",
  rakip: "Rakip ve Sektör Analizi'nde bu kart için bir kayıt açılacak; ilişki notu kaydın notuna yazılır.",
  ortaklik: "Ortaklık ve Dağıtım'da bu kart için bir kayıt açılacak; ilişki notu kaydın notuna yazılır.",
};
// dil:anahtar-bitis

/**
 * Bağlantı kartını rolüne göre diğer modüllere aktarma (bkz. backend
 * party/aktarim.ts). Hedef modül şirkette kapalıysa ya da kullanıcının orada
 * yazma yetkisi yoksa seçenek görünmez; yapılmış olanlar onay işaretiyle.
 * Aktarım da geri alması da iki adımlı; defter aktarımları (müşteri,
 * potansiyel, tedarikçi) geri alınabilir (2026-10-28).
 */
function AktarimSecenekleri({ party, onDegisti }: { party: Party; onDegisti: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [secenekler, setSecenekler] = useState<PartyAktarimSecenegi[]>([]);
  const [soru, setSoru] = useState<PartyAktarimHedefi | null>(null);
  // Geri alma da iki adımlı: tek tıkla kart Müşteriler'den çıkmasın.
  const [geriSoru, setGeriSoru] = useState<PartyAktarimHedefi | null>(null);
  const [mesgul, setMesgul] = useState(false);
  const [hata, setHata] = useState("");
  // Müşteriler'e aktarırken kartın gireceği müşteri listesi (migration 170):
  // "" = listesiz, YENI_LISTE = adı yazılan yeni liste (kullanıcı isteği, 2026-10-28).
  const kapsamYolu = party.jobId ? `/jobs/${party.jobId}` : `/organizations/${party.organizationId}`;
  const [musteriListeleri, setMusteriListeleri] = useState<BaglantiListeKaydi[] | null>(null);
  const [listeSecimi, setListeSecimi] = useState("");
  const [yeniListeAdi, setYeniListeAdi] = useState("");
  const YENI_LISTE = "\u0000yeni";
  const musteriDefteri = soru === "musteri" || soru === "potansiyel";

  const yukle = () => {
    partyApi.aktarimSecenekleri(party.id).then(setSecenekler).catch(() => setSecenekler([]));
  };
  useEffect(yukle, [party.id, party.updatedAt]);
  useEffect(() => {
    if (!musteriDefteri || musteriListeleri) return;
    // Müşteriler'i okuyamayan liste seçemez; o zaman seçim hiç çıkmaz.
    partyApi
      .listeler(kapsamYolu, MUSTERI_MODUL_KEY)
      .then(setMusteriListeleri)
      .catch(() => setMusteriListeleri([]));
  }, [musteriDefteri]);

  const aktar = async (hedef: PartyAktarimHedefi) => {
    setMesgul(true);
    setHata("");
    try {
      await partyApi.aktar(party.id, hedef);
      if (hedef === "musteri" || hedef === "potansiyel") {
        if (listeSecimi === YENI_LISTE && yeniListeAdi.trim()) {
          await partyApi.listeAc(kapsamYolu, yeniListeAdi.trim(), [party.id], MUSTERI_MODUL_KEY);
        } else if (listeSecimi && listeSecimi !== YENI_LISTE) {
          await partyApi.listeyeEkle(listeSecimi, [party.id]);
        }
      }
      setSoru(null);
      setListeSecimi("");
      setYeniListeAdi("");
      setMusteriListeleri(null);
      yukle();
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setMesgul(false);
    }
  };

  const geriAl = async (hedef: PartyAktarimHedefi) => {
    setMesgul(true);
    setHata("");
    try {
      await partyApi.aktarimiGeriAl(party.id, hedef);
      setGeriSoru(null);
      yukle();
      onDegisti();
    } catch (err) {
      setHata(err instanceof Error ? err.message : t("Kaydedilemedi"));
    } finally {
      setMesgul(false);
    }
  };

  const yapilan = secenekler.filter((s) => s.durum === "yapildi");
  const musteriYapildi = yapilan.some((s) => s.hedef === "musteri");
  // Müşteri olan karta "Potansiyel yap" sunulmaz: rol eklenir ama müşteri rolü
  // kaldığı için kart yine Müşteriler sekmesinde durur. Önce müşteri aktarımı geri alınır.
  const uygun = secenekler.filter((s) => s.durum === "uygun" && !(s.hedef === "potansiyel" && musteriYapildi));
  if (!uygun.length && !yapilan.length) return null;
  const geriAlinir = (h: PartyAktarimHedefi) => h === "musteri" || h === "potansiyel" || h === "tedarikci";

  const dugme = {
    fontSize: 13,
    padding: "4px 10px",
    borderRadius: 6,
    border: `1px solid ${c.primary}`,
    background: "transparent",
    color: c.primary,
    cursor: "pointer",
  } as const;
  const kucukBaglanti = { fontSize: 12, border: "none", background: "transparent", color: c.textSecondary, cursor: "pointer", padding: 0, textDecoration: "underline" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={{ color: c.textSecondary }}>{t("Aktar:")}</span>
        {uygun.map((s) => (
          <button
            key={s.hedef}
            onClick={() => {
              setSoru(s.hedef);
              setGeriSoru(null);
            }}
            disabled={mesgul}
            style={dugme}
          >
            {t(AKTARIM_ETIKETI[s.hedef])}
          </button>
        ))}
        {yapilan.map((s) => (
          <span key={s.hedef} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: c.success }}>✓ {t(AKTARIM_YAPILDI[s.hedef])}</span>
            {geriAlinir(s.hedef) && (
              <button
                onClick={() => {
                  setGeriSoru(s.hedef);
                  setSoru(null);
                }}
                disabled={mesgul}
                style={kucukBaglanti}
              >
                {t("Geri al")}
              </button>
            )}
          </span>
        ))}
      </div>
      {soru && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ color: c.textSecondary }}>{t(AKTARIM_ACIKLAMA[soru])}</span>
          {musteriDefteri && musteriListeleri && (
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <span style={{ color: c.textSecondary }}>{t("Müşteriler'de listesi:")}</span>
              <select
                value={listeSecimi}
                onChange={(e) => setListeSecimi(e.target.value)}
                style={{ fontSize: 13, padding: "3px 6px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.surface, color: c.textPrimary }}
              >
                <option value="">{t("Listesiz")}</option>
                {musteriListeleri.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.ad}
                  </option>
                ))}
                <option value={YENI_LISTE}>{t("+ Yeni liste…")}</option>
              </select>
              {listeSecimi === YENI_LISTE && (
                <input
                  autoFocus
                  value={yeniListeAdi}
                  maxLength={80}
                  onChange={(e) => setYeniListeAdi(e.target.value)}
                  placeholder={t("Liste adı")}
                  style={{ fontSize: 13, padding: "3px 8px", borderRadius: 6, border: `1px solid ${c.border}`, background: c.background, color: c.textPrimary }}
                />
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => aktar(soru)}
              disabled={mesgul || (listeSecimi === YENI_LISTE && !yeniListeAdi.trim())}
              style={{ ...dugme, border: "none", background: c.primary, color: c.onPrimary }}
            >
              {t("Onayla")}
            </button>
            <button onClick={() => setSoru(null)} style={{ ...dugme, borderColor: c.border, color: c.textSecondary }}>
              {t("Vazgeç")}
            </button>
          </div>
        </div>
      )}
      {geriSoru && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span style={{ color: c.textSecondary, flex: "1 1 220px" }}>
            {geriSoru === "tedarikci"
              ? t("Kart Tedarik'ten çıkar; Bağlantılar'da kalır.")
              : t("Aktarım geri alınır; kartın başka bir müşteri rolü yoksa Müşteriler'den çıkar. Kart Bağlantılar'da kalır.")}
          </span>
          <button onClick={() => geriAl(geriSoru)} disabled={mesgul} style={{ ...dugme, border: "none", background: c.primary, color: c.onPrimary }}>
            {t("Geri al")}
          </button>
          <button onClick={() => setGeriSoru(null)} style={{ ...dugme, borderColor: c.border, color: c.textSecondary }}>
            {t("Vazgeç")}
          </button>
        </div>
      )}
      {hata && <span style={{ color: c.danger }}>{hata}</span>}
    </div>
  );
}

/**
 * Kişi kartını modal pencerede açar — panelin dışından (görevdeki "Bağlantı:
 * …" etiketi). Kartın kendisi panelin detayıyla aynı (PartyDetail); yetkiyi
 * sunucu denetler: kartı göremeyen kullanıcıda pencere hata metniyle açılır.
 */
export function BaglantiKartiModal({ partyId, onClose }: { partyId: string; onClose: () => void }) {
  const c = useThemeColors();
  const t = useT();
  const [party, setParty] = useState<Party | null>(null);
  const [hata, setHata] = useState("");

  const yukle = () => {
    api
      .get<Party>(`/party/${partyId}`)
      .then(setParty)
      .catch((err) => setHata(err instanceof Error ? err.message : t("Kart açılamadı")));
  };
  useEffect(yukle, [partyId]);

  const baglanti = !!party?.modules.includes(BAGLANTI_MODUL_KEY);
  const altSatir = party
    ? [[party.unvan, party.kurum].filter(Boolean).join(", "), party.baglanti?.tanismaYeri].filter(Boolean).join(" · ")
    : "";

  return (
    <Modal title={party?.displayName ?? t("Yükleniyor…")} subtitle={altSatir || undefined} onClose={onClose} maxWidth={640} mobileFullScreen>
      {hata ? (
        <p style={{ color: c.danger, fontSize: 14, margin: 0 }}>{hata}</p>
      ) : party ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {party.roles.map((r) => (
              <span
                key={r}
                style={{ fontSize: 12, padding: "1px 6px", borderRadius: 6, color: ROLE_COLORS[r], border: `1px solid ${ROLE_COLORS[r]}40` }}
              >
                {t(ROLE_LABELS[r], { ctx: "rol" })}
              </span>
            ))}
          </div>
          <PartyDetail
            party={party}
            baglantiModu={baglanti}
            baglantiYazar={false}
            onDegisti={yukle}
            // Yazma kararı sunucuda; yetkisi olmayan kullanıcı düğmeye basınca hata görür.
            canWrite
            siparisYazar={false}
            profile={t("Temas ekle")}
            organizationId={baglanti ? undefined : party.organizationId}
            sirketId={party.organizationId}
          />
        </div>
      ) : (
        <p style={{ fontSize: 14, color: c.textSecondary, margin: 0 }}>{t("Yükleniyor…")}</p>
      )}
    </Modal>
  );
}

/** Kartın ili / ilçesi — büyük harfe çevrilir: "İzmir" ile "İZMİR" ayrı seçenek olmasın. */
function ilAdi(p: Party): string | undefined {
  return p.address?.city?.trim().toLocaleUpperCase("tr") || undefined;
}
function ilceAdi(p: Party): string | undefined {
  return p.address?.district?.trim().toLocaleUpperCase("tr") || undefined;
}
