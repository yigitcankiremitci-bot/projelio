# A3 — Envanter Motoru (kurulum)

> **⛔ UYGULANMADI — bu bir tasarım belgesidir.**
>
> `ModuleInventoryConfig`, hareket tablosu ve bakiye türetme kodda **yok**. Bugün var olan tek şey, hangi modülün envanter yüzeyine ait
> olduğunu söyleyen anahtar listesi (`apps/web/src/lib/moduleSurfaces.ts`) —
> motorun kendisi değil, yalnızca yüzey eşlemesi.
>
> Aşağıdaki "bugünkü kod şunu yapıyor" cümleleri belge yazıldığı **2026-08-15**
> tarihine aittir. Motor yazılacaksa bu tasarım başlangıç noktasıdır; ama önce
> kodun bugünkü hâline karşı yeniden doğrulanmalı.

> Kapsam: **veri modeli + hareket mantığı + depo kurulumu + tedarik/sevkiyat bağlantısı.** Kalem tablosu yerleşimi, hareket defteri görünümü ve kritik stok rozetleri bu turda yok — görünümler ayrı turda.
>
> Bu motora düşen modül: `oud_depo` → **1 modül** (besleyenler A4'te: `oud_tedarik`, `oud_sevkiyat_yonetimi`)

---

## 1. Ayırt edici kural

**Bakiye asla doğrudan yazılmaz, hareketlerden türetilir.**

Bugün `warehouseConfig`'te `quantity` elle girilen bir sayı. Bunun üç sonucu var: iki kişi aynı anda güncellerse biri diğerini eziyor; "stok neden 12'den 4'e düştü" sorusunun cevabı yok; sayım ile gerçek arasındaki fark hiçbir yerde durmuyor. Envanterde tek doğru model, bakiyenin **hareketlerin toplamı** olmasıdır.

İkinci kural: **kalem ≠ ürün.** `products` satılan şeydir (fiyatı, açıklaması, müşteriye bakan yüzü var). `item` depoda duran şeydir — hammadde, ambalaj, sarf malzemesi de olabilir. Bir ürün bir kaleme bağlanabilir, zorunlu değil.

---

## 2. Veri modeli

### 2.1 `item` — stok kalemi

```sql
create table public.item (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete cascade,
  job_id           uuid references public.jobs(id) on delete cascade,

  name             varchar not null,
  sku              varchar,
  barcode          varchar,
  unit             varchar not null default 'piece',   -- piece|kg|lt|m|box|pack
  category         varchar,

  product_id       uuid references public.products(id) on delete set null,  -- satılan ürünle bağ

  critical_level   numeric(14,3),          -- altına düşünce uyarı
  target_level     numeric(14,3),          -- ideal stok — sipariş önerisi bundan çıkar
  default_location varchar,

  -- Türetilmiş bakiye önbelleği. Kaynak DEĞİL, hızlandırıcı.
  cached_quantity  numeric(14,3) not null default 0,
  cached_at        timestamp,

  archived_at      timestamp,
  created_at       timestamp not null default current_timestamp,

  unique (coalesce(organization_id, job_id), sku)     -- sku doluysa tekil
);
```

`cached_quantity` bir istisna gibi görünüyor ama değil: **kaynak her zaman hareket tablosu**, bu kolon yalnızca liste ekranında 500 kalem için 500 toplama sorgusu yapmamak için var. Her hareket yazımında aynı işlemde güncellenir; tutarsızlık şüphesinde `recalculate(item_id)` ile yeniden kurulur.

### 2.2 `item_movement` — hareket

```sql
create table public.item_movement (
  id             uuid primary key default gen_random_uuid(),
  item_id        uuid not null references public.item(id) on delete cascade,

  kind           varchar not null
                 check (kind in ('in','out','adjust','transfer_in','transfer_out')),
  quantity       numeric(14,3) not null check (quantity > 0),   -- daima pozitif, yön kind'da
  occurred_at    timestamp not null default current_timestamp,

  location       varchar,
  unit_cost      numeric(14,2),
  currency       varchar(3),

  -- Kaynak: hareketi hangi kayıt doğurdu.
  source_type    varchar,        -- 'procurement' | 'shipment' | 'manual' | 'count' | 'production'
  source_id      uuid,           -- pipeline_record.id vb.

  note           varchar,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamp not null default current_timestamp
);

create index item_movement_item_idx on public.item_movement(item_id, occurred_at desc);
create index item_movement_source_idx on public.item_movement(source_type, source_id);
```

**Hareket silinmez.** Yanlış girilen hareket ters hareketle düzeltilir (`note` ile gerekçe). Muhasebede yevmiye kaydı nasıl silinmiyorsa burada da öyle — aksi halde geçmiş bakiyeler anlamsızlaşır.

### 2.3 Sayım — `adjust` hareketi

Sayımda kullanıcı **fark değil, sayılan miktarı** girer. Motor farkı hesaplar ve `adjust` hareketi yazar:

```
sayılan 47, sistem 52  →  adjust -5  (kind='adjust', quantity=5, note='Sayım farkı')
```

`adjust` hareketleri ayrı raporlanır: çok sayıda düzeltme, süreçte bir yerde hareket yazılmadığının işaretidir.

---

## 3. Konfigürasyon şeması

```ts
export interface ModuleInventoryConfig {
  kind: "inventory";
  title: string;
  addLabel: string;
  itemLabel: string;                 // "Kalem", "Malzeme"
  units: { value: string; label: string }[];
  /** Negatif stoka izin var mı. */
  allowNegative: boolean;
  /** Maliyet takibi: yok | son alış | ağırlıklı ortalama */
  costing: "none" | "last" | "weighted_average";
  /** Kalem üzerindeki ek alanlar. */
  itemFields?: ModuleFieldConfig[];
  /** Hareket üzerindeki ek alanlar. */
  movementFields?: ModuleFieldConfig[];
  /** Lokasyon (depo/raf) kullanımı. */
  locations: "off" | "free_text" | "managed";
}
```

Bu şema tek modül için fazla gelebilir; gerekçesi ileriye dönük: üretim yapan bir kullanıcı "hammadde deposu" ve "mamul deposu"nu iki ayrı modül örneği olarak açtığında ikisi farklı konfigürasyonla çalışacak.

---

## 4. Motor davranışı

| Konu | Kural |
|---|---|
| Bakiye | `sum(in + transfer_in) − sum(out + transfer_out) ± adjust`. Her yazımda `cached_quantity` aynı transaction'da güncellenir |
| Eşzamanlılık | Hareket yazımı kalem satırında `select … for update` ile serileştirilir. İki kişi aynı anda çıkış yaparsa ikisi de yazılır, bakiye doğru kalır |
| Negatif stok | `allowNegative = false` ise çıkış reddedilir ve "eldeki: 3, istenen: 5" mesajı verilir. `true` ise yazılır ama kalem "eksi bakiye" olarak işaretlenir |
| Kritik seviye | Bakiye `critical_level` altına inen her yazımda tetiklenir: modül üyelerine bildirim + isteğe bağlı `oud_tedarik` talebi açma önerisi |
| Maliyet | `costing = weighted_average` ise her girişte ortalama maliyet güncellenir; çıkışta o anki ortalama üzerinden değerleme. `none` ise maliyet alanı hiç gösterilmez |
| Transfer | İki lokasyon arası: tek işlemde `transfer_out` + `transfer_in` çifti yazılır, ikisi aynı `source_id` ile eşlenir |
| Kalem arşivleme | Bakiyesi sıfır olmayan kalem arşivlenemez; önce çıkış veya düzeltme istenir |
| Yeniden hesaplama | `recalculate(item_id)` yönetici eylemi; `cached_quantity`'yi hareketlerden yeniden kurar ve fark varsa denetim kaydına yazar |

---

## 5. Modül kurulumu — `oud_depo`

```
itemLabel: Kalem
units: adet · kg · litre · metre · kutu · paket
allowNegative: false
costing: weighted_average
locations: free_text        (yönetilen çoklu depo ikinci aşama)
```

**Kalem alanları:** `name`, `sku`, `barcode`, `unit`, `category`, `product_id` (`entity_ref → products`), `critical_level`, `target_level`, `default_location`, `notes`

**Hareket alanları:** `kind`, `quantity`, `occurred_at`, `location`, `unit_cost` (currency), `source_type`, `note`

**Türetilen göstergeler:** toplam kalem · kritik seviyedeki kalem · stoksuz kalem · toplam stok değeri (maliyet üzerinden) · bu ay giren/çıkan

### Zincir bağlantısı (A4 `stageEffects` karşılığı)

| Kaynak | Aşama | Hareket |
|---|---|---|
| `oud_tedarik` | `received` (Teslim alındı) | `in`, `source_type = procurement`, `unit_cost` sipariş fiyatından |
| `oud_sevkiyat_yonetimi` | `shipped` (Yola çıktı) | `out`, `source_type = shipment` |
| `oud_sevkiyat_yonetimi` | `returned` (İade) | `in`, `source_type = shipment`, not: "iade" |

Bu üç satır ürünün en güçlü "modüller birbirini besliyor" hikâyesi: kullanıcı tedarikte teslim aldı işaretler, depo kendiliğinden artar. **A4 motoru A3'ten önce yazılmalı** — efekt mekanizması orada, karşılığı burada.

Bağlantı **tek yönlü ve gevşek**: depo modülü kapalıysa efekt sessizce atlanır, tedarik kaydı yine de çalışır (İ5'in tersini yapmadan bağımlılık kurmamak).

---

## 6. Göç

| Adım | İş |
|---|---|
| 1 | `item` + `item_movement` (migration `052`) |
| 2 | Mevcut `oud_depo` kayıtları → `item`: `itemName → name`, `sku`, `unit`, `criticalLevel`, `location → default_location` |
| 3 | Her kalemin mevcut `quantity` değeri **açılış hareketi** olarak yazılır: `kind='in'`, `source_type='opening'`, `note='Devir — modül geçişi'`, `occurred_at = kaydın created_at` |
| 4 | `lastCountDate` doluysa ayrıca bir `adjust` yerine bilgi notu olarak `item.notes`'a taşınır (sahte hareket üretilmez) |
| 5 | Eski `module_records` satırları arşivlenir |

Açılış hareketi kararı önemli: bakiye kaynağı hareket tablosu olduğu için devirsiz göç, tüm stokları sıfırlar.

---

## 7. Bu motor bittiğinde

- Tedarik → Depo → Sevkiyat zinciri uçtan uca çalışır — demoda gösterilecek en ikna edici akış
- Stok değeri bir finansal metriğe dönüşür; `panel_analiz` ve `fm_nakit_akis` okuyabilir
- `products` ile bağ kurulduğu için "sattığım şeyin stoğu var mı" sorusu satış tarafında sorulabilir hale gelir

**Tahmini büyüklük:** 1 migration (2 tablo) · 1 servis (hareket yazımı + kilitleme + yeniden hesaplama) · 1 iki seviyeli panel bileşeni · 1 konfigürasyon. Tek modül için en pahalı motor — bu yüzden **sona bırakılıyor**, ama zincirin karşılığı olduğu için atlanamaz.

---

## Dört motorun sırası

| Sıra | Motor | Modül | Neden bu sırada |
|---|---|---|---|
| 1 | **A1** | 2 | En küçük; sürüm/onay altyapısı ve `longtext`/`tags` tipleri diğerlerine miras kalır |
| 2 | **A4** | 7 | En kalabalık; `stageEffects` mekanizması A3'ün ön şartı |
| 3 | **A5** | 5 | Tekrar motoru hazır (`operation_routines`), en yüksek kazanç/emek oranı |
| 4 | **A3** | 1 | En pahalı, tek modül, ama zincirin kapanışı |

Dördü bittiğinde 45 modülün tamamı **konfigürasyon** ile ayakta olur; bundan sonrası görünüm, boş durum ve mikro metin işidir.
