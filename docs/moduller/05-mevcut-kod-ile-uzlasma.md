# Mevcut Kod ile Uzlaşma

> Bu dokümandaki mimari (00–04) ve modül sözleşmeleri (10, 11) **hedefi** tarif ediyor. Kod bugün nerede duruyor, hangi kararlar zaten alınmış, neyin eksik olduğu ve hangi sırayla ilerlenmesi gerektiği burada.
>
> İncelenen dosyalar: `apps/web/src/lib/moduleRecordConfigs.ts`, `apps/web/src/components/ModuleRecordsPanel.tsx`, `backend/src/modules/module-records/module-records.service.ts`

---

## 1. Zaten Doğru Yapılmış Olanlar

Mimarinin bazı ilkeleri koda çoktan girmiş. Bunlar değiştirilmeyecek, üzerine inşa edilecek.

| Ne | Nerede | Karşılığı |
|---|---|---|
| **Config-driven modül render** — form + liste tek tanımdan üretiliyor | `moduleRecordConfigs.ts` + `ModuleRecordsPanel.tsx` | **İlke İ3** ("modül = şema, kod değil") kısmen uygulanmış |
| **Generic fallback** — tanımı olmayan modül boş kabuk kalmıyor, basit kayıt defteri oluyor | `genericConfig()` | Boş kutu sendromuna karşı iyi bir refleks |
| **Şemasız depolama** — `data jsonb` | `module_records` | Alan setini kodda değiştirmek migration gerektirmiyor |
| **Özet göstergeler** | `computeStats` | Spec'teki `summary_cards` ile birebir aynı fikir |
| **Çift sahiplik** — organizasyon **veya** iş (freelancer) | `ModuleRecordsService` | Freelancer → şirket büyüme yolu şemada çalışıyor |
| **Bütçe ile defterin ayrı olduğu bilinci** | `moduleRecordConfigs.ts:112-114` yorumu | Karar 1'in sezgisi zaten varmış |
| **Müşteri modülünün tek config olması** | `mid_musteri_modulu` ve `spd_musteri_modulu` → aynı `customerConfig` | Karar 3'ün yarısı yapılmış (bkz. §2.1) |
| **`bt_yazilim` = yazılım/araç envanteri** | `softwareConfig` | `01`'deki ⚠️ belirsizlik **çözüldü** — tahmin (a) doğruymuş |

**Sonuç:** Sıfırdan mimari kurmuyoruz. Var olan doğru yönü genişletiyoruz.

---

## 2. Kritik Boşluklar

### 2.1 Müşteri verisi kod seviyesinde bölünmüş 🔴

`mid_musteri_modulu` ve `spd_musteri_modulu` **aynı config'i** kullanıyor ama **ayrı `module_key` ile ayrı kayıt** yazıyor (dosyanın kendi yorumu bunu söylüyor, satır 7-9).

Yani Satış'ın girdiği "ABC Ltd." ile Müşteri İlişkileri'nin girdiği "ABC Ltd." iki farklı kayıt. Aynı müşteriye iki departman ayrı ayrı veri giriyor ve birbirini görmüyor.

Bu, İlke İ1'in tam ihlali ve şu an ürünün en somut veri riski. Karar 3 bunu çözüyor: tek `crm_musteri`, tek `party` tablosu, iki departman profili.

### 2.2 Modüle kişi atanamıyor 🔴

Kullanıcının kendi tarifi: *"Her modüle ekipten birileri atanabilir. Modüle atanan kişiler ve yöneticiler o modüllerde çalışmaya başlarlar."*

Kodda bu yok. `assertCanManage()` yalnızca şunlara izin veriyor:

- organizasyon sahibi, **veya**
- ilgili departmanın `role = manager` **ve** `status = approved` üyesi

Yani sıradan bir departman çalışanı hiçbir modüle kayıt giremiyor. `module_members` tablosu yok.

**Bu, modül sisteminin temel vaadini bugün çalışmaz kılıyor.** Diğer her şeyden önce gelmeli.

### 2.3 Liste bir listeden ibaret 🟡

`ModuleRecordsPanel` tüm kayıtları tarih sırasıyla döküyor. Yok olanlar:

filtre · arama · sıralama · dönem seçici · gruplama · sütun seçimi · dışa aktarma · toplu işlem · sayfalama

Gelir-Gider modülü 200 kayda ulaştığında kullanılamaz hale gelir. A2 arketibinin asıl işi bu özelliklerdir.

### 2.4 Alan tipi sözlüğü çok dar 🟡

| Var (5) | `text` · `textarea` · `number` · `date` · `select` |
|---|---|
| **Yok** | `currency` · `multiselect` · `boolean` · `percent` · `user_ref` · `entity_ref` · `module_ref` · `file` · `url` · `email` · `phone` · `tags` · `formula` |

En kritik eksik **`entity_ref`** — bu olmadan modüller birbirine bağlanamaz, yani İlke İ5 ("izole modül değersizdir") uygulanamaz. Şu an müşteri adı, tedarikçi adı, karşı taraf hep **serbest metin**; "ABC Ltd", "ABC Ltd.", "abc ltd" üç ayrı şey.

İkinci kritik eksik **`currency`** — şu an `number` + ayrı `currency` select olarak çözülmüş. Çalışıyor ama para birimi doğrulaması ve biçimlendirme her config'de elle tekrar ediliyor (`fmtMoney` iki yerde).

### 2.5 Sert silme 🟡

`remove()` gerçekten `DELETE` çalıştırıyor. `archived_at` kolonu var ama silme yolunda kullanılmıyor.

Finansal ve sözleşmesel kayıtlarda sert silme kabul edilemez — hem denetim izi kaybolur hem `panel_denetim` modülünün okuyacağı veri kalmaz. Arketip kararı: **arşivle, silme.**

### 2.6 Düzenleme akışı 🟡

Servis `update()` sunuyor; panelde ekleme ve silme var. Kaydı düzenleme akışının uçtan uca bağlanması gerekiyor — yanlış girilen bir tutarı silip yeniden girmek zorunda kalmak, sert silmeyle birleşince veri kaybı üretir.

### 2.7 Modüller arası bağ yok 🟡

12 config'in her biri ada. Fatura kesilince gelir kaydı oluşmuyor, tedarik teslim alınınca stok artmıyor, sözleşme bitişi hatırlatma üretmiyor. Kullanıcı aynı veriyi iki kez giriyor — ürünün en büyük terk sebebi bu olur.

### 2.8 Arketip kavramı yok 🟡

12 config elle yazılmış; ortak davranış yalnızca "form + liste + istatistik". Yeni bir modülü tam özellikli yapmak hâlâ elle config yazmayı gerektiriyor. 45 modüle çıkıldığında bu 45 elle bakım noktası demek.

---

## 3. Yol Haritası

Sıralama bağımlılığa göre; her faz kendi başına kullanılabilir bir iyileştirme bırakıyor.

### Faz 0 — Yetki ✅ TAMAMLANDI

- `module_members` tablosu → `database/migrations/042_module_members.sql` *(canlıda uygulandı)*
- `organization_modules.department_id` eklendi — aynı modül birden fazla departmanda etkinleşebiliyor
- `ModuleMembersService` — yetki çözümlemesi tek yerde
- `ModuleRecordsService` artık bu servisi kullanıyor
- `ModuleTeamPanel` — modül ekibini görme, kişi atama, rol değiştirme, çıkarma

#### Yetki sırası (ModuleMembersService.resolveOrganizationAccess)

En geniş yetkiden en dara; ilk eşleşen kazanır.

| # | Kim | Okuma | Yazma | Ekip yönetimi |
|---|---|---|---|---|
| 1 | Organizasyon sahibi | ✔ | ✔ | ✔ |
| 2 | Departman yöneticisi (onaylı) | ✔ | ✔ | ✔ |
| 3 | Modül üyesi — `manager` | ✔ | ✔ | ✔ |
| 4 | Modül üyesi — `employee` / `subcontractor` | ✔ | ✔ | ✗ |
| 5 | Departman üyesi, modüle atanmamış | ✔ | ✗ | ✗ |
| 6 | Diğer | ✗ | ✗ | ✗ |

