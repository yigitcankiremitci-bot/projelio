/**
 * Aynı anahtar için aynı anda yalnızca BİR işin çalışmasını sağlar.
 *
 * NEDEN VAR: OAuth jetonu yenilemede bir yarış vardı. Ön yüz bir Drive klasörü
 * açarken paralel birkaç istek atıyor; jetonun süresi o anda dolmuşsa hepsi
 * önbellekte bulamayıp AYRI AYRI yenileme başlatıyordu. Google bunu tolere
 * ediyor ama Azure AD kısıtlama uyguluyor, ayrıca refresh token rotasyonu olan
 * sağlayıcılarda SON YAZAN KAZANIYOR: diğerlerinin aldığı jeton geçersizleşiyor
 * ve kullanıcı sebepsiz "yeniden bağlanın" ekranı görüyor.
 *
 * Desen: ilk çağıran işi başlatır, aynı anda gelenler AYNI promise'i bekler.
 * İş bitince (başarılı ya da hatalı) kayıt silinir; sonraki çağrı yeniden başlatır.
 *
 * Ayrı dosyada ve saf: servisler Nest bağımlılıkları taşıdığı için doğrudan test
 * edilemiyor, kuralın kendisi burada sınanabilir halde duruyor.
 */
export class TekUcus<T> {
  private readonly ucusta = new Map<string, Promise<T>>();

  /**
   * `anahtar` için süren bir iş varsa onun sonucunu döndürür; yoksa `baslat`
   * çağrılır ve sonuç aynı anahtarla bekleyenlere paylaştırılır.
   */
  calistir(anahtar: string, baslat: () => Promise<T>): Promise<T> {
    const mevcut = this.ucusta.get(anahtar);
    if (mevcut) return mevcut;

    // finally ZİNCİRE bağlanır, çağırana dönen promise'e değil: hata da olsa
    // kayıt temizlensin ama hata çağırana aynen ulaşsın.
    const istek = baslat().finally(() => this.ucusta.delete(anahtar));
    this.ucusta.set(anahtar, istek);
    return istek;
  }

  /** Süren iş sayısı — yalnızca teşhis/test için. */
  get bekleyenSayisi(): number {
    return this.ucusta.size;
  }
}
