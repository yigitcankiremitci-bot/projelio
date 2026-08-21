import type { CSSProperties, ReactNode, RefObject } from "react";
import { Link } from "react-router-dom";
import { COVER_VEIL_HEIGHT, coverBackground } from "../lib/covers";
import type { LioSubject } from "../lib/askLio";
import AskLioButton from "./AskLioButton";
import { useIsDesktop } from "../lib/useIsDesktop";
import { pageGutter } from "../lib/layout";
import { useThemeColors } from "../theme/useThemeColors";
import { useCoverTheme } from "../theme/useCoverTheme";
import { IconChevronLeft } from "./icons";

/**
 * Kapağın sağ alt köşesindeki düzenleme düğmesinin ortak stili — beş sayfada
 * ayrı ayrı kopyalanmıştı.
 */
export function coverActionButton(c: { border: string; surface: string }): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
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
 * Üst sınır: bildirim çanı ve yardım/tur düğmesi (bkz. App.tsx — ikisi de
 * `position: fixed; top: 14`, 40 px) kapağın 14–54 px bandını kaplıyor; kart
 * 54'ün altından başlamalı, üstüne 8 px nefes payı.
 * Alt sınır: kapağın sağ altındaki 48 px'lik düzenleme düğmesi + 20 px kapak
 * dolgusu, yine 8 px pay.
 */
const BELL_BAND_BOTTOM = 62;
const COVER_PADDING = 20;
const ACTION_BAND = 48 + 8;
/** Masaüstünde kart akıştaki sütunda: dolgu zaten 20 px, kalanı burada eklenir. */
const ASIDE_TOP_CLEARANCE = BELL_BAND_BOTTOM - COVER_PADDING;
/**
 * Dar ekranda kart mutlak konumlu; başlık bloğu tam genişlikte olduğu için
 * altına girmesin diye sağda bu kadar yer ayrılır (katlıyken kart = fotoğraf).
 */
const MOBILE_ASIDE_RESERVE = 104;
/**
 * Dar ekranda kapağın tavanı.
 *
 * Sayfalar kapak yüksekliğini masaüstü için seçiyor (iş 330, rutin 290, şirket
 * 270). Telefonda 330 px, 850 px'lik bir ekranın %39'u demek: kullanıcı sayfayı
 * açtığında sekmeleri bile göremiyordu. Yazı bloğu kapağın dibine yaslı olduğu
 * için yüksekliği kısmak yalnızca fotoğrafın üst kısmını kırpar, hiçbir metni
 * kaybetmez.
 */
const MOBILE_MAX_HEIGHT = 220;

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
export function CoverBackLink({
  to,
  label,
  onDark = false,
  floating = false,
}: {
  to: string;
  label: string;
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
  const cover = useCoverTheme();
  // Kapağın altındaki perde karanlık modda koyuya döndüğü için (bkz.
  // useCoverTheme), çip de o zaman "onDark" gibi davranmalı — cover'ın kendi
  // görselinin koyu olup olmamasından bağımsız, app'in temasından geliyor.
  const dark = onDark || cover.dark;
  const fg = dark ? "rgba(255,255,255,0.92)" : c.textSecondary;
  return (
    <Link
      to={to}
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
      {label}
    </Link>
  );
}

interface Props {
  /** Kaydırınca beliren sabit başlık bunu ölçer (bkz. lib/pageHeader). */
  coverRef?: RefObject<HTMLDivElement>;
  coverImageUrl?: string;
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

  return (
    <div
      ref={coverRef}
      style={{
        position: "relative",
        height: coverHeight,
        background: coverBackground(coverImageUrl),
        padding: `${isDesktop ? 20 : 16}px ${gutter}px`,
        display: "flex",
        overflow: "hidden",
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
          height: COVER_VEIL_HEIGHT,
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
                // Uzun açıklama kapağı taşırmasın: iki satırda kırpılır.
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
              title={description}
            >
              {description}
            </p>
          )}
          {meta && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: isDesktop ? 14 : 10, fontSize: isDesktop ? 15 : 13, color: cover.secondary }}>
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
            top: BELL_BAND_BOTTOM,
            bottom: COVER_PADDING + (action ? ACTION_BAND : 0),
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
