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

## Modül sözleşmeleri

Her modül `00`'daki sözleşme formatında yazılır. Arketip başına bir **referans modül** önce tam tasarlanır; motor onun üzerinden yazılır, kalan modüller konfigürasyona düşer.

| # | Modül | Arketip | Durum |
|---|---|---|---|
| 10 | [Gelir-Gider](10-modul-fm_gelir_gider.md) | A2 — Kayıt Listesi | Referans modül, spec hazır |
| 11 | [Müşteri (CRM)](11-modul-crm_musteri.md) | A2 — Kayıt Listesi | Referans modül, spec hazır |

Sırada: `spd_satis_planlama` (A4) · `panel_analiz` (A6) · `pd_sosyal_medya` (A5) · `oud_depo` (A3) · `kimlik_ve_yon` (A1)

## Özet sayılar

| | |
|---|---|
| Katalog kaydı | 57 |
| **Tam tanımlı modül** | **40** |
| Panel (A6) motorunu bekleyen | 11 |
| Çekirdek (modül değil) | 5 |
| Kendi tablosunda | 1 |
| Arketip motoru: yazılan / toplam | **1 / 6** (A2 tamam) |

## Durum

| Faz | Ne | Durum |
|---|---|---|
| 0 | `module_members` — modüle kişi atama ve yetki | ✅ uygulandı |
| 0.5 | 40 modül tanımı, departman bazlı dosyalar | ✅ |
| 1 | A2 motoru — düzenleme, arşivleme, arama, filtre, sıralama | ✅ |
| — | Test altyapısı (416 test, sıfır yeni bağımlılık) | ✅ |
| 2 | Alan tipi genişletmesi (`currency`, `entity_ref`, `user_ref`…) | sırada |
| 3 | `party` ortak varlığı + müşteri modülü birleşmesi | |
| 4 | `money_entry` — bütçe/defter birleşmesi | |
| 5 | A6 panel motoru (tek motor, 11 modül) | |
| 6 | A4 pipeline · A5 takvim · A3 envanter motorları | |

Migration'lar `042` ve `043` canlıya uygulandı.

## Komutlar

```bash
npm test          416 test
npm run typecheck backend + web
npm run dev       backend + web birlikte
```
