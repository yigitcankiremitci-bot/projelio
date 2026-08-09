# Projelio — 57 Modülün Arketip Eşlemesi

Kaynak: `module_catalog` (57 kayıt). Arketip ve varlık tanımları için bkz. `00-modul-mimarisi.md`.

**Durum kodları**
`✅` net · `⚠️` kapsam belirsiz, konuşulmalı · `🔀` başka modülle birleşmeli · `⚙️` modül değil, çekirdek

---

## Holding geneli (3)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `holding_analiz` | Analiz (Holding) | A6 | metric | 🔀 → `panel_analiz`, kapsam=holding |
| `holding_raporlama` | Raporlama (Holding) | A6 | metric | 🔀 → `panel_raporlama` |
| `holding_denetim` | Denetim (Holding) | A6 | metric | 🔀 → `panel_denetim` |

> Holding/organizasyon/departman farkı bir **kapsam parametresi**dir, ayrı modül değil.

---

## Bilgi Teknolojileri / Yazılım (3)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `bt_yazilim` | Yazılım | A2 | module_records | ✅ **Kodda çözülmüş** — `softwareConfig` zaten "Yazılım / Araç Envanteri" olarak uygulanmış (araç, sağlayıcı, lisans türü, yenileme tarihi) |
| `bt_donanim` | Donanım | A2 | module_records | ✅ Demirbaş + zimmet listesi (`user_ref` alanı ile) |
| `bt_ag_guvenlik` | Ağ ve güvenlik | A2 | module_records | ⚠️ Öneri: güvenlik olay kaydı + periyodik kontrol listesi. Yoksa çok soyut kalır |

---

## Finans / Muhasebe (10)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `fm_gelir_gider` | Gelir-Gider | A2-F | `money_entry` | ✅ Finansın omurgası — **ilk tasarlanacak modül** |
| `fm_alacak_borc` | Alacak-Borç Takibi | A2-F | `money_entry` | ✅ Aynı varlık, farklı görünüm (yön + vade + tahsilat durumu) |
| `fm_fatura` | Fatura | A2-F | `document` + `money_entry` | ✅ Fatura kesildiğinde otomatik `money_entry` üretir |
| `fm_vergi_takip` | Vergi takip | A5 | `plan_entry` | ✅ Beyanname takvimi, tekrar kuralı, görev üretir |
| `fm_butce_hazirlama` | Bütçe hazırlama | A2 | module_records | ✅ Bütçe kalemleri; gerçekleşme karşılaştırması A6 görünümü olarak |
| `fm_sermaye_yatirim_takip` | Sermaye ve Yatırım takip | A2 | module_records | ✅ Yatırım kaydı + ROI formül alanı |
| `fm_risk_yonetimi` | Risk yönetimi | A2 | module_records | ✅ Klasik risk register: risk / olasılık / etki / sahip / aksiyon |
| `fm_nakit_akis` | Nakit akış | A6 | metric | ✅ `money_entry`'den türer, veri girişi yok |
| `fm_finansal_planlama` | Finansal Planlama | A6 | metric | ⚠️ `fm_butce_hazirlama` ile sınırı bulanık. Öneri: bu = projeksiyon paneli, bütçe = plan girişi |
| `fm_analiz_rapor` | Analiz ve Rapor | A6 | metric | 🔀 → `panel_analiz` (kapsam=departman) |

---

## Hukuk ve Uyum (3)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `hud_sozlesme` | Sözleşme | A2 | `document` | ✅ Taraf → `party`, bitiş tarihi → hatırlatma görevi |
| `hud_marka_patent_telif` | Marka/Patent/Telif | A2 | `document` | ✅ Yenileme tarihi zorunlu, A5 hatırlatma bileşeni |
| `hud_mevzuatlar` | Mevzuatlar | A2 | `document` | ✅ Referans kütüphane; salt okunur ağırlıklı |

---

