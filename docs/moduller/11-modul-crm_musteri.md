# Modül Sözleşmesi — Müşteri (CRM)

> `mid_musteri_modulu` + `spd_musteri_modulu` birleşimi. **Tek modül, tek veri, iki departman.**
>
> Bu modül İlke İ1'in kanıtıdır: aynı `party` tablosuna Satış ve Müşteri İlişkileri farklı profillerle bakar. Mekanizma: `04-departman-bazli-gorunum.md`. Varlık: `03-ortak-varlik-party.md`.

---

## 1. Kimlik

| | |
|---|---|
| key | `crm_musteri` |
| Ad | Müşteri |
| Departmanlar | Satış ve İş Geliştirme (birincil) · Müşteri İlişkileri |
| Arketip | **A2 — Kayıt Listesi** |
| Kapsam | organization, job (freelancer) |
| Freelancer'a uygun | Evet |
| Çekirdek mi | Hayır |
| UI yüzeyi | Tam sayfa sekme + detay yan panel |
| Hassasiyet | `normal` |
| Eskiyen key'ler | `mid_musteri_modulu`, `spd_musteri_modulu` → yönlendirilir |

---

## 2. Amaç

> Satış ve müşteri ilişkileri ekipleri, temas ettikleri her kişi ve kurumu tek kayıtta toplar; kimin ne zaman ne konuştuğu, neyi satın aldığı ve hangi sorunu yaşadığı tek karttan görülür.

**Bu modül şu değildir:** satış hunisi (o `spd_satis_planlama`), destek talebi (o `mid_teknik_destek`), fatura (o `fm_fatura`). Bu modül onların hepsinin **etrafında döndüğü kişi/kurum kaydıdır**.

---

## 3. Veri

**Ortak varlık:** `party` (+ `party_contact`, `party_activity`)

### Ana alanlar

| key | label | tip | zorunlu | listede | not |
|---|---|---|---|---|---|
| `display_name` | Ad / Unvan | `text` | ✔ | ✔ | Tek zorunlu alan. Hızlı kayıt bununla açılır |
| `party_type` | Tür | `select` | ✔ | ✔ | `person` \| `company`. Varsayılan `company` |
| `roles` | Roller | `multiselect` | ✔ | ✔ | Rozet olarak. Varsayılan `lead` |
| `status` | Durum | `select` | ✔ | ✔ | `active` \| `passive` \| `blocked` |
| `owner_user_id` | Sorumlu | `user_ref` | — | ✔ | Varsayılan: kaydı açan |
| `email` | E-posta | `email` | — | ✔ | Dedup kontrolü tetikler |
| `phone` | Telefon | `phone` | — | ✔ | |
| `website` | Web sitesi | `url` | — | — | |
| `legal_name` | Resmi unvan | `text` | — | — | `party_type = company` ise görünür |
| `tax_number` | Vergi / TC No | `text` | koşullu | — | Fatura kesilecekse zorunlu. Org içinde **benzersiz** |
| `tax_office` | Vergi dairesi | `text` | — | — | |
| `address` | Adres | `address` | — | — | Ülke, il, ilçe, açık adres, posta kodu |
| `source` | Geliş kaynağı | `select` | — | — | Referans, Web, Reklam, Fuar, Soğuk arama, Diğer |
| `parent_party_id` | Bağlı olduğu firma | `entity_ref → party` | — | — | Grup şirketi / şube |
| `tags` | Etiketler | `tags` | — | — | |
| `notes` | Notlar | `longtext` | — | — | |

### Türetilmiş alanlar (yazılmaz, hesaplanır)

| key | label | Kaynak |
|---|---|---|
| `last_activity_at` | Son temas | `party_activity` MAX |
| `open_deal_count` / `open_deal_value` | Açık fırsat | `spd_satis_planlama` |
| `open_ticket_count` | Açık talep | `mid_teknik_destek` + `mid_sikayet_oneri` |
| `total_revenue` | Toplam ciro | `money_entry` (yalnızca yetkiliye) |
| `contract_end_at` | Sözleşme bitişi | `hud_sozlesme` |
| `customer_since` | Müşteri olma tarihi | İlk `customer` rolü eklenme tarihi |

> Türetilmiş alanlar **filtrelenebilir ve sıralanabilir olmalı** ⚙️ — "en çok açık talebi olan müşteriler" sorgusu bu modülün en sık kullanımı olacak.

### Alt tablolar

