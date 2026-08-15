# A1 — Form / Doküman Motoru (kurulum)

> Kapsam: **veri modeli + konfigürasyon + davranış.** Ekran yerleşimi, boş durum görseli ve mikro metin bu turda kasıtlı olarak yok — modüller kurulduktan sonra ayrı bir "görünümler" turunda ele alınacak.
>
> Bu motora düşen modüller: `kimlik_ve_yon`, `pd_urun_stratejileri` → **2 modül**

---

## 1. Ayırt edici kural

**Kapsam başına tek kayıt.** Liste yok, "yeni" düğmesi yok; ikinci kayıt oluşturulamaz. Geçmiş, kayıt çoğaltarak değil **sürüm** olarak tutulur.

Bugünkü kod bunu taklit ediyor: `visionConfig` / `missionConfig` her güncellemede yeni bir `module_records` satırı ekliyor ve satır sayısını "Sürüm" diye gösteriyor. İşe yarıyor ama üç şeyi yapamıyor — hangisinin yürürlükte olduğunu söyleyemiyor, taslak ile onaylıyı ayıramıyor, iki sürüm arasındaki farkı gösteremiyor.

---

## 2. Veri modeli

`module_records` değişmiyor; **tek satır** kullanılıyor. Üstüne bir tablo ve iki kolon geliyor.

### 2.1 Yeni tablo — `module_record_versions`

```sql
create table public.module_record_versions (
  id           uuid primary key default gen_random_uuid(),
  record_id    uuid not null references public.module_records(id) on delete cascade,
  data         jsonb not null,
  approved_by  uuid references public.users(id) on delete set null,
  approved_at  timestamp not null default current_timestamp,
  note         varchar          -- "neyi neden değiştirdik" — opsiyonel
);

create index module_record_versions_record_idx
  on public.module_record_versions(record_id, approved_at desc);
```

Sürüm satırı **yürürlükten düşen** metni saklar; yürürlükteki metin her zaman `module_records.data`'dadır. Böylece okuma yolu tek sorgu kalır, sürüm geçmişi yalnızca istendiğinde açılır.

### 2.2 `module_records` — eklenecek kolonlar

| Kolon | Tip | Amaç |
|---|---|---|
| `draft_data` | `jsonb null` | Onaylanmamış değişiklikler. Boşsa taslak yok |
| `updated_at` | `timestamp` | Taslağın en son ne zaman dokunulduğu |

### 2.3 Tek kayıt kısıtı

```sql
create unique index module_records_single_row_idx
  on public.module_records (coalesce(organization_id, job_id), module_key, coalesce(scope_ref, '00000000-0000-0000-0000-000000000000'::uuid))
  where archived_at is null;
```

`scope_ref` yeni bir kolon (uuid, null): A1'in "kapsam başına tek kayıt"ındaki kapsamı adresler.

| Modül | Kapsam | `scope_ref` |
|---|---|---|
| `kimlik_ve_yon` | Organizasyon (veya iş) | `null` |
| `pd_urun_stratejileri` | Ürün | `products.id` |

Yani ürün stratejisi modülünde **her ürün için bir** strateji dokümanı olur; kısıt aynı motorla sağlanır.

---

## 3. Konfigürasyon şeması

`ModuleRecordConfig` yanına ikinci bir tip. Ortak alan tanımları (`ModuleFieldConfig`) aynen kullanılır, iki ekle:

```ts
export interface ModuleFormConfig {
  kind: "form";                     // A1 işareti
  title: string;
  /** Kapsam: tek kayıt neye göre tekil. */
  scope: "organization" | "entity";
  scopeEntity?: "product";          // scope === "entity" ise
  /** Bölümler — form ve okuma görünümü bu sırayla render eder. */
  groups: { key: string; label: string; hint?: string }[];
  fields: ModuleFormFieldConfig[];  // ModuleFieldConfig + { group, requiredForApproval? }
  /** Onay için dolu olması gereken alanlar. */
  approvalRequires: string[];
  /** Gözden geçirme aralığı (ay). Verilirse review görevi üretilir. */
  reviewIntervalMonths?: number;
  /** Boş kaydı doldurmak için hazır şablonlar. */
  templates?: { key: string; label: string; data: Record<string, unknown> }[];
}
```

### Eklenecek alan tipleri

| Tip | Neden gerekli |
|---|---|
| `longtext` | `textarea` tek satırlık bir kutu; A1'in gövdesi uzun metin. Biçimlendirme yok, yalnızca paragraf |
| `tags` | Değerler, anahtar kelimeler. Bugün yok, `multiselect` sabit seçeneklere bağlı |

`file` tipi A1 için gerekmiyor — dosya çekirdekte tutuluyor.

---

## 4. Motor davranışı

### 4.1 Taslak / Onay döngüsü

| Eylem | Ne olur |
|---|---|
| Düzenle → Kaydet | `draft_data` yazılır. Okuma görünümü **hâlâ onaylı metni** gösterir; başlıkta "Onaylanmamış değişiklik var" işareti |
| Onayla | `data` → `module_record_versions`'a kopyalanır, `draft_data` → `data` olur, `draft_data = null`, `approved_by`/`approved_at` damgalanır |
| Taslağı at | `draft_data = null` |
| Sürüme geri dön | Seçilen sürüm `draft_data`'ya yazılır — doğrudan yürürlüğe **girmez**, kullanıcı onaylar |

