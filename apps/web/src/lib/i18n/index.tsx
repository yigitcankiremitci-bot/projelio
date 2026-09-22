import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createTranslator, defaultLocale, isLocale, resolveLocale, setEtiketCevirmeni } from "@projelio/shared";
import type { Locale, Translate } from "@projelio/shared";
import { api } from "../../api/client";
import { setCachedLocale, useCurrentUser } from "../useCurrentUser";
import { en } from "./en/index";
import { getLocale as readStored, setStoredLocale as writeStored } from "./depo";

/**
 * Arayüz dili.
 *
 * Anahtar olarak Türkçe metnin kendisi kullanılıyor; gerekçesi
 * packages/shared/src/i18n.ts başında yazılı. Pratik sonucu şu: `t()` ile
 * sarılmamış bir metin Türkçe kalır, patlamaz. Yani çeviri ekran ekran
 * ilerleyebilir ve her ara durum canlıya çıkabilir.
 *
 * ## Dil nereden geliyor
 *
 * Sırayla: hesap tercihi > bu tarayıcıda yapılmış seçim > tarayıcı dili > Türkçe.
 *
 * Hesap tercihi ÖNCE gelir çünkü açık seçim örtük tahmini yener: kullanıcı
 * Ayarlar'dan İngilizce dediyse, tarayıcısı Türkçe olsa bile İngilizce görür.
 * Ama hesap tercihi ancak /auth/me döndükten sonra bilinir; o ana kadar (ve
 * giriş ekranında hiç) tarayıcı dili geçerli. Bu yüzden seçim localStorage'a
 * da yazılıyor — sunucu yanıtı beklenmeden ilk boyamada doğru dil kullanılsın,
 * yoksa her açılışta gözle görülür bir dil titremesi olurdu.
 */

/** Tarayıcının dil listesi. navigator.languages sıralıdır, ilk tanınanı alınır. */
function browserLocale(): Locale {
  if (typeof navigator === "undefined") return defaultLocale;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  // Tanınmayan bir tarayıcı dili ("de-DE") İngilizceye düşer, Türkçeye değil
  // (bkz. resolveLocale).
  return resolveLocale(tags);
}

/**
 * Adresteki `?lang=en` — tanıtım sitesinin /en sayfasından gelen bağlantılar
 * bunu taşıyor. Sitede İngilizce okuyup "Sign up"a basan birinin karşısına,
 * tarayıcısı başka bir dilde diye Türkçe kayıt ekranı çıkmamalı.
 * Bir seçim sayılır ve bu tarayıcıya yazılır; hesap açılınca oraya da geçer.
 */
function adrestekiDil(): Locale | null {
  try {
    const lang = new URLSearchParams(window.location.search).get("lang");
    return isLocale(lang) ? lang : null;
  } catch {
    return null;
  }
}

/** İlk boyamadaki dil — senkron okunur, sunucu beklenmez. */
function initialLocale(): Locale {
  const adres = adrestekiDil();
  if (adres) {
    writeStored(adres);
    return adres;
  }
  return readStored() ?? browserLocale();
}

interface I18nValue {
  locale: Locale;
  /** Kaynak metni geçerli dile çevirir. Türkçede kimlik fonksiyonudur. */
  t: Translate;
  /**
   * Dili değiştirir ve hesaba kaydeder.
   * `null` = "otomatik": seçim silinir, tarayıcı diline dönülür.
   */
  setLocale: (locale: Locale | null) => void;
  /** Kullanıcı açık bir seçim yapmış mı, yoksa dil tahmin mi edildi? */
  chosen: boolean;
  /**
   * Hesaptan gelen dili uygular ve sunucuya GERİ YAZMAZ — değer zaten oradan
   * geldi. Ayrı durmasının tek sebebi bu: setLocale her çağrıldığında PATCH
   * atıyor, her açılışta bir kez boşuna istek olurdu.
   */
  applyFromAccount: (locale: Locale) => void;
}

const Ctx = createContext<I18nValue | null>(null);

