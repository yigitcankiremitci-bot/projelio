# Modül Yerleşimi — Yüzeyler ve Otomatik Sekmeler

> Motorlar modülün **ne yaptığını** tanımlar; bu doküman modülün **nereden açıldığını** ve **açılınca ekranı nasıl kapladığını** tanımlar.
>
> İki ayrı karar, iki ayrı mekanizma:
>
> | Karar | Ne | Kim verir |
> |---|---|---|
> | **Yüzey** (`surface`) | Modül açılınca modal mı, tam sayfa mı | Modül tanımı — sabit |
> | **Yerleşim** (`placement`) | Modül nereden açılıyor: sekme mi, modül listesi mi | Motor — tamamen otomatik |

---

## 1. Neden bu ayrım

Bugün her modül aynı yerde ve aynı biçimde açılıyor: departman kartının içinde bir akordeon. Bunun iki sonucu var.

**Küçük şirkette her şey çok derinde.** Üç kişilik bir işletmede Gelir-Gider'e ulaşmak için Organizasyon → Departmanlar → Finans → Modüller → Gelir-Gider → Aç: beş tık. Oysa o şirkette günde on kez açılan tek ekran orası.

**Büyük şirkette her şey aynı düzlemde.** Kırk modül açıldığında hepsi eşit ağırlıkta listelenir; kullanıcının kendi işine yarayan üç tanesi kalabalıkta kaybolur.

Doğru cevap sabit bir yerleşim değil, **şirket büyüdükçe değişen** bir yerleşim: yapı yokken modüller yüzeye çıkar, yapı kurulunca yapının içine yerleşir.

---

## 2. Yüzey — modal mı, sayfa mı

Her modül tanımında bir `surface` alanı taşır. Varsayılan arketipten gelir, modül isterse geçersiz kılar.

### 2.1 Karar ölçütü

**Modal**, iş tek ekranda bitiyorsa:

- tek kayıt üzerinde çalışılıyor (A1) ya da kayıt sayısı doğası gereği az
- kayıtlar arası karşılaştırma yok, filtre/arama gerekmiyor
- toplu işlem yok, sütun seçici yok
- kullanıcı işi bitirip geldiği yere döner — bağlamı kaybetmemeli

**Tam sayfa**, ekranın kendisi bir çalışma alanıysa:

- liste + filtre + arama + sıralama + toplu işlem
- kanban tahtası, takvim ızgarası, iki seviyeli envanter
- grafik ve kırılım taşıyan paneller
- kullanıcı orada dakikalarca kalır

### 2.2 Arketip varsayılanları

| Arketip | Varsayılan | Gerekçe |
|---|---|---|
| A1 Form | **modal** | Tek kayıt, okuma + düzenleme. Sayfa açmak abartı |
| A2 Kayıt Listesi | **sayfa** | Filtre/arama/toplu işlem sayfa ister |
| A3 Envanter | **sayfa** | İki seviyeli (kalem → hareket) |
| A4 Pipeline | **sayfa** | Kanban yatayda yer ister |
| A5 Takvim | **sayfa** | Ay ızgarası modala sığmaz |
| A6 Türev Panel | **sayfa** | Kart ızgarası + kırılım tablosu |

### 2.3 İstisnalar

Varsayılandan sapan modüller — her biri için gerekçe zorunlu:

| Modül | Arketip | Yüzey | Gerekçe |
|---|---|---|---|
| `yonetim_hedef_belirleme` | A2 | **modal** | Dönem başına 3–7 hedef. Filtreye gerek yok |
| `hud_mevzuatlar` | A2 | **modal** | Referans kütüphane, salt okunur ağırlıklı, kısa liste |
| `bt_ag_guvenlik` | A2 | **modal** | Periyodik kontrol listesi; kayıt sayısı düşük |
| `pd_hedef_kitle` | A2 | **modal** | 3–5 persona kartı |
| `panel_denetim` | A6 | **modal** | Tek bir sağlık listesi; grafik yok |
| `pd_urun_stratejileri` | A1 | modal | (varsayılan) ürün seçici modalin başlığında |

