/**
 * ÇEVRİMDIŞI ÇALIŞMANIN SAF KARARLARI.
 *
 * Telefonda bağlantı sık sık yarım kopuyor (asansör, metro, zayıf çekim).
 * Eskiden her ekran o an sunucuya gidiyor, ulaşamayınca boş kalıyor ya da
 * 30 sn dönen bir spinner gösteriyordu — uygulama "çöktü" gibi görünüyordu.
 * Çözüm iki parça: (1) başarılı her GET yanıtı cihazda saklanır, ağ yokken o
 * gösterilir; (2) bilerek işaretlenmiş küçük yazmalar (ör. görevi tamamlandı
 * yapmak) kuyruğa alınıp bağlantı gelince sırayla gönderilir.
 *
 * Bu dosyada yalnızca kararlar var — tarayıcıya, IndexedDB'ye, ağa dokunan
 * kısım `cevrimdisiDepo.ts`, istemciye bağlandığı yer `api/client.ts`.
 */

/** Saklanacak en çok yanıt sayısı; aşılınca en eski kullanılanlar silinir. */
export const ONBELLEK_TAVANI = 400;

/**
 * Bundan büyük yanıt saklanmaz (karakter). Dev listeler (tüm dosyalar, yönetici
 * dökümleri) cihazı doldurup diğer her şeyi tahliye ettirirdi; çevrimdışı
 * işe yarayan ekranlar zaten bunun çok altında.
 */
export const YANIT_BOYUT_TAVANI = 2_000_000;

/**
 * Saklı bir yanıtı olan GET'in sunucuyu ne kadar bekleyeceği.
 *
 * NEDEN AYRI: "kısmen kopuk" bağlantıda istek hata vermiyor, yalnızca asılı
 * kalıyor; 30 sn'lik genel zaman aşımına (client.ts) kadar ekran boş durur.
 * Elde saklı bir yanıt varken bu kadar beklemenin anlamı yok: 6 sn sonra eldeki
 * gösterilir, istek arkada sürer ve yetişirse bir dahaki açılış için saklanır.
 */
export const KISMI_BAGLANTI_BEKLEME_MS = 6_000;

/** Kuyruğa alınabilecek en çok yazma. Sınırsız büyüyen bir kuyruk dönüşte saatlerce istek atardı. */
export const KUYRUK_TAVANI = 200;

/** Bu kadar eski bekleyen yazma artık gönderilmez — bir haftalık "tamamlandı" işareti bayattır. */
export const KUYRUK_OMRU_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Bu yol cihazda saklanabilir mi?
 *
 * Şifre, erişim jetonu ve giriş bilgisi taşıyan uçlar ASLA saklanmaz: Hesaplar
 * modülü sırları yalnızca istendiği an ve yalnızca geçiş anahtarı kilidinden
 * sonra veriyor (bkz. backend hesap-kimlik.service.ts) — kopyasını cihaza
 * yazmak o kilidi anlamsız kılar. Yönetici uçları da saklanmaz: hem büyük hem
 * çevrimdışı işe yaramaz.
 */
export function onbellegeAlinirMi(path: string): boolean {
  const yol = path.split("?")[0].toLowerCase();
  if (/credential|token|secret|password|sifre|kimlik|passkey|reveal/.test(yol)) return false;
  if (yol.startsWith("/admin") || yol.startsWith("/ai/admin")) return false;
  // Oturumun kendisi (/auth/me hariç) ve ödeme akışı anlık olmalı.
  if (yol.startsWith("/auth/") && yol !== "/auth/me") return false;
  if (yol.startsWith("/billing/")) return false;
  return true;
}

/**
 * Bu durum kodu "sunucuya ulaşılamadı" mı demek?
 *
 * 0 = istek hiç cevap almadı (client.ts konvansiyonu). 502/503/504 = önümüzdeki
 * vekil (Caddy) cevap verdi ama arkadaki uygulama yok — kullanıcı açısından
 * bağlantı kopukluğuyla aynı şey, ve sunucu yeniden başlarken (her yayında
 * birkaç saniye) eldeki veriyi göstermek boş ekrandan iyidir.
 */
export function sunucuyaUlasilamadiMi(status: number): boolean {
  return status === 0 || status === 502 || status === 503 || status === 504;
}

/**
 * Bekleyen bir yazmanın gönderim sonucu ne yapılsın?
 *
 * - tamam: gönderildi, kuyruktan çıkar.
 * - beklet: hâlâ ulaşılamıyor (ya da oturum düşmüş) — kuyrukta kalsın, sıradaki
 *   de denenmesin; sıra korunmalı, "tamamlandı → geri al" ters sırada giderse
 *   sonuç tersine döner.
 * - at: sunucu ulaştı ve REDDETTİ (kayıt silinmiş, yetki kalkmış). Tekrar denemek
 *   aynı cevabı alır; kuyruğu sonsuza dek tıkamasın diye atılır ve kullanıcıya
 *   sayısı gösterilir.
 */
