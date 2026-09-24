import type { CSSProperties, ReactNode, RefObject } from "react";
import { Link, useNavigate } from "react-router-dom";
import { COVER_VEIL_HEIGHT, COVER_VEIL_HEIGHT_MOBILE, coverBackground } from "../lib/covers";
import type { LioSubject } from "../lib/askLio";
import AskLioButton from "./AskLioButton";
import { useIsDesktop } from "../lib/useIsDesktop";
import { COVER_TOP_CLEARANCE, pageGutter, SAFE_TOP, TOP_CHROME_BOTTOM, safeTop, TOP_CHROME } from "../lib/layout";
import { useThemeColors } from "../theme/useThemeColors";
import { useT } from "../lib/i18n";
import { useCoverTheme } from "../theme/useCoverTheme";
import { IconChevronDown, IconChevronLeft } from "./icons";
import { useKatlanirBolum } from "../lib/useKatlanirBolum";
import ProfileCard, { PROFILE_CARD_MOBILE_WIDTH } from "./ProfileCard";
import AiCreditsChip from "./AiCreditsChip";
import { useAppPrefs } from "../lib/appPrefs";

/**
 * Kapağın sağ alt köşesindeki düzenleme düğmesinin ortak stili — beş sayfada
 * ayrı ayrı kopyalanmıştı.
 */
export function coverActionButton(c: { border: string; surface: string }): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    // Ölçü kapaktan gelir (bkz. EntityCover --cover-action-size): telefonda
    // 48 px'lik iki düğme kapağın dibinde ayrı bir bant açıp kapağı uzatıyordu.
    width: "var(--cover-action-size, 48px)",
    height: "var(--cover-action-size, 48px)",
    borderRadius: 10,
    border: `1px solid ${c.border}`,
    background: c.surface,
    boxShadow: "0 2px 8px rgba(26,31,41,0.12)",
  };
}

/**
 * Kişi kartı, üstteki bildirim çanı ile alttaki düzenleme düğmesi arasında
 * kalan boşluğun TAM ORTASINA oturur — köşeye yapışmaz.
 *
 * Üst sınır sabit düğmelerin kapladığı banttan TÜRETİLİR (bkz. lib/layout
 * TOP_CHROME_BOTTOM). Eskiden buraya elle 62 yazılıydı: düğme boyutu ya da
 * üstten uzaklığı değiştiğinde yalnızca App.tsx düzeliyor, kapaklar eski bandı
 * kullanmaya devam ediyordu.
 * Alt sınır: kapağın sağ altındaki 48 px'lik düzenleme düğmesi + 20 px kapak
 * dolgusu, 8 px pay.
 */
const BELL_BAND_BOTTOM = TOP_CHROME_BOTTOM;
const COVER_PADDING = 20;
const ACTION_BAND = 48 + 8;
/** Telefonda düzenleme düğmeleri küçülür (bkz. coverActionButton). */
const ACTION_SIZE_MOBILE = 38;
const ACTION_BAND_MOBILE = ACTION_SIZE_MOBILE + 8;
/** Masaüstünde kart akıştaki sütunda: dolgu zaten 20 px, kalanı burada eklenir. */
const ASIDE_TOP_CLEARANCE = BELL_BAND_BOTTOM - COVER_PADDING;
/**
 * Dar ekranda kart mutlak konumlu; başlık bloğu tam genişlikte olduğu için
 * altına girmesin diye sağda bu kadar yer ayrılır (katlıyken kart = fotoğraf).
 *
 * Sayı ELLE YAZILMIYOR: kartın kendi ölçüsünden geliyor. Daha önce 104 diye
 * kopyalanmıştı ve avatar küçültülünce burası eski genişlikte yer ayırmaya
 * devam ederdi — başlık aynı sıkışıklıkta kalırdı.
 */
const MOBILE_ASIDE_RESERVE = PROFILE_CARD_MOBILE_WIDTH;
/**
 * Dar ekranda bindirilen kartın (fotoğraf + altındaki Lio rozeti) kapladığı
 * yükseklik. Kapak bundan kısa kalırsa kart bandına sığmıyor ve ortalanırken
 * iki uçtan da taşıyor: üstte çanın, altta düzenleme düğmesinin üstüne biner.
 */
