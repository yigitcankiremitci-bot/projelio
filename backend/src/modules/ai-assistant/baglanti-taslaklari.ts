import { randomUUID } from "node:crypto";
import type { PlanAdimi } from "../party/kartvizit-plani";

/**
 * Kartvizitten bağlantı TASLAKLARI ve onay koruması.
 *
 * Akış: prepare_connections planı çıkarır ve burada saklar → Lio kullanıcıya
 * gösterip rolü sorar → kullanıcı cevap yazar → confirm_connections uygular.
 *
 * Kural: taslak, oluşturulduğu turdan SONRA gelen bir kullanıcı mesajından
 * önce onaylanamaz. Modelin "kullanıcı onayladı" demesine güvenmiyoruz: Lio
 * kartviziti okuyup aynı turda kaydederse yanlış okunmuş bir ad ya da telefon
 * kullanıcı görmeden deftere girer. Web'deki onay penceresi WhatsApp'ta yok;
 * bu kural iki kanalda da aynı korumayı sağlıyor (sosyal medya taslaklarındaki
 * kuralın eşi, bkz. social-media/gelen-medya.ts).
 *
 * Bellekte durur: sunucu yeniden başlarsa taslak düşer ve Lio yeniden hazırlar
 * (kartvizit görseli zaten sohbette/medya deposunda).
 */

/** Taslağın ömrü: kullanıcı rolü bir saat içinde söylemezse yeniden hazırlanır. */
const TASLAK_OMRU_MS = 60 * 60 * 1000;

export interface BaglantiTaslagi<T> {
  id: string;
  userId: string;
  olusma: number;
  /** Oluştuktan sonra kullanıcıdan yeni bir mesaj geldi mi. */
  sunuldu: boolean;
  veri: T;
}

export class BaglantiTaslaklari<T> {
  private taslaklar = new Map<string, BaglantiTaslagi<T>>();
  private now: () => number;

  // Node'un test koşucusu "parameter property" sözdizimini çalıştıramıyor.
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  olustur(userId: string, veri: T): BaglantiTaslagi<T> {
    this.temizle();
    const t: BaglantiTaslagi<T> = { id: `bt_${randomUUID().replace(/-/g, "").slice(0, 16)}`, userId, olusma: this.now(), sunuldu: false, veri };
    this.taslaklar.set(t.id, t);
    return t;
  }

  /**
   * Kullanıcı yeni bir mesaj yazdı: o ana kadar oluşmuş taslakları "gösterildi"
   * sayar. Otomatik turlar (WhatsApp'ta "fotoğraf geldi" turu) bunu ÇAĞIRMAZ —
   * onlar kullanıcının cevabı değil.
   */
  yeniMesaj(userId: string): void {
    for (const t of this.taslaklar.values()) if (t.userId === userId) t.sunuldu = true;
  }

  al(userId: string, id: string): BaglantiTaslagi<T> | undefined {
    this.temizle();
    const t = this.taslaklar.get(id);
    return t && t.userId === userId ? t : undefined;
  }

  sil(id: string): void {
    this.taslaklar.delete(id);
  }

  /** Kullanıcının taslaklarındaki her veri (yeniden hazırlıkta önceki taslağın görseli için). */
  kullanicininVerileri(userId: string): T[] {
    this.temizle();
    return [...this.taslaklar.values()].filter((t) => t.userId === userId).map((t) => t.veri);
  }

  /**
   * Kullanıcının henüz gösterilmemiş (bu turda hazırlanmış) taslağı var mı.
   * WhatsApp köprüsü cevabı bu durumda KESMEZ: kullanıcı onaylayacağı listenin
   * tamamını görmeli.
   */
  sunulmamisVar(userId: string): boolean {
    this.temizle();
    for (const t of this.taslaklar.values()) if (t.userId === userId && !t.sunuldu) return true;
    return false;
  }

  private temizle(): void {
    const sinir = this.now() - TASLAK_OMRU_MS;
    for (const [id, t] of this.taslaklar) if (t.olusma < sinir) this.taslaklar.delete(id);
  }
}

export interface BaglantiTaslakVerisi {
  scope: { organizationId?: string; jobId?: string };
  departmentId?: string;
  plan: PlanAdimi[];
  /**
   * Kartvizit görsellerinin KOPYASI (dosya kimliği → baytlar). Taslak
   * hazırlanınca sohbetteki dosyalar bırakılıyor — yoksa görsel kullanıcının
   * cevap turunda modele yeniden gönderilip yeniden ücretleniyordu. Onayda
   * kırpma ve karta ekleme bu kopyadan yapılır.
   */
  gorseller: Record<string, { name: string; mimeType: string; buffer: Buffer }>;
}

/** Süreç genelinde tek depo: Lio yazar, WhatsApp köprüsü cevabı keserken sorar. */
export const baglantiTaslaklari = new BaglantiTaslaklari<BaglantiTaslakVerisi>();
