# Modül Sözleşmesi — Kimlik ve Yön

> **A1 arketipinin referans modülü.** Bu modül tam tasarlandığında A1 motoru yazılır; kalan tek A1 modülü (`pd_urun_stratejileri`) yalnızca şema konfigürasyonuna düşer. Burada verilen kararların bir kısmı modüle özel değil, **arketip kararıdır** — ⚙️ ile işaretlendi.
>
> Birleşme: `yonetim_vizyon_sablonu` + `yonetim_misyon_sablonu` → `kimlik_ve_yon`
> (bkz. `01-modul-arketip-eslesmesi.md`, Yönetim tablosu)

---

## 1. Kimlik

| | |
|---|---|
| key | `kimlik_ve_yon` (eski: `yonetim_vizyon_sablonu`, `yonetim_misyon_sablonu`) |
| Ad | Kimlik ve Yön |
| Önerilen departman | Yönetim (birincil) |
| Arketip | **A1 — Form / Doküman (tek kayıt)** |
| Kapsam | holding, organization, job (freelancer) |
| Freelancer'a uygun | Evet — tek kişilik işletmede "ben ne yapıyorum" sayfası |
| Çekirdek mi | Hayır |
| UI yüzeyi | **Modal** (okuma) → aynı modal içinde düzenleme |
| Hassasiyet | `normal` — organizasyondaki herkes okur |

---

## 2. Amaç

> Kurucu/yönetici, şirketin ne için var olduğunu ve nereye gittiğini tek bir sayfada yazar ki hedefler, işe alım ve müşteri iletişimi aynı cümleye dayansın.

Bu cümle `module_catalog.description` alanına yazılır.

**Bu modül şu değildir:** dönemsel hedefler (o `hedef_yonetimi`), ürün konumlandırması (o `pd_urun_stratejileri`), marka kılavuzu (dosya olarak çekirdekte durur).

---

## 3. Veri

**Ortak varlık:** yok — `module_records` içinde **tek satır**, `data jsonb`.

A1'in ayırt edici kuralı ⚙️: **kapsam başına bir kayıt.** İkinci kayıt oluşturulamaz; "yeni" yerine "düzenle" vardır. Geçmiş, kayıt çoğaltarak değil `module_record_versions` ile tutulur (bkz. §3.2).

### 3.1 Alanlar

Alanlar üç **bölüm** (`group`) altında toplanır; modal bu bölümleri sırayla gösterir.

| key | label | tip | zorunlu | bölüm | not |
|---|---|---|---|---|---|
| `vision` | Vizyon | `longtext` | ✔ | Yön | "Gelecekte nerede olmak istiyoruz?" 300 karakter yumuşak sınır |
| `horizon` | Zaman ufku | `select` | — | Yön | 1 / 3 / 5 / 10 yıl. Varsayılan 5 |
| `mission` | Misyon | `longtext` | ✔ | Kimlik | "Bugün kime, hangi değeri sunuyoruz?" |
| `audience` | Kime hizmet ediyoruz | `text` | — | Kimlik | Serbest metin; `pd_hedef_kitle` açıksa oradan öneri |
| `values` | Değerler | `tags` | — | Kimlik | 3–7 arası öneri; her biri kart olarak render edilir |
| `value_notes` | Değerlerin açıklaması | `longtext` | — | Kimlik | Her değerin ne demek olduğu — boş bırakılırsa değerler süs kalır |
| `positioning` | Tek cümlelik konumlandırma | `text` | — | Kimlik | "X için Y yapan Z'yiz." Slogan değil, iç kullanım |
| `effective_from` | Geçerlilik tarihi | `date` | ✔ | Durum | Varsayılan: onay tarihi |
| `review_at` | Sonraki gözden geçirme | `date` | — | Durum | Boşsa `effective_from + 12 ay` önerilir; hatırlatma görevi üretir |
| `status` | Durum | `select` | ✔ | Durum | `draft` \| `approved` \| `outdated`. Varsayılan `draft` |
| `approved_by` | Onaylayan | `user_ref` | — | Durum | `status = approved` olduğunda otomatik dolar, elle değişmez |
| `notes` | Not | `longtext` | — | Durum | İç not; okuma görünümünde gösterilmez |