const MOBILE_ASIDE_BAND = PROFILE_CARD_MOBILE_WIDTH + 34;
/**
 * Dar ekranda kapağın tavanı.
 *
 * Sayfalar kapak yüksekliğini masaüstü için seçiyor (iş 330, rutin 290, şirket
 * 270). Telefonda 330 px, 850 px'lik bir ekranın %39'u demek: kullanıcı sayfayı
 * açtığında sekmeleri bile göremiyordu. Yazı bloğu kapağın dibine yaslı olduğu
 * için yüksekliği kısmak yalnızca fotoğrafın üst kısmını kırpar, hiçbir metni
 * kaybetmez.
 */
//
// 220'den 190'a indirildi: telefonda anasayfa (şirket kapağı) hâlâ ekranın
// dörtte birini kaplıyordu. Açıklama tek satıra, künye tek satıra indiği için
// yazı bloğu artık bu tavana sığıyor.
const MOBILE_MAX_HEIGHT = 190;

/**
 * "← İşler" bağlantısının kapak içindeki hâli.
 *
 * Eskiden kapağın ALTINDA, kendi satırında duruyordu (`margin: 14px 0`) ve
 * sekme çubuğunu 43px aşağı itiyordu — telefonda bu, ilk ekranın onda birine
 * denk geliyor. Kapağın içinde başlığın hemen üstünde, sayfanın kimliğiyle
 * aynı blokta duruyor: "hangi listeden geldim" bilgisi başlığın yanında daha
 * doğru bir yer zaten.
 *
 * Çip görünümü (yarı saydam beyaz zemin) şart, süs değil: kapak fotoğrafı
 * koyu da olabilir. Perde (bkz. lib/covers.ts) kapağın alt bandını açıyor ama
 * bağlantı bandın üst sınırına yakın duruyor; kendi zemini olmadan bazı
 * fotoğraflarda okunmuyordu.
 */
/**
 * Kapak künyesindeki küçük etiketin ("Şirket", "İşletme") stili.
 *
 * AYIKLANAN HATA. Bu etiket tema paletinden besleniyordu
 * (`color: c.primaryDark`, `background: ${c.primary}22`) — oysa kapağın
 * üstündeki YAZI RENKLERİ ayrı bir kümeden geliyor (bkz. useCoverTheme):
 * perdenin üstünde 4.5:1 kontrastı tutturmak için özellikle seçilmiş
 * değerler. Tema paleti o perde için tasarlanmadığı için etiket karanlık
 * modda koyu zemin üstünde koyu yazı oluyor ve fiilen okunmuyordu.
 *
 * Görünüm bilerek geri hapıyla (CoverBackLink) aynı dilde: yarı saydam zemin
 * + saç teli çerçeve. Kapak fotoğrafı ne olursa olsun etiketin kendi zemini
 * oluyor, ki perdenin gücüne bel bağlamasın.
 */
export function coverBadgeStyle(cover: { primary: string; dark: boolean }): CSSProperties {
  return {
    fontSize: 12,
    color: cover.primary,
    background: cover.dark ? "rgba(255,255,255,0.14)" : "rgba(26,31,41,0.08)",
    border: `1px solid ${cover.dark ? "rgba(255,255,255,0.22)" : "rgba(26,31,41,0.10)"}`,
    borderRadius: 20,
    padding: "2px 9px",
    alignSelf: "center",
    whiteSpace: "nowrap",
  };
}