export function kuyrukKarari(status: number): "tamam" | "beklet" | "at" {
  if (status >= 200 && status < 300) return "tamam";
  if (sunucuyaUlasilamadiMi(status) || status === 401 || status === 429) return "beklet";
  return "at";
}

/**
 * Jetonun sahibi (JWT `sub`). Saklanan veri kullanıcıya göre ayrılıyor: aynı
 * telefonda hesap değiştiren biri öncekinin işlerini görmemeli.
 *
 * İmza burada DOĞRULANMIYOR ve gerekmiyor: değer yalnızca cihazdaki anahtarın
 * önekidir, hiçbir yetki kararı ona dayanmıyor.
 */
export function oturumSahibi(token: string | null): string | null {
  if (!token) return null;
  const parca = token.split(".")[1];
  if (!parca) return null;
  try {
    const json = atob(parca.replace(/-/g, "+").replace(/_/g, "/"));
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

export function onbellekAnahtari(sahip: string, path: string): string {
  return `${sahip}|${path}`;
}

export interface BekleyenYazma {
  method: "PATCH";
  path: string;
  body: unknown;
  /** Kuyruğa girdiği an (ms). */
  zaman: number;
}

/**
 * Kuyruğa yeni yazma ekler.
 *
 * Aynı yola giden ve AYNI hedefi değiştiren önceki bekleyen yazma düşürülür:
 * çevrimdışıyken bir görevi beş kez işaretleyip kaldırmak sunucuya beş istek
 * değil, son hâli göndermeli. Gövde karşılaştırması `itemId`/`id` üzerinden —
 * kuyruklu uçlar (bkz. client.ts patchKuyruklu) değeri SET eden, sırası önemli
 * olmayan uçlar olmak zorunda; o yüzden son yazma öncekilerin hepsini kapsar.
 */
export function kuyrugaEkle(kuyruk: BekleyenYazma[], yeni: BekleyenYazma): BekleyenYazma[] {
  const hedef = hedefKimligi(yeni);
  const kalan = kuyruk.filter((k) => !(k.path === yeni.path && hedefKimligi(k) === hedef));
  const sonuc = [...kalan, yeni];
  return sonuc.length > KUYRUK_TAVANI ? sonuc.slice(sonuc.length - KUYRUK_TAVANI) : sonuc;
}

function hedefKimligi(y: BekleyenYazma): string {
  const b = y.body as { itemId?: unknown; id?: unknown } | null;
  const kimlik = b && typeof b === "object" ? (b.itemId ?? b.id) : undefined;
  // Gövdede kimlik yoksa hedef yolun kendisidir (/tasks/:id gibi).
  return typeof kimlik === "string" ? kimlik : "";
}

/** Ömrünü doldurmuş bekleyen yazmaları ayıklar. */
export function bayatlariAyikla(kuyruk: BekleyenYazma[], simdi: number): BekleyenYazma[] {
  return kuyruk.filter((k) => simdi - k.zaman < KUYRUK_OMRU_MS);
}

/**
 * Bekleyen yazmaları saklı bir yanıtın üstüne uygular.
 *
 * NEDEN: çevrimdışıyken bir görevi tamamlayıp başka sayfaya gidip dönen
 * kullanıcı saklı (eski) listeyi görüyordu — görev "geri açılmış" gibi. Kuyruk
 * gönderilene dek saklı veri bekleyen değişikliği yansıtmalı.
 *
 * Hedef: gövdedeki itemId/id, yoksa yolun ikinci parçası (/tasks/:id/status).
 * Yalnızca nesnede ZATEN olan alanlar yazılır — gövde ile kayıt şekli her uçta
 * aynı değil, var olmayan alanı eklemek ekranlara beklenmedik veri sokardı.
 */
export function bekleyenleriUygula<T>(veri: T, kuyruk: BekleyenYazma[]): T {
  if (!kuyruk.length) return veri;
  const degisimler = kuyruk
    .map((y) => {
      const b = (y.body && typeof y.body === "object" ? y.body : {}) as Record<string, unknown>;
      const hedef = hedefKimligi(y) || y.path.split("?")[0].split("/")[2] || "";
      const { itemId: _i, id: _d, source: _s, ...alanlar } = b;
      return { hedef, alanlar };
    })
    .filter((d) => d.hedef);
  if (!degisimler.length) return veri;
  const gez = (dugum: unknown): void => {
    if (Array.isArray(dugum)) {
      dugum.forEach(gez);
      return;
    }
    if (!dugum || typeof dugum !== "object") return;
    const nesne = dugum as Record<string, unknown>;
    for (const d of degisimler) {
      if (nesne.id !== d.hedef && nesne.itemId !== d.hedef) continue;
      for (const [k, v] of Object.entries(d.alanlar)) if (k in nesne) nesne[k] = v;
    }
    Object.values(nesne).forEach(gez);
  };
  gez(veri);
  return veri;
}