### 3.2 Versiyonlama ⚙️ (arketip)

A1'de "kaydet" ile "yayımla" ayrıdır:

1. Düzenleme sırasında değişiklik **taslak** olarak aynı satıra yazılır; okuma görünümü hâlâ son onaylı metni gösterir.
2. `Onayla` denince mevcut onaylı metin `module_record_versions`'a kopyalanır, taslak yürürlüğe girer, `approved_by` + `effective_from` damgalanır.
3. Sürümler arası fark (diff) metin bazında gösterilir: "Vizyon 12 Ağu 2026'da değişti — kim, ne yazıyordu".

Bu yüzden A1 motoru **`module_record_versions(id, record_id, data jsonb, approved_by, approved_at)`** tablosunu gerektirir. Bugünkü kod her güncellemeyi yeni kayıt olarak ekleyerek bunu taklit ediyor (bkz. `moduleConfigs/yonetim.ts` içindeki not) — göç adımı §9'da.

### 3.3 Doğrulama

1. `status = approved` için `vision` ve `mission` dolu olmalı
2. `values` 10'dan fazla etiket almaz — "her şey değerse hiçbir şey değer değil" uyarısı
3. `review_at` geçmişte kalırsa kayıt otomatik `outdated` olur (gece işi), silinmez

---

## 4. Görünümler

A1'de liste **yoktur**. İki görünüm vardır:

**Okuma görünümü (varsayılan)** — modal açılır açılmaz gelen ekran.

```
┌─ Kimlik ve Yön ───────────────── Onaylı · 12 Ağu 2026 ─┐
│  VİZYON            5 yıl                                │
│  "…"                                                    │
│  ────────────────────────────────────────────────────   │
│  MİSYON                                                 │
│  "…"          Kime: küçük ve orta ölçekli üretici       │
│  ────────────────────────────────────────────────────   │
│  DEĞERLER   [Şeffaflık] [Hız] [Sahiplenme]              │
│  ────────────────────────────────────────────────────   │
│  Sonraki gözden geçirme: 12 Ağu 2027                    │
│           [Sürüm geçmişi]  [PDF]  [Düzenle]             │
└─────────────────────────────────────────────────────────┘
```

**Düzenleme görünümü** — aynı modal, bölüm bölüm form. Kaydet (taslak) ve Onayla ayrı düğmeler.

**Sürüm geçmişi** — tarih listesi; bir sürüme tıklayınca o günün metni ve farkı.

**Filtre / sıralama / gruplama yoktur** ⚙️ — A1'de arama arayüzü açmak boş yere karmaşıklıktır.

---

## 5. Eylemler

**Birincil:** kayıt yoksa `Kimliği Yaz`, varsa `Düzenle`

| Eylem | Not |
|---|---|
| Onayla | Taslağı yürürlüğe alır, sürüm damgalar |
| Sürüm geçmişi | Fark görünümü; eski sürüme "geri dön" |
| PDF olarak dışa aktar | Tek sayfa; ekip sunumuna/işe alım paketine gider |
| Paylaş | Organizasyon içi link; ortak (partner) rolüne açılabilir |
| Gözden geçirme hatırlat | `review_at` için çekirdek görev üretir (sorumlu: onaylayan) |
| Lio'ya sor | Taslak üretme/keskinleştirme — bkz. §8 |

**Toplu eylem yoktur** ⚙️ (tek kayıt).

---

## 6. İzinler

| Rol | Görme | Düzenleme | Onaylama | Sürüm geçmişi | Dışa aktarma |
|---|---|---|---|---|---|
| Modül yöneticisi | ✔ | ✔ | ✔ | ✔ | ✔ |
| Modül üyesi | ✔ | ✔ (taslak) | ✗ | ✔ | ✔ |
| Departman üyesi (atanmamış) | ✔ (okuma) | ✗ | ✗ | ✗ | ✔ |
| Organizasyon yöneticisi | ✔ | ✔ | ✔ | ✔ | ✔ |
| Ortak (partner) | Açıksa okuma | ✗ | ✗ | ✗ | ✔ |

