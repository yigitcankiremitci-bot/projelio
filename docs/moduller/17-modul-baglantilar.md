# Modül Planı — Bağlantı ve İlişkiler

> **Durum (2026-10-08):** Faz 1 ve Faz 2 yazıldı, migration 153 canlıda uygulandı. Faz 3 (Lio) plan.
>
> Faz 2'de plandan sapma: "Müşteri yap"ın tersi ("Bağlantılara ekle") da yazıldı; uç
> `POST /party/:id/defter`. Görev listesi `GET /party/:id/gorevler` — görev, kullanıcının
> görebildiği departman/projedeyse döner. Excel'de bağlantı şablonu ayrı
> (`GET /party-template?modul=baglantilar`); genel "Not" sütunu yok, yerine İlişki notu.
>
> Çıkış noktası: fuarda toplanan kartvizitler. Kişilerin çoğu müşteri değil;
> rakip, olası işbirlikçi ya da benzer iş yapan meslektaş. Müşteriler modülü
> bunu karşılamıyor, çünkü satış ekibinin listesine bu kişileri karıştırıyor.

---

## 1. Kimlik

| | |
|---|---|
| key | `baglantilar` |
| Ad | Bağlantı ve İlişkiler |
| Departman | Satış ve İş Geliştirme (birincil) · Pazarlama ve Büyüme · Yönetim |
| Kapsam | organization, job (serbest çalışana da uygun) |
| Arketip | Ortak varlık paneli (`party`'ye bakar, `module_records`'a yazmaz) |
| Hassasiyet | `normal`. İlişki notları `yuksek` sayılır, bkz. §3.2 |

**Bu modül şu değildir:** müşteri defteri (o `crm_musteri`), satış hunisi
(o tasarlandı ama yazılmadı: `21-motor-a4-pipeline.md`).

---

## 2. Verilen kararlar

1. **Veri tek tabloda: `party`.** Bağlantılar ayrı bir tablo açmaz. Bugünün
   bağlantısı yarın müşteri olur. Ayrı tabloda kişi iki yerde ayrı ayrı eskir,
   üstelik WhatsApp, Lio, Excel içe aktarma ve yinelenen kayıt yakalama
   baştan yazılmak zorunda kalır.
2. **Görünürlük: kayıt hangi modülde açıldıysa orada görünür** (kullanıcının
   1. seçeneği). Bağlantılar'da açılan kişi Müşteriler'de çıkmaz. Müşteri
   rolü aldığında iki modülde birden görünür. Kopyalanmaz, taşınmaz.
3. **Ad: Bağlantı ve İlişkiler; yeri Satış.** Yönetim ve Pazarlama'dan da
   eklenebilir — departmanlar aynı defteri görür. Anahtar departmansız
   (`baglantilar`), çünkü tek bir departmana ait değil.

---

## 3. Veri

### 3.1 `party` üzerinde değişenler (migration 153)

```sql
-- Kayıt hangi modül(ler)in listesinde görünür. Rol "ne olduğu"nu, bu alan
-- "kimin defterinde olduğu"nu söyler. İkisi ayrı sorular: rakip bir firma
-- tedarikçimiz de olabilir ama yalnızca yönetimin defterinde durabilir.
alter table public.party
  add column if not exists modules text[] not null default '{crm_musteri}';
create index if not exists party_modules_idx on public.party using gin(modules);
```

Mevcut kayıtların hepsi varsayılan değerle `crm_musteri` olarak işaretlenir,
yani bugünkü davranış hiç değişmez.

**Yeni roller** (`PartyRole`): `competitor` (Rakip), `collaborator`
(İşbirliği), `contact` (Bağlantı). Bu rollere `partner` adı verilmez, çünkü
o ad sistemde hisse ortakları için kullanılıyor (`partners` tablosu).

> ⚠️ Rol değerleri bugün sunucuda **doğrulanmıyor**: `roles` istemciden
> geldiği gibi yazılıyor. Yeni rollerle birlikte izin verilen değerler
> listesi (`PARTY_ROLES`) shared'a konacak ve servis bilinmeyen değeri
> reddedecek.

### 3.2 Bağlantılar'a özel alanlar: `party_baglanti` (aynı migration)

```sql
create table public.party_baglanti (
  party_id         uuid primary key references public.party(id) on delete cascade,
  onem             varchar not null default 'orta' check (onem in ('yuksek','orta','dusuk')),
  tanisma_yeri     varchar,          -- "Fuar 2026 — İstanbul", serbest metin
  tanisma_tarihi   date,
  sonraki_temas    date,             -- listede "bugün/geçti" vurgusu bundan
  iliski_notu      text,             -- "rakip ama X konusunda ortak iş yapılabilir"
  updated_at       timestamp not null default current_timestamp
);
```

