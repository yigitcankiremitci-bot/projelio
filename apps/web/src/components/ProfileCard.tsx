import { useEffect, useRef, useState } from "react";
import type { User } from "@projelio/shared";
import { colors, resolveUserTitle } from "@projelio/shared";
import { api } from "../api/client";
import { useThemeColors } from "../theme/useThemeColors";
import { useIsDesktop } from "../lib/useIsDesktop";
import CardDescription from "./CardDescription";
import { IconUser, IconSettings } from "./icons";
import EditProfileModal from "./EditProfileModal";
import { useT } from "../lib/i18n";

// Dar ekranda kart, kendisinin altında duran iş kartlarından yer çalıyordu:
// 116 px'lik avatar + geniş kapsül tek başına ekranın üçte birini kaplıyor.
// Mobilde ölçüler küçültülüyor, masaüstü olduğu gibi kalıyor.
const AVATAR_SIZE_DESKTOP = 116;
const AVATAR_SIZE_MOBILE = 96;
const RING_PADDING = 4;
/**
 * Avatar kapsülden YÜKSEK olmalı: tasarımın tamamı dairenin kapsülün üstüne
 * binmesine dayanıyor. Açıklama uzun olduğunda kapsül büyüyor — daire sabit
 * kalsaydı içine gömülürdü. Bu yüzden avatar kapsülü ölçüp onunla birlikte
 * büyüyor; aradaki fark (taşma payı) hep sabit kalıyor.
 */
const AVATAR_OVERHANG = 22;
/**
 * Büyümenin sınırı. Kart kapağın içinde yaşıyor (bkz. EntityCover): en kısa
 * kapak 270 px ve kartın oturduğu bant ~140 px. Daha büyük bir daire kapağın
 * dışına taşıp kırpılırdı.
 */
const AVATAR_SIZE_MAX = 138;
/**
 * Açıklamanın kırpılmadan gösterildiği satır sayısı. Bunu aşarsa "…" ile
 * kesilir ve çift tıklanınca tamamı açılır (bkz. CardDescription).
 * Üst sınır AVATAR_SIZE_MAX'ten geliyor: 3 satırdan fazlası, avatarın
 * yetişemeyeceği kadar yüksek bir kapsül demek.
 */
const BIO_LINES = 3;

// Anasayfada sağ üstte gösterilen kişi kartı: koyu bir "kapsül" içinde sağa dayalı
// ad/görev/açıklama, kapsülün üstüne bindirilmiş büyük yuvarlak bir profil fotoğrafı ile
// birleşiyor — alışılmış dikdörtgen kart yerine iç içe geçen tek bir kompozisyon.
// Masaüstünde kartın üzerine gelince tüm kompozisyon hafifçe büyür ve fotoğrafın tam
// üstünde düzenleme simgesi belirir; dokunmatikte hover olmadığı için fotoğrafa
// dokunmak aynı simgeyi açar.
interface Props {
  /**
   * Bilgi kapsülünün sağa doğru taşacağı piksel miktarı — sayfanın yatay
   * dolgusu kadar verilir. Kapsül böylece ekranın sağ kenarına dayanır ve
   * "sayfanın kenarından geliyormuş" gibi durur; avatarın altında kesilmiş
   * görünmez. 0 (varsayılan) eski davranış: kapsül avatarın merkezinde biter.
   */
  bleedRight?: number;
  /**
   * Küçültülmüş ölçüler. Yalnızca kartın ekranı domine ettiği yerlerde
   * (anasayfa, dar ekran) açılır; departman/organizasyon kapaklarındaki kart
   * özgün boyutunda kalsın diye varsayılan kapalı.
   */
  compact?: boolean;
  /**
   * Dar ekranda kart kapalı başlar: yalnızca yuvarlak fotoğraf durur, bilgi
   * kapsülü fotoğrafın arkasında gizlidir; fotoğrafa dokununca yandan kayarak
   * çıkar.
   *
   * Neden: kart kapak fotoğrafının üstünde duruyor (bkz. EntityCover
   * asideOnMobile). Kapsül sürekli açık kalınca kapağın sağ üst köşesi hiç
   * görünmüyordu. Bilgi zaten talep üzerine bakılan bir şey — fotoğraf ise
   * kartın kimliği, o kalıyor.
   *
   * Masaüstünde etkisiz: orada kapsül zaten hover ile büyüyor ve yer sorunu yok.
   */
  collapsible?: boolean;
}

