# Modül Sözleşmesi — Gelir-Gider Defteri

> **A2 arketipinin referans modülü.** Bu modül tam tasarlandığında A2 motoru yazılır ve kalan 21 A2 modülü yalnızca şema konfigürasyonuna düşer. Bu yüzden burada verilen kararlar modüle özel değil, **arketip kararıdır** — hangilerinin arketibe ait olduğu ⚙️ ile işaretlendi.

---

## 1. Kimlik

| | |
|---|---|
| key | `fm_gelir_gider` |
| Ad | Gelir-Gider |
| Önerilen departman | Finans / Muhasebe (birincil) |
| Arketip | **A2 — Kayıt Listesi**, alt tip **A2-F (Finansal)** |
| Kapsam | organization, job (freelancer) |
| Freelancer'a uygun | Evet — freelancer'ın ilk açacağı modüllerden biri |
| Çekirdek mi | Hayır |
| UI yüzeyi | Tam sayfa sekme + detay yan panel |
| Hassasiyet | `restricted` |

---

## 2. Amaç

> Finans sorumlusu, ay içinde her para hareketini tek yere kaydeder ki dönem sonunda şirketin ne kazandığı, ne harcadığı ve neye harcadığı tek ekrandan görülebilsin.

Bu cümle `module_catalog.description` alanına yazılır.

**Bu modül şu değildir:** proje kârlılığı (o çekirdek bütçe sekmesi), fatura kesme (o `fm_fatura`), gösterge/rapor (o `panel_butce`).

---

## 3. Veri

**Ortak varlık:** `money_entry` (bkz. `02-karar-notu-butce-vs-muhasebe.md`)

### Alanlar

| key | label | tip | zorunlu | listede | not |
|---|---|---|---|---|---|
| `direction` | Tür | `select` | ✔ | ✔ | `income` \| `expense`. Renk kodlu rozet |
| `amount` | Tutar | `currency` | ✔ | ✔ | Daima pozitif; yön `direction` ile ifade edilir |
| `occurred_at` | Tarih | `date` | ✔ | ✔ | Gerçekleşme tarihi. Varsayılan: bugün |
| `category_id` | Kategori | `select` | ✔ | ✔ | `money_category`'den; `direction`'a göre filtrelenir |
| `counterparty_id` | Karşı taraf | `entity_ref → party` | — | ✔ | Müşteri/tedarikçi. Yazarken yeni kayıt açılabilir |
| `description` | Açıklama | `text` | — | ✔ | |
| `status` | Durum | `select` | ✔ | ✔ | `planned` \| `pending` \| `settled` \| `cancelled`. Varsayılan `settled` |
| `due_at` | Vade | `date` | koşullu | — | `status = pending` ise zorunlu. `fm_alacak_borc` görünümünün eksenidir |
| `payment_method` | Ödeme yöntemi | `select` | — | — | Nakit, Banka havalesi, Kredi kartı, Çek, Diğer |
| `account_id` | Hesap/Kasa | `select` | — | — | Çoklu banka hesabı olanlar için. Tek hesapta gizli |
| `vat_rate` | KDV oranı | `percent` | — | — | Varsayılan org ayarından (%20) |
| `vat_amount` | KDV tutarı | `formula` | — | — | `amount * vat_rate / (100 + vat_rate)` — dahil varsayım |
| `document_id` | Belge | `file` + `module_ref → fm_fatura` | — | ✔ (ikon) | Fiş/fatura eki. Drive'a yazılır |
| `project_id` | Proje | `entity_ref → projects` | — | — | Doldurulursa proje bütçesinde de görünür (çift kayıt **değil**, aynı satır) |
| `department_id` | Departman | `entity_ref → departments` | — | — | Departman bazlı gider kırılımı için |
| `tags` | Etiketler | `tags` | — | — | |

### Doğrulama kuralları ⚙️ (arketip)

1. `amount > 0` — negatif tutar reddedilir, kullanıcı yönü değiştirmeye yönlendirilir
2. `occurred_at` gelecek tarihli ise `status` otomatik `planned` olur
3. `status = pending` ve `due_at` boş ise kayıt açılmaz
4. `currency` organizasyon varsayılanından farklıysa kayıt anındaki kur saklanır (`fx_rate`) — sonradan değişmez
5. Aynı `counterparty_id` + `amount` + `occurred_at` üçlüsü 30 gün içinde tekrar girilirse **"Bu kaydı daha önce girmiş olabilirsiniz"** uyarısı (engellemez)

