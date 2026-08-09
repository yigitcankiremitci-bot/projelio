# Ortak Varlık — `party`

> Dış dünyadaki kişi ve kurumların tek kaydı. 6 modül bu varlığa bakar: `crm_musteri`, `oud_tedarik`, `ik_ise_alim_oryantasyon`, `spd_ortaklik_dagitim`, `hud_sozlesme`, `fm_gelir_gider`.
>
> Bu varlık, İlke İ1'in ("varlık modülden bağımsızdır") temel taşıdır.

---

## 1. Neden tek tablo

Aynı firma çoğu zaman birden fazla rolde karşınıza çıkar:

- Bir tedarikçiden hizmet alıp ona ürün satarsınız → hem `supplier` hem `customer`
- Bir müşteri sonra bayiniz olur → `customer` + `distributor`
- Bir aday işe girmeyip serbest danışman olur → `candidate` + `supplier`

Rol başına ayrı tablo yaparsan aynı firmanın adresi, vergi numarası ve iletişim bilgisi 3 yerde tutulur; biri güncellenir ikisi eskir. Bu yüzden **rol bir alandır, tablo değil.**

### `party` ≠ `users` ≠ `partners`

| | Ne | Nerede |
|---|---|---|
| `users` | Projelio hesabı olan kişi (ekip üyesi) | Mevcut |
| `partners` | Şirkete **hisse** ile ortak olan kişi (iç kavram, `user_id` ile) | Mevcut |
| `party` | Şirketin **dışındaki** kişi/kurum | **Yeni** |

Bir `party` bir `users` kaydına bağlanabilir (`linked_user_id`) — müşterin aynı zamanda Projelio kullanıyorsa. Zorunlu değil.

---

## 2. Şema

```
party
  id                uuid pk
  organization_id   uuid null      -- şirket sahipliği
  job_id            uuid null      -- freelancer sahipliği
  group_id          uuid null      -- holding geneli paylaşım (bkz. §5)

  party_type        varchar        -- person | company
  display_name      varchar  NOT NULL   -- görünen ad (tek zorunlu alan)
  legal_name        varchar null   -- resmi unvan (kurum)

  tax_number        varchar null   -- VKN/TCKN — fatura için kritik
  tax_office        varchar null

  email             varchar null
  phone             varchar null
  website           varchar null
  address           jsonb null     -- { country, city, district, line, postal }

  roles             text[]         -- customer|lead|supplier|candidate|distributor|other
  status            varchar        -- active | passive | blocked
  source            varchar null   -- referans | web | reklam | fuar | soğuk arama | diğer

  owner_user_id     uuid null      -- sorumlu kişi
  parent_party_id   uuid null      -- grup şirketi / şube hiyerarşisi
  linked_user_id    uuid null      -- Projelio hesabı varsa
  merged_into_id    uuid null      -- birleştirilmişse hedef kayıt

  data              jsonb          -- organizasyona özel ek alanlar
  notes             text null

  created_by, created_at, archived_at
```

### `party_contact` — kurumdaki kişiler

```
party_contact(id, party_id, name, title, email, phone, is_primary, notes, archived_at)
```

B2B'de bu tablo olmadan CRM çalışmaz: firma bir, muhatap birden fazladır ve muhatap değişir, firma kalır.

### `party_activity` — tüm temas geçmişi

```
party_activity(id, party_id, type, occurred_at, summary, user_id,
               related_type, related_id, created_at)

type: not | arama | toplanti | eposta | teklif | ziyaret | sistem
```

`related_type/related_id` sayesinde **diğer modüller de buraya yazar**: satış hunisi aşama değişimi, açılan destek talebi, kesilen fatura, imzalanan sözleşme. Müşteri kartını açan kişi tek akışta her şeyi görür. Bu, "modüller birbirini besliyor" tezinin en görünür kanıtıdır.

---

## 3. Roller

| Rol | Anlamı | Hangi modül yazar |
|---|---|---|
| `lead` | Potansiyel, henüz satın almadı | `spd_satis_planlama` |
| `customer` | En az bir satın alma yaptı | `crm_musteri`, `fm_fatura` |
| `supplier` | Mal/hizmet aldığımız | `oud_tedarik` |
| `candidate` | İş başvurusu yapan | `ik_ise_alim_oryantasyon` |
| `distributor` | Bayi / dağıtıcı | `spd_ortaklik_dagitim` |
| `other` | Diğer (kurum, kamu, danışman) | — |

**Kural:** Rol ekleme otomatiktir, silme manuel. İlk fatura kesildiğinde `lead` → `customer` rolü **eklenir**, `lead` silinmez — geçmiş kaybolmaz.

---

## 4. Tekilleştirme (dedup)

Ortak varlığın en büyük riski aynı firmanın 3 kez girilmesidir.

| Kontrol | Davranış |
|---|---|
| Aynı `tax_number` (organizasyon içinde) | **Engelle** — mevcut kaydı göster |
| Aynı `email` | Uyar, "Bu kayıt mı?" öner |
| Normalize `display_name` benzerliği (büyük/küçük, "A.Ş.", "Ltd.", boşluk temizlenmiş) | Uyar, birleştirme öner |

**Birleştirme işlemi:** hedef kayıt seçilir → tüm `party_contact`, `party_activity`, `money_entry`, `pipeline_record` referansları hedefe taşınır → kaynak kayıt `merged_into_id` ile işaretlenir, silinmez. Geri alınabilir olmalı.

---

## 5. Sahiplik ve kapsam

| Senaryo | Alan |
|---|---|
| Şirket müşterisi | `organization_id` |
| Freelancer müşterisi | `job_id` |
| Holding altındaki şirketlerin ortak müşterisi | `group_id` dolu, `organization_id` boş |

**Açık soru:** Holding altındaki iki şirket aynı müşteriye ayrı ayrı satış yapıyorsa müşteri kaydı paylaşılsın mı, ayrı mı dursun? Öneri: **varsayılan ayrı**, holding yöneticisi isterse "grup geneli müşteri havuzu" ayarını açar. Zorla paylaşım şirketler arası veri gizliliği sorunu yaratır.

---

## 6. Organizasyona özel alanlar

`data jsonb` içinde her organizasyon kendi alanlarını tanımlayabilir — `module_catalog.schema.custom_fields_allowed = true` olan modüllerde açık.

Örnek: bir inşaat şirketi müşteri kartına "Ruhsat No", bir ajans "Sektör" ve "Aylık Bütçe" ekler. Bu, ürünün "kendi ünik yapısına uyarlama" tezinin en somut karşılığıdır ve rakiplerin çoğunda ücretli paketle gelir.

**Sınır:** özel alanlar filtrelenebilir ve dışa aktarılabilir ama metrik yayınlayamaz (panel arketipi bunları okumaz). Aksi halde şema kontrolsüz büyür.

---

## 7. Uygulama Sırası

1. `party` + `party_contact` + `party_activity` tabloları, RLS ile
2. Dedup kontrolleri (önce `tax_number`, sonra diğerleri)
3. `crm_musteri` modülü (bkz. `11-modul-crm_musteri.md`)
4. Diğer modüllerin `party_activity`'ye yazması
5. Birleştirme (merge) ekranı — bu, veri kirlenmeye başlamadan önce gelmeli
