# Elle Test Rehberi — Modül Sistemi

> Otomatik testler (`npm test`) mantığı doğruluyor; bu rehber uçtan uca akışı doğruluyor. İki migration (042, 043) canlıya uygulandı, ekstra bir kurulum gerekmiyor.

```bash
npm run typecheck   # backend + web derleme denetimi
npm test            # tüm testler (bugün 1084)
npm run dev         # backend + web birlikte
```

---

## 1. Katalog açıklamaları

| Adım | Beklenen |
|---|---|
| Bir departman sayfası aç → sağ alt "+" → **Modül ekle** | Her modülün altında bir cümlelik açıklama görünüyor |
| Listede "Analiz", "Raporlama", "Denetim" gibi modüllere bak | Açıklama "Veri girişi yoktur, okur (panel)." ile bitiyor |

Açıklama boş görünen modül varsa 043 migration'ı uygulanmamış demektir.

---

## 2. Modül ekibi ve yetki

Bu bölüm en kritik olanı: 042 öncesinde sıradan çalışanlar hiçbir modüle kayıt giremiyordu.

**Hazırlık:** bir departman aç, kadrosuna en az bir `employee` rolünde kişi ekle (onaylı olmalı), bir de modül etkinleştir (ör. Gelir-Gider).

| # | Kim | Ne yapar | Beklenen |
|---|---|---|---|
| 2.1 | Organizasyon sahibi | Modülü açar | "Modül ekibi" görünür, **Kişi ata** düğmesi var |
| 2.2 | Organizasyon sahibi | Kadrodan birini atar | Kişi listede belirir, rolü değiştirilebilir, atanan kişiye bildirim gider |
| 2.3 | **Atanan çalışan** | Modülü açar | Kayıt ekleyebilir ✅ *(042 öncesinde yapamıyordu)* |
| 2.4 | Atanan çalışan | Ekip listesine bakar | Rolleri görür ama **Kişi ata** düğmesi yok |
| 2.5 | **Atanmamış** departman üyesi | Modülü açar | Kayıtları görür, sağ üstte **"Salt görüntüleme"** yazar, ekleme/silme yok |
| 2.6 | Departman yöneticisi | Modülü açar | Modüle ayrıca atanmamış olsa da tam yetkili |
| 2.7 | Modül yöneticisi (`manager` rolü verilen) | Ekibe bakar | **Kişi ata** düğmesi var |
| 2.8 | `subcontractor` rolündeki kişi | Modülü açar | Kayıt ekleyebilir ama **ekip paneli hiç görünmez** |
| 2.9 | Sahip | Bir kişiyi çıkarır | Listeden düşer; o kişi artık kayıt ekleyemez |

**Sunucu tarafı kontrolü:** arayüzdeki `canWrite` yalnızca kolaylık. Yetkisiz bir kullanıcı isteği elle gönderse bile backend `403` döndürmeli.

---

## 3. Kayıt işlemleri (A2 motoru)

Gelir-Gider veya Müşteri modülünde:

| # | Adım | Beklenen |
|---|---|---|
| 3.1 | **+ Kayıt ekle** | Form yalnızca **zorunlu alanları** gösterir |
| 3.2 | "Tüm alanlar (N tane daha)" | Kalan alanlar açılır |
| 3.3 | Zorunlu alanı boş bırakıp Kaydet | Hata mesajı çıkar **ve** form otomatik genişler (gizli kalan zorunlu alan görünsün diye) |
| 3.4 | Kaydet | Kayıt listeye düşer, göstergeler güncellenir |
| 3.5 | **Kayda tıkla** | Aynı form "Kaydı düzenliyorsun" notuyla dolu açılır, satır çerçevelenir |
| 3.6 | Bir alanı değiştir → Güncelle | Liste güncellenir, yeni kayıt oluşmaz |
| 3.7 | Çöp kutusu ikonu | Kayıt listeden düşer |
| 3.8 | Cmd/Ctrl + Z | Kayıt **geri gelir** — arşivlendiği için sunucudan gerçekten geri alınıyor |

