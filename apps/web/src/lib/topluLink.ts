/**
 * Birden fazla adresi aynı anda yeni sekmelerde açmak.
 *
 * ÖNCE BOŞ SEKMELER açılıyor, sonra adresler yükleniyor. Sebep tarayıcının
 * kuralı: bir tıklamadan doğan İLK pencere her hâlükârda geçiyor, kalanı
 * siteye açılır pencere izni verilmemişse engelleniyor. Doğrudan adreslerle
 * açılsaydı izin yokken bir tanesi açılır, diğerleri açılmaz ve kullanıcı yarım
 * bir sonuçla kalırdı. Boş sekmeler hiçbir yere gitmediği için engel
 * görüldüğünde hepsi anında kapatılıyor: YA HEPSİ AÇILIR YA HİÇBİRİ.
 *
 * `opener` elle koparılıyor; `noopener` seçenek dizesiyle verilemiyor çünkü o
 * hâlde window.open null döner ve başarılı açılışı engellenmiş sayardık.
 *
 * ORTAK DOSYADA: aynı düğme iki modülde var (Sosyal Medya hesapları, Hesaplar
 * modülünün giriş adresleri). Kopyalansaydı, yukarıdaki sıranın önemini
 * bilmeyen biri birinde "basitleştirip" düzeltilmiş hatayı geri getirirdi.
 */
export function sekmeleriAc(urls: string[]): boolean {
  if (urls.length === 0) return true;

  const pencereler = urls.map(() => {
    try {
      return window.open("", "_blank");
    } catch {
      return null;
    }
  });

  if (pencereler.some((w) => !w)) {
    for (const w of pencereler) {
      try {
        w?.close();
      } catch {
        // Kapatılamayan boş sekme kullanıcıyı rahatsız etmez, sessiz geç.
      }
    }
    return false;
  }

  pencereler.forEach((w, i) => {
    if (!w) return;
    try {
      w.opener = null;
    } catch {
      // Bazı tarayıcılar opener'a yazdırmıyor; sekme yine açılıyor.
    }
    w.location.replace(urls[i]);
  });
  return true;
}