export function CoverBackLink({
  to,
  label,
  geriGit = false,
  onDark = false,
  floating = false,
}: {
  to: string;
  label: string;
  /** Hedef bir önceki geçmiş kaydı: yeni kayıt açmadan geri gider (bkz. lib/backTarget). */
  geriGit?: boolean;
  /**
   * Departman kapağı gibi koyu perdeli, beyaz yazılı kapaklar için. Oradaki
   * yazı rengi kuralı EntityCover'ınkinden farklı (bkz. DepartmentDetail);
   * açık çip o zeminde göz alıyordu.
   */
  onDark?: boolean;
  /**
   * Kaydırınca beliren sabit şeritteki kopya (bkz. App.tsx CoverStickyHeader).
   *
   * TASARIM AYNI, yalnızca zeminden kopmuş hâli: orada hap kapağın üstünde
   * değil, akan içeriğin üstünde duruyor — bu yüzden zemini daha opak ve
   * gölgeli. Şekil, dolgu, ikon ve yazı boyutu birebir aynı kalmalı: iki hap
   * devir teslim anında aynı çizgide buluşuyor, farklı görünürlerse göz orada
   * bir sıçrama görüyor.
   */
  floating?: boolean;
}) {
  const c = useThemeColors();
  // Etiket ya sabit bir sayfa adı ("Ana Sayfa", sözlükte) ya da kaydın kendi
  // adıdır; ikincisi sözlükte olmadığı için olduğu gibi kalır.
  const t = useT();
  const cover = useCoverTheme();
  // Kapağın altındaki perde karanlık modda koyuya döndüğü için (bkz.
  // useCoverTheme), çip de o zaman "onDark" gibi davranmalı — cover'ın kendi
  // görselinin koyu olup olmamasından bağımsız, app'in temasından geliyor.
  const dark = onDark || cover.dark;
  const fg = dark ? "rgba(255,255,255,0.92)" : c.textSecondary;
  const navigate = useNavigate();
  return (
    <Link
      to={to}
      onClick={(e) => {
        // Yeni sekmede açma (Cmd/Ctrl/orta tık) bağlantının kendi işi.
        if (!geriGit || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(-1);
      }}
      className={floating ? "pill-liftoff" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "4px 12px 4px 7px",
        borderRadius: 999,
        background: dark
          ? floating
            ? "rgba(26,31,41,0.88)"
            : "rgba(26,31,41,0.42)"
          : floating
          ? "rgba(255,255,255,0.94)"
          : "rgba(255,255,255,0.62)",
        border: `1px solid ${dark ? "rgba(255,255,255,0.22)" : "rgba(26,31,41,0.08)"}`,
        // Gölge yalnızca yüzen hâlde: hapın içerikten "kalkmış" olduğunu
        // gösteren tek işaret bu.
        boxShadow: floating
          ? dark
            ? "0 3px 12px rgba(0,0,0,0.5)"
            : "0 3px 10px rgba(26,31,41,0.14)"
          : "none",
        backdropFilter: floating ? "blur(6px)" : undefined,
        fontSize: 13,
        color: fg,
        whiteSpace: "nowrap",
        textDecoration: "none",
      }}
    >
      <IconChevronLeft size={14} color={fg} />
      {t(label)}
    </Link>
  );
}

interface Props {
  /** Kaydırınca beliren sabit başlık bunu ölçer (bkz. lib/pageHeader). */
  coverRef?: RefObject<HTMLDivElement>;
  coverImageUrl?: string;
  /**
   * Kapak seçilmemişse hazır kapağın türetileceği tohum — kaydın kimliği
   * (bkz. lib/covers presetForSeed). Verilmezse düz varsayılan kapak çizilir.
   */
  seed?: string;
  height?: number;
  title: ReactNode;
  description?: string;
  /** Başlığın altındaki tek satırlık künye (sahip, tarih, tutar…). */
  meta?: ReactNode;
  /** Sağ üstteki kişi kartı. Dar ekranda gösterilmez — başlığı eziyordu. */
  aside?: ReactNode;
  /**
   * Dar ekranda kişi kartını yok saymak yerine kapağın ÜSTÜNE bindirerek göster.
   *
   * Neden bindirme: kartı kapağın altına kendi satırına koymak sayfadan fazladan
   * ~110 px yiyordu — mobilde en çok şikâyet edilen şey zaten dikey yer.
   * Kapağın akışına sütun olarak sokmak da olmuyor: 270 px'lik bantta başlığı ve
   * künyeyi eziyor (bkz. showAside). Mutlak konumlandırma ikisini de çözer:
   * kart kapak fotoğrafının üstünde durur, hiç yer kaplamaz.
   *
   * Dikey yer: üstte bildirim çanı/yardım düğmesi var (fixed, 14–54 px), altta
   * başlık bloğu kapağın dibine yaslı. Kart ikisinin arasındaki banda oturur.
   *
   * Varsayılan kapalı: iş/proje/rutin kapaklarında kart bir "ek", anasayfada
   * ise sayfanın parçası.
   */
  asideOnMobile?: boolean;
  /**
   * Başlığın üstündeki geri bağlantısı (bkz. CoverBackLink). Sayfalar bunu
   * `usePageHeader`in sourceRef'i için bir sarmalayıcıyla veriyor.
   */
  back?: ReactNode;
  /**
   * Kapağın sağ alt bandına, düzenleme düğmesinin üstüne giren blok
   * (bkz. StatGrid CoverStats). Dar ekranda kendisi null döndüğü için burada
   * ayrıca eşiğe bakılmıyor.
   */
  stats?: ReactNode;
  /** Sağ alttaki düzenleme düğmesi. */
  action?: ReactNode;
  /**
   * Verilirse başlığın yanına "bunu Lio'ya sor" simgesi konur
   * (bkz. components/AskLioButton). Sayfanın kendisi düğme çizmez, yalnızca
   * konuyu bildirir.
   */
  lioSubject?: LioSubject;
  /**
   * Telefonda başlık ve kişi fotoğrafı EN ÜST satırda, kenar çubuğu oku ile
   * yardım/bildirim düğmelerinin arasında durur; kapak yalnızca o satır
   * kadardır. Proje sayfası için: orada kanban panosu ekranın asıl içeriği ve
   * kapağın her pikseli panodan çalınıyordu.
   */
  titleInTopRow?: boolean;
}

