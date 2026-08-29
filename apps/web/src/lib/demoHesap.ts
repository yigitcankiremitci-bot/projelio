/**
 * Herkese açık demo hesabı.
 *
 * NEDEN KODUN İÇİNDE, .env'de DEĞİL: bu bilgiler zaten giriş ekranında ve
 * tanıtım sitesinde yayımlanıyor — gizli değil, bilerek herkese açık. Sır
 * olmadığı için ortam değişkenine taşımanın koruyucu bir faydası yok; tek
 * yerde durması ki ekranlar birbirinden ayrışmasın.
 *
 * ŞİFRE DEĞİŞİRSE üç yeri birlikte güncelle:
 *   1. Veritabanındaki users.password_hash (bcrypt, 12 tur — bkz. password.util.ts)
 *   2. Burası
 *   3. landing/src/lib/site.ts (depo kokunden) içindeki `site.demo`
 */
export const demoHesap = {
  email: "ceo@celikhan.test",
  password: "Celikhan2026!",
} as const;
