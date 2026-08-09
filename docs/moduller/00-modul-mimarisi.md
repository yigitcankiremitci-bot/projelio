# Projelio — Modül Mimarisi ve Modül Sözleşmesi

> Bu doküman, 57 modülün her birini ayrı ayrı tasarlamak yerine **6 arketip + ortak varlık katmanı** üzerinden konfigüre edilebilir hale getirmek için yazıldı. Her modül bundan sonra bu dokümandaki "Modül Sözleşmesi" formatında tanımlanır.

---

## 0. Temel İlkeler

**İ1 — Varlık modülden bağımsızdır.**
Modül, veriyi *sahiplenmez*; ortak bir varlığa açılan bir penceredir. "Müşteri" verisi tek yerde durur; Satış departmanı ile Müşteri İlişkileri departmanı aynı veriye farklı görünüm ve izinle bakar. Bu ilke ihlal edilirse veri bölünür ve ürün ölür.

**İ2 — Çekirdek modül değildir.**
Görev, proje, program, çıktı, dosya, bütçe ve bildirim ürünün çekirdeğidir; kapatılabilir modül olarak sunulmaz. "Yönetim → Görev yönetimi modülü" gibi kayıtlar modül değil, **çekirdeğe departman bazlı erişim yetkisidir**.

**İ3 — Modül = şema, kod değil.**
Bir modülü eklemek yeni ekran yazmak değil, katalog kaydına alan şeması + görünüm tanımı yazmak olmalıdır. Frontend arketip başına bir kez yazılır.

**İ4 — Departman zorunluluk değil, öneridir.**
`department_key` modülü kilitlemez; kurulum sihirbazında öneri üretir. Küçük işletmede bir kişi hem finans hem satış yapar.

**İ5 — İzole modül değersizdir.**
Her modülün en az bir "besleyen" veya "beslenen" ilişkisi olmalı. Yoksa kullanıcı aynı veriyi iki kez girer. İlişkisi olmayan modül ya birleştirilir ya silinir.

**İ6 — UI yüzeyi arketipten türer, keyfi seçilmez.**
Modal mı sekme mi kararı modül bazında verilmez; arketip belirler (bkz. §2).

---

## 1. Katman Modeli

```
Çekirdek        : users, jobs, projects, operations, tasks, outputs, files, notifications
Ortak Varlıklar : party, money_entry, document, item, pipeline_record, plan_entry, metric
Modüller        : ortak varlığa açılan, şema ile tanımlı görünüm + form + izin paketi
Departmanlar    : modül önerisi + kadro + izin sınırı
Organizasyon    : hangi modüller açık, kim atanmış
```

Modül **veri katmanı değildir**. Modül; bir varlık + alan alt kümesi + görünüm + izin + otomasyon demetidir.

---

## 2. Arketipler

Altı arketip 57 modülün tamamını karşılıyor. Her arketip için frontend bir kez yazılır.

### A1 — Form / Doküman (tek kayıt)

| | |
|---|---|
| **Kardinalite** | Organizasyon (veya departman) başına 1 kayıt |
| **UI yüzeyi** | Modal |
| **Görünümler** | Form (düzenleme) + Okuma görünümü |
| **Ayırt edici** | Liste yok. Versiyon geçmişi var. |
| **Depolama** | `module_records` (tek satır), `data jsonb` |
| **Tipik eylemler** | Düzenle, Versiyonla, PDF olarak dışa aktar, Paylaş |
| **Örnekler** | Vizyon, Misyon, Hedef belirleme |

Not: A1 kayıtları genellikle *diğer modüllerin referans aldığı* çerçeve verilerdir (ör. hedefler → performans izleme).

---

### A2 — Kayıt Listesi (Ledger / CRUD)

| | |
|---|---|
| **Kardinalite** | N kayıt |
| **UI yüzeyi** | Tam sayfa sekme + detay yan panel (drawer) |
| **Görünümler** | Tablo (varsayılan), Kart, Gruplu tablo |
| **Ayırt edici** | Filtre, arama, sıralama, toplu işlem, CSV/XLSX dışa aktarım, sütun seçici |
| **Depolama** | `module_records` çoklu satır **veya** ilgili ortak varlık tablosu |
| **Tipik eylemler** | Ekle, Düzenle, Arşivle, Dosya ekle, Görev oluştur, Dışa aktar |
| **Örnekler** | Gelir-Gider, Fatura, Alacak-Borç, Sözleşme, Mevzuat, Marka/Patent, Hedef kitle |

