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
 *
 * İki demo var: şirket (Çelikhan Endüstri) ve serbest çalışan (Oliver Hayes,
 * migration 124). Veri kümeleri ortak, sıfırlama da ortak (bkz. backend
 * modules/demo/demo-kapsam.ts).
 */
export const demoHesap = {
  email: "ceo@celikhan.test",
  password: "Celikhan2026!",
} as const;

/** Serbest çalışan demosu: müzik prodüktörü + video editörü (migration 124). */
export const serbestDemoHesap = {
  email: "oliver@hayes.test",
  password: "Freelance2026!",
} as const;

/** Verilen e-posta herhangi bir demo hesabına mı ait? */
export function demoEpostasiMi(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  return e === demoHesap.email || e === serbestDemoHesap.email;
}