**Kişiler** (`party_contact`) — kurum kartında sekme: Ad, Ünvan, E-posta, Telefon, Birincil mi.
**Geçmiş** (`party_activity`) — zaman akışı; hem manuel not hem diğer modüllerin otomatik kayıtları.

---

## 4. Görünümler

### Liste

| Profil | Varsayılan | Filtre | Öne çıkan sütunlar |
|---|---|---|---|
| `base` | Tablo | — | Ad, Roller, Durum, Sorumlu, Telefon |
| Satış | Tablo | `roles ∈ (lead, customer)` | Ad, Roller, Sorumlu, Son temas, Açık fırsat tutarı, Kaynak |
| Müşteri İlişkileri | Kart | `roles = customer, status = active` | Ad, Açık talep, Son temas, Sözleşme bitişi |

**Diğer görünümler:** Role göre gruplu · Sorumluya göre gruplu · Harita (adres varsa, v2)

**Filtreler:** Rol · Durum · Sorumlu · Kaynak · Şehir · Etiket · Son temas (X günden eski) · Açık fırsat var/yok · Açık talep var/yok

### Detay kartı

Sol: kimlik bilgileri · Sağ: sekmeler

| Sekme | İçerik | Görünürlük |
|---|---|---|
| Geçmiş | `party_activity` zaman akışı | Modüle atanan herkes |
| Kişiler | `party_contact` listesi | Modüle atanan herkes |
| Fırsatlar | Satış hunisi kayıtları | Detay: satış modülü üyeleri · Diğerleri: yalnızca sayı ve toplam |
| Talepler | Destek/şikayet kayıtları | Detay: destek modülü üyeleri · Diğerleri: yalnızca sayı |
| Finans | Fatura ve ödemeler | Yalnızca finans modülü üyeleri (`restricted`) |
| Belgeler | Sözleşme ve dosyalar | Hukuk + sorumlu |

> Yetkisi olmayan sekme **gizlenmez, sayı gösterir**. "3 açık talep var, görmek için Teknik Destek modülüne erişim gerekli" — bu hem işbirliğini teşvik eder hem gizliliği korur.

---

## 5. Eylemler

**Birincil:** `+ Müşteri Ekle` — hızlı form: yalnızca **Ad + Tür + Rol**. Gerisi sonra doldurulur.

> Zorunlu alan sayısını 1'e indirmek A2 arketibinin en önemli kullanım kararıdır ⚙️. 12 zorunlu alanlı form, boş modül demektir.

**İkincil**

| Eylem | Not |
|---|---|
| İçe aktar | CSV/XLSX; kolon eşleme + dedup önizleme |
| Dışa aktar | Seçili sütunlar |
| Birleştir | Yinelenen kayıtları tek kayda indirir (bkz. `03` §4) |
| Toplu sorumlu ata | Ekip değişiminde kritik |

**Satır içi:** Aktivite ekle · Kişi ekle · Fırsat aç · Talep aç · Ara/E-posta gönder · Sorumlu değiştir · Arşivle

**Hızlı eylemler departman profiline göre değişir** — Satış'ta "Fırsat aç", Müşteri İlişkileri'nde "Talep aç" öne çıkar.

---

## 6. İzinler

| Rol | Görme | Ekleme | Düzenleme | Arşivleme | Birleştirme | Dışa aktarma |
|---|---|---|---|---|---|---|
| Modül yöneticisi | Tümü | ✔ | Tümü | ✔ | ✔ | ✔ |
| Modül üyesi | Tümü | ✔ | Tümü | Yalnız kendi sorumlusu | ✗ | ✔ |
| Departman üyesi (atanmamış) | Salt okunur liste | ✗ | ✗ | ✗ | ✗ | ✗ |
| Organizasyon yöneticisi | Tümü | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ortak (partner) | Yalnızca sayılar | ✗ | ✗ | ✗ | ✗ | ✗ |

### Arketip kararları ⚙️

- `sensitivity = normal` modüllerde **departman üyeliği okuma için yeterlidir**, yazma için modül üyeliği gerekir. (`restricted` olanlarda okuma da modül üyeliği ister — `fm_gelir_gider` ile fark budur.)
- **Birleştirme yalnızca modül yöneticisinde** — geri alınabilir olsa da veri kaybı riski taşır.
- Dışa aktarma loglanır (KVKK: kişisel veri dışa aktarımı iz gerektirir).
- Arşivlenen müşteri listeden çıkar ama geçmiş kayıtlarındaki referansı korur.

