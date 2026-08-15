# Modül Sistemi — Tasarım Dokümanları

Projelio'nun modül mimarisi, ortak varlıkları ve modül sözleşmeleri.

## Okuma sırası

| # | Doküman | İçerik |
|---|---|---|
| 00 | [Modül Mimarisi](00-modul-mimarisi.md) | 6 ilke, katman modeli, 6 arketip, ortak varlıklar, alan tipi sözlüğü, **modül sözleşmesi formatı**, şema değişiklik önerisi |
| 01 | [Arketip Eşlemesi](01-modul-arketip-eslesmesi.md) | 57 katalog kaydının tamamının arketip/varlık eşlemesi, birleşmeler, verilen kararlar, tasarım sırası |
| 02 | [Karar: Bütçe vs Muhasebe](02-karar-notu-butce-vs-muhasebe.md) | Proje bütçesi, gelir-gider defteri ve yönetim paneli ayrımı; `money_entry` tek tablo kararı |
| 03 | [Ortak Varlık: party](03-ortak-varlik-party.md) | Müşteri/tedarikçi/aday/bayi tek tabloda; roller, tekilleştirme, aktivite akışı |
| 04 | [Departman Bazlı Görünüm](04-departman-bazli-gorunum.md) | Bir modülün birden fazla departmana açılması; profiller, veri görünürlüğü kuralı |
| 05 | [**Mevcut Kod ile Uzlaşma**](05-mevcut-kod-ile-uzlasma.md) | Kod bugün nerede, hangi boşluklar var, **6 fazlı yol haritası** ve tamamlananlar |
| 06 | [Elle Test Rehberi](06-elle-test-rehberi.md) | Uçtan uca doğrulama adımları: yetki, kayıt işlemleri, arama/filtre, bilinen sınırlar |

## Arketip motorları

Bir motor yazıldığında o arketipteki tüm modüller **konfigürasyona** düşer. A2 (kayıt listesi) ve A6 (türev panel) yazıldı; kalan dördünün kurulum tasarımı aşağıda.

| # | Motor | Modül | Durum |
|---|---|---|---|
| 20 | [A1 — Form / Doküman](20-motor-a1-form.md) | 2 | Tasarım hazır, kodlanıyor |
| 21 | [A4 — Pipeline](21-motor-a4-pipeline.md) | 7 → 6 | Tasarım hazır |
| 22 | [A5 — Takvim / Plan](22-motor-a5-takvim.md) | 5 → 4 | Tasarım hazır |
| 23 | [A3 — Envanter](23-motor-a3-envanter.md) | 1 | Tasarım hazır |
| 24 | [Yerleşim: yüzeyler ve otomatik sekmeler](24-yerlesim-modul-yuzeyleri.md) | tümü | Tasarım + uygulama |

Bu dört doküman **kurulum** odaklıdır: tablolar, konfigürasyon şeması, davranış kuralları ve her modülün alan/aşama tanımı. Ekran yerleşimi ve mikro metin bilinçli olarak dışarıda — modüller ayakta olduktan sonra ayrı bir "görünümler" turunda ele alınacak.

Yazım sırası ve gerekçesi: `23-motor-a3-envanter.md` sonundaki tablo.

## Modül sözleşmeleri

Her modül `00`'daki sözleşme formatında yazılır. Arketip başına bir **referans modül** önce tam tasarlanır; motor onun üzerinden yazılır, kalan modüller konfigürasyona düşer.

| # | Modül | Arketip | Durum |
|---|---|---|---|
| 10 | [Gelir-Gider](10-modul-fm_gelir_gider.md) | A2 — Kayıt Listesi | Referans modül, spec hazır |
| 11 | [Müşteri (CRM)](11-modul-crm_musteri.md) | A2 — Kayıt Listesi | Referans modül, spec hazır |
| 12 | [Kimlik ve Yön](12-modul-kimlik_ve_yon.md) | A1 — Form / Doküman | Referans modül, spec hazır (vizyon + misyon birleşimi) |

Sırada: `spd_satis_planlama` (A4) · `pd_sosyal_medya` (A5) · `oud_depo` (A3)

## Özet sayılar

| | |
|---|---|
| Katalog kaydı | 57 |
| Kayıt modülü (A2 motoru) | 38 |
| Türev panel (A6 motoru) | 12 |
| Varlık modülü (`party`) | 1 |
| Çekirdek (modül değil) | 5 |
| Kendi tablosunda (`products`) | 1 |
| **Çalışan modül** | **51 / 51** |
| Arketip motoru: yazılan / toplam | **2 / 6** (A2 · A6) |
| Arketip motoru: tasarımı hazır | **6 / 6** |

Kalan 4 motor (A1 form, A3 envanter, A4 pipeline, A5 takvim) modülleri **çalışır kılmak için değil, daha iyi kılmak için** gerekli: aşamalı modüller bugün liste olarak, takvim modülleri tarih alanı olarak çalışıyor.

## Durum

| Faz | Ne | Durum |
|---|---|---|
| 0 | `module_members` — modüle kişi atama ve yetki | ✅ uygulandı |
| 0.5 | 40 modül tanımı, departman bazlı dosyalar | ✅ |
| 1 | A2 motoru — düzenleme, arşivleme, arama, filtre, sıralama | ✅ |
| — | Test altyapısı (416 test, sıfır yeni bağımlılık) | ✅ |
| 3 | `party` ortak varlığı + müşteri modülü birleşmesi | ✅ |
| 2 | Alan tipi genişletmesi (`currency`, `entity_ref`, `user_ref`…) | ✅ (`file` hariç) |
| 5 | A6 panel motoru (tek motor, **12 modül**) | ✅ |
| 6 | A1 · A4 · A5 · A3 motorlarının kurulum tasarımı | ✅ (20–23) |
| 6a | A1 form motoru — kod | ✅ |
| 7 | Yerleşim: modal yüzeyi + otomatik sekmeler | ✅ (mobil satırı ve departman "senin modüllerin" satırı hariç) |
| 6b | A4 pipeline · A5 takvim · A3 envanter — kod | |
| 8 | Boş durum ve mikro metin turu | |
| 4 | `money_entry` — bütçe/defter birleşmesi | |

Migration'lar `042` ve `043` canlıya uygulandı.

## Komutlar

```bash
npm test          482 test
npm run typecheck backend + web
npm run dev       backend + web birlikte
```

## Alan tipleri

`text` · `textarea` · `longtext` · `number` · `date` · `select` · `currency` · `entity_ref` · `user_ref` · `multiselect` · `tags` · `formula`

`entity_ref` ve `user_ref` alanları geriye dönük uyumlu: bu alanlar eskiden serbest metindi, eski kayıtlardaki adlar olduğu gibi görünmeye devam ediyor.
`longtext` ve `tags` A1 motoruyla geldi; `tags` değerleri `multiselect` ile aynı biçimde (virgülle ayrılmış tek metin) saklanır.