## İnsan Kaynakları (5)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `ik_ise_alim_oryantasyon` | İşe alım ve oryantasyon | A4 | `pipeline_record` + `party` | ✅ Aday `party(role=candidate)`; işe alınınca `department_members`'a dönüşür |
| `ik_egitim_gelisim` | Eğitim ve gelişim planlama | A5 | `plan_entry` | ✅ Katılımcı → `user_ref`, görev üretir |
| `ik_performans_izleme` | Performans izleme | A2 + A6 | module_records | ✅ Dönemsel değerlendirme kayıtları (A2) + özet panel (A6). `yonetim_hedef_belirleme`'den besleniyor |
| `ik_bordro_ozluk` | Bordro ve özlük | A2 | module_records | ✅ **`sensitivity = confidential`** — varsayılan görünürlük yalnızca atananlar |
| `ik_ic_iletisim_kultur` | İç iletişim ve kültür | — | `project_posts` | ⚠️ Zaten çekirdekte akış var (`project_posts`, `post_comments`, `post_likes`). Öneri: organizasyon seviyesi duyuru akışı olarak çekirdeğe taşı, modül olmaktan çıkar |

---

## Müşteri İlişkileri (3)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `mid_musteri_modulu` | Müşteri | A2 | `party` | 🔀 **[Karar]** `spd_musteri_modulu` ile birleşti → tek `crm_musteri`, iki departmana birden açılıyor (bkz. §Karar 3) |
| `mid_sikayet_oneri` | Şikayet ve Öneri | A4 | `pipeline_record` | ✅ Aşamalar: açık → inceleniyor → çözüldü → kapandı |
| `mid_teknik_destek` | Teknik Destek | A4 | `pipeline_record` | ⚠️ `mid_sikayet_oneri` ile aynı arketip ve neredeyse aynı akış. Öneri: tek "Talep Yönetimi" modülü, tür alanı ile ayrış |

---

## Operasyon / Üretim (4)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `oud_tedarik` | Tedarik | A4 | `pipeline_record` → `item_movement` | ✅ Talep → teklif → sipariş → teslim. Teslimde depoya giriş üretir |
| `oud_depo` | Depo | A3 | `item` + `item_movement` | ✅ Envanter arketipinin tek tam örneği — **arketip A3 buradan tasarlanır** |
| `oud_sevkiyat_yonetimi` | Sevkiyat yönetimi | A4 | `pipeline_record` → `item_movement` | ✅ Depodan çıkış üretir |
| `oud_kalite_kontrol` | Kalite kontrol | A4 | `pipeline_record` | ✅ Uygunsuzluk → aksiyon → doğrulama → kapatma |

> Tedarik → Depo → Sevkiyat zinciri ürünün en güçlü "modüller birbirini besliyor" hikâyesi. Demo için ideal.

---

## Pazarlama ve Büyüme (9 kayıt → 10 modül)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `pd_rakip_sektor_analizi` | Rakip ve sektör analizi | A2 | module_records | 🔀 `spd_pazar_arastirma` ile örtüşüyor |
| `pd_hedef_kitle` | Hedef kitle | A2 | module_records | ✅ Persona kartları; varsayılan görünüm = kart |
| `pd_sosyal_medya` | Sosyal medya | A5 | `plan_entry` | ✅ İçerik takvimi; onay akışı + görev üretimi |
| `pd_email` | E-mail | A5 | `plan_entry` | ⚠️ `pd_sosyal_medya` ile aynı motor. Öneri: tek "İçerik Takvimi", kanal alanı ile ayrış |
| `pd_reklam` | Reklam | A5 | `plan_entry` | ✅ Bütçe alanı `money_entry`'ye gider yazar |
| `pd_dijital_pazarlama` | Dijital Pazarlama | A6 | metric | ✅ **[Karar]** İkiye bölündü. Bu yarısı: tüm dijital kanalların (sosyal, e-mail, reklam, SEO) tek ekranda performans özeti. Veri girişi yok |
| `pd_seo_sem` | SEO / SEM | A2 | module_records | ✅ **[Karar]** Diğer yarısı: anahtar kelime + hedef sayfa + sıralama + arama hacmi + SEM kampanya bağı |
| `pd_urun_stratejileri` | Ürün stratejileri | A1 | `products` bağlı | ✅ Ürün başına tek strateji dokümanı |
| `pd_musteri_kazanim_optimizasyonu` | Müşteri kazanım optimizasyonu | A6 | metric | ✅ CAC / dönüşüm paneli; reklam + satış modüllerinden besleniyor |
| `pd_buyume_hedefleri` | Büyüme hedefleri | A2 | module_records | 🔀 `yonetim_hedef_belirleme` ile aynı yapı → tek hedef/OKR modülü, kapsam parametreli |

---