/**
 * İş / şirket / grup / proje / rutin sayfalarının ortak kapak başlığı.
 *
 * Önceden her sayfa bu bloğu kendi içinde kopyalıyordu ve iki hata beş yerde
 * birden yaşıyordu:
 *
 *  1. Kapak yokken arka plan koyu bir gradyandı, yazı rengi ise koyu kalıyordu —
 *     başlık ve açıklama görünmüyordu. Artık arka plan ne olursa olsun yazının
 *     oturduğu bant beyaz bir perdeyle açılıyor (bkz. lib/covers.ts).
 *  2. Kişi kartı mutlak konumdaydı, başlık bloğuysa sabit bir sağ boşluğa
 *     güveniyordu; açıklama uzayınca kartın altına giriyordu. Artık kart ile
 *     yazı aynı satırın iki sütunu — çakışma yapısal olarak imkânsız.
 */
export default function EntityCover({
  coverRef,
  coverImageUrl,
  seed,
  height = 290,
  back,
  title,
  description,
  meta,
  aside,
  asideOnMobile = false,
  stats,
  action,
  lioSubject,
  titleInTopRow = false,
}: Props) {
  const isDesktop = useIsDesktop();
  // Telefonda HER kapak aynı modelde: katlanır bant (bkz. MobileCollapsibleCover).
  // Sayfaların kendi `aside`ı, `back`i ve `stats`ı burada kullanılmaz — kişi
  // kartını ve bakiyeyi kapak kendisi çizer, geri bağlantısını sayfa
  // sekmelerin altına koyar (bkz. MobileBackRow).
  if (!isDesktop) {
    return (
      <MobileCollapsibleCover
        coverRef={coverRef}
        coverImageUrl={coverImageUrl}
        seed={seed}
        title={title}
        description={description}
        meta={meta}
        action={action}
        lioSubject={lioSubject}
        titleInTopRow={titleInTopRow}
      />
    );
  }
  return (
    <DefaultCover
      coverRef={coverRef}
      coverImageUrl={coverImageUrl}
      seed={seed}
      height={height}
      back={back}
      title={title}
      description={description}
      meta={meta}
      aside={aside}
      asideOnMobile={asideOnMobile}
      stats={stats}
      action={action}
      lioSubject={lioSubject}
    />
  );
}

/**
 * Telefonda kapağın geri bağlantısı: sekmelerin ALTINDA, kendi satırında.
 *
 * Katlanır kapakta yer yok (bant yalnızca başlık + fotoğraf) ve kapağın
 * üstünde sabit düğmelerle yarışıyordu. `backRef` sayfanın usePageHeader'a
 * verdiği ref: kaydırınca beliren geri hapı bu öğe görünürlükten çıkınca
 * devralıyor. Masaüstünde hiçbir şey çizmez — orada bağlantı kapağın içinde.
 */
