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
};

export function isSessionPayload(payload: Partial<SessionJwtPayload> | null | undefined): boolean {
  return Boolean(payload) && !payload!.typ;
}
