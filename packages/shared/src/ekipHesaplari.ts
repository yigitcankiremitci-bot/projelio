/**
 * Ekip Hesapları (bkz. migration 130, backend modules/ekip-hesaplari).
 *
 * Şirket sahibi ya da departman yöneticisi ekibi için hesap açar: kişi, kadro
 * kaydı ve modül atamaları tek formda. Çalışana giden e-postadaki bağlantı
 * onu şifre sormadan içeri alır.
 *
 * NEDEN SHARED: kullanıcı adı önerisi formda anında görünüyor, sunucu da aynı
 * kuralla doğruluyor. İki kopya olsaydı form "uygun" deyip sunucu reddederdi.
 */

import type { DepartmentMemberRole } from "./types";

/** Formun departman/modül seçenekleri — yalnızca çağıranın atayabildikleri. */
export interface EkipHesabiSecenekleri {
  /** Çağıran şirket sahibi mi (tüm departmanlar) yoksa departman yöneticisi mi. */
  sahipMi: boolean;
  departmanlar: {
    id: string;
    name: string;
    /** Bu departmanda şirkette açık olan modüller. */
    moduller: { key: string; name: string }[];
  }[];
}

export interface EkipHesabiDepartmanSecimi {
  departmentId: string;
  role: DepartmentMemberRole;
}

export interface EkipHesabiGirdisi {
  fullName: string;
  username: string;
  email: string;
  password: string;
  /** Görevi / unvanı — kadro kaydına ve profile yazılır. */
  title?: string;
  phone?: string;
  departmanlar: EkipHesabiDepartmanSecimi[];
  /** Kayıt girebileceği modüller; departman üyeliği zaten okuma hakkı veriyor. */
  moduller: { departmentId: string; moduleKey: string }[];
  /** İlk girişte kendi şifresini belirlesin (varsayılan açık). */
  sifreDegistirmeli?: boolean;
  /** E-postaya eklenecek kısa not. */
  karsilamaNotu?: string;
  locale?: "tr" | "en";
}

export interface EkipHesabi {
  id: string;
  userId: string;
  fullName: string;
  username: string;
  email: string;
  title?: string;
  departmanlar: { id: string; name: string; role: DepartmentMemberRole }[];
  createdByName?: string;
  createdAt: string;
  davetGonderildiAt?: string;
  /** Doluysa kişi bağlantıyla içeri girdi; artık yeni bağlantı üretilemez. */
  ilkGirisAt?: string;
}

export const KULLANICI_ADI_DESENI = /^[a-z0-9_.]{3,30}$/;

const TR_HARF: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  i̇: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/**
 * Ad soyaddan kullanıcı adı önerir: "Ayşe Nur Yılmaz" → "ayse.yilmaz".
 *
 * İlk ad + soyad, çünkü ikinci adlar uzatıyor ve kişinin kendisi de çoğu
 * zaman kullanmıyor. Türkçe harfler sadeleşir (desen yalnızca a-z kabul
 * ediyor); `toLowerCase` "I"yı "i" yapar, Türkçedeki "ı" değil — bu yüzden
 * önce tr-TR küçültmesi.
 */
export function kullaniciAdiOner(adSoyad: string): string {
  const sade = adSoyad
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşüâîû]|i̇/g, (h) => TR_HARF[h] ?? h)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, "");
  const parcalar = sade.split(/\s+/).filter(Boolean);
  if (parcalar.length === 0) return "";
  const aday = parcalar.length === 1 ? parcalar[0] : `${parcalar[0]}.${parcalar[parcalar.length - 1]}`;
  return aday.slice(0, 30);
}