/** Giriş ekranında yapılmış, henüz hesaba yazılmamış dil seçimi (sessionStorage). */
const GIRIS_SECIMI = "projelio_locale_giris";

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [chosen, setChosen] = useState<boolean>(() => readStored() !== null);

  // <html lang> ekran okuyucular ve tarayıcının çeviri önerisi için gerekli;
  // ayrıca CSS'te dile göre kural yazılabilmesini sağlıyor.
  //
  // Sekme başlığı da burada kuruluyor: index.html'deki <title> statik ve
  // Türkçe. Sunucu tarafı render yok, yani başlığın dile göre değişmesinin
  // tek yolu bu — sayfa açılır açılmaz düzeltiliyor.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title =
      locale === "en" ? "Projelio — Freelance Project & Task Management" : "Projelio — Freelance Proje & Görev Yönetimi"; // dil:atla
  }, [locale]);

  const setLocale = useCallback((next: Locale | null) => {
    setLocaleState(next ?? browserLocale());
    setChosen(next !== null);
    writeStored(next);
    // /auth/me önbelleği oturum boyunca duruyor; hesaptaki dil orada eski
    // kalmasın (bkz. useCurrentUser setCachedLocale).
    setCachedLocale(next);
    // Sunucunun da bilmesi gerekiyor: e-posta ve push bildirimi tarayıcı
    // kapalıyken gidiyor, orada localStorage diye bir şey yok.
    // Oturum yoksa (giriş/kayıt ekranı) çağrı anlamsız, atlanır.
    try {
      // Oturum yokken (giriş ekranındaki seçici) seçim bekletilir: girişten
      // sonra hesaptaki ESKİ dil gelip bu seçimi ezmesin, hesaba yazılsın
      // (bkz. useAccountLocale).
      if (!localStorage.getItem("projelio_token")) {
        if (next) sessionStorage.setItem(GIRIS_SECIMI, next);
        else sessionStorage.removeItem(GIRIS_SECIMI);
      }
      if (localStorage.getItem("projelio_token")) {
        // Sonucu beklemiyoruz: dil zaten ekranda değişti, kayıt arka planda.
        // Hata yutuluyor — kaydedilememesi kullanıcıya gösterilecek bir şey
        // değil, bu tarayıcıda tercih yine de geçerli.
        api.patch("/users/me/locale", { locale: next }).catch(() => {});
      }
    } catch {
      // localStorage okunamıyorsa kaydetme adımı atlanır.
    }
  }, []);

  const applyFromAccount = useCallback((next: Locale) => {
    setLocaleState(next);
    setChosen(true);
    // Bu tarayıcıya da yazılıyor ki sonraki açılışta ilk boyama doğru dilde
    // olsun ve /auth/me beklenirken dil titremesin.
    writeStored(next);
  }, []);

  const t = useMemo(() => createTranslator(locale, en), [locale]);

  const value = useMemo<I18nValue>(
    () => ({ locale, t, setLocale, chosen, applyFromAccount }),
    [locale, t, setLocale, chosen, applyFromAccount]
  );

  return (
    <Ctx.Provider value={value}>
      <HesapDili />
      {children}
    </Ctx.Provider>
  );
}

/**
 * Hesaptaki dil tercihini uygular.
 *
 * Ayrı bir bileşen çünkü sağlayıcının kendisi kendi context'ini okuyamıyor.
 * Kullandığı /auth/me çağrısı modül düzeyinde önbelleklenmiş (bkz.
 * useCurrentUser); uygulamanın başka yerleri zaten aynı veriyi istediği için
 * bu satır fazladan istek AÇMIYOR. Oturum yokken çağrı 401 döner, kanca yutar
 * ve dil tarayıcıdan gelmeye devam eder.
 */
function HesapDili() {
  const { user } = useCurrentUser();
  const { locale } = useI18n();
  // undefined = kullanıcı henüz yüklenmedi; null = hesapta dil seçilmemiş.
  useAccountLocale(user ? (user.locale ?? null) : undefined);

  // Hesapta dil YOKSA ekranda görünen dil bir kez hesaba yazılır.
  //
  // Kayıt ekranı eskiden dili göndermiyordu; o dönemde açılmış hesaplarda ve
  // Google/Microsoft ile açılanlarda kolon boş kaldı. Sunucu tarayıcı
  // kapalıyken ürettiği her şeyde (örnek iş, ipucu e-postaları, bildirimler)
  // dili yalnızca hesaptan biliyor ve boşsa Türkçeye düşüyordu — arayüzü
  // İngilizce gören yabancı test kullanıcıları tam olarak bunu yaşadı.
  // Oturum başına bir kez; hata yutuluyor (bkz. setLocale'deki gerekçe).
  const yazildi = useRef(false);
  useEffect(() => {
    if (!user || user.locale != null || yazildi.current) return;
    yazildi.current = true;
    api.patch("/users/me/locale", { locale }).catch(() => {});
  }, [user, locale]);
  return null;
}

