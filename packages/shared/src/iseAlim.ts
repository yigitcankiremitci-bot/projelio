/**
 * İşe alım daveti (bkz. migration 143, backend modules/ise-alim).
 *
 * Şirket sahibi ya da departman yöneticisi, Projelio'da hesabı OLAN birini tek
 * formla şirkete davet eder: pozisyon, iş tanımı, departmanlar (rolüyle) ve
 * modüller. Kişi kabul edene kadar kadroya hiçbir şey yazılmaz.
 *
 * Form seçenekleri Ekip Hesapları'yla ORTAK (EkipHesabiSecenekleri): kim hangi
 * departmana kişi alabilir sorusunun iki ayrı cevabı olmasın.
 */

import type { DepartmentMemberRole } from "./types";
import type { EkipHesabiDepartmanSecimi } from "./ekipHesaplari";

export type IseAlimDurumu = "pending" | "accepted" | "rejected" | "cancelled";

export interface IseAlimGirdisi {
  userId: string;
  /** Pozisyon / unvan — kabulde kadro kaydının title alanına yazılır. */
  pozisyon?: string;
  /** Serbest metin: sorumluluklar, çalışma düzeni. Kişi davette okur. */
  isTanimi?: string;
  departmanlar: EkipHesabiDepartmanSecimi[];
  moduller: { departmentId: string; moduleKey: string }[];
}

export interface IseAlimDaveti {
  id: string;
  organizationId: string;
  organizationName: string;
  userId: string;
  fullName: string;
  username?: string;
  invitedByName?: string;
  pozisyon?: string;
  isTanimi?: string;
  departmanlar: { id: string; name: string; role: DepartmentMemberRole }[];
  moduller: { departmentId: string; key: string; name: string }[];
  status: IseAlimDurumu;
  createdAt: string;
  respondedAt?: string;
}

/** Şirketin ekibi: onaylı kadrosu olan herkes, departmanlarıyla. */
export interface SirketEkibiUyesi {
  userId: string;
  fullName: string;
  username?: string;
  avatarUrl?: string;
  /** Kadro kayıtlarından ilk dolu pozisyon. */
  title?: string;
  /**
   * Şirketin sahibi. Kadro kaydı olmasa da ekipte görünür: kurucu kendi
   * şirketinin ekibinde yokmuş gibi duruyordu. Departmanı yoksa `departmanlar` boş.
   */
  kurucu?: boolean;
  departmanlar: { id: string; name: string; role: DepartmentMemberRole }[];
}

export interface SirketEkibi {
  uyeler: SirketEkibiUyesi[];
  /** Yalnızca işe alım yetkisi olana dolu gelir. */
  bekleyenDavetler: IseAlimDaveti[];
  /** Çağıran "İşe al" yapabilir mi (sahip ya da departman yöneticisi). */
  iseAlabilir: boolean;
}
