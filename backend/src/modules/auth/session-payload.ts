/**
 * Bir JWT yükü oturum jetonuna mı ait?
 *
 * Uygulamada oturum DIŞI jetonlar da aynı sırla (JWT_SECRET) imzalanıyor:
 * dosya erişimi (`file_access`, bkz. files.controller.ts) ve OAuth `state`
 * jetonları (`google_oauth`, `microsoft_oauth`, `instagram_oauth`). Bunların
 * hepsi URL query string'inde dolaşıyor — yani sunucu loglarına, referrer
 * başlığına ve tarayıcı geçmişine düşüyor. Ayrım yapılmazsa tek bir dosyaya
 * açılmış 5 dakikalık bir jeton, sızdığında API'nin tamamı için geçerli bir
 * oturum jetonuna dönüşür.
 *
 * Ayrım `typ` alanıyla: oturum jetonlarında (auth.service.ts,
 * google-auth.service.ts, habie.service.ts) bu alan YOKTUR. Yeni bir özel amaçlı
 * jeton üretirken `typ` koymayı unutma — koymazsan oturum jetonu olur.
 *
 * Dekoratörlü jwt.strategy.ts'ten ayrı bir dosyada, çünkü test koşucusu
 * (node --test, tip silme) dekoratör içeren dosyaları yükleyemiyor.
 */
export type SessionJwtPayload = {
  sub: string;
  email: string;
  role: string;
  typ?: string;
  /** İlk girişin yapıldığı an (saniye). Yenilemelerde DEĞİŞMEZ — bkz. MUTLAK ÖMÜR. */
  loginAt?: number;
  /**
   * Dış bir uygulamaya (Habie) kullanıcı adına verilmiş, kısa ömürlü devir jetonu.
   *
   * Bu jeton normal bir oturum jetonudur (typ taşımaz, API'ye erişir) ama ömrü
   * bilerek kısa tutulmuştur. YENİLENEMEZ: aksi halde 30 dakikalık devir,
   * /auth/refresh çağrılarak tam ömürlü bir oturuma çevrilebilirdi.
   */
  agent?: boolean;
};

export function isSessionPayload(payload: Partial<SessionJwtPayload> | null | undefined): boolean {
  return Boolean(payload) && !payload!.typ;
}


/**
 * MUTLAK OTURUM ÖMRÜ.
 *
 * SORUN: oturum "kayan" (bkz. apps/web/src/lib/session.ts) — uygulama her
 * açıldığında /auth/refresh çağrılıp jeton ömrü baştan başlıyor. Düzenli kullanan
 * kullanıcı için doğru davranış bu, ama bir yan etkisi vardı: jetonu çalan biri de
 * aynı ucu haftada bir çağırarak oturumu SONSUZA KADAR uzatabiliyordu. Jeton
 * localStorage'da durduğu ve sunucuda iptal listesi olmadığı için, kullanıcı
 * şifresini değiştirse bile o oturum yaşamaya devam ederdi.
 *
 * ÇÖZÜM: jeton İLK girişin zamanını (loginAt) taşıyor ve yenilemelerde bu değer
 * aynen aktarılıyor. Yenileme, ilk girişin üzerinden bu süre geçtiyse reddediliyor;
 * kullanıcı yeniden giriş yapmak zorunda. Durum tutmadan (veritabanı okumadan)
 * çalışır — jwt.strategy her istekte veritabanına gitmiyor, gitseydi her API
 * çağrısına bir Supabase gidiş-dönüşü eklenirdi.
 *
 * ETKİSİ: düzenli kullanan bir kullanıcı 30 günde bir yeniden giriş yapar.
 * Çalınmış bir jetonun ömrü de aynı süreyle sınırlanır.
 *
 * SINIRI: kontrol yalnızca yenileme anında yapılıyor, her istekte değil. Bu yüzden
 * gerçek üst sınır 30 gün + bir jeton ömrü (JWT_EXPIRES_IN, varsayılan 7 gün)
 * kadar olabilir. Her istekte kontrol etmek durum tutmayı gerektirirdi.
 */
export const ABSOLUTE_SESSION_MAX_MS = 30 * 24 * 60 * 60 * 1000;

/** Saniye cinsinden şu an — JWT alanları saniye kullanır (iat/exp ile aynı birim). */
export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * İlk girişin üzerinden mutlak sınırdan fazla geçtiyse true.
 *
 * loginAt YOKSA false döner. Bu bilinçli: bu alan eklenmeden önce üretilmiş
 * jetonlar sahada duruyor ve onları "çok eski" sayıp herkesi bir anda çıkışa
 * düşürmek istemiyoruz. O jetonlar ilk yenilemede loginAt kazanır ve sayaç
 * oradan başlar.
 */
export function absoluteSessionExpired(loginAt: number | undefined, now = nowInSeconds()): boolean {
  if (!loginAt) return false;
  return (now - loginAt) * 1000 > ABSOLUTE_SESSION_MAX_MS;
}