---

## 7. İlişkiler

### Beslendiği

| Kaynak | Ne gelir |
|---|---|
| `spd_satis_planlama` | Fırsat kazanıldı → `customer` rolü eklenir + aktivite |
| `mid_teknik_destek` / `mid_sikayet_oneri` | Talep açıldı/kapandı → aktivite |
| `fm_fatura` | Fatura kesildi → aktivite + ciro |
| `hud_sozlesme` | Sözleşme imzalandı/bitiyor → aktivite + `contract_end_at` |
| `ik_ise_alim_oryantasyon` | Aday kaydı → `candidate` rolüyle aynı tabloya |
| `pd_reklam`, form girişleri | Yeni `lead` |

### Beslediği

| Hedef | Ne gider |
|---|---|
| `spd_satis_planlama` | Fırsatın müşterisi |
| `fm_gelir_gider`, `fm_fatura` | `counterparty_id` |
| `hud_sozlesme` | Sözleşme tarafı |
| `oud_tedarik` | Tedarikçi (rol `supplier`) |
| `panel_analiz` | Müşteri sayısı, kaynak dağılımı, elde tutma |

### Çekirdek bağı

Görev üretir (takip hatırlatması) · Dosya tutar · Projeye bağlanabilir (`projects.party_id`, v2)

### Yayınladığı metrikler

`toplam_musteri` · `aktif_musteri` · `yeni_musteri_bu_donem` · `kaynak_dagilimi` · `temassiz_musteri_sayisi` · `ortalama_musteri_omru`

---

## 8. Otomasyon ve Bildirim

| Tetikleyici | Sonuç | Kime |
|---|---|---|
| X gündür temas yok (varsayılan 60, ayarlanabilir) | "Soğuyan müşteri" listesi + haftalık özet | Sorumlu |
| Sözleşme bitişine 30 gün | Bildirim + yenileme görevi | Sorumlu + Hukuk |
| Yeni `lead` eklendi, sorumlu atanmadı | 24 saat sonra bildirim | Modül yöneticisi |
| Yinelenen kayıt tespit edildi | Birleştirme önerisi bandı | Modül yöneticisi |
| İlk fatura kesildi | `lead` → `customer` rolü otomatik eklenir + aktivite | — |
| Sorumlu ekipten ayrıldı | Kayıtları yeniden atama uyarısı | Departman yöneticisi |

---

## 9. Boş Durum

**Başlık:** Henüz müşteri kaydı yok
**Metin:** İlk müşterinizi ekleyin veya mevcut listenizi Excel'den içe aktarın.
**Eylemler:** `Müşteri Ekle` · `Excel'den İçe Aktar`

**Kurulumda gelen veri:** Kayıt gelmez; **kaynak listesi** (Referans, Web, Reklam, Fuar, Soğuk arama) ve **rol seti** hazır gelir.

**Bağımlılık uyarısı:** Yok — tek başına çalışır.

**Öneri bandı:** 10+ müşteri sonrası: *"Satış Planlama modülünü açarak bu müşteriler üzerinde fırsat takibi yapabilirsiniz."*

---

## 10. Katalog Kaydı

```sql
-- eski iki kayıt emekliye ayrılır
UPDATE module_catalog SET archived_at = now(), replaced_by = 'crm_musteri'
WHERE key IN ('mid_musteri_modulu', 'spd_musteri_modulu');

INSERT INTO module_catalog
  (key, name, description, archetype, entity_key, scope,
   applies_to_freelancer, is_core, ui_surface, default_view,
   sensitivity, icon, sort_order)
VALUES
  ('crm_musteri', 'Müşteri',
   'Temas edilen tüm kişi ve kurumların tek kaydı; kimin ne zaman ne konuştuğu, neyi satın aldığı ve hangi sorunu yaşadığı tek karttan görülür.',
   'a2_list', 'party', 'organization',
   true, false, 'page', 'table',
   'normal', 'users', 10);

INSERT INTO module_catalog_departments (module_key, department_key, is_primary, sort_order)
VALUES ('crm_musteri', 'satis_is_gelistirme', true,  10),
       ('crm_musteri', 'musteri_iliskileri',  false, 20);
```

### `schema` jsonb

