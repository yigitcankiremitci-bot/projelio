/**
 * Bildirime basınca gidilecek adres.
 *
 * Sipariş bildirimleri 2026-11-11'den beri Tahsilat sekmesini o sipariş açık
 * getiriyor (`?sekme=tahsilat&siparis=<id>`, bkz. backend
 * siparisBildirimBaglantisi). Ondan önce yazılmış bildirimlerin bağlantısı
 * yalnızca modülün kendisiydi ve kişinin açılış sekmesine (çoğu zaman
 * Müşteriler) düşüyordu; kullanıcı yayından sonra eski bildirime basıp "olmamış"
 * dedi. Eski bildirimde sipariş kimliği yok ama gövdesi sipariş numarasıyla
 * başlıyor ("NS-10007 · 1.014,30 TRY — onay bekliyor"): numarayla bulunur.
 */
export function bildirimBaglantisi(n: { type: string; link?: string | null; body?: string | null }): string | undefined {
  if (!n.link) return undefined;
  if (n.type !== "web_order_received") return n.link;
  if (/[?&](siparis|siparisNo)=/.test(n.link) || !/\/modules\/crm_musteri$/.test(n.link)) return n.link;
  const q = new URLSearchParams({ sekme: "tahsilat" });
  const no = /^(.+?) · /.exec(n.body ?? "")?.[1]?.trim();
  if (no) q.set("siparisNo", no);
  return `${n.link}?${q.toString()}`;
}
