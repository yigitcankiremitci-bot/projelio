import type { CSSProperties, ReactNode, RefObject } from "react";
import {
  COVER_TEXT_PRIMARY,
  COVER_TEXT_SECONDARY,
  COVER_TEXT_VEIL,
  COVER_VEIL_HEIGHT,
  coverBackground,
} from "../lib/covers";
import { useIsDesktop } from "../lib/useIsDesktop";

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
  /** Sağ alttaki düzenleme düğmesi. */
  action?: ReactNode;
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
  title,
  description,
  meta,
  aside,
  asideOnMobile = false,
  action,
}: Props) {
  const isDesktop = useIsDesktop();
  const showAside = Boolean(aside) && isDesktop;
  const showAsideOverlay = Boolean(aside) && !isDesktop && asideOnMobile;

  return (
    <div
      ref={coverRef}
      style={{
        position: "relative",
        height,
        background: coverBackground(coverImageUrl),
        padding: "20px 28px",
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
          background: COVER_TEXT_VEIL,
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
          color: COVER_TEXT_SECONDARY,
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
          <h1 style={{ fontSize: 22, fontWeight: 500, color: COVER_TEXT_PRIMARY, margin: "0 0 4px" }}>{title}</h1>
          {description && (
            <p
              style={{
                fontSize: 16,
                color: COVER_TEXT_SECONDARY,
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 15, color: COVER_TEXT_SECONDARY }}>
              {meta}
            </div>
          )}
        </div>

        {(showAside || action) && (
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