Kural: **istisna listesi 10'u geçerse ölçüt yanlıştır**, tek tek modül kararı değil ölçüt düzeltilir.

### 2.4 Modal davranışı

Tek bir `ModuleModal` sarmalayıcı; bugünkü `Modal` bileşeninin üstüne modüle özgü davranış ekler:

| Konu | Kural |
|---|---|
| Genişlik | 640px (A1 form), 760px (liste/panel). Bugünkü varsayılan 400 dar kalıyor |
| Yükseklik | `max-height: 85vh`, içerik kendi içinde kayar; başlık ve alt eylem çubuğu sabit |
| Mobil | 768px altında tam ekran sayfa gibi davranır (alttan yükselen sayfa), kenar boşluğu yok |
| Başlık | Modül ikonu + adı + tek satır açıklama. Açıklama katalogdaki `description` |
| Kapanış | ESC · dış tıklama · sağ üst çarpı. **Kaydedilmemiş taslak varsa** dış tıklama kapatmaz, sorar |
| Derin bağlantı | `?modul=<key>` adres parametresi. Yenilenince aynı modal açılır, geri tuşu kapatır |
| Odak | Açılışta ilk alana odak; kapanışta çağıran düğmeye geri döner |

Derin bağlantı önemsiz görünüyor ama modalin sayfaya göre tek gerçek dezavantajını kapatıyor: paylaşılabilir adres.

### 2.5 Modül nereden açılır

Departmanda modüller **kart ızgarası** olarak listelenir — şirket anasayfasındaki
modül kartlarıyla aynı görünüm. Liste hâli modülleri "ayar satırı" gibi
gösteriyordu; oysa bunlar açılıp içinde çalışılan araçlar.

| Yüzey | Karta tıklayınca |
|---|---|
| `page` | `/departments/:departmentId/modules/:moduleKey` — modülün kendi sayfası |
| `modal` | Kart yerinde modal açılır, kapanınca ızgaradaki yerine dönülür |

Modülün kendi sayfası olmasının üç kazancı var: çalışma alanı departman
listesinin arasına sıkışmıyor, adres paylaşılabiliyor, sayfa yenilenince
kaybolmuyor. Ekip paneli sayfada modülün **altında** durur — önce iş, sonra kim
çalışıyor.

---

## 2.6 Kayıt listelerinin biçimi

Üç kural, tüm A2 modüllerinde ortak (`ModuleRecordsPanel`):

1. **Satır genişliği sınırlı (920px).** Geniş ekranda satır ekranı baştan sona
   kat edince göz satır başını kaybediyor. Pano görünümü sütunlara bölündüğü
   için bu sınırdan muaf.
2. **Düzenleme kalem simgesiyle, modalde.** Önceden satıra tıklamak düzenleme
   açıyordu: hangi eylemin ne yapacağı belirsizdi ve form listenin arasına
   girince kullanıcı hangi kaydı düzenlediğini kaybediyordu. Artık her satırda
   açık bir kalem düğmesi var, form modalde açılıyor.
3. **Pano (kanban) seçeneği.** Kayıtlar bir `select` alanına göre sütunlara
   bölünebiliyorsa görünüm seçici çıkar. Sütun alanı `config.boardKey` ile
   bildirilir; bildirilmezse 2–6 seçenekli ilk select alanı seçilir (daha
   fazlası okunmaz bir şerit olur). Alanı boş kayıtlar "Belirtilmemiş"
   sütununda toplanır — pano görünümünde sessizce kaybolmasınlar.

Gelir-Gider'de sütunlar türe göre bölünür (`boardKey: "type"`): gelir ve gider
yan yana iki sütun.

**Henüz yok:** sütunlar arası sürükle-bırak. Kayıt taşımak şimdilik kalem →
alanı değiştir üzerinden yapılıyor.

