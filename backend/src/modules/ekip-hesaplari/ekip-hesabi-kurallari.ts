import type { EkipHesabiGirdisi, EkipHesabiSecenekleri } from "@projelio/shared";
import { KULLANICI_ADI_DESENI } from "@projelio/shared";

/**
 * Ekip Hesapları'nın saf kuralları: kim hangi departmana hesap açabilir ve
 * formdan gelen seçim geçerli mi.
 *
 * Veritabanı sorguları serviste kalır; burada yalnızca "bu gerçekler
 * verildiğinde ne olur" sorusu yanıtlanır (module-access.ts ile aynı desen).
 */

const ROLLER = ["manager", "employee", "subcontractor"] as const;
const EPOSTA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Çağıranın hesap açabileceği departmanlar.
 *
 * Şirket sahibi hepsine; departman yöneticisi YALNIZCA yönettiklerine. Bir
 * yöneticinin başka bir departmana kişi sokabilmesi, o departmanın
 * modüllerine (bütçe, müşteri, hesap şifreleri) okuma hakkı dağıtabilmesi
 * demek olurdu — mevcut kadro davetinin kuralıyla da aynı (bkz.
 * DepartmentMembersService.assertOrgOwner).
 */
export function atanabilirDepartmanlar(
  tumDepartmanlar: string[],
  gercekler: { sahipMi: boolean; yonettigiDepartmanlar: string[] }
): string[] {
  if (gercekler.sahipMi) return [...tumDepartmanlar];
  const yonetilen = new Set(gercekler.yonettigiDepartmanlar);
  return tumDepartmanlar.filter((id) => yonetilen.has(id));
}

/**
 * Formdan gelen girdiyi doğrular. Hata varsa kullanıcıya gösterilecek mesajı,
 * yoksa null döner.
 *
 * Departman ve modül seçimi SEÇENEKLERE karşı doğrulanır — formun gösterdiği
 * listeyle aynı kaynak. İstemci listede olmayan bir departman ya da modül
 * gönderirse (elle yazılmış istek) reddedilir.
 */
export function girdiyiDogrula(girdi: EkipHesabiGirdisi, secenekler: EkipHesabiSecenekleri): string | null {
  const ad = typeof girdi.fullName === "string" ? girdi.fullName.trim() : "";
  if (ad.length < 2 || ad.length > 120) return "Ad soyad 2-120 karakter olmalı.";

  const kullaniciAdi = typeof girdi.username === "string" ? girdi.username.trim().replace(/^@/, "").toLowerCase() : "";
  if (!KULLANICI_ADI_DESENI.test(kullaniciAdi)) {
    return "Kullanıcı adı 3-30 karakter olmalı; sadece küçük harf, rakam, nokta ve alt çizgi içerebilir.";
  }

  const eposta = typeof girdi.email === "string" ? girdi.email.trim() : "";
  if (!EPOSTA.test(eposta) || eposta.length > 254) return "Geçerli bir e-posta adresi gir.";

  // bcrypt 72 baytta keser (bkz. common/password.util.ts); asıl bayt kontrolü hashPassword'de.
  if (typeof girdi.password !== "string" || girdi.password.length < 8 || girdi.password.length > 72) {
    return "Şifre 8-72 karakter olmalı.";
  }

  if (girdi.title != null && (typeof girdi.title !== "string" || girdi.title.length > 120)) {
    return "Görev en fazla 120 karakter olabilir.";
  }
  if (girdi.phone != null && (typeof girdi.phone !== "string" || girdi.phone.length > 40)) {
    return "Telefon en fazla 40 karakter olabilir.";
  }
  if (girdi.karsilamaNotu != null && (typeof girdi.karsilamaNotu !== "string" || girdi.karsilamaNotu.length > 1000)) {
    return "Not en fazla 1000 karakter olabilir.";
  }

  if (!Array.isArray(girdi.departmanlar) || girdi.departmanlar.length === 0) {
    return "En az bir departman seç.";
  }
  const departmanlar = new Map(secenekler.departmanlar.map((d) => [d.id, d]));
  const secilen = new Set<string>();
  for (const secim of girdi.departmanlar) {
    if (!secim || !departmanlar.has(secim.departmentId)) return "Bu departmana hesap açma yetkin yok.";
    if (!(ROLLER as readonly string[]).includes(secim.role)) return "Geçersiz kadro rolü.";
    if (secilen.has(secim.departmentId)) return "Aynı departman iki kez seçilmiş.";
    secilen.add(secim.departmentId);
  }

  if (!Array.isArray(girdi.moduller)) return "Modül seçimi geçersiz.";
  for (const m of girdi.moduller) {
    if (!m || !secilen.has(m.departmentId)) return "Modül, seçilen departmanlardan birine ait olmalı.";
    const departman = departmanlar.get(m.departmentId)!;
    if (!departman.moduller.some((dm) => dm.key === m.moduleKey)) {
      return "Seçilen modül bu departmanda açık değil.";
    }
  }
  return null;
}

/** Aynı (departman, modül) çifti iki kez gelirse tek atama yazılır. */
export function tekilModuller(moduller: { departmentId: string; moduleKey: string }[]) {
  const gorulen = new Set<string>();
  return moduller.filter((m) => {
    const anahtar = `${m.departmentId}:${m.moduleKey}`;
    if (gorulen.has(anahtar)) return false;
    gorulen.add(anahtar);
    return true;
  });
}