export function MobileBackRow({
  backRef,
  to,
  label,
  geriGit,
}: {
  backRef: RefObject<HTMLDivElement>;
  to: string;
  label: string;
  geriGit?: boolean;
}) {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;
  return (
    <div ref={backRef} style={{ marginBottom: 14 }}>
      <CoverBackLink to={to} label={label} geriGit={geriGit} floating />
    </div>
  );
}

/** Kapak açık mı — bütün sayfalarda TEK tercih: telefonda her kapak aynı davranır. */
const KAPAK_ACIK_ANAHTARI = "projelio.kapak-acik";

/** Kapalı bandın üstünde bırakılan boşluk: sabit düğmelerin (ok, çan) altı. */
const COLLAPSED_TOP = TOP_CHROME_BOTTOM + 2;
/** Açılınca başlığın üstünde görünen kapak fotoğrafı şeridi. */
const EXPANDED_PHOTO = 84;

/**
 * titleInTopRow ölçüleri: başlık satırı sabit düğmelerin (ok solda, yardım +
 * çan sağda) arasına oturur. Kenar boşlukları o düğmelerin kapladığı yerden
 * türetiliyor (bkz. lib/layout TOP_CHROME, App.tsx): ok 14–54, yardım ve
 * çan sağdan 14–106.
 */
const TOP_ROW_AVATAR = 40;
const TOP_ROW_HEIGHT = TOP_ROW_AVATAR + 8;
const TOP_ROW_LEFT = TOP_CHROME.gutter + 40 + 8;
const TOP_ROW_RIGHT = TOP_CHROME.gutter + TOP_CHROME.size * 2 + 4 + 8;
/** Satır, 44 px'lik düğmelerle aynı dikey merkezde. */
const TOP_ROW_TOP = TOP_CHROME.top + TOP_CHROME.size / 2 - TOP_ROW_HEIGHT / 2;

/**
 * Telefonda katlanır kapak (bkz. Props.mobileCollapsible).
 *
 * Neden: telefonda şirket anasayfasının ilk ekranının yarısı kapaktı —
 * geri bağlantısı, iki satırlık başlık, açıklama, künye, kişi kartı, bakiye
 * ve iki düğme. Hepsi talep üzerine bakılan bilgi; kapalı hâlde yalnızca
 * sayfanın kimliği (başlık) ve kullanıcının kendisi (fotoğraf) kalıyor.
 *
 * Açılma animasyonu ölçüm yapmadan: fotoğraf şeridi sabit iki yükseklik
 * arasında, künye bloğu `grid-template-rows: 0fr ↔ 1fr` ile geçiyor —
 * `height: auto`ya geçiş canlandırılamadığı için bilinen yol bu.
 */