**Alt tip A2-F (Finansal):** Tutar + para birimi + tarih alanı zorunlu; alt toplam satırı, dönem filtresi ve `metric` yayını otomatik gelir.

---

### A3 — Envanter (Kalem + Hareket)

| | |
|---|---|
| **Kardinalite** | N kalem, her kaleme N hareket |
| **UI yüzeyi** | Tam sayfa sekme, iki seviyeli (kalem listesi → hareket geçmişi) |
| **Görünümler** | Kalem tablosu, Hareket defteri, Düşük stok uyarı listesi |
| **Ayırt edici** | **Bakiye hiçbir zaman doğrudan yazılmaz**, hareketlerden türetilir. Negatif stok kuralı, birim, lokasyon. |
| **Depolama** | `item` + `item_movement` (yeni ortak varlık) |
| **Tipik eylemler** | Kalem ekle, Giriş, Çıkış, Sayım/Düzeltme, Transfer, Kritik seviye ayarla |
| **Örnekler** | Depo, Tedarik, Sevkiyat |

---

### A4 — Pipeline (Aşamalı Süreç)

| | |
|---|---|
| **Kardinalite** | N kayıt, her kayıt tek aşamada |
| **UI yüzeyi** | Tam sayfa sekme |
| **Görünümler** | Kanban (varsayılan), Tablo, Huni/dönüşüm özeti |
| **Ayırt edici** | Aşama tanımı konfigüre edilebilir. Aşama geçiş kaydı tutulur (kim, ne zaman). SLA / bekleme süresi. Kazanıldı-kaybedildi sonucu. |
| **Depolama** | `pipeline_record` + `pipeline_stage_event` |
| **Tipik eylemler** | Kayıt aç, Aşama değiştir, Sorumlu ata, Not/aktivite ekle, Sonuçlandır |
| **Örnekler** | İşe alım, Satış planlama, Şikayet/Öneri, Teknik destek, Kalite kontrol |

Kritik: aşamalar **veri değil konfigürasyon**. Her şirket kendi aşamalarını tanımlar — "kendi ünik yapısına uyarlama" tezinin en somut karşılığı burasıdır.

---

### A5 — Takvim / Plan (Zaman eksenli)

| | |
|---|---|
| **Kardinalite** | N kayıt, her kaydın planlanmış zamanı var |
| **UI yüzeyi** | Tam sayfa sekme |
| **Görünümler** | Takvim (varsayılan), Zaman çizelgesi, Tablo |
| **Ayırt edici** | Tekrar kuralı (`operation_routines` ile aynı motor). Plan → **görev üretimi**. Durum: planlandı / yayınlandı / iptal. |
| **Depolama** | `plan_entry` (+ üretilen `tasks` kayıtları) |
| **Tipik eylemler** | Planla, Sürükle-taşı, Tekrar kuralı ata, Göreve dönüştür, Sonucu işaretle |
| **Örnekler** | Sosyal medya, Reklam, E-mail, Eğitim ve gelişim planlama |

---

### A6 — Türev Panel (Salt okunur / hesaplanmış)

| | |
|---|---|
| **Kardinalite** | Kendi kaydı **yoktur** |
| **UI yüzeyi** | Tam sayfa sekme |
| **Görünümler** | Kart ızgarası + grafik + detay tablosu |
| **Ayırt edici** | Veri girişi yok. Kaynak modüller seçilir; kaynak kapalıysa panel boş uyarı verir. Dönem seçici zorunlu. |
| **Depolama** | Yok — sorgu/görünüm (`metric` okur) |
| **Tipik eylemler** | Dönem seç, Kırılım değiştir, Dışa aktar, Rapor olarak kaydet, Paylaş |
| **Örnekler** | Analiz, Raporlama, Nakit akış, Denetim, Performans izleme, Finansal planlama, Bütçe hazırlama |

**Bu arketip 57 modülün ~%20'sini kapsıyor ve tek bir konfigüre edilebilir dashboard motoruyla çözülür.** En büyük tasarruf kalemi burası.

---

### Arketip seçim akışı