**Neden `party.data` ya da `party.notes` değil:** Bir bağlantı müşteri
olduğunda kart Müşteriler'de de görünür ve satış ekibi `notes` alanını okur.
"Rakip, fiyatları bizden düşük, ortaklık için X'e yaklaşılabilir" gibi bir
not satışçıya açılmamalı. Bu alanlar ayrı tabloda durursa yalnızca
`baglantilar` okuma yetkisi olana dönülür. Ayrıca önem ve sonraki
temas tarihi sıralanıp filtrelenebilsin diye gerçek sütun olmalı, jsonb değil.

**Temas geçmişi (`party_activity`) ortak kalır.** "Fuarda tanıştık, 12'sinde
aradım" bilgisi müşteri olduktan sonra da işe yarar. Gizli olan geçmiş değil,
ilişki notu.

---

## 4. Yetki

Bugün her şey `crm_musteri` sabitine bağlı (`party.service.ts`, `MODULE_KEY`).
Değişecekler:

- `access(scope, userId)` → `access(scope, userId, moduleKey)`. Varsayılan
  `crm_musteri`, böylece sipariş/tahsilat ve diğer çağıranlar değişmez.
- **Kayda göre okuma:** `assertCanRead` kaydın `modules` dizisindeki
  modüllerden **herhangi birinde** okuma yetkisi arar. Kart `/party/:id`
  ucundan açılsa bile, yalnızca Bağlantılar'da olan bir kaydı Müşteriler
  yetkisiyle okumak mümkün olmamalı.
- **Liste uçları:** `findAll` bir `moduleKey` alır ve `modules @> {key}`
  ile süzer. **Diğer modüllerin müşteri seçicileri** (fatura, alacak-borç,
  ürün tedarikçisi, sipariş) `crm_musteri` ile çağırır. Böylece bir rakibin
  kartı fatura seçicisinde çıkmaz.
- `party_baglanti` okuma ve yazma işleri yalnızca `baglantilar`
  yetkisinden geçer.