## Satış ve İş Geliştirme (4)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `spd_satis_planlama_b2b_b2c` | Satış planlama B2B/B2C | A4 | `pipeline_record` + `party` | ✅ Satış hunisi — **A4 arketipi buradan tasarlanır** |
| `spd_musteri_modulu` | Müşteri | A2 | `party` | 🔀 **[Karar]** `crm_musteri` içinde birleşti |
| `spd_ortaklik_dagitim` | Ortaklık ve Dağıtım | A2 | `party(role=distributor)` | ✅ |
| `spd_pazar_arastirma` | Pazar ve araştırma | A2 | module_records | 🔀 `pd_rakip_sektor_analizi` ile birleş |

---

## Ürün Yönetimi (1)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `uyd_urunler` | Ürünler | A2 | `products` (mevcut tablo) | ✅ Ortak varlık zaten var; modül bu tabloya pencere açar |

---

## Yönetim (12)

| key | Ad | Arketip | Varlık | Durum |
|---|---|---|---|---|
| `yonetim_vizyon_sablonu` | Vizyon belirleme | A1 | module_records | 🔀 Misyon ile birleş → "Kimlik ve Yön" (vizyon + misyon + değerler) |
| `yonetim_misyon_sablonu` | Misyon belirleme | A1 | module_records | 🔀 yukarıdaki ile birleş |
| `yonetim_hedef_belirleme` | Hedef belirleme | A2 | module_records | ✅ Hedef + anahtar sonuç kayıtları. `pd_buyume_hedefleri` buraya katlanır |
| `yonetim_analiz` | Analiz | A6 | metric | 🔀 → `panel_analiz` |
| `yonetim_raporlama` | Raporlama | A6 | metric | 🔀 → `panel_raporlama` |
| `yonetim_denetim` | Denetim | A6 | metric | 🔀 → `panel_denetim` |
| `yonetim_proje_yonetimi` | Proje yönetimi | ⚙️ | `projects` | Çekirdek — modül değil |
| `yonetim_program_yonetimi` | Program yönetimi | ⚙️ | `operations` | Çekirdek — modül değil |
| `yonetim_gorev_yonetimi` | Görev yönetimi | ⚙️ | `tasks` | Çekirdek — modül değil |
| `yonetim_cikti_yonetimi` | Çıktı yönetimi | ⚙️ | `outputs` | Çekirdek — modül değil |
| `yonetim_dosya_yonetimi` | Dosya yönetimi | ⚙️ | `files` | Çekirdek — modül değil |
| `yonetim_butce_yonetimi` | Bütçe yönetimi | A6 | metric | ✅ **[Karar]** Çekirdek değil, panel → `panel_butce`. Yönetime gösterge/rapor sunar, veri girişi yok. Proje bütçesi çekirdekte kalır, defter `fm_gelir_gider`'dedir. Detay: `02-karar-notu-butce-vs-muhasebe.md` |

---

## Toplam

| | Sayı |
|---|---|
| Katalog kaydı | 57 |
| Bölünen kayıt (`pd_dijital_pazarlama_seo_sem` → 2) | +1 |
| Çekirdeğe taşınacak (⚙️) | −5 |
| Birleşme sonucu kaybolan kayıt (14 satır → 6 modül) | −8 |
| **Tasarlanacak gerçek modül** | **45** |
| Bunlardan kapsamı netleştirilecek (⚠️) | 5 |

Birleşme detayı:

| Birleşen kayıtlar | Sonuç | Kayıp |
|---|---|---|
| `holding_analiz` + `yonetim_analiz` + `fm_analiz_rapor` | `panel_analiz` | −2 |
| `holding_raporlama` + `yonetim_raporlama` | `panel_raporlama` | −1 |
| `holding_denetim` + `yonetim_denetim` | `panel_denetim` | −1 |
| `mid_musteri_modulu` + `spd_musteri_modulu` | `crm_musteri` | −1 |
| `pd_rakip_sektor_analizi` + `spd_pazar_arastirma` | `pazar_rakip_analizi` | −1 |
| `pd_buyume_hedefleri` + `yonetim_hedef_belirleme` | `hedef_yonetimi` | −1 |
| `yonetim_vizyon_sablonu` + `yonetim_misyon_sablonu` | `kimlik_ve_yon` | −1 |

### Arketip dağılımı (kararlar sonrası, 45 modül)