Serbest çalışan tarafında (`resolveJobAccess`): iş sahibi tam yetkili, modüle atananlar yazabilir, kalan herkes erişemez.

**Notlar**

- Organizasyon geneli atama (`department_id` boş) her departmanda geçerlidir — eski kurulum sihirbazı kayıtları bu yüzden kırılmaz.
- Modülden çıkarma kaydı **silmez**, `status = removed` işaretler; kimin ne zaman hangi modülde çalıştığı denetim için korunur.
- `subcontractor` rolündeki kişi ekip listesini göremez.
- Arayüzdeki `canWrite` yalnızca kolaylık; sunucu her istekte kendi kontrolünü yapar.

**Kalan:** Migration'ın canlıya uygulanması. Uygulanana kadar `module_members` sorguları boş döner — sistem 042 öncesi davranışına (sahip + departman yöneticisi) geriler, kırılmaz.

> `module_records.remove()` hâlâ sert `DELETE` yapıyor. Arşivlemeye çevrilmesi Faz 1'e ait bir arketip kararı; bu fazda bilerek dokunulmadı.

### Faz 0.5 — Modül tanımları ✅ TAMAMLANDI

Faz 1'i beklemeden, mevcut motorun üstüne 28 yeni modül tanımı yazıldı. Kapsam **12 → 40 modül**.

Config dosyaları departman bazlı bölündü; dışa açık API (`MODULE_RECORD_CONFIGS`, `getModuleRecordConfig`, `ModuleRecordConfig`) değişmedi:

```
lib/moduleConfigs/shared.ts              tipler + yardımcılar (fmtMoney, countBy, moneyStats, opts, labelOf…)
lib/moduleConfigs/finans.ts              7 modül
lib/moduleConfigs/pazarlama.ts           8 modül
lib/moduleConfigs/insanKaynaklari.ts     5 modül
lib/moduleConfigs/operasyon.ts           4 modül
lib/moduleConfigs/hukuk.ts               3 modül
lib/moduleConfigs/musteriIliskileri.ts   3 modül
lib/moduleConfigs/bilgiTeknolojileri.ts  3 modül
lib/moduleConfigs/satis.ts               3 modül
lib/moduleConfigs/yonetim.ts             3 modül
lib/moduleConfigs/index.ts               kayıt defteri + generic fallback
lib/moduleRecordConfigs.ts               eski import yolu (re-export)
```

#### Kapsam (57 katalog kaydı)

| | Sayı | Not |
|---|---|---|
| Tam tanımlı | **40** | |
| A6 türev panel | 11 | Veri girişi almaz, panel motorunu bekliyor (Faz 5) |
| Çekirdek | 5 | Proje/program/görev/çıktı/dosya — modül değil |
| Kendi tablosu | 1 | `uyd_urunler` → `products` |
| **Beklenmeyen boşluk** | **0** | |

#### Mevcut motorun sınırladığı yerler

Alan tipi sözlüğü hâlâ 5 tip (`text`, `textarea`, `number`, `date`, `select`). Bunun sonuçları:

- "Karşı taraf", "sorumlu", "zimmetli kişi" gibi alanlar **serbest metin** — `entity_ref` / `user_ref` Faz 2'de.
- Aşamalı modüller (satış hunisi, destek talebi, kalite kontrol) liste + aşama alanı olarak çalışıyor; kanban Faz 6'da.
- `oud_depo` miktarı doğrudan tutuyor; hareket defterinden türetme Faz 6'da. Kritik seviye uyarısı bu haliyle de çalışıyor.
- Vizyon/misyon tek kayıtlık form (A1) olması gerekirken liste; **her kayıt bir sürüm** gibi çalışacak şekilde tasarlandı, veri kaybı olmadan A1'e indirgenebilir.

#### Kalan iş

`module_catalog.description` 57 kayıtta hâlâ boş — kurulum sihirbazında kullanıcı ne seçtiğini görmüyor. Artık her modülün ne yaptığı belli olduğuna göre bu bir sonraki migration'da doldurulabilir.

### Faz 1 — A2 motoru ✅ TAMAMLANDI

`ModuleRecordsPanel` tam liste bileşenine çıkarıldı. Tek dosya değişikliği 40 modülü **ve** generic fallback'e düşen her modülü birden etkiliyor.

