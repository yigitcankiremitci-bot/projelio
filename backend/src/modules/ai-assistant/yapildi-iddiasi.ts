/**
 * "Yaptım" iddiası denetimi: model aracı çağırmadan işi yapmış gibi konuşuyor mu.
 *
 * Saf dosya (bkz. ai-sheet-import.ts gibi): veritabanı ve model taklidi
 * gerektirmeden test edilebilsin.
 *
 * NEDEN: 2026-09-28'de bir kullanıcı "buradaki tüm yapılacakları tamamlandıya
 * çek" dedi; Lio tek model turunda, HİÇBİR araç çağırmadan "6 kart taşındı"
 * yazdı. Kullanıcı "olmadı" dedikçe aynısı iki kez daha oldu. Kredi defteri
 * bunu gösteriyordu (59 bin giriş tokenı = tek tur, 31-48 çıktı tokenı).
 * İstemdeki "aracı çağırmadan yaptım deme" kuralı bir RİCA; bu denetim onu
 * sunucuda zorunlu kılar: iddia var ama bu koşuda hiçbir yazma aracı
 * çalışmadıysa cevap kullanıcıya gitmez, model bir kez geri çevrilir.
 */

// Birinci tekil şahıs geçmiş zaman ("taşıdım") ve iş bildiren edilgen kalıplar
// ("taşındı", "tamamlandıya çekildi"). Kelime sınırı Unicode harfe göre: JS'in
// \b'si yalnızca ASCII tanır, "ş" ile biten kelimede yanlış sınır koyardı.
const IDDIA_KOKLERI = [
  "taşıdım",
  "taşındı",
  "aldım",
  "çektim",
  "çekildi",
  "ekledim",
  "işaretledim",
  "işaretlendi",
  "tamamladım",
  "sildim",
  "arşivledim",
  "güncelledim",
  "oluşturdum",
  "kaydettim",
  "planladım",
  "kurdum",
  "atadım",
  "değiştirdim",
  "iptal ettim",
  "gönderdim",
  // Edilgen bildirimler: 2026-09-24'te "Eklendi. 19:00-19:15 … bloğu bugüne
  // eklendi" tek turda, araçsız yazıldı. "tamamlandı" bilerek YOK: bir kartın
  // durumunu anlatırken de geçer ("görev tamamlandı durumda").
  "eklendi",
  "kuruldu",
  "oluşturuldu",
  "kaydedildi",
  "güncellendi",
];

// "Kontrol ettim / baktım": okuma iddiası. Hiçbir araç (okuma dahil) çalışmadan
// söylenirse uydurmadır — 2026-09-24'te Lio takvime hiç bakmadan "kontrol
// ettim, 8 blok takvimde var" dedi.
const KONTROL_IDDIASI = /(?<![\p{L}])(kontrol ettim|baktım|kontrol edildi|doğruladım)(?![\p{L}])/u;

const IDDIA = new RegExp(`(?<![\\p{L}])(${IDDIA_KOKLERI.join("|")})(?![\\p{L}])`, "iu");
// İngilizce arayüz dili için de aynı denetim (Lio kullanıcının dilinde cevap verir).
const IDDIA_EN = /\b(I(?:'ve| have)? (?:moved|marked|added|created|deleted|archived|updated|scheduled|saved|completed|cancelled|assigned))\b/i;

/** Metin bir iş yapıldığını iddia ediyor mu. */
export function yapildiIddiasiVar(metin: string): boolean {
  // Türkçe küçültme şart: regex'in /i bayrağı "I"yı "ı"ya indirmez ("TAŞIDIM").
  return IDDIA.test(metin.toLocaleLowerCase("tr-TR")) || IDDIA_EN.test(metin);
}

/**
 * Geri çevirme kararı: metin iddia içeriyor ve bu koşuda hiçbir YAZMA aracı
 * çalışmadıysa. Okuma araçları (get_todo_board vb.) sayılmaz — panoyu okuyup
 * "taşıdım" demek tam olarak yakalanmak istenen durum.
 */
export function aracsizIddiaMi(metin: string, calisanAraclar: string[], yazmaAraclari: Set<string>): boolean {
  if (yapildiIddiasiVar(metin) && !calisanAraclar.some((ad) => yazmaAraclari.has(ad))) return true;
  // Okuma iddiası: herhangi bir araç çalıştıysa bakmış sayılır.
  return calisanAraclar.length === 0 && KONTROL_IDDIASI.test(metin.toLocaleLowerCase("tr-TR"));
}

// dil:atla-baslangic — modele giden yönlendirme, kullanıcıya görünmüyor.
export const ARACSIZ_IDDIA_UYARISI =
  "Az önceki cevabında bir işi YAPTIĞINI ya da bir şeyi KONTROL ETTİĞİNİ söyledin ama bu istekte gerekli aracı " +
  "çağırmadın; yani hiçbir şey değişmedi ve hiçbir şeye bakılmadı. (Bu istekte yapılmamış, geçmişte olmuş bir şeyi " +
  "anlatıyorsan bunu açıkça geçmiş olarak söyle.) Şimdi gerçekten yap: gerekiyorsa önce ilgili veriyi oku (ör. get_todo_board), sonra değişikliği " +
  "yapan aracı çağır. Yapamıyorsan bunu açıkça söyle. Araç sonucu gelmeden \"yaptım\" deme.";
// dil:atla-bitis
