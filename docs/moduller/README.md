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
| 05 | [**Mevcut Kod ile Uzlaşma**](05-mevcut-kod-ile-uzlasma.md) | Kod bugün nerede, hangi boşluklar var, **6 fazlı yol haritası** |

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
| Çekirdeğe taşınacak | 5 |
| Birleşme sonucu kaybolan | 8 |
| **Tasarlanacak modül** | **45** |
| Yazılacak arketip motoru | **6** |

## Nereden başlanmalı

`05`'teki yol haritasına göre: **Faz 0 — `module_members` yetki tablosu.** Modüle kişi atama bugün kodda yok; modül sisteminin temel vaadi bu tablo olmadan çalışmıyor.