Arketip kararı ⚙️: **A1 modüllerinde `normal` hassasiyet varsayılanı okumayı organizasyona açar.** Sebep: bu metinlerin işe yaraması için görünmesi gerekir; modül üyeliğine kilitlenen bir vizyon hiç yazılmamış vizyondur. Gizli tutulması gereken A1 modülü olursa `sensitivity = confidential` ile kilitlenir.

---

## 7. İlişkiler

**Beslediği modüller**

| Nereye | Nasıl |
|---|---|
| `hedef_yonetimi` | Hedef eklerken üstte vizyon cümlesi görünür; hedef isteğe bağlı olarak vizyona bağlanır (`module_ref`) |
| `ik_ise_alim_oryantasyon` | Aday ekranında ve oryantasyon paketinde kimlik metni |
| `pd_hedef_kitle`, `pd_urun_stratejileri` | Konumlandırma cümlesi başlangıç noktası |
| Kurulum sihirbazı | Sihirbazın son adımı bu modülü doldurmaya davet eder |
| Lio (AI asistan) | Kimlik metni asistan bağlamına eklenir — öneriler şirketin diline yaklaşır |

**Beslendiği modüller:** yok. A1 zincirin başıdır.

**Çekirdek bağı:** görev üretir (gözden geçirme hatırlatması). Dosya tutmaz, çıktıya bağlanmaz.

**Yayınladığı metrik:** yok. Panellere `kimlik_tanimli: evet/hayır` sağlığı olarak düşer (bkz. `panel_denetim`).

---

## 8. Otomasyon ve Bildirim

| Tetikleyici | Sonuç |
|---|---|
| `review_at` geldi | Onaylayana bildirim + çekirdek görev: "Kimlik ve Yön'ü gözden geçir" |
| Yeni sürüm onaylandı | Organizasyona tek seferlik bildirim: "Vizyon güncellendi" + fark linki |
| Organizasyon 30 gündür boş | Kurucuya tek nazik hatırlatma; ikinci kez tekrarlanmaz |

**Lio ile taslak** — boş ekranda "Birkaç soru sorayım, taslağı ben yazayım": sektör, kime satıyorsun, 3 yıl sonra ne olmak istiyorsun. Çıktı **taslak** olarak düşer, asla otomatik onaylanmaz. Kredi tüketimi `ai_credits` üzerinden.

---

## 9. Boş Durum ve Göç

**Boş ekran:** "Şirketinin ne için var olduğunu bir kez yaz; hedefler, işe alım ve müşteri iletişimi buna dayansın." → `Kimliği Yaz` · `Lio ile taslak üret` · `Örneği gör`

**Örnek veri:** sektöre göre iki hazır şablon (üretim / hizmet). Silinebilir; `status = draft` olarak gelir ki gerçek sanılmasın.

**Göç (mevcut kayıtlardan):**

1. `yonetim_vizyon_sablonu` ve `yonetim_misyon_sablonu` kayıtlarından **en son onaylı** olanlar alınır → tek `kimlik_ve_yon` kaydının `vision` / `mission` alanlarına yazılır
2. Kalan eski kayıtlar `module_record_versions`'a sürüm olarak taşınır (tarih sırasıyla)
3. Eski iki katalog kaydı `is_active = false`; açık olan organizasyonlarda yerine `kimlik_ve_yon` açılır
4. Kimsenin veri kaybı yaşamaması için göç **geri alınabilir** olmalı: eski satırlar silinmez, `superseded_by` ile işaretlenir

**"Şunu da aç" uyarısı:** yok — bu modül hiçbir modüle bağımlı değildir.

---

## 10. Bu modül A1 motorundan ne istiyor

| İhtiyaç | Bugün var mı |
|---|---|
| Tek kayıt kısıtı (ikinci kayıt açılamaz) | ✗ |
| `module_record_versions` + fark görünümü | ✗ |
| Alan bölümleri (`group`) ve modal içi bölüm başlıkları | ✗ |
| `longtext` alan tipi | ✗ (bugün `textarea`) |
| `tags` alan tipi | ✗ |
| Okuma görünümü (formdan ayrı) | ✗ |
| PDF dışa aktarım | ✗ |
| Taslak/Onaylı ayrımı | ✗ (bugün yalnızca `status` alanı) |

Bunların hepsi A1 motorunun kapsamıdır; `pd_urun_stratejileri` aynı motoru ürün başına tek kayıt olarak kullanır.