- Bağlantılar'da "çalışan yalnızca kendisine atananları görür" kuralı
  **yok**. Bu bir yönetim modülü; erişimi olan herkes hepsini görür.
  (Müşteriler'deki `musterilerim` kuralı aynen kalır.)

### Müşteriye dönüşüm

Kart üzerinde "Müşteri yap" düğmesi:
1. `customer` rolünü ekler (rol eklenir, silinmez; bugünkü kural),
2. `modules`'e `crm_musteri` ekler,
3. geçmişe `sistem` satırı yazar: "Bağlantılar'dan müşteriye dönüştü".

Bunu yalnızca **iki modülde birden yazma yetkisi olan** kişi yapabilir.
Satış ekibine kart vermek bir karar ve yönetime ait.

Tersi yönde de aynı mekanizma çalışır: Müşteriler'deki bir kart
"Bağlantılara ekle" ile `baglantilar`'a da alınabilir. Bunun için
de iki modülde yetki gerekir.

### Yinelenen kayıt kontrolü

`checkDuplicates` yalnızca kullanıcının **okuyabildiği** modüllerdeki
kayıtlarla karşılaştırır. Aksi hâlde "bu adla bir kayıt var" uyarısı
görmeye yetkisi olmadığı bir müşterinin varlığını sızdırırdı. Vergi
numarası tekil indeksi (`party_org_tax_uniq`) modülden bağımsız kalır. Bu
yüzden aynı vergi numarasıyla ikinci kayıt açılamaz. Kullanıcı kaydı
göremiyorsa hata mesajı yalnızca "bu vergi numarası şirkette kayıtlı" der,
kaydın adını vermez.

---

## 5. Arayüz

`CustomersPanel.tsx` kopyalanmaz. Ortak gövde bir `moduleKey` ve bir
profil alır (`partyProfiles.ts`'teki yapı zaten bunun için var):

| | Müşteriler | Bağlantılar |
|---|---|---|
| Varsayılan sıralama | ad | önem, sonra sonraki temas |
| Satır altı | rol · durum · telefon | rol · tanışma yeri · sonraki temas |
| Filtreler | rol, durum, sorumlu | rol, önem, tanışma yeri, etiket |
| Kart sekmeleri | Bilgi · Kişiler · Geçmiş · Siparişler | Bilgi · Kişiler · Geçmiş · **İlişki** · **Görevler** |
| Birincil eylem | Aktivite ekle | Takip görevi aç |

- `ENTITY_MODULE_KEYS` → `["crm_musteri", "baglantilar"]`.
  `ModuleSurface.tsx` ikisini aynı panele yönlendirir.
- **Sonraki temas vurgusu:** tarihi geçmiş olan kırmızı, bugünkü vurgulu.
  Renkler paletten (`theme.ts`) alınır.
- **Hızlı ekleme:** ad + önem + tanışma yeri. Fuar dönüşü 40 kartı tek tek
  uzun formla girmek kimsenin yapmayacağı bir iş.
- Excel içe aktarma şablonuna önem, tanışma yeri ve not sütunları eklenir.
  İçe aktarmanın hangi modüle yazdığını açıldığı panel belirler.

### Görevler

Altyapı var: `tasks.source_module_key` + `source_record_id` (migration
051) ve `TaskFromRecordModal.tsx`. Bağlantılar `source_module_key =
'baglantilar'`, `source_record_id = party.id` ile görev açar.
Görevler sekmesi bu iki alana göre listelenir. Görev nerede yaşar
(Yönetim departmanının görevleri ya da seçilen bir proje): bunu
`TaskFromRecordModal` zaten soruyor.

> 051'deki sütun yorumu "module_records kaydının id'si" diyor. Artık bir
> party id'si de olabileceği için yorum güncellenir (kısıt yok, sorun değil).

---

## 6. Lio

- Mevcut `list_customers` / `create_customer` / `update_customer`
  araçlarına bir `module` parametresi eklenmez. Bunun yerine üç ayrı araç
  yazılır: `list_connections` / `create_connection` / `update_connection`.
  Gerekçe: model "müşteri" ile "bağlantı"yı karıştırırsa rakip satış
  listesine düşer. Araç adı kararı modele bırakmamanın en sağlam yolu.
- **Kartvizitten kayıt:** kullanıcı kartvizit fotoğraflarını (sohbette ya
  da WhatsApp'tan) verir, Lio okur ve önce **önizleme** gösterir: "12 kişi
  okudum, 2'si zaten kayıtlı". Kayıtlar onaydan sonra açılır. Sosyal
  medya taslağındaki kural burada da geçerli: onay, kullanıcıdan gelen
  yeni bir mesajla verilir.
- `create_followup_task`: bir bağlantı için takip görevi açar (§5'teki bağla).

---

## 7. Fazlar

| Faz | Kapsam | Değer |
|---|---|---|
| **1** | Migration 153 (`modules`, `party_baglanti`, katalog satırı) · yeni roller + sunucuda rol doğrulama · yetkinin `moduleKey`'e bağlanması · seçicilerin `crm_musteri`'ye sabitlenmesi · panel ve kartın Bağlantılar profili · önem/tanışma/sonraki temas · hızlı ekleme | Fuar listesi girilebilir, sıralanabilir, satıştan ayrı |
| **2** | Görevler sekmesi + takip görevi · müşteriye dönüşüm / bağlantılara ekleme · Excel şablonuna yeni sütunlar | Takip edilebilir |
| **3** | Lio araçları + kartvizit fotoğrafından toplu kayıt | 40 kartvizit tek mesajda |

Faz 1 tek başına yayınlanabilir. Migration uygulanmadan yayınlanırsa
`modules` sütunu olmayacağından **müşteri listesi de kırılır**. Bu yüzden
sıra şu: migration, sonra push.

---

## 8. Testler (node --test, kaynağın yanında)

- Yetki kararı saf bir fonksiyon olarak yazılır (`baglanti-erisim.ts`):
  yalnızca Bağlantılar'da olan kayıt Müşteriler yetkisiyle okunamaz ·
  iki modüldeki kayıt ikisinden biriyle okunur · `party_baglanti` müşteri
  yetkisiyle dönmez · dönüşüm iki yetki ister.
- `checkDuplicates` görülemeyen modüldeki kaydın adını döndürmez.
- Rol doğrulaması bilinmeyen değeri reddeder.
- Seçiciler (`findAll` + `crm_musteri`) rakibi listelemez.

---

## 9. Açık sorular (kod yazılırken karar verilebilir)

- Bağlantılar holding (`groups`) düzeyinde paylaşılsın mı? Önerim: şimdilik
  hayır, kapsam yalnızca organizasyon ve iş.
- Önem üç kademe mi, yoksa beş yıldızlı bir puan mı? Önerim üç kademe, çünkü
  fuar dönüşü hızlı karar verilecek bir şey.
