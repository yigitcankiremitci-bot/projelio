import type { DepartmentMemberRole, EkipHesabiSecenekleri, IseAlimGirdisi } from "@projelio/shared";
import { kadroSeciminiDogrula } from "../ekip-hesaplari/ekip-hesabi-kurallari";

/**
 * İşe alım davetinin saf kuralları (bkz. migration 143).
 *
 * Veritabanı sorguları serviste kalır; burada yalnızca "bu gerçekler
 * verildiğinde ne olur" sorusu yanıtlanır (ekip-hesabi-kurallari.ts ile aynı
 * desen).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Formdan gelen davetin doğrulaması. Hata varsa kullanıcıya gösterilecek mesaj, yoksa null. */
export function davetGirdisiniDogrula(girdi: IseAlimGirdisi, secenekler: EkipHesabiSecenekleri): string | null {
  if (!girdi || typeof girdi.userId !== "string" || !UUID.test(girdi.userId)) return "İşe alınacak kişiyi seç.";
  if (girdi.pozisyon != null && (typeof girdi.pozisyon !== "string" || girdi.pozisyon.length > 120)) {
    return "Pozisyon en fazla 120 karakter olabilir.";
  }
  if (girdi.isTanimi != null && (typeof girdi.isTanimi !== "string" || girdi.isTanimi.length > 2000)) {
    return "İş tanımı en fazla 2000 karakter olabilir.";
  }
  return kadroSeciminiDogrula(girdi.departmanlar, girdi.moduller, secenekler, "Bu departmana kişi alma yetkin yok.");
}

/** Kişinin şirketteki mevcut kadro satırı (removed hariç). */
export interface MevcutKadro {
  id: string;
  departmentId: string;
  status: string;
}

/** Kişinin şirketteki mevcut modül satırı (removed_at boş olanlar). */
export interface MevcutModul {
  id: string;
  departmentId: string | null;
  moduleKey: string;
  status: string;
}

export interface KabulPlani {
  kadroEkle: { departmentId: string; role: DepartmentMemberRole }[];
  /** Bekleyen/reddedilmiş eski davet satırları: onaylıya çevrilir. */
  kadroGuncelle: { id: string; role: DepartmentMemberRole }[];
  modulEkle: { departmentId: string; moduleKey: string }[];
  modulGuncelle: string[];
}

/**
 * Kabulde hangi satırın eklenip hangisinin güncelleneceği.
 *
 * Kişi zaten onaylı olduğu bir departmana/modüle yeniden "işe alınırsa" o satıra
 * DOKUNULMAZ: rolünü yöneticinin daveti sessizce düşürmesin (yönetici → çalışan)
 * — rol değişikliği departmanın Ekip sekmesinden, bilerek yapılır. Bekleyen ya
 * da reddedilmiş eski bir davet satırı varsa yenisi eklenmez, o onaylanır: tekil
 * indeks (department_members_dept_user_uniq) ikinci satırı zaten reddederdi.
 */
export function kabulPlani(
  davet: Pick<IseAlimGirdisi, "departmanlar" | "moduller">,
  mevcutKadro: MevcutKadro[],
  mevcutModul: MevcutModul[]
): KabulPlani {
  const plan: KabulPlani = { kadroEkle: [], kadroGuncelle: [], modulEkle: [], modulGuncelle: [] };

  for (const secim of davet.departmanlar) {
    const satir = mevcutKadro.find((k) => k.departmentId === secim.departmentId);
    if (!satir) plan.kadroEkle.push({ departmentId: secim.departmentId, role: secim.role });
    else if (satir.status !== "approved" && satir.status !== "leave_pending") {
      plan.kadroGuncelle.push({ id: satir.id, role: secim.role });
    }
  }

  const gorulen = new Set<string>();
  for (const m of davet.moduller) {
    const anahtar = `${m.departmentId}:${m.moduleKey}`;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    const satir = mevcutModul.find((s) => s.departmentId === m.departmentId && s.moduleKey === m.moduleKey);
    if (!satir) plan.modulEkle.push({ departmentId: m.departmentId, moduleKey: m.moduleKey });
    else if (satir.status !== "approved" && satir.status !== "removed") plan.modulGuncelle.push(satir.id);
  }
  return plan;
}

/**
 * Davetteki seçim, kabul anında hâlâ geçerli mi: arada bir departman silinmiş ya
 * da arşivlenmiş, bir modül kapatılmış olabilir. Geçersiz parçalar sessizce
 * düşer; HİÇ departman kalmadıysa kabul anlamsızdır (şirkete erişim kadrodan
 * geliyor) ve null döner.
 */
export function gecerliSecim(
  davet: Pick<IseAlimGirdisi, "departmanlar" | "moduller">,
  aktifDepartmanlar: Set<string>,
  acikModuller: Set<string>
): Pick<IseAlimGirdisi, "departmanlar" | "moduller"> | null {
  const departmanlar = davet.departmanlar.filter((d) => aktifDepartmanlar.has(d.departmentId));
  if (departmanlar.length === 0) return null;
  const kalan = new Set(departmanlar.map((d) => d.departmentId));
  const moduller = davet.moduller.filter((m) => kalan.has(m.departmentId) && acikModuller.has(m.moduleKey));
  return { departmanlar, moduller };
}