---

## 4. Görünümler

**Varsayılan:** Tablo + üstte 4 özet kartı

| Kart | İçerik |
|---|---|
| Toplam Gelir | Seçili dönem, `settled` |
| Toplam Gider | Seçili dönem, `settled` |
| Net | Gelir − Gider, işaretine göre renkli |
| Bekleyen | `status = pending` toplamı + vadesi geçen sayısı |

**Diğer görünümler**

| Görünüm | Ne zaman |
|---|---|
| Kategoriye göre gruplu tablo | "Paramız nereye gidiyor?" |
| Karşı tarafa göre gruplu | "En çok kime ödüyoruz?" |
| Aylık pivot (kategori × ay) | Trend ve bütçe karşılaştırması |

**Filtreler:** Dönem (bu ay / geçen ay / bu çeyrek / bu yıl / özel) · Tür · Kategori · Durum · Karşı taraf · Departman · Proje · Tutar aralığı · Etiket

**Sıralama:** Tarih (varsayılan, yeniden eskiye), Tutar, Kategori

**Dönem seçici A2-F alt tipinde zorunludur** ⚙️ — filtresiz açılan finansal liste kullanılamaz hale gelir.

---

## 5. Eylemler

**Birincil:** `+ Kayıt Ekle` — açılır menü: Gelir / Gider (iki ayrı hızlı form)

**İkincil**

| Eylem | Not |
|---|---|
| İçe aktar | CSV / XLSX; banka ekstresi eşleme sihirbazı |
| Dışa aktar | CSV / XLSX; muhasebeciye gönderim için |
| Tekrarlayan ödeme tanımla | `recurring_payments`'a yazar, otomatik kayıt üretir |
| Faturadan oluştur | `fm_fatura`'dan seçilen faturayı gelir kaydına çevirir |
| Kategorileri düzenle | `money_category` yönetimi (yalnızca modül yöneticisi) |

**Toplu eylemler:** Kategori değiştir · Durumu "Ödendi" yap · Etiket ekle · Arşivle · Dışa aktar

**Satır içi:** Düzenle · Kopyala (aynı kaydı yeni tarihle) · Belge ekle · Görev oluştur · Arşivle

> "Kopyala" küçük ama en çok kullanılan eylem olacak — tekrar eden benzer giderler için.

---

## 6. İzinler

| Rol | Görme | Ekleme | Düzenleme | Silme/Arşiv | Dışa aktarma | Kategori yönetimi |
|---|---|---|---|---|---|---|
| Modül yöneticisi | Tümü | ✔ | Tümü | ✔ | ✔ | ✔ |
| Modül üyesi | Tümü | ✔ | Yalnız kendi kaydı | Yalnız kendi kaydı | ✔ | — |
| Departman üyesi (modüle atanmamış) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Organizasyon yöneticisi | Tümü | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ortak (partner) | `partner_module_grants` ile açıksa yalnız **özet kartlar** | ✗ | ✗ | ✗ | ✔ | ✗ |

### Arketip kararları ⚙️

- `sensitivity = restricted` olan modüllerde **departman üyeliği yetmez, modül üyeliği gerekir.** `module_members` tablosu bu yüzden zorunlu.
- **Kayıt silinmez, arşivlenir** (`archived_at`). Finansal veride sert silme olmaz.
- **Değişiklik geçmişi tutulur** (kim, ne zaman, hangi alanı, eski→yeni). `panel_denetim` bunu okur.
- Ortak (partner) rolü finansal modüllerde varsayılan olarak **yalnız toplamları** görür, satır detayını görmez.

---

## 7. İlişkiler

### Beslendiği modüller

| Kaynak | Ne üretir |
|---|---|
| `fm_fatura` | Fatura kesildi/ödendi → gelir kaydı (`source = invoice`) |
| Proje bütçesi (çekirdek) | Proje harcaması → aynı tabloya `source = project_budget` |
| `oud_tedarik` | Sipariş teslim alındı → gider kaydı |
| `pd_reklam` | Kampanya harcaması → gider kaydı |
| `ik_bordro_ozluk` | Bordro dönemi kapandı → toplu personel gideri |
| `recurring_payments` | Vade geldi → otomatik kayıt (`source = recurring`) |

### Beslediği modüller