```
Kayıt tutuyor mu?
├─ Hayır → A6 Türev Panel
└─ Evet
   ├─ Tek kayıt mı?              → A1 Form
   └─ Çok kayıt
      ├─ Miktar/bakiye var mı?   → A3 Envanter
      ├─ Aşamadan aşamaya mı geçiyor? → A4 Pipeline
      ├─ Zaman ekseninde mi yaşıyor?  → A5 Takvim
      └─ Diğer                   → A2 Kayıt Listesi
```

---

## 3. Ortak Varlıklar

Modüller bunları **paylaşır**. Aynı varlığa iki modül bakabilir; veri tek yerdedir.

| Varlık | Ne | Hangi modüller bakar |
|---|---|---|
| `party` | Kişi/kurum: müşteri, tedarikçi, aday, iş ortağı. `roles[]` ile ayrışır. | Müşteri (Satış), Müşteri (Müş. İlişkileri), Tedarik, Ortaklık/Dağıtım, İşe Alım |
| `money_entry` | Para hareketi: gelir, gider, alacak, borç. Yön + tutar + tarih + karşı taraf. | Gelir-Gider, Alacak-Borç, Fatura, Nakit Akış, Bütçe, Analiz |
| `document` | Dosyalı, tarihli, taraflı kayıt: sözleşme, fatura, tescil, mevzuat. | Sözleşme, Fatura, Marka/Patent, Mevzuat |
| `item` + `item_movement` | Stok kalemi ve hareketleri | Depo, Tedarik, Sevkiyat |
| `pipeline_record` + `pipeline_stage_event` | Aşamalı süreç kaydı | İşe alım, Satış, Şikayet, Teknik destek, Kalite kontrol |
| `plan_entry` | Zamanlanmış planlama kaydı | Sosyal medya, Reklam, E-mail, Eğitim planı |
| `metric` | Modüllerin yayınladığı ölçüm (dönem + değer + boyut) | Tüm A6 panelleri |

**Kural:** Yeni bir modül tasarlarken önce "bu hangi ortak varlığı kullanır?" sorulur. Cevap "hiçbiri" ise, ya yeni ortak varlık gerekçelendirilir ya da modül `module_records.data` içinde serbest şemayla yaşar.

---

## 4. Alan Tipi Sözlüğü

`data jsonb` içindeki alanlar bu tiplerden birini kullanır. Frontend her tip için bir kez input bileşeni yazar.

| Tip | Not |
|---|---|
| `text` | Tek satır |
| `longtext` | Zengin metin |
| `number` | Ondalık hassasiyeti parametreli |
| `currency` | Tutar + para birimi çifti |
| `percent` | |
| `date` / `datetime` | |
| `select` / `multiselect` | Seçenekler konfigürasyonda tanımlı |
| `boolean` | |
| `user_ref` | Organizasyon üyesi |
| `entity_ref` | Ortak varlık referansı (ör. `party`) |
| `module_ref` | Başka modülün kaydına referans |
| `file` | Drive/OneDrive bağlantılı |
| `url` / `email` / `phone` | |
| `tags` | |
| `formula` | Salt okunur, diğer alanlardan hesaplanır |

Her alan tanımı: `key, label, type, required, default, help, group, visible_in_list, editable_by[]`.

---

## 5. Modül Sözleşmesi (her modül bu formatta yazılır)

```markdown
# <Modül Adı>

## 1. Kimlik
- key:
- Önerilen departman(lar):
- Arketip:            A1 | A2 | A3 | A4 | A5 | A6
- Kapsam:             holding | organization | job(freelancer)
- Freelancer'a uygun: evet | hayır
- Çekirdek mi:        hayır   (evet ise modül değildir)

## 2. Amaç
Tek cümlede: kim, ne zaman, hangi kararı vermek için açar.
(Katalogdaki `description` alanına bu cümle yazılır.)

## 3. Veri
- Ortak varlık:
- Alanlar: (alan tipi sözlüğünden)
  | key | label | tip | zorunlu | listede görünür | not |

## 4. Görünümler
- Varsayılan görünüm:
- Diğer görünümler:
- Filtreler:
- Gruplama / kırılım:

## 5. Eylemler
- Birincil eylem (ekranın sağ üstündeki buton):
- İkincil eylemler:
- Toplu eylemler:

## 6. İzinler
| Rol | Görme | Ekleme | Düzenleme | Silme | Dışa aktarma |
|---|---|---|---|---|---|
| Modül yöneticisi | | | | | |
| Modül üyesi | | | | | |
| Departman üyesi (atanmamış) | | | | | |
| Organizasyon yöneticisi | | | | | |
| Ortak (partner) | | | | | |

Hassasiyet: normal | gizli   (gizli → varsayılan görünürlük yalnızca atananlar)

## 7. İlişkiler
- Beslendiği modüller:
- Beslediği modüller:
- Çekirdek bağı: (görev üretir mi? çıktıya bağlanır mı? dosya tutar mı?)
- Yayınladığı metrikler:

## 8. Otomasyon ve Bildirim
- Tetikleyiciler:
- Bildirim alacaklar:
- Otomatik görev üretimi:

## 9. Boş Durum
- Boş ekran metni:
- İlk kurulumda gelen örnek/şablon veri:
- "Bu modül şunu da açmanı gerektirir" uyarısı:
```