function useI18n(): I18nValue {
  const value = useContext(Ctx);
  if (!value) throw new Error("I18nProvider dışında dil kancası kullanıldı");
  return value;
}

/**
 * Çeviri fonksiyonu. En sık kullanılan kanca:
 *
 *   const t = useT();
 *   <button>{t("Görev ekle")}</button>
 *   <p>{t("{ad} görevi tamamladı", { ad: user.fullName })}</p>
 *   <p>{t("{n} görev", { n: count })}</p>
 */
export function useT(): Translate {
  return useI18n().t;
}

/** Dil durumu ve değiştirici — Ayarlar'daki dil kartı için. */
export function useLocale(): { locale: Locale; setLocale: (l: Locale | null) => void; chosen: boolean } {
  const { locale, setLocale, chosen } = useI18n();
  return { locale, setLocale, chosen };
}

/**
 * Hesaptaki dil tercihini arayüze uygular.
 *
 * /auth/me'yi ZATEN çeken bir yerden çağrılmalı (bkz. App.tsx) — sağlayıcının
 * kendisi istek atmıyor, çünkü giriş ekranında oturum yok ve oradaki 401
 * oturum sonlanma akışını tetiklerdi (bkz. api/client.ts).
 *
 * Yalnızca hesapta AÇIK bir tercih varsa devreye girer; yoksa tarayıcı dili
 * neyse o kalır.
 */
export function useAccountLocale(accountLocale: Locale | null | undefined) {
  const { applyFromAccount } = useI18n();
  // Hesaptan gelen dil yalnızca DEĞİŞTİĞİNDE uygulanır; geçerli dille
  // karşılaştırılmaz. Eskiden karşılaştırılıyordu ve dil değiştirmeyi tümden
  // bozuyordu: /auth/me modül düzeyinde önbelleklenmiş (bkz. useCurrentUser),
  // yani hesaptaki dil sayfa yenilenene kadar eski değerinde kalıyor.
  // Kullanıcı Türkçe'den İngilizce'ye geçtiğinde efekt "hesapta tr yazıyor,
  // ekranda en var" deyip seçimi anında geri alıyordu — dil ancak sayfa
  // yenilendikten sonra değişmiş görünüyordu.
  const uygulanan = useRef<Locale | null>(null);
  useEffect(() => {
    // Giriş ekranında dil seçildiyse o kazanır: kişi ekranda o dili görüp
    // bilerek seçti. Hesaptaki dil farklıysa (ya da boşsa) hesaba yazılır;
    // yoksa girişten hemen sonra arayüz eski dile geri dönerdi.
    if (accountLocale !== undefined) {
      let bekleyen: string | null = null;
      try {
        bekleyen = sessionStorage.getItem(GIRIS_SECIMI);
        sessionStorage.removeItem(GIRIS_SECIMI);
      } catch {
        // sessionStorage okunamıyorsa bekleyen seçim yok sayılır.
      }
      if (isLocale(bekleyen)) {
        uygulanan.current = bekleyen;
        applyFromAccount(bekleyen);
        if (bekleyen !== accountLocale) {
          setCachedLocale(bekleyen);
          api.patch("/users/me/locale", { locale: bekleyen }).catch(() => {});
        }
        return;
      }
    }
    if (!isLocale(accountLocale)) return;
    if (uygulanan.current === accountLocale) return;
    uygulanan.current = accountLocale;
    applyFromAccount(accountLocale);
  }, [accountLocale, applyFromAccount]);
}

export { cevirmenSuAn } from "./anlik";
import { cevirmenSuAn } from "./anlik";

// Ortak paketteki modül özetleri (labelOf) çevirmeni buradan alır; dil her
// çağrıda depodan okunur, yani dil değişince yeni çizimde doğru dil gelir.
setEtiketCevirmeni((metin, params) => cevirmenSuAn()(metin, params));