## 2.7 Modül → görev köprüsü

Bir sosyal medya planı, tedarik talebi ya da kalite uygunsuzluğu girildiğinde iş
orada bitmiyor: birinin onu yapması gerekiyor. Köprü olmadan kullanıcı aynı
cümleyi bir de departman görevlerine elle yazıyor, iki kayıt arasında hiçbir bağ
kalmıyordu.

Her kayıt satırında **"Göreve dönüştür"** düğmesi var. Açılan modal görev
başlığını kaydın özetinden, teslim tarihini kaydın kendi tarih alanından
(`config.periodKey`) doldurur; kişi seçimi departman kadrosundan yapılır
(`AssigneePicker`). Görev departmanın görev listesine düşer.

Bağ görevde saklanır (`tasks.source_module_key`, `tasks.source_record_id` —
migration `051`):

- Modül panelinde satır, o kayıttan kaç görev doğduğunu rozetle gösterir.
- Aynı kayıttan ikinci görev açmak **yasak değil** — bir plan birden fazla kişiye
  bölünebilir — ama modal kullanıcıyı uyarır.
- Bağ tek yönlü ve gevşek: görev silinse kayıt, kayıt arşivlense görev etkilenmez.

Ara tablo yerine görevde iki kolon: bağ görevin bir niteliği (nereden geldi),
ayrı bir varlık değil.

**Sınır:** köprü şimdilik yalnızca departman bağlamında. Serbest çalışanda
görevler projeye bağlı ve hangi projeye yazılacağı ayrı bir karar; o yüzden
düğme orada görünmüyor.

---

## 2.8 Panoda sürükle-bırak

Pano sütunları arasında kart sürüklenebiliyor; bırakıldığı sütunun değeri kayda
yazılır. Görev panosuyla aynı ayarlar kullanılıyor (`useSortableList`): kısa
basılı tutunca kalkar, böylece normal kaydırma yanlışlıkla sürükleme sayılmaz.

Sütun içi sıralama kapalı (`sort: false`) — sıra alan tanımından geliyor, önemli
olan kaydın hangi sütuna bırakıldığı. Boş sütunlar da hedef olabilsin diye en az
bir satır yüksekliğinde duruyor ve "Buraya sürükle" diyor.

Yerel durum önce güncellenir, sonra sunucuya yazılır: sürükleme bittiğinde kart
yeni sütunda kalmalı, isteğin dönmesini bekleyip geri zıplamamalı. İstek
başarısız olursa liste sunucudan tazelenir.

---

## 3. Yerleşim — otomatik sekme terfisi

### 3.1 İki bağlam, tek kural

| Bağlam | Sabit sekmeler | Modül sekmesi nereye |
|---|---|---|
| Serbest çalışan anasayfası (`/`) | İşler · Bütçe · Dosyalar · Modüller | "Modüller"in soluna, en fazla 2 |
| Organizasyon sayfası (`/organizations/:id`) | Anasayfa · Sosyal · Departmanlar · Ürün/Hizmet · Bütçe · Dosyalar | "Dosyalar"ın sağına, en fazla 2 |

Aynı puanlama, aynı eşikler, aynı histerezis. Fark yalnızca girdi kümesinde: serbest çalışanda işe atanmış modüller, organizasyonda etkin modüller.

### 3.2 Kaç slot — şirket büyüklüğü

Sezgiye ters ama doğru olan kural: **şirket büyüdükçe modül sekmesi azalır.**

| Ölçek | Ölçüt | Modül sekmesi | Neden |
|---|---|---|---|
| Tek kişi | 1 kullanıcı, departman yok | **2** | Gezinilecek yapı yok; modüller yüzeye çıkmazsa gömülü kalır |
| Küçük | 2–9 kullanıcı | **2** | Departmanlar var ama sığ; herkes her işi yapıyor |
| Orta | 10–49 kullanıcı | **1** | Departman gezinmenin ekseni olmaya başlar |
| Büyük | 50+ kullanıcı ya da 5+ departman | **0** | Sekme çubuğu kurumsal ve sabit olmalı; modül ekibinin yanında durur |