export default function ProfileCard({ bleedRight = 0, compact = false, collapsible = false }: Props) {
  const c = useThemeColors();
  const t = useT();
  const isDesktop = useIsDesktop();
  const rootRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLDivElement>(null);
  // Kapsülün gerçek yüksekliği: avatar buna göre büyüyor (bkz. AVATAR_OVERHANG).
  // Tahmin edilemez — açıklama uzunluğu, yazı ölçeği ve kapsül genişliği birlikte
  // belirliyor; ölçmek tek güvenilir yol.
  const [capsuleHeight, setCapsuleHeight] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [hovered, setHovered] = useState(false);
  // Ayar simgesi yalnızca imleç fotoğrafın üstündeyken görünür; kartın geri kalanında
  // gezinmek yeterli değil.
  const [avatarHovered, setAvatarHovered] = useState(false);
  const [tapped, setTapped] = useState(false);
  // Katlanabilir kartta düzenleme simgesi ikinci dokunuşla gelir (bkz. onClick).
  const [gearArmed, setGearArmed] = useState(false);
  const [editing, setEditing] = useState(false);

  const reload = () => {
    api.get<User>("/auth/me").then(setUser).catch(() => setUser(null));
  };

  useEffect(reload, []);

  // Açıklama açılıp kapandıkça da yükseklik değişiyor; ResizeObserver hepsini
  // tek yerden yakalar.
  useEffect(() => {
    const el = capsuleRef.current;
    if (!el) return;
    setCapsuleHeight(el.offsetHeight);
    const observer = new ResizeObserver(() => setCapsuleHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, [user]);

  // Kapsül açıkken kartın dışına dokunmak onu kapatır. Olmazsa kapsül bir kez
  // açıldıktan sonra kapağın köşesini kalıcı olarak kapatıyordu — özelliğin
  // varlık sebebiyle çelişirdi.
  const collapsed = collapsible && !isDesktop;
  useEffect(() => {
    if (!collapsed || !tapped) return;
    const onOutside = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setTapped(false);
      setGearArmed(false);
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [collapsed, tapped]);

  if (!user) return null;

  // Taban ölçü ile kapsülün gerektirdiği ölçünün büyüğü — ama kapağa sığacak
  // kadar. Kapsül ölçülene kadar (ilk render) taban ölçü kullanılır.
  const AVATAR_SIZE = Math.min(
    AVATAR_SIZE_MAX,
    Math.max(compact ? AVATAR_SIZE_MOBILE : AVATAR_SIZE_DESKTOP, capsuleHeight + AVATAR_OVERHANG)
  );
  // Kapsülün sağ ucu HER ZAMAN avatarın merkezinde biter: daire kapsülden taşar,
  // tasarımın tamamı bu binişme üzerine kurulu. Sağa taşma (bleedRight) kapsüle
  // değil KARTIN TAMAMINA uygulanır (aşağıdaki dış sarmalayıcı) — kapsülü
  // büyütmek avatarı içine alıyor ve kart sıradan bir dikdörtgene dönüyordu.
  const capsuleRightInset = AVATAR_SIZE / 2;
  const gearVisible = isDesktop ? avatarHovered : collapsed ? tapped && gearArmed : tapped;
  // Modal açıkken kart normal boyutuna dönsün — arkada büyümüş halde durması dikkat dağıtıyor.
  const active = isDesktop && hovered && !editing;
  // Kapsül görünür mü: katlanabilir değilse her zaman, katlanabilirse dokunulduğunda.
  const capsuleOpen = !collapsed || tapped;

  return (
    <div
      ref={rootRef}
      onMouseEnter={() => isDesktop && setHovered(true)}
      onMouseLeave={() => isDesktop && setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        // Sağ üstte durduğu için sağ kenarı sabit tutup sola/aşağı doğru büyütüyoruz;
        // aksi halde büyüyünce sayfa kenarından taşardı.
        transformOrigin: "right center",
        transform: active ? "scale(1.15)" : "scale(1)",
        transition: "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)",
        // Kart sayfa dolgusunu aşıp ekran kenarına dayanır: avatarın sağ kenarı
        // tam kenarda durur, kapsül de "sayfanın dışından geliyormuş" gibi
        // görünür. Avatarın kırpılmaması için taşma payı YOK — tam dolgu kadar.
        marginRight: -bleedRight,
      }}
    >
      {/* Sağa dayalı bilgi kapsülü — sağ tarafı avatarın altına girecek şekilde kısaltılmış. */}
      <div
        ref={capsuleRef}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          textAlign: "right",
          gap: compact ? 4 : 3,
          // Kapsüldeki ad her zaman sabit beyaz (aşağıda "#fff"), o yüzden zemin de
          // sabit koyu kalmalı — dinamik c.primary karanlık modda açık bir tona
          // döndüğü için (bkz. ThemeProvider) beyaz yazıyla kontrastı bozar.
          background: `linear-gradient(120deg, ${colors.light.primary}, ${colors.light.primaryDark})`,
          borderRadius: "999px 22px 22px 999px",
          // Sağ dolgu = avatarın kapsülün içinde kalan kısmı + boşluk + taşma.
          // Kapsül sağa taşmıyorsa (bleedRight = 0) eski davranış korunur:
          // kapsül avatarın MERKEZİNDE biter, dolgu da yarıçap kadardır.
          // Compact'te dolgular çok kısıktı: yazılar kapsülün kıyısına dayanıp
          // taşacakmış gibi duruyordu. Dikeyde 9 -> 13, solda 14 -> 18,
          // metin ile avatar arasında 18 -> 22.
          padding: compact
            ? `10px ${capsuleRightInset + 22}px 10px 18px`
            : `14px ${capsuleRightInset + 26}px 14px 24px`,
          marginRight: -(capsuleRightInset + RING_PADDING),
          // maxWidth kutunun TAMAMINI sınırlar (border-box). Sağ dolgu büyüdükçe
          // metne kalan yer daralıyor ve yazılar eziliyordu; sınırı içerik
          // genişliği + dolgu olarak kuruyoruz. Kapsül sağa sabitli olduğu için
          // fazla genişlik sola doğru açılır.
          maxWidth: (compact ? 190 : 260) + capsuleRightInset,
          boxShadow: active ? "0 12px 28px rgba(28,34,44,0.26)" : "0 6px 18px rgba(28,34,44,0.18)",
          // Katlıyken kapsül kendi genişliği kadar sağa kayar: sol ucu avatarın
          // merkezine denk gelir, yani tamamen fotoğrafın ARKASINA (avatar
          // zIndex: 2) ve kapağın overflow: hidden sınırının dışına gider.
          // Yerleşimi değiştirmediği için (transform) avatar sağ kenarda sabit
          // kalır — kapsül gerçekten "yandan kayarak" çıkıp giriyor.
          transform: capsuleOpen ? "translateX(0)" : "translateX(100%)",
          opacity: capsuleOpen ? 1 : 0,
          pointerEvents: capsuleOpen ? "auto" : "none",
          transition:
            "box-shadow 620ms ease, transform 460ms cubic-bezier(0.22, 1, 0.36, 1), opacity 260ms ease",
        }}
      >
        <div
          style={{
            fontSize: compact ? 14 : 17,
            fontWeight: 600,
            color: "#fff",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {user.fullName}
        </div>
        {/* Unvan her zaman görünür: kullanıcı kendi metnini yazmadıysa hesap tipinden türetilir. */}
        <div
          style={{
            fontSize: compact ? 11 : 12,
            fontWeight: 500,
            color: c.primaryDark,
            background: c.accent,
            padding: "2px 10px",
            borderRadius: 999,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {resolveUserTitle(user)}
        </div>
        {/* Açıklama kartlardakiyle aynı davranışta: sığdığı kadarı olduğu gibi
            görünür, taşarsa "…" ile kesilir ve ÇİFT tıklayınca tamamı açılır.
            Kapsül büyüyünce avatar da onunla birlikte büyür (bkz. capsuleHeight),
            yani daire hiçbir zaman kapsülün içine gömülmez. */}
        {user.bio && (
          <CardDescription
            text={user.bio}
            lines={BIO_LINES}
            style={{
              fontSize: compact ? 11.5 : 12.5,
              color: "rgba(255,255,255,0.72)",
              lineHeight: 1.4,
              margin: "2px 0 0",
              textAlign: "right",
              maxWidth: "100%",
            }}
          />
        )}
      </div>

      {/* Büyük, kapsülün üstüne binen yuvarlak profil fotoğrafı. */}
      <div
        onClick={() => {
          if (isDesktop) return;
          if (!collapsed) {
            setTapped((prev) => !prev);
            return;
          }
          // Katlanabilir kartta ilk dokunuş kapsülü açar, ikincisi düzenleme
          // simgesini getirir. İkisi tek dokunuşta olunca fotoğraf — tam da
          // görünür kalsın diye uğraştığımız şey — anında karartılıyordu.
          if (!tapped) {
            setTapped(true);
            setGearArmed(false);
          } else {
            setGearArmed((prev) => !prev);
          }
        }}
        onMouseEnter={() => isDesktop && setAvatarHovered(true)}
        onMouseLeave={() => isDesktop && setAvatarHovered(false)}
        role="button"
        tabIndex={0}
        onFocus={() => {
          setHovered(true);
          setAvatarHovered(true);
        }}
        onBlur={() => {
          setHovered(false);
          setAvatarHovered(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
        aria-label={collapsed && !tapped ? "Profil kartını aç" : "Profil fotoğrafı"}
        aria-expanded={collapsed ? tapped : undefined}
        style={{
          position: "relative",
          zIndex: 2,
          flexShrink: 0,
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          borderRadius: "50%",
          padding: RING_PADDING,
          background: `linear-gradient(135deg, ${c.accent}, ${c.accentDark})`,
          boxShadow: active ? "0 14px 30px rgba(28,34,44,0.36)" : "0 8px 20px rgba(28,34,44,0.28)",
          transition: "box-shadow 620ms ease",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            overflow: "hidden",
            background: c.surface,
            border: `3px solid ${c.surface}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              // alt BİLEREK BOŞ: görsel yüklenemezse tarayıcı alt metnini yazar ve
              // yuvarlak avatar alanında taşan bir isim/e-posta görünür. Burada
              // isim zaten kartın içinde ayrıca yazıyor, alt metnin bilgi değeri yok.
              alt=""
              // Kırık görselde <img> gizlenir; arkadaki simge yer tutucu görünür.
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <IconUser size={compact ? 30 : 44} color={c.textSecondary} />
          )}
        </div>

        {/* Düzenleme simgesi fotoğrafın tam üstünde, hafif karartılmış bir katman içinde. */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setTapped(false);
            setEditing(true);
          }}
          role="button"
          aria-label={t("Profili düzenle")}
          style={{
            position: "absolute",
            inset: RING_PADDING + 3,
            borderRadius: "50%",
            background: "rgba(26,31,41,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: gearVisible ? 1 : 0,
            pointerEvents: gearVisible ? "auto" : "none",
            transition: "opacity 200ms ease",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.16)",
              border: "1.5px solid rgba(255,255,255,0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: gearVisible ? "scale(1)" : "scale(0.7)",
              transition: "transform 240ms cubic-bezier(0.34, 1.4, 0.64, 1)",
            }}
          >
            <IconSettings size={20} color="#fff" />
          </span>
        </div>
      </div>

      {editing && <EditProfileModal user={user} onClose={() => setEditing(false)} onSaved={reload} />}
    </div>
  );
}