```json
{
  "custom_fields_allowed": true,
  "quick_create_fields": ["display_name", "party_type", "roles"],

  "fields": [
    { "key": "display_name", "label": "Ad / Unvan", "type": "text", "required": true,
      "visible_in_list": true, "group": "kimlik" },

    { "key": "party_type", "label": "Tür", "type": "select", "required": true,
      "default": "company",
      "options": [
        { "value": "company", "label": "Kurum" },
        { "value": "person",  "label": "Kişi" }
      ],
      "visible_in_list": true, "group": "kimlik" },

    { "key": "roles", "label": "Roller", "type": "multiselect", "required": true,
      "default": ["lead"],
      "options": [
        { "value": "lead",        "label": "Potansiyel",  "color": "amber" },
        { "value": "customer",    "label": "Müşteri",     "color": "green" },
        { "value": "supplier",    "label": "Tedarikçi",   "color": "blue" },
        { "value": "distributor", "label": "Bayi",        "color": "purple" },
        { "value": "candidate",   "label": "Aday",        "color": "slate" },
        { "value": "other",       "label": "Diğer",       "color": "slate" }
      ],
      "visible_in_list": true, "group": "kimlik" },

    { "key": "status", "label": "Durum", "type": "select", "required": true,
      "default": "active",
      "options": [
        { "value": "active",  "label": "Aktif" },
        { "value": "passive", "label": "Pasif" },
        { "value": "blocked", "label": "Engelli" }
      ],
      "visible_in_list": true, "group": "kimlik" },

    { "key": "owner_user_id", "label": "Sorumlu", "type": "user_ref",
      "default": "current_user", "visible_in_list": true, "group": "kimlik" },

    { "key": "email", "label": "E-posta", "type": "email",
      "dedup_check": "warn", "visible_in_list": true, "group": "iletisim" },
    { "key": "phone", "label": "Telefon", "type": "phone",
      "visible_in_list": true, "group": "iletisim" },
    { "key": "website", "label": "Web sitesi", "type": "url", "group": "iletisim" },
    { "key": "address", "label": "Adres", "type": "address", "group": "iletisim" },

    { "key": "legal_name", "label": "Resmi unvan", "type": "text",
      "visible_if": { "party_type": "company" }, "group": "resmi" },
    { "key": "tax_number", "label": "Vergi / TC No", "type": "text",
      "unique_within": "organization", "dedup_check": "block", "group": "resmi" },
    { "key": "tax_office", "label": "Vergi dairesi", "type": "text", "group": "resmi" },

    { "key": "source", "label": "Geliş kaynağı", "type": "select",
      "options": ["Referans", "Web", "Reklam", "Fuar", "Soğuk arama", "Diğer"],
      "group": "ticari" },
    { "key": "parent_party_id", "label": "Bağlı olduğu firma", "type": "entity_ref",
      "entity": "party", "group": "ticari" },
    { "key": "tags", "label": "Etiketler", "type": "tags", "group": "ticari" },
    { "key": "notes", "label": "Notlar", "type": "longtext", "group": "ticari" }
  ],

  "derived_fields": [
    { "key": "last_activity_at",  "label": "Son temas",
      "source": "party_activity", "agg": "max", "field": "occurred_at",
      "filterable": true, "sortable": true },
    { "key": "open_deal_count",   "label": "Açık fırsat",
      "source": "spd_satis_planlama", "agg": "count",
      "where": { "status": "open" }, "filterable": true, "sortable": true },
    { "key": "open_deal_value",   "label": "Açık fırsat tutarı",
      "source": "spd_satis_planlama", "agg": "sum", "field": "value",
      "where": { "status": "open" }, "requires_module_access": false },
    { "key": "open_ticket_count", "label": "Açık talep",
      "source": ["mid_teknik_destek", "mid_sikayet_oneri"], "agg": "count",
      "where": { "status": "open" }, "filterable": true, "sortable": true },
    { "key": "total_revenue",     "label": "Toplam ciro",
      "source": "money_entry", "agg": "sum", "field": "amount",
      "where": { "direction": "income", "status": "settled" },
      "requires_module_access": true },
    { "key": "contract_end_at",   "label": "Sözleşme bitişi",
      "source": "hud_sozlesme", "agg": "min", "field": "end_date",
      "filterable": true, "sortable": true },
    { "key": "customer_since",    "label": "Müşteri olma tarihi",
      "source": "party_activity", "agg": "min",
      "where": { "type": "role_added", "value": "customer" } }
  ],

  "field_groups": [
    { "key": "kimlik",   "label": "Kimlik",   "collapsed": false },
    { "key": "iletisim", "label": "İletişim", "collapsed": false },
    { "key": "resmi",    "label": "Resmi bilgiler", "collapsed": true },
    { "key": "ticari",   "label": "Ticari bilgiler", "collapsed": true }
  ],

  "sub_tables": [
    { "key": "party_contact",  "label": "Kişiler", "icon": "user" },
    { "key": "party_activity", "label": "Geçmiş",  "icon": "clock", "default_tab": true }
  ],

  "related_tabs": [
    { "key": "deals",     "label": "Fırsatlar", "module": "spd_satis_planlama",
      "fallback": "count_only" },
    { "key": "tickets",   "label": "Talepler",
      "module": ["mid_teknik_destek", "mid_sikayet_oneri"], "fallback": "count_only" },
    { "key": "finance",   "label": "Finans",    "module": "fm_gelir_gider",
      "fallback": "hidden" },
    { "key": "documents", "label": "Belgeler",  "module": "hud_sozlesme",
      "fallback": "count_only" }
  ],

  "views": {
    "base": {
      "default_view": "table",
      "columns": ["display_name", "roles", "status", "owner_user_id", "phone"],
      "filters": ["roles", "status", "owner_user_id", "source", "tags",
                  "last_activity_at", "open_deal_count", "open_ticket_count"]
    },
    "department_profiles": {
      "satis_is_gelistirme": {
        "label": "Satış görünümü",
        "default_view": "table",
        "default_filter": { "roles": ["lead", "customer"] },
        "columns": ["display_name", "roles", "owner_user_id",
                    "last_activity_at", "open_deal_value", "source"],
        "sort": "last_activity_at desc",
        "quick_actions": ["deal_create", "activity_add"],
        "summary_cards": ["potansiyel_sayisi", "acik_firsat_tutari", "bu_ay_kazanilan"]
      },
      "musteri_iliskileri": {
        "label": "Müşteri ilişkileri görünümü",
        "default_view": "cards",
        "default_filter": { "roles": ["customer"], "status": "active" },
        "columns": ["display_name", "open_ticket_count", "last_activity_at",
                    "contract_end_at"],
        "sort": "open_ticket_count desc",
        "quick_actions": ["ticket_create", "activity_add"],
        "summary_cards": ["aktif_musteri", "acik_talep", "bu_ay_biten_sozlesme"]
      }
    }
  },

  "dedup": {
    "block_on":  ["tax_number"],
    "warn_on":   ["email", "normalized_display_name"],
    "merge_role": "module_manager"
  },

  "publishes_metrics": [
    "toplam_musteri", "aktif_musteri", "yeni_musteri_bu_donem",
    "kaynak_dagilimi", "temassiz_musteri_sayisi", "ortalama_musteri_omru"
  ]
}
```