Büyük şirkette sekme sıfırlanınca kullanıcı erişimi kaybetmez: kişiselleştirme sekme çubuğundan **departman sayfasına** taşınır — kullanıcının atandığı modüller o sayfanın en üstünde "Senin modüllerin" satırında toplanır.

### 3.3 Puanlama

Puan **kullanıcı başına** hesaplanır — aynı şirkette finansçı ile depocu farklı sekme görür. "Kullanım kolaylığı" ancak kişiselse mümkün.

| Sinyal | Puan | Gerekçe |
|---|---|---|
| Kullanıcı modüle atanmış (`module_members`) | **+3** | En güçlü sinyal: bu modül bu kişinin işi |
| Son 14 günde kayıt eklendi/güncellendi | **+2** | Canlı kullanım |
| Son 15–30 günde hareket | +1 | Sönmekte olan kullanım |
| Kayıt hacmi: 1–20 / 21–100 / 100+ | +0 / +1 / +2 | Dolu modül boş modülden önce gelir |
| Modül son 14 günde açıldı (yeni) | **+2** | Yeni açılan modül hemen görünür olmalı, yoksa unutulur |
| Çekirdek sekmeyle örtüşüyor | **−2** | `panel_butce` zaten "Bütçe" sekmesinde; iki kez göstermek kafa karıştırır |
| Modülün hiç kaydı yok ve 30 gündür açılmamış | **−3** | Terk edilmiş modül sekme işgal etmez |

**Eşikler (histerezis):** puan **≥ 6** ise terfi eder, **< 3** ise düşer. Aradaki bant mevcut durumu korur — sekmeler haftadan haftaya yer değiştirmez. Bu bant olmasaydı 5 ile 6 puan arasında salınan bir modül her girişte belirip kaybolurdu; kullanıcının en çok güvendiği şey ise sekmenin dünkü yerinde olması.

**Yeniden hesaplama:** oturum açılışında bir kez; sonuç kullanıcı + bağlam anahtarıyla `localStorage`'a yazılır ve **24 saat** taze kabul edilir. Oturum ortasında sekme çubuğu asla değişmez.

**Sıra:** çekirdek sekmeler daima sabit ve önce. Terfi eden modüller aralarında puana göre sıralanır; terfi ettikleri andaki sıra düşene kadar korunur.

### 3.4 Değişiklik hissi

- **Terfi görünür olur:** yeni sekme ilk kez çizildiğinde yanında tek seferlik "yeni" noktası ve tek cümlelik bilgi: "Gelir-Gider'i sık kullandığın için üste aldık."
- **Düşüş sessizdir:** sekme kaybolur, hiçbir bildirim çıkmaz. Modül "Modüller" listesinde yerinde durur. Kullanıcıya kaybettiği bir şey olduğunu söylemek, olmayan bir sorunu haber vermektir.
- **Geri alınabilirlik:** "Modüller" sekmesinin başında "Üstteki sekmeler nasıl belirleniyor?" bağlantısı; tek paragraf açıklama ve o anki puanlar.

### 3.5 Mobil

Mobilde modül sekmesi **çıkmaz**. Sekme çubuğu zaten 3+3 ızgaraya bölünüyor ve alt menü (`BottomNav`) ayrıca yer kaplıyor; yedinci bir sekme okunmuyor.

Karşılığı: mobilde "Modüller" sekmesinin en üstünde **"Sık kullandıkların"** satırı — aynı puanlama, farklı kap. Böylece kural tek kalır, yalnızca kap değişir.

---

## 4. Veri: puanlama neyden besleniyor

Yeni tablo **yok**. Üç kaynaktan türer:

