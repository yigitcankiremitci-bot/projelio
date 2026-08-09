# Karar Notu — Bütçe Yönetimi vs. Gelir-Gider Defteri

**Durum:** Karara bağlandı. Uygulama önerisi aşağıda; migration henüz yazılmadı.

---

## Problem

Üç yerde para tutuluyor ve sınırları belirsiz:

| Yer | Şu anki hali | Kapsam |
|---|---|---|
| `budget_transactions` (çekirdek, 2 kayıt) | `project_id`, `operation_id`, `department_id`, `type`, `amount`, `occurred_at`, `recurring_payment_id` | Proje/program bütçesi. Şirkete otomatik geliyor. |
| `fm_gelir_gider` (modül, `module_records`) | `type`, `amount`, `category`, `currency`, `entryDate`, `description` | Şirket muhasebe defteri |
| `yonetim_butce_yonetimi` (katalog kaydı) | — | Yönetimi bilgilendiren gösterge |

Risk: aynı 10.000 TL hem proje bütçesine hem gelir-gider defterine girilirse yönetim panelinde **20.000 TL** görünür. Bu ürünün güvenilirliğini tek hamlede bitirir.

---

## Karar

### 1. Rollerin ayrımı

| | **Proje Bütçesi** (çekirdek) | **Gelir-Gider Defteri** (`fm_gelir_gider`) | **Bütçe Yönetimi** (`yonetim_butce_yonetimi`) |
|---|---|---|---|
| Soru | "Bu iş bana ne kazandırdı?" | "Şirketin bu ay ne kazandı, ne harcadı?" | "Nerede duruyoruz, sapma var mı?" |
| Kim | Proje yöneticisi | Muhasebe / finans | Yönetim, ortaklar |
| Kapsam | Tek proje/program | Tüm organizasyon | Organizasyon + holding |
| Arketip | Çekirdek sekme | **A2** Kayıt Listesi | **A6** Türev Panel |
| Veri girişi | Var (hızlı, 3 alan) | Var (detaylı, ~14 alan) | **Yok** |
| Kapatılabilir mi | Hayır | Evet | Evet |

**Net cümle:** Proje bütçesi *hızlı kayıt*, gelir-gider defteri *doğru kayıt*, bütçe yönetimi *okuma*.

### 2. Tek fiziksel tablo: `money_entry`

Çift sayımı önlemenin tek sağlam yolu tek defter tutmaktır. `budget_transactions` ile `fm_gelir_gider` **aynı tabloya** yazar:

```
money_entry
  id
  organization_id            -- zorunlu (job/proje üzerinden türetilir)
  job_id, project_id,        -- opsiyonel bağlam
  operation_id, department_id
  direction        income | expense
  amount, currency
  occurred_at                -- gerçekleşme tarihi
  due_at                     -- vade (alacak/borç görünümü için)
  status           planned | pending | settled | cancelled
  category_id                -- hesap planı (bkz. §3)
  counterparty_id            -- party referansı
  description
  document_id                -- fatura/belge bağı
  recurring_payment_id
  source           manual | project_budget | invoice | recurring | import
  source_id
  created_by, created_at, archived_at
```

Ayrım artık tablo değil, **görünüm ve zorunluluk seviyesi**:

- Proje bütçesi sekmesi → `money_entry WHERE project_id = X`, formda 3 alan (tür, tutar, açıklama), `source = 'project_budget'`
- Gelir-Gider modülü → `money_entry WHERE organization_id = X`, formda tam alan seti
- Bütçe Yönetimi paneli → aynı tablodan toplam okur, **hiçbir şey iki kez sayılmaz**

### 3. Geriye uyumluluk

`budget_transactions` adı mevcut kodda kullanılıyor. Migration yolu:

1. `money_entry` tablosu oluşturulur, `budget_transactions` verisi taşınır (`source='project_budget'`, `direction=type`, `organization_id` proje→iş→org üzerinden doldurulur)
2. `budget_transactions` **view** olarak yeniden yaratılır → mevcut sorgular çalışmaya devam eder
3. `fm_gelir_gider` `module_records` kayıtları `money_entry`'ye taşınır (`type→direction`, `entryDate→occurred_at`, `category` metni → `category_id` eşlemesi)
4. Frontend kademeli olarak `money_entry`'ye geçer, view sonra kaldırılır

### 4. Kategori (hesap planı)

Şu anki `fm_gelir_gider` kaydında kategori **serbest metin** ("Deneme geliri"). Bu, panel arketipini imkânsız kılar — kırılım yapılamaz.

Öneri: `money_category` referans tablosu, organizasyon başına düzenlenebilir, kurulumda hazır set gelir:

```
Gelir  : Satış Geliri · Hizmet Geliri · Faiz/Kur Geliri · Diğer Gelir
Gider  : Personel · Kira ve Aidat · Yazılım/Abonelik · Pazarlama ve Reklam ·
         Tedarik/Hammadde · Vergi ve SGK · Ulaşım · Danışmanlık · Diğer Gider
```

Kullanıcı ekleyebilir/yeniden adlandırabilir — "kendi ünik yapısına uyarlama" tezi burada da geçerli.

### 5. `yonetim_butce_yonetimi` yeniden sınıflandırma

| Önce | Sonra |
|---|---|
| ⚙️ Çekirdek | **A6 Türev Panel**, key: `panel_butce` |

İçerik: dönem seçici + planlanan/gerçekleşen karşılaştırma, kategori kırılımı, proje bazlı kâr-zarar, en büyük 5 gider kalemi, geçen döneme göre değişim. Veri girişi yok, `money_entry` + `fm_butce_hazirlama` kalemlerinden okur.

**Etki:** Çekirdeğe taşınacak kayıt sayısı 6 → 5. Tasarlanacak modül 43 → 44.

---

## Açık kalan küçük soru

`recurring_payments` şu an yalnızca `project_id` / `operation_id` biliyor. Şirket seviyesi tekrarlayan giderler (kira, maaş, abonelik) için `organization_id` ve `department_id` eklenmeli — yoksa gelir-gider modülünün en çok kullanılacak özelliği çalışmaz.