| Yetenek | Nasıl çalışıyor |
|---|---|
| **Kayıt düzenleme** | Satıra tıkla → aynı form düzenleme kipinde açılır |
| **Arşivleme** | Sert silme kaldırıldı; `archived_at` yazılır, kayıt listeden düşer ama veritabanında kalır. Geri alma sunucudan gerçekten geri getirir (`PATCH /module-records/:id/restore`) |
| **Arama** | Kaydın tüm metin/sayı alanlarında, Türkçe küçük harf duyarlı |
| **Filtre** | `select` tipli her alan için otomatik açılır liste |
| **Sıralama** | `date` ve `number` alanları için artan/azalan. Değeri olmayan kayıtlar her zaman sona düşer |
| **Hızlı ekleme** | Form yalnızca zorunlu alanları gösterir; "Tüm alanlar" ile açılır. Gizli kalan zorunlu bir alan varsa doğrulama formu otomatik genişletir |
| **Araç çubuğu eşiği** | 8 kayıttan azken gizli — az kayıtta yer kaplamaktan başka işe yaramıyor |

Bu fazdan **dışa aktarma (CSV/XLSX)** ve **toplu işlem** bilinçli olarak sonraya bırakıldı: ikisi de yeni bağımlılık ya da seçim durumu yönetimi istiyor, oysa yukarıdakiler tek dosyada çözülüyor.

### Test altyapısı ✅ TAMAMLANDI

Projede test yoktu. Vitest/jest yerine **Node 22'nin yerleşik test koşucusu** kullanıldı — yeni bağımlılık eklenmedi.

```
npm test                    tüm testler
npm test -- --filter=access  yalnızca eşleşen dosyalar
npm run typecheck           backend + web TypeScript denetimi
```

| Dosya | Ne test ediyor | Test sayısı |
|---|---|---|
| `backend/.../module-access.test.ts` | 6 kademeli yetki matrisi, öncelik kuralları, serbest çalışan senaryosu | 22 |
| `apps/web/.../shared.test.ts` | Para birimi toplama, biçimlendirme, sayaç ve etiket yardımcıları | 27 |
| `apps/web/.../moduleConfigs.test.ts` | 40 modülün alan tutarlılığı, özet/gösterge dayanıklılığı, katalog kapsaması | 367 |
| | **Toplam** | **416** |

Yetki kararı test edilebilsin diye `decideAccess` saf bir fonksiyona ayrıldı (`module-access.ts`): servis yalnızca *gerçekleri* toplar, kararı bu fonksiyon verir. Böylece sistemin en güvenlik-kritik mantığı Supabase taklidi olmadan test ediliyor.

**Testlerin yakaladığı gerçek sorunlar:**