| Hedef | Ne alır |
|---|---|
| `fm_alacak_borc` | Aynı tablo, `status = pending` görünümü |
| `fm_nakit_akis` | Tarih bazlı giriş/çıkış serisi |
| `panel_butce` | Gerçekleşen tutarlar (plan ile karşılaştırma) |
| `fm_vergi_takip` | KDV matrahı ve tutarı |
| `panel_analiz` | Gelir, gider, net, kategori kırılımı |

### Çekirdek bağı

- Görev üretir: vade hatırlatması, aylık kapanış
- Dosya tutar: belge ekleri → `files` (Drive)
- Projeye bağlanır: `project_id` üzerinden

### Yayınladığı metrikler (`metric`)

`toplam_gelir` · `toplam_gider` · `net_kar` · `kategori_bazli_gider` · `departman_bazli_gider` · `aylik_trend` · `bekleyen_alacak` · `bekleyen_borc`

Her metrik: `{ organization_id, department_id?, period, dimension?, value, currency }`

---

## 8. Otomasyon ve Bildirim

| Tetikleyici | Sonuç | Kime |
|---|---|---|
| Tekrarlayan ödeme vadesi | Kayıt otomatik üretilir (`status = pending`) | Modül üyeleri |
| Vadeye N gün kaldı (`reminder_days_before`) | Bildirim + görev | Sorumlu |
| Vade geçti, hâlâ `pending` | Kırmızı rozet + günlük bildirim | Modül yöneticisi |
| Ay bitti | "Geçen ayın kapanışını yap" görevi + özet | Modül yöneticisi |
| Kategorisiz kayıt > 5 | Yumuşak uyarı bandı | Modül üyeleri |
| Tek kayıt, aylık ortalamanın 3 katından büyük | Onay iste (yalnızca `restricted` modüllerde) ⚙️ | Modül yöneticisi |

---

## 9. Boş Durum

**Başlık:** Henüz kayıt yok
**Metin:** İlk gelir veya giderinizi ekleyin. Banka ekstrenizi içe aktararak da başlayabilirsiniz.
**Eylemler:** `Gelir Ekle` · `Gider Ekle` · `Ekstre İçe Aktar`

**Kurulumda gelen veri:** Kayıt gelmez, **kategori seti gelir** (bkz. karar notu §4). Boş kategori listesi modülü kullanılamaz kılar.

**Bağımlılık uyarısı:** Yok — bu modül hiçbir şeye ihtiyaç duymaz, tek başına çalışır. (Bu yüzden ilk referans modül olarak seçildi.)

**Öneri bandı:** 10+ kayıt girildikten sonra: *"Nakit Akış modülünü açarak bu verilerden 12 aylık projeksiyon görebilirsiniz."*

---

## 10. Katalog Kaydı (uygulanacak veri)

```sql
UPDATE module_catalog SET
  description   = 'Şirketin tüm para hareketlerini tek defterde toplar; dönem sonunda ne kazanıldığı, ne harcandığı ve neye harcandığı tek ekrandan görülür.',
  archetype     = 'a2_list',
  entity_key    = 'money_entry',
  is_core       = false,
  ui_surface    = 'page',
  default_view  = 'table',
  sensitivity   = 'restricted',
  icon          = 'wallet',
  depends_on    = '{}'
WHERE key = 'fm_gelir_gider';
```

### `schema` jsonb (A2 motorunun okuyacağı tanım)