Kural: **onay dışında hiçbir yol yürürlükteki metni değiştiremez.** Taslak kaydetmek serbest, onay yetkisi ayrıdır (bkz. §5).

### 4.2 Fark (diff)

Alan bazında, metin alanlarında kelime bazında. Sürüm listesi: tarih · onaylayan · değişen alanlar. Uygulamada başka yerde diff yok; bu motorla birlikte küçük bir yardımcı olarak gelir ve ileride sözleşme/mevzuat sürümlerinde de kullanılır.

### 4.3 Gözden geçirme

`reviewIntervalMonths` doluysa: onay anında `review_at = approved_at + interval` hesaplanır. Tarih geldiğinde çekirdek görev üretilir (sorumlu: son onaylayan) ve kayıt `outdated` işaretlenir. **Silme veya gizleme yok** — eski metin de olsa görünmeye devam eder.

### 4.4 Boş kayıt

Modül açıldığında satır **oluşturulmaz**. İlk kaydetmede satır doğar. Böylece "hiç doldurulmamış" ile "boşaltılmış" ayırt edilebilir; paneller `kimlik_tanimli` sağlığını buradan okur.

---

## 5. İzinler

| Yetki | Kim |
|---|---|
| Okuma | Organizasyondaki herkes (`sensitivity = normal`) |
| Taslak yazma | Modül üyesi ve üstü |
| **Onaylama** | Modül yöneticisi + organizasyon yöneticisi |
| Sürüme geri dönme | Onaylayabilenler |

Arketip kararı: A1'de okuma varsayılan olarak organizasyona açıktır. Sebep basit — bu metinlerin işi görünmektir. Gizli tutulması gereken bir A1 modülü çıkarsa `sensitivity = confidential` ile kilitlenir.

---

## 6. Modül kurulumları

### 6.1 `kimlik_ve_yon`

Tam sözleşme: `12-modul-kimlik_ve_yon.md`. Motor açısından özeti:

```
scope: organization
groups: yon (Yön) · kimlik (Kimlik) · durum (Durum)
approvalRequires: vision, mission
reviewIntervalMonths: 12
templates: uretim, hizmet
```

| Alan | Tip | Bölüm |
|---|---|---|
| `vision` | `longtext` | yon |
| `horizon` | `select` (1/3/5/10 yıl) | yon |
| `mission` | `longtext` | kimlik |
| `audience` | `text` | kimlik |
| `values` | `tags` | kimlik |
| `value_notes` | `longtext` | kimlik |
| `positioning` | `text` | kimlik |
| `effective_from` · `review_at` · `status` · `approved_by` · `notes` | — | durum |

### 6.2 `pd_urun_stratejileri`

```
scope: entity → product
groups: konum (Konumlandırma) · pazar (Pazar) · plan (Plan)
approvalRequires: positioning, target_segment
reviewIntervalMonths: 6
```

| key | label | tip | bölüm | not |
|---|---|---|---|---|
| `product_id` | Ürün | `entity_ref → products` | — | Kapsam alanı, kayıt açıldıktan sonra değişmez |
| `positioning` | Konumlandırma | `longtext` | konum | "Kime, neden bu ürün" |
| `differentiator` | Farklılaştırıcı | `longtext` | konum | Rakipten ayıran tek şey |
| `target_segment` | Hedef segment | `text` | pazar | `pd_hedef_kitle` açıksa persona seçimi |
| `pricing_note` | Fiyatlandırma yaklaşımı | `longtext` | pazar | Fiyatın kendisi `products`'ta |
| `competitors` | Rakipler | `tags` | pazar | `pazar_rakip_analizi` kayıtlarından öneri |
| `channels` | Satış kanalları | `multiselect` | plan | Doğrudan, bayi, pazaryeri, web, ihracat |
| `roadmap_note` | Yol haritası | `longtext` | plan | Sürüm/geliştirme niyeti |
| `success_metric` | Başarı ölçütü | `text` | plan | `hedef_yonetimi`'ne bağlanabilir |
| `status` · `effective_from` · `review_at` | — | durum | |

Ürün silinirse strateji kaydı arşivlenir, silinmez.

---

## 7. Göç

| Adım | İş |
|---|---|
| 1 | `module_record_versions` + `draft_data`, `updated_at`, `scope_ref` kolonları (migration `049`) |
| 2 | `yonetim_vizyon_sablonu` / `yonetim_misyon_sablonu` kayıtlarını `kimlik_ve_yon` tek satırına birleştir; kalanları sürüm olarak taşı |
| 3 | Eski iki katalog kaydını pasifleştir, açık organizasyonlarda `kimlik_ve_yon` aç |
| 4 | Tek kayıt kısıtını **veri temizlendikten sonra** ekle (aksi halde migration düşer) |

Göç geri alınabilir olmalı: eski satırlar silinmez, `superseded_by` ile işaretlenir.

---

## 8. Bu motor bittiğinde

- 2 modül konfigürasyona düşer
- Sürüm/onay altyapısı doğar — `hud_sozlesme` ve `hud_mevzuatlar` ileride aynı tabloyu kullanır
- `longtext` ve `tags` alan tipleri diğer arketiplere de açılır

**Tahmini büyüklük:** 1 migration · 1 yeni panel bileşeni (okuma + form + sürüm) · 2 konfigürasyon dosyası. Dört motorun en küçüğü — ısınma turu olarak buradan başlamak mantıklı.