---

## 6. Şema Değişiklik Önerisi

> Henüz uygulanmadı — onayınla migration'a çeviririm.

### `module_catalog` — eklenecek kolonlar

| Kolon | Tip | Amaç |
|---|---|---|
| `archetype` | varchar | `a1_form` … `a6_panel` |
| `entity_key` | varchar null | Kullandığı ortak varlık |
| `is_core` | boolean | true → modül listesinde gösterilme, çekirdek yetkisi olarak sun |
| `ui_surface` | varchar | `modal` \| `page` (arketipten türetilir, override edilebilir) |
| `default_view` | varchar | `table` \| `kanban` \| `calendar` \| `form` \| `dashboard` |
| `icon` | varchar | Kart görünümü için |
| `schema` | jsonb | Alan tanımları |
| `views` | jsonb | Görünüm ve filtre tanımları |
| `depends_on` | text[] | Beslendiği modül key'leri |
| `sensitivity` | varchar | `normal` \| `confidential` |
| `description` | — | **57 kaydın tamamı boş, doldurulacak** |

### Eksik tablo: `module_members`

Modüle kişi ataması şu an şemada yok. Gerekli:

```
module_members(id, organization_id | job_id, module_key, user_id,
               role: manager|member|viewer, assigned_by, created_at)
```

### `organization_modules` — eklenecek

`department_id uuid null` — aynı modül farklı departmanlarda açılabilsin, `module_records` ile tutarlı olsun.

### Silinecek / birleştirilecek katalog kayıtları

| Sorun | Kayıtlar | Öneri |
|---|---|---|
| Aynı varlık, iki modül | `mid_musteri_modulu`, `spd_musteri_modulu` | Tek `crm_musteri` modülü, iki departmana da önerilir |
| Aynı panel, üç kayıt | `yonetim_analiz`, `holding_analiz`, `fm_analiz_rapor` | Tek `panel_analiz`, kapsam parametreli |
| Aynı panel, iki kayıt | `yonetim_raporlama`, `holding_raporlama` | Tek `panel_raporlama` |
| Aynı panel, iki kayıt | `yonetim_denetim`, `holding_denetim` | Tek `panel_denetim` |
| Çekirdek, modül değil | `yonetim_proje_yonetimi`, `yonetim_program_yonetimi`, `yonetim_gorev_yonetimi`, `yonetim_cikti_yonetimi`, `yonetim_dosya_yonetimi`, `yonetim_butce_yonetimi` | `is_core = true`, modül kataloğundan kaldır |

**Net etki:** 57 katalog kaydı → ~44 gerçek modül + 6 çekirdek yetkisi. Tasarlanacak iş %23 azalır.

---

## 7. Kurulum Deneyimi Notu

Boş kutu sendromunu önlemek için:

1. Sihirbazda departman seçimi sonrası **her departmandan en fazla 3 modül** varsayılan olarak önerilir (`sort_order` en düşükler).
2. Geri kalanlar "Daha fazla modül" altında, açıklamalarıyla birlikte.
3. Bir modül açıldığında `depends_on` kontrol edilir; eksik besleyici varsa "Bu modülün anlamlı çalışması için X modülü de gerekli" uyarısı.
4. Her modül kurulumda **örnek/şablon veri** ile gelir (silinebilir) — boş tablo yerine dolu tablo görmek kullanımı belirgin şekilde artırır.
