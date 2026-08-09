# Arketip Kararı — Departman Bazlı Görünüm

> Bir modül birden fazla departmana açıldığında ne olur? Bu doküman mekanizmayı tanımlar. `crm_musteri` ilk uygulayıcısıdır ama kural tüm arketipler için geçerlidir.

---

## Problem

Karar 3 gereği `crm_musteri` tek modül, tek `party` tablosu, iki departman (Satış + Müşteri İlişkileri). Ama bu iki departman aynı veriye aynı gözle bakmaz:

- **Satış** sorar: "Kim potansiyel? Kime ne zaman dönmeliyim? Beklenen ciro ne?"
- **Müşteri İlişkileri** sorar: "Kimin açık talebi var? Sözleşmesi ne zaman bitiyor? Memnun mu?"

Aynı tabloyu aynı şekilde gösterirsen ikisi de yarısını gereksiz bulur ve modülü kullanmaz.

---

## Çözüm: Departman Profilleri

Veri ortak, **sunum profillenmiş**. Modül kataloğunda `views.department_profiles` altında departman anahtarlı override tanımlanır.

```json
{
  "base": {
    "default_view": "table",
    "columns": ["display_name", "roles", "status", "owner_user_id", "phone"],
    "filters": ["roles", "status", "owner_user_id", "source", "city"]
  },

  "department_profiles": {
    "satis_is_gelistirme": {
      "label": "Satış görünümü",
      "default_view": "table",
      "default_filter": { "roles": ["lead", "customer"] },
      "columns": ["display_name", "roles", "owner_user_id",
                  "last_activity_at", "open_deal_value", "source"],
      "sort": "last_activity_at desc",
      "quick_actions": ["Fırsat aç", "Aktivite ekle", "Teklif gönder"],
      "summary_cards": ["potansiyel_sayisi", "acik_firsat_tutari", "bu_ay_kazanilan"]
    },

    "musteri_iliskileri": {
      "label": "Müşteri ilişkileri görünümü",
      "default_view": "cards",
      "default_filter": { "roles": ["customer"], "status": "active" },
      "columns": ["display_name", "open_ticket_count", "last_contact_at",
                  "contract_end_at", "satisfaction"],
      "sort": "open_ticket_count desc",
      "quick_actions": ["Talep aç", "Aktivite ekle", "Sözleşme görüntüle"],
      "summary_cards": ["aktif_musteri", "acik_talep", "bu_ay_biten_sozlesme"]
    }
  }
}
```

---

## Çözümleme Kuralları

| Durum | Davranış |
|---|---|
| Kullanıcı tek departmanda ve o departmanın profili var | Profil uygulanır |
| Kullanıcı tek departmanda, profil yok | `base` uygulanır |
| Kullanıcı birden fazla departmanda | Üstte profil seçici çıkar, son seçim hatırlanır |
| Organizasyon yöneticisi (departmansız) | `base` + tüm profiller seçilebilir |
| Kullanıcı profili değiştirdi | Kişisel tercih olarak saklanır, departman varsayılanını ezmez |

**Kritik kural:** Profil yalnızca **sunumu** değiştirir. Hangi kayıtların *görülebileceğini* profil değil izin belirler. `default_filter` bir varsayılandır, kullanıcı temizleyip tüm kayıtları görebilir.

---

## Veri Görünürlüğü: Ortak kayıt, ayrı ilişki

En ince nokta burası. Satış, Müşteri İlişkileri'nin destek konuşmalarını görmeli mi?

**Kural:**

> **`party` kaydının kendisi ortaktır. İlişkili kayıtlar kendi modülünün iznine tabidir.**

| Ne | Kim görür |
|---|---|
| Müşteri kartı: ad, iletişim, adres, vergi no, roller | Modüle atanan herkes |
| `party_activity` — not, arama, toplantı | Modüle atanan herkes |
| Açık destek talepleri (`mid_teknik_destek` kayıtları) | O modüle atanmış olanlar; diğerleri **yalnızca sayısını** görür |
| Satış fırsatları (`spd_satis_planlama`) | O modüle atanmış olanlar; diğerleri **yalnızca tutar toplamını** görür |
| Finansal kayıtlar (`money_entry`) | `restricted` — yalnızca finans modülü üyeleri |

Böylece Müşteri İlişkileri "bu müşteride 3 açık fırsat var" bilgisini görür ama detayını göremez. Bu, hem işbirliğini hem gizliliği korur.

---

## Katalog Şeması Gereksinimi

Bu mekanizma iki şema değişikliği ister:

### 1. Modül–departman ilişkisi çoklu olmalı

`module_catalog.department_key` (tekil) yerine:

```sql
module_catalog_departments(
  module_key     varchar,
  department_key varchar,
  is_primary     boolean default false,
  sort_order     integer default 0,
  primary key (module_key, department_key)
)
```

Mevcut `department_key` bu tabloya `is_primary = true` olarak taşınır, kolon bir süre view uyumluluğu için kalır.

### 2. Etkinleştirilmiş modül departman bilmeli

`organization_modules`'a `department_id uuid null` eklenir (daha önce `module_records` ile tutarsızlık olarak işaretlenmişti). Aynı modül iki departmanda etkinse iki satır olur:

```
organization_modules
  (org_x, 'crm_musteri', dept_satis)
  (org_x, 'crm_musteri', dept_musteri_iliskileri)
```

`module_members` ataması da departman bazlı olur — bir kişi Satış tarafında üye, Müşteri İlişkileri tarafında değil olabilir.

---

## Hangi Modüller Çoklu Departmana Açılır

| Modül | Departmanlar |
|---|---|
| `crm_musteri` | Satış · Müşteri İlişkileri |
| `hud_sozlesme` | Hukuk · Satış · Finans |
| `fm_fatura` | Finans · Satış |
| `pazar_rakip_analizi` | Pazarlama · Satış · Yönetim |
| `uyd_urunler` | Ürün Yönetimi · Pazarlama · Satış |
| `panel_analiz` / `panel_raporlama` | Tüm departmanlar (kapsam parametreli) |
| `oud_tedarik` | Operasyon · Finans |

Geri kalan modüller tek departmanda kalır — çoklu departman bir zorunluluk değil, ihtiyaç halinde açılan bir yetenektir.

---

## Uygulama Notu

Departman profilleri **v1'de zorunlu değil**. `base` görünümüyle başlanabilir; profiller kullanıcı geri bildirimi geldikçe eklenir. Ama şema bunu baştan desteklemeli, yoksa sonradan eklemek her modülü elden geçirmeyi gerektirir.