- Göstergelerde `NaN` / `undefined` sızıntısı (eksik alanlı kayıtlarda)
- Tekrar eden gösterge etiketi (React'te `key` olarak kullanılıyor, liste bozulur)
- Kataloğa uymayan eski `select` değerlerinde ham anahtarın ekranda görünmesi
- Farklı para birimlerinin yanlışlıkla toplanması

Ayrıca `backend/tsconfig.build.json` eklendi: test dosyaları üretim derlemesine girmiyor.

### Faz 2 — Alan tipi genişletmesi ✅ TAMAMLANDI

Alan tipi sözlüğü **5 → 10**. En önemlisi `entity_ref`: modüller artık birbirine gerçekten bağlanabiliyor.

| Tip | Ne yapar |
|---|---|
| `currency` | Tek kontrol, iki anahtar (tutar + para birimi). Veri şekli aynı kaldı, mevcut kayıtlar bozulmadı |
| `entity_ref` | Ortak varlığa referans. Aranabilir seçici; listede yoksa satır içi yeni müşteri açılabiliyor |
| `user_ref` | Organizasyon üyesine referans |
| `multiselect` | Çoklu seçim |
| `formula` | Salt okunur, diğer alanlardan hesaplanır. **Kaydedilmez** — kaynak alan değişince bayat değer kalmasın diye her okumada üretilir |

**Geçirilen alanlar:** 9 karşı taraf → `entity_ref`, 7 sorumlu → `user_ref`, 7 tutar → `currency`. Her modülde ayrı duran "Para birimi" select'i kalktı.

#### Geriye dönük uyumluluk

Bu alanlar eskiden serbest metindi ve mevcut kayıtlarda ham ad duruyor. Kural: **UUID ise çözümle, değilse olduğu gibi göster.**

| Kayıttaki değer | Ekranda |
|---|---|
| UUID, kayıt var | Adı |
| UUID, kayıt silinmiş | `(silinmiş kayıt)` |
| Serbest metin (eski) | Metnin kendisi + `· bağlı değil` |
| Boş | — |

Hiçbir veri görünmez olmuyor; kullanıcı isterse listeden gerçek kaydı seçip bağlıyor.

#### Modüller birbirini besliyor

Bir kayıt müşteriye referans verdiğinde **müşteri kartının geçmişine düşüyor**. Fatura kesildi, destek talebi açıldı, sözleşme girildi — hepsi tek akışta görünüyor. İlke İ5'in ilk somut karşılığı.

> Bilinçli sınır: bu bağı frontend kuruyor, çünkü alan tanımları yalnızca web tarafında. Aktivite yazımı "en iyi çaba" — başarısız olursa asıl kayıt etkilenmiyor. Tanımlar paylaşılan pakete taşınırsa sunucuya alınabilir.

#### Panelde çözülen ince nokta

`summary`/`detail` fonksiyonları ham veriyi okuyor; referans alanlarında orada UUID durur ve ekranda kimlik görünürdü. Panel artık tanımlara ham veriyi değil **adları çözülmüş bir kopyasını** veriyor (`toDisplayData`). Arama da bu kopya üzerinden çalışıyor — kullanıcı gördüğü adı arıyor. `computeStats` bilerek ham veriyle kalıyor: orada sayım ve toplama yapılıyor, ad gösterilmiyor.

> Testler burada iki hata daha yakaladı: düzenlemede para birimi forma yüklenmediği için TRY'ye sıfırlanıyordu (kullanıcı farkında olmadan tutarın birimini değiştirirdi), ve `currency` tipli alanlar kaydederken sayıya çevrilmiyordu.

**Kalan:** `file` tipi (Drive/OneDrive bağlaması ayrı bir iş).

### Faz 2 — özgün plan (referans)

Öncelik sırası: `currency` → `entity_ref` → `user_ref` → `multiselect` → `file` → `formula`.

`entity_ref` altyapısı Faz 3'ün ön koşulu.

### Faz 3 — `party` + `crm_musteri` birleşmesi ✅ TAMAMLANDI

Modül mimarisinin **1. ilkesi** ("varlık modülden bağımsızdır") artık kodda karşılığını buldu.

**Neden şimdi:** ortada 0 müşteri kaydı vardı — birleştirme bedavaydı. Her gün beklemek taşınacak veri biriktirirdi.

| Ne | Nerede |
|---|---|
| `party`, `party_contact`, `party_activity` | `046_party_and_customer_merge.sql` |
| `module_catalog_departments` (çoklu departman) | aynı migration; mevcut 54 eşleme taşındı |
| `mid_musteri_modulu` + `spd_musteri_modulu` → tek `crm_musteri` | aynı migration; iki departmana birden açık |
| Tekilleştirme mantığı (saf, test edilebilir) | `backend/.../party/party-dedup.ts` |
| Backend servis + uçlar | `backend/.../party/` |
| Müşteri paneli + departman profilleri | `apps/web/.../CustomersPanel.tsx`, `lib/partyProfiles.ts` |
| Varlık modülü yönlendirmesi | `apps/web/src/lib/entityModules.ts` |
| FK indeksleri | `047_party_fk_indexes.sql` |

**Tekilleştirme kademeleri**

| Kontrol | Davranış | Neden |
|---|---|---|
| Aynı vergi numarası | **Engeller** | Kesin kimlik; veritabanı kısıtı da destekliyor |
| Aynı e-posta | Uyarır | Ortak kurumsal e-posta olabilir |
| Benzer ad | Uyarır | Aynı adlı iki ayrı şube olabilir; karar kullanıcının |

Ad karşılaştırması Türkçe'ye duyarlı: `İ`/`I` doğru küçültülür, aksanlar ASCII'ye iner, tüzel kişilik ekleri (`A.Ş.`, `Ltd. Şti.`, `San.`, `Tic.`) atılır. Böylece **"ABC A.Ş." = "ABC Ltd. Şti." = "abc"**.

> Testler burada iki gerçek hata yakaladı: `A.Ş.` noktalama temizliğinde `a s` diye ikiye bölünüp tüzel ek olarak tanınmıyordu (nokta kısaltmada harfleri **birleştirir**, ayırmaz), ve bunun sonucu ad bazlı kopya tespiti çalışmıyordu.

**Rol modeli:** rol bir alandır, tablo değil. Aynı firma hem müşteri hem tedarikçi olabilir ve adresi tek yerde durur. Rol **eklenir, silinmez** — ilk fatura kesildiğinde `lead` üzerine `customer` eklenir, kaydın potansiyel olarak başladığı bilgisi kaybolmaz.

**Departman profilleri:** Satış `lead` filtresiyle ve sorumlu/kaynak sütunlarıyla açılır; Müşteri İlişkileri `customer` filtresiyle ve durum/temas bilgisiyle. Aynı kayıtlar, farklı bakış — profil yalnızca sunumu değiştirir, görünürlüğü izin belirler.

**Kalan:** diğer modüllerin `party_activity`'ye yazması (fatura kesildi, destek talebi açıldı) ve serbest metin "karşı taraf" alanlarının `entity_ref`'e çevrilmesi — ikisi de Faz 2'ye bağlı.

### Faz 3 — özgün plan (referans)

- `party`, `party_contact`, `party_activity` tabloları
- Mevcut `mid_musteri_modulu` + `spd_musteri_modulu` kayıtları `party`'ye taşınır, yinelenenler birleştirilir
- `module_catalog_departments` (çoklu departman) + departman profilleri
- Diğer modüllerdeki serbest metin karşı taraf alanları `entity_ref`'e çevrilir

**İlk gerçek "modüller birbirini besliyor" anı burasıdır.** Demo değeri en yüksek faz.

### Faz 4 — `money_entry` birleşmesi

Karar 1'in uygulaması: `budget_transactions` + `fm_gelir_gider` tek tabloya, `budget_transactions` geriye uyumluluk için view olarak kalır.

### Faz 5 — A6 panel motoru ✅ TAMAMLANDI

**Tek motor 12 modülü birden açtı.** Mimarideki "6 motor, 45 modül" tezinin en büyük tek kazancı. Girilen verinin nihayet bir karşılığı var.

| Panel | Ne cevaplıyor |
|---|---|
| `yonetim_analiz` | Şirketin dönemsel durumu: para, satış, müşteri, açık işler |
| `yonetim_raporlama` | Dönem özeti + CSV dışa aktarma |
| `yonetim_denetim` | Kategorisiz kayıt, vadesi geçen, süresi dolan sözleşme, açık kritik risk |
| `yonetim_butce_yonetimi` | Planlanan vs gerçekleşen, kullanım oranı |
| `fm_analiz_rapor` | Gelir, gider, net, kategori kırılımı |
| `fm_nakit_akis` | Giren/çıkan, açık alacak-borç, aylık hareket |
| `fm_finansal_planlama` | Net + açık alacak − açık borç projeksiyonu |
| `pd_musteri_kazanim_optimizasyonu` | Kazanım maliyeti, dönüşüm oranı |
| `pd_dijital_pazarlama` | Sosyal, e-posta, reklam, SEO tek ekranda |
| `holding_analiz` · `holding_raporlama` · `holding_denetim` | Aynı paneller, holding kapsamı |

**Hesap istemci tarafında.** Modül alan tanımları (hangi alan tutar, hangi değer "açık" demek) yalnızca web tarafında yaşıyor; hesabı sunucuya taşımak önce tanımların paylaşılan pakete taşınmasını gerektirir — panellerden bağımsız ve daha büyük bir iş.

**Grafik kütüphanesi eklenmedi.** Kırılımlar CSS çubuklarıyla çiziliyor; yeni bağımlılığa değecek bir kazanç yoktu.

#### Dürüstlük kararları

- **Payda sıfırsa `—`**, sıfır değil. "%0 dönüşüm" ile "veri yok" farklı şeyler.
- **Farklı para birimleri toplanmaz**, yan yana yazılır. Oran gerektiren göstergeler (kullanım, kazanım maliyeti) yalnızca TRY üzerinden hesaplanır ve bunu ipucu satırında söyler.
- **Tarihsiz kayıt dönem filtresinden elenmez.** Bütçe kalemi, risk, stok gibi modüllerde olay tarihi kavramı yok; sessizce süzmek "verim kayboldu" hissi verirdi.
- **Kaynak modül kapalıysa panel bunu yazar.** Boş panel gören kullanıcı "bozuk" sanmamalı.
- **Holding panelleri kapsam sınırını açıkça söylüyor:** konsolidasyon henüz yok, şu an tek organizasyonun verisi gösteriliyor.

#### Testlerin yakaladığı ciddi hata

`toISOString()` UTC'ye çevirdiği için **her dönem sınırı bir gün kayıyordu** — Türkiye UTC+3 olduğundan "Bu ay" 31 Temmuz'da başlıyordu. Yerel takvim gününü veren `todayISO()` yardımcısı eklendi ve tarih karşılaştırması yapan tüm yerler (panel dönemleri, vade kontrolleri, sözleşme ve tescil yenileme pencereleri) buna geçirildi.

#### Yol boyunca kapanan eksik

`048` migration'ı: **Karar 2'nin veritabanı tarafı hiç uygulanmamıştı.** `pd_dijital_pazarlama` katalogda yoktu, yani paneli yazsam da hiçbir departmanda görünmeyecekti. SEO/SEM modülünün adı da netleşti.

### Faz 5 — özgün plan (referans)

`metric` yayını + konfigüre edilebilir dashboard. Tek motor 8 modülü birden açar (`panel_analiz`, `panel_raporlama`, `panel_denetim`, `panel_butce`, `fm_nakit_akis`, `fm_finansal_planlama`, `pd_dijital_pazarlama`, `pd_musteri_kazanim_optimizasyonu`).

### Faz 6 — A4 / A5 / A3 motorları

Pipeline (kanban + aşama konfigürasyonu, 7 modül) → Takvim (5 modül) → Envanter (1 modül, en karmaşık, en sona).

---

## 4. Spec'lerde Düzeltilecek Nokta

`10-modul-fm_gelir_gider.md` mevcut alan adlarını değiştirmeyi öneriyor (`type→direction`, `entryDate→occurred_at`). Kodda ve veritabanında bugün eski adlar var.

**Karar:** Yeniden adlandırma Faz 4'te, `money_entry` migration'ıyla birlikte yapılır. O zamana kadar spec'teki adlar hedef durumu gösterir; kodda dokunulmaz. Erken yeniden adlandırma, kazancı olmayan bir kırılma üretir.

---

## 5. Özet

> **⚠️ Aşağıdaki tablo 2026-08-15 tarihlidir ve ARTIK GEÇERLİ DEĞİL.**
> Saydığı üç işin üçü de yapıldı: `module_members` uygulandı (042), A2 motoru
> yazıldı, müşteri bölünmesi 046 ile çözüldü. Tablo tarihî kayıt olarak
> duruyor — güncel durum için `docs/moduller/README.md`'deki faz tablosuna bak.

| | | Bugün |
|---|---|---|
| Mimari yön | Kodun gittiği yönle uyumlu — çatışma yok | ✅ hâlâ geçerli |
| En acil iş | `module_members` (Faz 0) | ✅ yapıldı (042 canlıda) |
| En yüksek getirili iş | A2 motoru (Faz 1) | ✅ yazıldı |
| En büyük veri riski | Müşteri kaydının iki modüle bölünmüş olması | ✅ çözüldü (046) |
| Spec'lerin durumu | Kod 6 fazın 1.'sinde | ❌ eskimiş — kalan iş A4/A5/A3 motorları ve `money_entry` |