| Arketip | Adet | Yorum |
|---|---|---|
| A1 Form | 2 | En ucuz |
| A2 Kayıt Listesi | 21 | En kalabalık — motor buradan çıkar (3'ü A2-F finansal alt tip) |
| A3 Envanter | 1 | Tek örnek ama en karmaşık |
| A4 Pipeline | 7 | Aşama konfigürasyonu kritik |
| A5 Takvim | 5 | `operation_routines` motoru yeniden kullanılır |
| A6 Türev Panel | 8 | Tek dashboard motoru → 8 modül birden |
| Belirlenmedi | 1 | `ik_ic_iletisim_kultur` — çekirdeğe taşınması öneriliyor |
| **Toplam** | **45** | |

Not: kalan ⚠️ sorular kapanırsa sayı düşer — `mid_teknik_destek`+`mid_sikayet_oneri`, `pd_email`+`pd_sosyal_medya` birleşir ve `ik_ic_iletisim_kultur` çekirdeğe taşınırsa **42 modül** kalır.

**Sonuç:** 6 arketip motoru yazıldığında 45 modülün tamamı konfigürasyon ile ayağa kalkar.

---

## Verilen Kararlar

### Karar 1 — Bütçe ≠ Muhasebe (7 Ağu 2026)

Üç ayrı rol, **tek fiziksel tablo** (`money_entry`):

| Katman | Soru | Arketip | Veri girişi |
|---|---|---|---|
| Proje bütçesi (çekirdek) | "Bu iş bana ne kazandırdı?" | Çekirdek sekme | Hızlı, 3 alan |
| `fm_gelir_gider` | "Şirket bu ay ne kazandı/harcadı?" | A2 | Detaylı, ~14 alan |
| `panel_butce` (eski `yonetim_butce_yonetimi`) | "Nerede duruyoruz, sapma var mı?" | A6 | **Yok** |

`budget_transactions` ve `fm_gelir_gider` aynı tabloya yazar; ayrım görünüm ve zorunluluk seviyesindedir. Böylece aynı para iki kez sayılmaz. Detay ve migration yolu: `02-karar-notu-butce-vs-muhasebe.md`.

### Karar 2 — Dijital pazarlama ikiye bölündü

| Yeni modül | Arketip | Kapsam |
|---|---|---|
| `pd_dijital_pazarlama` | A6 | Tüm dijital kanalların performans özeti — okuma |
| `pd_seo_sem` | A2 | Anahtar kelime, hedef sayfa, sıralama, arama hacmi, SEM kampanya bağı — giriş |

### Karar 3 — Tek müşteri modülü, iki departmana açık

`crm_musteri` tek modüldür, tek `party` tablosuna yazar; **hem Satış hem Müşteri İlişkileri departmanına atanabilir.**

Bunun iki şema gereksinimi var:

**a) Modül–departman ilişkisi çoklu olmalı.** `module_catalog.department_key` tek departmana kilitliyor. Yerine:

```
module_catalog_departments(module_key, department_key, is_primary, sort_order)
```

**b) Departman bazlı varsayılan görünüm.** Aynı veriye iki departman farklı açıdan bakar — `views` jsonb içinde departman anahtarlı varsayılanlar:

| Departman | Varsayılan görünüm | Varsayılan filtre | Öne çıkan alanlar |
|---|---|---|---|
| Satış ve İş Geliştirme | Tablo | `role in (lead, customer)` | Potansiyel değer, son temas, sorumlu |
| Müşteri İlişkileri | Kart | `role = customer AND status = active` | Açık talep sayısı, memnuniyet, sözleşme bitişi |

Kayıtlar ortak, görünüm ayrı. İlke İ1'in ilk somut uygulaması budur.

---

## Önerilen Tasarım Sırası

Her arketipin **referans modülü** önce tam tasarlanır; motor onun üzerinden yazılır, kalanlar konfigürasyona düşer.

| Sıra | Referans modül | Arketip | Neden önce |
|---|---|---|---|
| 1 | `fm_gelir_gider` | A2 | En kalabalık arketip + herkes kullanır + `money_entry` varlığını tanımlar |
| 2 | `crm_musteri` (birleşik) | A2 | `party` ortak varlığını tanımlar; ilke İ1'in kanıtı |
| 3 | `spd_satis_planlama` | A4 | Aşama konfigürasyonu motorunu tanımlar |
| 4 | `panel_analiz` | A6 | 7 modülü birden açar; 1 ve 2'den beslenir |
| 5 | `pd_sosyal_medya` | A5 | Takvim + görev üretimi motorunu tanımlar |
| 6 | `oud_depo` | A3 | En karmaşık, en az tekrarlanan — sona |
| 7 | `yonetim_kimlik_yon` | A1 | Trivial, istediğin an |