---

## 11. Bu Modülden Çıkan Yeni Arketip Gereksinimleri

`fm_gelir_gider`'in listesine eklenenler:

| # | Yetenek | Neden yeni | Kaç modül kullanır |
|---|---|---|---|
| 13 | `derived_fields` — başka modülden hesaplanan, filtrelenebilir alan | Gelir-Giderde yoktu; CRM'in omurgası | ~14 |
| 14 | `related_tabs` + `fallback: count_only` — yetkisiz kullanıcıya sayı gösterme | Yeni izin deseni | ~10 |
| 15 | `sub_tables` — kaydın altında ikinci seviye liste | Kurum→kişi, kayıt→geçmiş | ~8 |
| 16 | `quick_create_fields` — tam formdan ayrı hızlı ekleme | Boş kutu sendromuna karşı | 22 (tüm A2) |
| 17 | `department_profiles` — departman bazlı görünüm | Karar 3 | ~7 |
| 18 | `dedup` — engelle/uyar + birleştirme akışı | Ortak varlıkta zorunlu | ~6 |
| 19 | `visible_if` — koşullu alan görünürlüğü | `legal_name` yalnızca kurumda | ~10 |
| 20 | Aktivite akışı (diğer modüllerin yazabildiği) | Modüller arası bağın görünür yüzü | ~6 |

**16 numaralı madde en kritiği:** hızlı ekleme formu olmadan hiçbir A2 modülü kullanılmaz. `fm_gelir_gider` için de geriye dönük uygulanmalı — orada 4 zorunlu alan var, hızlı formda 3'e (tür, tutar, tarih) inmeli, kategori sonradan sorulmalı.