function MobileCollapsibleCover({
  coverRef,
  coverImageUrl,
  seed,
  title,
  description,
  meta,
  action,
  lioSubject,
  titleInTopRow = false,
}: Pick<
  Props,
  "coverRef" | "coverImageUrl" | "seed" | "title" | "description" | "meta" | "action" | "lioSubject" | "titleInTopRow"
>) {
  const t = useT();
  const prefs = useAppPrefs();
  const cover = useCoverTheme();
  const gutter = pageGutter(false);
  // Varsayılan KAPALI. useKatlanirBolum "1" yazılı değilse false döner;
  // burada anahtar "açık mı?" anlamında kullanılıyor (adı "-acik" ile
  // bitiyor), yani hiç dokunulmamış kapak kapalı başlıyor.
  const [acik, degistir] = useKatlanirBolum(KAPAK_ACIK_ANAHTARI);
  const easing = "360ms cubic-bezier(0.22, 1, 0.36, 1)";
  const kartGenisligi = titleInTopRow ? TOP_ROW_HEIGHT : PROFILE_CARD_MOBILE_WIDTH;
  // Açılınca görünen fotoğraf şeridi: normalde başlığın üstünde, üst satır
  // kipinde başlığın ALTINDA (başlık yerinden oynamasın).
  const fotoSeridi = <div aria-hidden style={{ height: acik ? EXPANDED_PHOTO : 0, transition: `height ${easing}` }} />;

  return (
    <div
      ref={coverRef}
      style={{
        position: "relative",
        background: coverBackground(coverImageUrl, seed),
        padding: titleInTopRow
          ? `${safeTop(TOP_ROW_TOP)} ${gutter}px 8px`
          : `${safeTop(COLLAPSED_TOP)} ${gutter}px 12px`,
        // "hidden" DEĞİL "clip": katlı kişi kartının kapsülü sağa kaydırılmış
        // (transform) bekliyor ve taşan kısmı kapağı kaydırılabilir bir kutuya
        // çeviriyordu. Açma düğmesine dokununca tarayıcı odaklanan öğeyi
        // görünür kılmak için kapağı ~50 px sola kaydırıyor, başlık kesiliyordu.
        // clip kaydırma kutusu oluşturmaz; eski tarayıcılar hidden'a düşer.
        overflow: "hidden",
        overflowX: "clip" as CSSProperties["overflowX"],
        overflowY: "clip" as CSSProperties["overflowY"],
        ["--cover-action-size" as string]: `${ACTION_SIZE_MOBILE}px`,
      }}
    >
      {/* Kapalıyken perde tam: bant kısa, fotoğrafın tamamı yazının arkasında
          kalıyor. Açılınca üst kısım kapağın kendisi olarak görünür. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: acik ? "72%" : "100%",
          background: cover.veil,
          pointerEvents: "none",
          transition: `height ${easing}`,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
        {!titleInTopRow && fotoSeridi}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            minHeight: kartGenisligi,
            ...(titleInTopRow ? { marginLeft: TOP_ROW_LEFT - gutter, marginRight: TOP_ROW_RIGHT - gutter } : {}),
          }}
        >
          <h1
            style={{
              flex: "0 1 auto",
              minWidth: 0,
              fontSize: titleInTopRow ? 17 : 19,
              fontWeight: 500,
              lineHeight: 1.25,
              color: cover.primary,
              margin: 0,
              // Kapalı bantta başlık tek satır; açılınca tamamı görünür.
              ...(acik
                ? {}
                : { whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }),
            }}
          >
            {title}
          </h1>
          <button
            type="button"
            onClick={degistir}
            aria-expanded={acik}
            aria-label={acik ? t("Kapağı kapat") : t("Kapağı aç")}
            title={acik ? t("Kapağı kapat") : t("Kapağı aç")}
            style={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: `1px solid ${cover.dark ? "rgba(255,255,255,0.22)" : "rgba(26,31,41,0.10)"}`,
              background: cover.dark ? "rgba(255,255,255,0.14)" : "rgba(26,31,41,0.06)",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "flex",
                transform: acik ? "rotate(180deg)" : "rotate(0deg)",
                transition: `transform ${easing}`,
              }}
            >
              <IconChevronDown size={16} color={cover.primary} />
            </span>
          </button>
          <div style={{ flex: 1 }} />
          {/* Kişi kartı akışta yalnızca fotoğraf kadar yer tutar; dokununca
              açılan kapsül sola doğru, başlığın ÜSTÜNE taşar (katlı kart,
              bkz. ProfileCard collapsible). */}
          <div style={{ position: "relative", flexShrink: 0, width: kartGenisligi, height: kartGenisligi, zIndex: 2 }}>
            {/* Sarmalayıcı dokunuşa kapalı: katlı kartın kutusu sola, açma
                düğmesinin üstüne uzanıyor. Fotoğraf ve açık kapsül kendi
                pointerEvents: auto değerleriyle dokunuş almaya devam eder. */}
            <div style={{ position: "absolute", right: 0, top: 0, pointerEvents: "none" }}>
              <ProfileCard compact collapsible avatarSize={titleInTopRow ? TOP_ROW_AVATAR : undefined} />
            </div>
          </div>
        </div>

        {titleInTopRow && fotoSeridi}

        <div
          style={{
            display: "grid",
            gridTemplateRows: acik ? "1fr" : "0fr",
            opacity: acik ? 1 : 0,
            transition: `grid-template-rows ${easing}, opacity 260ms ease`,
          }}
          // Kapalıyken içindeki düğmelere klavyeyle de ulaşılmasın. `inert`
          // React 18 tiplerinde yok; öznitelik elle yazılıyor (satır içi ref
          // her çizimde yeniden çağrıldığı için durum değişince güncellenir).
          ref={(el) => {
            if (!el) return;
            if (acik) el.removeAttribute("inert");
            else el.setAttribute("inert", "");
          }}
        >
          <div style={{ minHeight: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 6, color: cover.secondary }}>
              {lioSubject && (
                <div>
                  <AskLioButton subject={lioSubject} size={28} withBackground />
                </div>
              )}
              {description && (
                <p style={{ fontSize: 14, color: cover.secondary, margin: 0, lineHeight: 1.45 }}>{description}</p>
              )}
              {meta && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 13, color: cover.secondary }}>
                  {meta}
                </div>
              )}
              {(prefs.showLio || action) && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 2 }}>
                  {/* Lio gizlenmişse (Ayarlar > Yardımcılar) bakiye de görünmez. */}
                  <div>{prefs.showLio && <AiCreditsChip compact />}</div>
                  {action}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DefaultCover({
  coverRef,
  coverImageUrl,
  seed,
  height = 290,
  back,
  title,
  description,
  meta,
  aside,
  asideOnMobile = false,
  stats,
  action,
  lioSubject,
}: Props) {
  const isDesktop = useIsDesktop();
  const gutter = pageGutter(isDesktop);
  const cover = useCoverTheme();
  // Dar ekranda kapak kısalır; sayfanın kendi yan boşluğuyla da aynı hizaya
  // gelir ki başlık, altındaki sekme çubuğuyla aynı dikey çizgide başlasın.
  const coverHeight = isDesktop ? height : Math.min(height, MOBILE_MAX_HEIGHT);
  const showAside = Boolean(aside) && isDesktop;
  const showAsideOverlay = Boolean(aside) && !isDesktop && asideOnMobile;
  /**
   * Dar ekranda kapağın alt sınırı: yazı bloğu kadar (minHeight ile kendiliğinden
   * uzar) ama bindirilen kart varsa onun bandını da karşılamalı.
   */
  const mobileAsideBandBottom = COVER_PADDING + (action ? ACTION_BAND_MOBILE : 0);
  /**
   * SAFE_TOP burada da var: kart, çanın ALTINDAN başlayan bir banda oturuyor
   * ve çan mobil kabukta durum çubuğu kadar aşağı itiliyor (bkz. layout.ts).
   * Bant eski yerinde bırakılınca fotoğraf çanın altına giriyordu.
   */
  const mobileMinHeight = showAsideOverlay
    ? `calc(${Math.max(coverHeight, BELL_BAND_BOTTOM + MOBILE_ASIDE_BAND + mobileAsideBandBottom)}px + ${SAFE_TOP})`
    : coverHeight;

  return (
    <div
      ref={coverRef}
      style={{
        position: "relative",
        // Telefonda SABİT yükseklik değil, ALT SINIR.
        //
        // Yazı bloğu (geri bağlantısı + başlık + açıklama + künye) uzun bir
        // şirket adında 190 px'i buluyor; sabit 220 px'lik kapakta üstteki
        // yüzen düğmelerin bandına giriyor, `overflow: hidden` de taşan kısmı
        // kırpıyordu. Şirket sayfasında sonuç şuydu: geri bağlantısı logonun
        // altında kayboluyor, başlık kenar çubuğu okuyla üst üste biniyordu.
        // Artık kapak gerektiği kadar uzuyor; kısa içerikte yine 220'de kalır.
        ...(isDesktop ? { height: coverHeight } : { minHeight: mobileMinHeight }),
        background: coverBackground(coverImageUrl, seed),
        // Dar ekranda üst boşluk sabit düğmelerin bandından TÜRETİLİR
        // (bkz. lib/layout COVER_TOP_CLEARANCE); masaüstünde kapak zaten
        // şeridin altında başladığı için gerekmiyor.
        padding: isDesktop
          ? `20px ${gutter}px`
          : `${safeTop(COVER_TOP_CLEARANCE)} ${gutter}px 16px`,
        display: "flex",
        overflow: "hidden",
        ...(isDesktop ? {} : { ["--cover-action-size" as string]: `${ACTION_SIZE_MOBILE}px` }),
      }}
    >
      {/* Yazı perdesi: kapağın alt kısmını beyaza doğru açar. Üst kısım kapağın
          kendisi olarak kalır, yani seçilen görsel/gradyan görünmeye devam eder. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: isDesktop ? COVER_VEIL_HEIGHT : COVER_VEIL_HEIGHT_MOBILE,
          background: cover.veil,
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          gap: 20,
          width: "100%",
          alignItems: "stretch",
          color: cover.secondary,
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            // Mobilde kart akışta değil, kapağın üstünde duruyor; başlık bloğu
            // tam genişlikte olduğu için altına girmesin diye yer ayrılır.
            paddingRight: showAsideOverlay ? MOBILE_ASIDE_RESERVE : 0,
          }}
        >
          {back && <div style={{ marginBottom: 10 }}>{back}</div>}
          {/* Lio simgesi başlığın yanında: kapağın sağ alt köşesi zaten
              düzenleme düğmesi + özet şeridiyle dolu. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 4px" }}>
            <h1
              style={{
                // Dar ekranda 22 px başlık iki satıra taşıp künyeyi aşağı itiyordu.
                fontSize: isDesktop ? 22 : 20,
                fontWeight: 500,
                color: cover.primary,
                margin: 0,
                lineHeight: 1.25,
                minWidth: 0,
              }}
            >
              {title}
            </h1>
            {lioSubject && <AskLioButton subject={lioSubject} size={28} withBackground />}
          </div>
          {description && (
            <p
              style={{
                fontSize: isDesktop ? 16 : 14,
                color: cover.secondary,
                margin: "0 0 8px",
                // Uzun açıklama kapağı taşırmasın: iki satırda (telefonda tek
                // satırda) kırpılır.
                display: "-webkit-box",
                WebkitLineClamp: isDesktop ? 2 : 1,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={description}
            >
              {description}
            </p>
          )}
          {meta && (
            // Telefonda künye tek satır: alt satıra kırılınca kapağı iki
            // satır uzatıyordu. Sığmayan uç kırpılır — künye özet bilgi.
            <div
              style={{
                display: "flex",
                flexWrap: isDesktop ? "wrap" : "nowrap",
                gap: isDesktop ? 14 : 10,
                fontSize: isDesktop ? 15 : 12.5,
                color: cover.secondary,
                ...(isDesktop ? {} : { whiteSpace: "nowrap", overflow: "hidden" }),
              }}
            >
              {meta}
            </div>
          )}
        </div>

        {(showAside || action || stats) && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              justifyContent: "flex-end",
              // Çanın altından başla; kart ile düzenleme düğmesi arasındaki
              // boşluğu aşağıdaki flex:1 sarmalayıcı eşit paylaştırır, yani
              // kart bandın ortasına oturur.
              paddingTop: showAside ? ASIDE_TOP_CLEARANCE : 0,
            }}
          >
            {showAside && <div style={{ flex: 1, display: "flex", alignItems: "center" }}>{aside}</div>}
            {stats}
            {action}
          </div>
        )}
      </div>

      {/* Dar ekran: kart kapağın üstüne bindirilir — akışta yer kaplamaz.
          Bant çanın altından düzenleme düğmesinin üstüne kadar; kart bandın
          ortasında. right: 0 ile ekranın tam kenarına dayanır ("sayfanın
          dışından geliyor" görünümü); kapağın overflow: hidden'ı taşanı kırpar.
          pointerEvents: bandın boş kısmı kapağa yapılan dokunuşları yutmasın. */}
      {showAsideOverlay && (
        <div
          style={{
            position: "absolute",
            top: safeTop(BELL_BAND_BOTTOM),
            bottom: mobileAsideBandBottom,
            right: 0,
            zIndex: 2,
            display: "flex",
            alignItems: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ pointerEvents: "auto" }}>{aside}</div>
        </div>
      )}
    </div>
  );
}