| Sinyal | Kaynak |
|---|---|
| Atanmışlık | `module_members` (mevcut) |
| Kayıt hacmi ve son hareket | `module_records` / `pipeline_record` / `plan_entry` üzerinde toplam |
| Modülün açılma tarihi | `organization_modules.created_at` / `job_modules.created_at` (mevcut) |

Tek yeni uç nokta — sayfa başına tek sorgu:

```
GET /organizations/:id/module-stats
GET /jobs/:id/module-stats
→ [{ moduleKey, recordCount, lastActivityAt, enabledAt, assignedToMe }]
```

```sql
select module_key,
       count(*)                                as record_count,
       max(coalesce(updated_at, created_at))   as last_activity_at
from public.module_records
where organization_id = $1 and archived_at is null
group by module_key;
```

A4 ve A5 motorları geldiğinde `pipeline_record` ve `plan_entry` aynı biçimde `union all` ile eklenir; uç noktanın sözleşmesi değişmez.

**Not:** "modülün kaç kez açıldığı" bilinçli olarak ölçülmüyor. Tıklama günlüğü tutmak yeni bir tablo, yeni bir gizlilik yüzeyi ve sürekli yazma yükü demek; kayıt hareketi zaten kullanımın daha dürüst göstergesi — insan baktığı yeri değil, çalıştığı yeri doldurur.

---

## 5. Kod yapısı

| Dosya | İş |
|---|---|
| `lib/moduleSurfaces.ts` | Modül → yüzey kayıt defteri (arketip varsayılanı + istisnalar) |
| `lib/moduleLayout.ts` | **Saf fonksiyon:** `resolveModuleTabs(input) → ModuleTab[]`. Ağ yok, React yok, tam test edilebilir |
| `components/ModuleModal.tsx` | Modal sarmalayıcı: genişlik, mobil tam ekran, taslak koruması, derin bağlantı |
| `components/ModuleSurface.tsx` | Tek giriş noktası: modül anahtarını alır, doğru paneli doğru yüzeyde açar |
| `hooks/useModuleTabs.ts` | Saf fonksiyonu veriyle besler, 24 saatlik önbelleği yönetir |

`ModuleSurface` bugünkü dört dallı `if` zincirinin (form / panel / varlık / kayıt) tek yerde toplanmış hali olur — `DepartmentModulesPanel`, `DashboardAssignedModules` ve yeni sekmeler aynı bileşeni çağırır. Bugün bu zincir iki dosyada kopyalanmış durumda ve A4/A5 geldiğinde üçe çıkacaktı.

---

## 6. Uygulama sırası

| # | Adım | Neden bu sırada |
|---|---|---|
| 1 | `moduleSurfaces.ts` + `ModuleModal` + `ModuleSurface` | Yüzey ayrımı tek başına değerli; sekme olmadan da kazanç |
| 2 | Departman panelinde akordeon yerine `ModuleSurface` | Modal olan modüller hemen modalde açılmaya başlar |
| 3 | `module-stats` uç noktası | Puanlamanın girdisi |
| 4 | `moduleLayout.ts` + testler | Saf mantık, ekrana dokunmadan doğrulanır |
| 5 | `useModuleTabs` + iki anasayfaya bağlama | Görünür değişiklik en sona |

1–2 tek başına gönderilebilir; 3–5 ondan bağımsız ilerleyebilir.

---

## 7. Karara bağlanan açık uçlar

- **Departman sayfasındaki "Senin modüllerin" satırı** büyük şirkette sekmenin yerini alıyor; bu satırın da aynı puanlamayı kullanması gerekir — ayrı bir sıralama mantığı yazılmamalı.
- **Holding kapsamı** bu dokümanda yok: holding sayfasının sekme çubuğu ayrı ve modül taşımıyor. Gerekirse aynı motor `slots = 0` ile çalışır.
- **Erişilebilirlik:** sekme çubuğu değiştiğinde odak sırası da değişir. Terfi eden sekme klavye sırasında çekirdek sekmelerden sonra gelmeli; ekran okuyucuya "yeni sekme" duyurusu tek seferlik yapılmalı.