```json
{
  "fields": [
    { "key": "direction", "label": "Tür", "type": "select", "required": true,
      "options": [
        { "value": "income",  "label": "Gelir",  "color": "green" },
        { "value": "expense", "label": "Gider",  "color": "red" }
      ],
      "visible_in_list": true, "group": "temel" },

    { "key": "amount", "label": "Tutar", "type": "currency", "required": true,
      "min": 0, "visible_in_list": true, "group": "temel" },

    { "key": "occurred_at", "label": "Tarih", "type": "date", "required": true,
      "default": "today", "visible_in_list": true, "group": "temel" },

    { "key": "category_id", "label": "Kategori", "type": "select", "required": true,
      "source": "money_category", "filter_by": "direction",
      "visible_in_list": true, "group": "temel" },

    { "key": "counterparty_id", "label": "Karşı taraf", "type": "entity_ref",
      "entity": "party", "creatable": true,
      "visible_in_list": true, "group": "temel" },

    { "key": "description", "label": "Açıklama", "type": "text",
      "visible_in_list": true, "group": "temel" },

    { "key": "status", "label": "Durum", "type": "select", "required": true,
      "default": "settled",
      "options": [
        { "value": "planned",   "label": "Planlandı" },
        { "value": "pending",   "label": "Bekliyor" },
        { "value": "settled",   "label": "Gerçekleşti" },
        { "value": "cancelled", "label": "İptal" }
      ],
      "visible_in_list": true, "group": "durum" },

    { "key": "due_at", "label": "Vade", "type": "date",
      "required_if": { "status": "pending" }, "group": "durum" },

    { "key": "payment_method", "label": "Ödeme yöntemi", "type": "select",
      "options": ["Nakit", "Banka havalesi", "Kredi kartı", "Çek", "Diğer"],
      "group": "odeme" },

    { "key": "account_id", "label": "Hesap", "type": "select",
      "source": "money_account", "hide_if_single": true, "group": "odeme" },

    { "key": "vat_rate", "label": "KDV oranı", "type": "percent",
      "default": "org.default_vat_rate", "group": "vergi" },

    { "key": "vat_amount", "label": "KDV tutarı", "type": "formula",
      "expr": "amount * vat_rate / (100 + vat_rate)", "group": "vergi" },

    { "key": "document_id", "label": "Belge", "type": "file",
      "also_ref": "fm_fatura", "visible_in_list": "icon", "group": "belge" },

    { "key": "project_id", "label": "Proje", "type": "entity_ref",
      "entity": "projects", "group": "baglam" },

    { "key": "department_id", "label": "Departman", "type": "entity_ref",
      "entity": "departments", "group": "baglam" },

    { "key": "tags", "label": "Etiketler", "type": "tags", "group": "baglam" }
  ],

  "field_groups": [
    { "key": "temel",  "label": "Temel bilgiler", "collapsed": false },
    { "key": "durum",  "label": "Durum ve vade",  "collapsed": false },
    { "key": "odeme",  "label": "Ödeme",          "collapsed": true },
    { "key": "vergi",  "label": "Vergi",          "collapsed": true },
    { "key": "belge",  "label": "Belge",          "collapsed": true },
    { "key": "baglam", "label": "Bağlam",         "collapsed": true }
  ],

  "summary_cards": [
    { "label": "Toplam Gelir", "agg": "sum", "field": "amount",
      "where": { "direction": "income", "status": "settled" } },
    { "label": "Toplam Gider", "agg": "sum", "field": "amount",
      "where": { "direction": "expense", "status": "settled" } },
    { "label": "Net", "expr": "income - expense", "color_by_sign": true },
    { "label": "Bekleyen", "agg": "sum", "field": "amount",
      "where": { "status": "pending" }, "badge": "overdue_count" }
  ],

  "views": [
    { "key": "table",       "label": "Tablo",      "default": true },
    { "key": "by_category", "label": "Kategoriye göre", "group_by": "category_id" },
    { "key": "by_party",    "label": "Karşı tarafa göre", "group_by": "counterparty_id" },
    { "key": "pivot",       "label": "Aylık pivot", "rows": "category_id", "cols": "month" }
  ],

  "period_selector": { "required": true, "default": "this_month" },

  "publishes_metrics": [
    "toplam_gelir", "toplam_gider", "net_kar",
    "kategori_bazli_gider", "departman_bazli_gider",
    "aylik_trend", "bekleyen_alacak", "bekleyen_borc"
  ]
}
```

---

## 11. Bu Modülden Çıkan Arketip Gereksinimleri

A2 motorunun desteklemesi gereken ve bu modülden türeyen yetenekler:

| # | Yetenek | Kaç A2 modülü kullanır |
|---|---|---|
| 1 | Alan grupları + katlanabilir bölümler | 22 |
| 2 | `required_if` koşullu zorunluluk | ~12 |
| 3 | `formula` hesaplanan alan | ~8 |
| 4 | `entity_ref` + satır içi yeni kayıt açma | ~15 |
| 5 | Dönem seçici + özet kartlar | 8 (A2-F) |
| 6 | Gruplu görünüm / pivot | ~10 |
| 7 | İçe aktarma sihirbazı (kolon eşleme) | ~6 |
| 8 | Toplu eylem | 22 |
| 9 | Arşivle (sert silme yok) | 22 |
| 10 | Değişiklik geçmişi | `restricted` olanlar (~5) |
| 11 | Metrik yayını | 22 |
| 12 | Yinelenen kayıt uyarısı | ~8 |

**1, 4, 8, 9, 11 kalemleri motorun çekirdeği** — bunlar olmadan hiçbir A2 modülü tam çalışmaz. 5, 6, 7, 10, 12 ise ikinci dalga.