### Arama, filtre, sıralama

Araç çubuğu **8 kayıttan sonra** görünür (daha azında gizli).

| # | Adım | Beklenen |
|---|---|---|
| 3.9 | 9+ kayıt gir | Arama kutusu, filtre listeleri ve sıralama görünür |
| 3.10 | Aramaya bir kelime yaz | Liste süzülür, üstte "N / M kayıt" yazar |
| 3.11 | Eşleşmeyen bir şey ara | "Aramanla eşleşen kayıt yok." (modülün boş metni değil) |
| 3.12 | Bir filtre seç | Yalnızca o değerdekiler kalır |
| 3.13 | Sıralamada bir tarih alanı seç | Sıra değişir; **tarihi boş olan kayıtlar sona düşer** (yön fark etmez) |
| 3.14 | **Temizle** | Arama ve filtreler sıfırlanır |

> Göstergeler daima **tüm kayıtları** yansıtır, filtrelenmiş listeyi değil — filtre görünümü değiştirir, gerçeği değil.

---

## 4. Modül kapsamı

| # | Adım | Beklenen |
|---|---|---|
| 4.1 | Finans departmanında modülleri aç | Gelir-Gider, Alacak-Borç, Fatura, **Vergi Takibi**, **Bütçe Kalemleri**, **Sermaye ve Yatırım**, **Risk Kayıtları** hepsi kendi alanlarıyla açılıyor |
| 4.2 | Operasyon departmanı | Tedarik, **Depo**, **Sevkiyat**, **Kalite Kontrol** |
| 4.3 | Pazarlama departmanı | 8 modül; **SEO/SEM**, **Reklam**, **E-mail**, **Hedef Kitle** dahil |
| 4.4 | Analiz / Raporlama / Denetim modülleri | Basit "kayıt defteri" görünümü — bunlar panel (A6) motorunu bekliyor, **beklenen davranış** |

Toplam 40 modül tam tanımlı. Kalan 17: 11 panel, 5 çekirdek, 1 kendi tablosunda.

---

## 5. Serbest çalışan tarafı

| # | Adım | Beklenen |
|---|---|---|
| 5.1 | Anasayfa → Modüller → bir işe modül ata | Modül kartı belirir |
| 5.2 | Karta tıkla | Modal açılır: kayıt paneli + altında **Modül ekibi** |
| 5.3 | İşe alınmış birini modüle ata | Atanan kişi kayıt girebilir |
| 5.4 | İşe alınmış ama modüle atanmamış kişi | Erişemez |

---

## 6. Bilinen sınırlar (hata değil)

Hâlâ geçerli olanlar:

- **Depo** miktarı doğrudan tutuyor; hareket defteri (giriş/çıkış/sayım) A3
  motoruyla gelecek — motor yazılmadı (bkz. `23-motor-a3-envanter.md`).
- **Aşamalı modüller** (satış hunisi, destek talebi, kalite kontrol, işe alım)
  liste + aşama alanı; kanban A4 motoruyla gelecek — motor yazılmadı
  (bkz. `21-motor-a4-pipeline.md`).
- **Dışa aktarma ve toplu işlem** henüz yok.

Çözülenler *(2026-09-03'te güncellendi — bu maddeler artık sınır değil)*:

- ~~Vizyon/Misyon her kayıt bir sürüm gibi çalışıyor~~ → A1 form motoru yazıldı,
  tek kayıtlık form olarak çalışıyor (`apps/web/src/lib/moduleForms/`).
- ~~Karşı taraf / sorumlu serbest metin~~ → `entity_ref` ve `user_ref` alan
  tipleri mevcut ve kullanılıyor.
- ~~Müşteri modülü iki yerde ayrı kayıt tutuyor~~ → `party` tablosunda
  birleştirildi (migration 046, `backend/src/modules/party/`).
