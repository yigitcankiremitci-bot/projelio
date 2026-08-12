-- 043_module_catalog_descriptions.sql
-- Modül kataloğundaki 57 kaydın açıklaması boştu; kurulum sihirbazında kullanıcı
-- ne seçtiğini göremiyordu ("Analiz modülü" adı tek başına ne yaptığını anlatmıyor).
--
-- Açıklama biçimi: tek cümle, "kim ne zaman hangi kararı vermek için açar".
-- Bkz. docs/moduller/00-modul-mimarisi.md §5 (Modül Sözleşmesi, madde 2).
--
-- Ayrıca modülün ne tür bir araç olduğu (kayıt defteri mi, panel mi, çekirdek mi)
-- açıklamanın sonunda parantez içinde belirtiliyor — kullanıcı "bunu açınca ne
-- göreceğim?" sorusunu seçim ekranında yanıtlayabilsin.

update public.module_catalog set description = v.description
from (values

-- ============================================== YÖNETİM
('yonetim_vizyon_sablonu',
 'Şirketin uzun vadeli yönünü tek bir ifadeye indirger; stratejik kararlarda başvurulacak çerçeveyi tanımlar.'),
('yonetim_misyon_sablonu',
 'Şirketin bugün kime, hangi değeri sunduğunu netleştirir; ekip ve müşteri iletişiminin ortak zeminidir.'),
('yonetim_hedef_belirleme',
 'Dönemsel hedefleri sorumlusu ve tarihiyle listeler; kimin neyi ne zamana kadar başaracağını tek yerde tutar.'),
('yonetim_analiz',
 'Diğer modüllerin verisinden şirket geneli göstergeler üretir. Veri girişi yoktur, okur (panel).'),
('yonetim_raporlama',
 'Seçilen dönem için hazır raporlar üretir ve dışa aktarır. Veri girişi yoktur, okur (panel).'),
('yonetim_denetim',
 'Kayıtlarda kim ne zaman ne değiştirdi, hangi süreç eksik kaldı — denetim izini gösterir (panel).'),
('yonetim_proje_yonetimi',
 'Projelio''nun çekirdek proje yönetimidir; ayrıca etkinleştirilmesi gerekmez.'),
('yonetim_program_yonetimi',
 'Süresi olmayan, tekrar eden işlerin (program) yönetimi. Projelio''nun çekirdeğidir.'),
('yonetim_gorev_yonetimi',
 'Görev oluşturma, atama ve takip Projelio''nun çekirdeğidir; ayrıca etkinleştirilmesi gerekmez.'),
('yonetim_cikti_yonetimi',
 'Projelerin somut çıktılarının yönetimi Projelio''nun çekirdeğidir.'),
('yonetim_butce_yonetimi',
 'Planlanan ve gerçekleşen bütçeyi karşılaştırıp yönetime sapma gösterir. Veri girişi yoktur, okur (panel).'),
('yonetim_dosya_yonetimi',
 'Dosya saklama ve paylaşım Projelio''nun çekirdeğidir; Drive/OneDrive bağlantısıyla çalışır.'),

-- ============================================== İNSAN KAYNAKLARI
('ik_ise_alim_oryantasyon',
 'Açık pozisyonlara gelen adayları mülakattan işe alıma kadar aşama aşama takip eder.'),
('ik_egitim_gelisim',
 'Çalışanların eğitim ve gelişim planlarını tarihi, katılımcısı ve maliyetiyle planlar.'),
('ik_performans_izleme',
 'Dönemsel performans değerlendirmelerini kaydeder; kimin hedefine ne kadar yaklaştığını gösterir.'),
('ik_bordro_ozluk',
 'Çalışan bazında dönemlik bordro ve ödeme kayıtlarını tutar. Maaş bilgisi içerir, yalnızca atanan kişiler görmelidir.'),
('ik_ic_iletisim_kultur',
 'Şirket içi duyuru, etkinlik, anket ve kutlamaları planlar ve yayınlanma durumunu izler.'),

-- ============================================== FİNANS MUHASEBE
('fm_gelir_gider',
 'Şirketin tüm para hareketlerini tek defterde toplar; dönem sonunda ne kazanıldığı ve neye harcandığı tek ekrandan görülür.'),
('fm_alacak_borc',
 'Henüz tahsil edilmemiş alacakları ve ödenmemiş borçları vade tarihiyle takip eder.'),
('fm_fatura',
 'Kesilen ve alınan faturaları numarası, tutarı ve ödeme durumuyla kaydeder.'),
('fm_vergi_takip',
 'Beyanname ve vergi ödeme yükümlülüklerini dönem ve son ödeme tarihiyle takip eder; gecikmeleri öne çıkarır.'),
('fm_butce_hazirlama',
 'Dönem başında hangi kaleme ne kadar ayrılacağını planlar; gerçekleşmeyle karşılaştırma bütçe panelinde yapılır.'),
('fm_finansal_planlama',
 'Mevcut verilerden ileriye dönük finansal projeksiyon üretir. Veri girişi yoktur, okur (panel).'),
('fm_nakit_akis',
 'Gelir-gider kayıtlarından tarih bazlı nakit giriş/çıkış akışını çıkarır. Veri girişi yoktur, okur (panel).'),
('fm_analiz_rapor',
 'Finansal verilerden kategori ve dönem kırılımlı analiz üretir. Veri girişi yoktur, okur (panel).'),
('fm_sermaye_yatirim_takip',
 'Yapılan ve planlanan yatırımları tutarı, beklenen getirisi ve durumuyla izler.'),
('fm_risk_yonetimi',
 'Şirketi tehdit eden riskleri olasılık, etki, sorumlu ve alınacak önlemle birlikte kayıt altına alır.'),

-- ============================================== PAZARLAMA ve BÜYÜME
('pd_rakip_sektor_analizi',
 'Rakipleri güçlü/zayıf yanları, fiyat konumu ve tehdit seviyesiyle karşılaştırır.'),
('pd_hedef_kitle',
 'Hedef müşteri profillerini (persona) ihtiyaçları ve ulaşılan kanallarıyla tanımlar.'),
('pd_dijital_pazarlama_seo_sem',
 'Takip edilen anahtar kelimeleri hedef sayfası, arama hacmi ve sıralamasıyla izler.'),
('pd_sosyal_medya',
 'Sosyal medya gönderilerini platform ve tarihe göre planlar; taslaktan yayına durumunu izler.'),
('pd_email',
 'E-posta kampanyalarını hedef listesi, gönderim tarihi ve açılma/tıklanma oranlarıyla takip eder.'),
('pd_reklam',
 'Reklam kampanyalarını platformu, bütçesi ve yayın durumuyla yönetir.'),
('pd_urun_stratejileri',
 'Her ürün için konumlandırma, hedef segment ve fiyatlandırma stratejisini tek yerde tutar.'),
('pd_musteri_kazanim_optimizasyonu',
 'Reklam ve satış verisinden müşteri kazanım maliyeti ve dönüşüm oranlarını çıkarır. Veri girişi yoktur, okur (panel).'),
('pd_buyume_hedefleri',
 'Sayısal büyüme hedeflerini ölçütü, hedef değeri ve mevcut değeriyle izler.'),

-- ============================================== SATIŞ ve İŞ GELİŞTİRME
('spd_satis_planlama_b2b_b2c',
 'Satış fırsatlarını potansiyelden kapanışa kadar aşama aşama takip eder; açık fırsat tutarını gösterir.'),
('spd_musteri_modulu',
 'Satış tarafının müşteri ve aday kayıtları. (Müşteri İlişkileri''ndeki müşteri modülüyle birleştirilecek.)'),
('spd_ortaklik_dagitim',
 'Bayi, distribütör ve iş ortaklarını bölgesi, komisyon oranı ve durumuyla yönetir.'),
('spd_pazar_arastirma',
 'Pazar büyüklüğü, fiyat ve trend araştırmalarını bulgularıyla birlikte arşivler.'),

-- ============================================== OPERASYON / ÜRETİM
('oud_tedarik',
 'Malzeme ve hizmet taleplerini siparişten teslimata kadar takip eder.'),
('oud_depo',
 'Stok kalemlerinin mevcut miktarını, birimini ve konumunu tutar; kritik seviyenin altına düşenleri uyarır.'),
('oud_sevkiyat_yonetimi',
 'Müşteriye giden sevkiyatları taşıyıcı, takip numarası ve teslim durumuyla izler.'),
('oud_kalite_kontrol',
 'Uygunsuzluk ve kalite sorunlarını düzeltici aksiyondan kapanışa kadar takip eder.'),

-- ============================================== BİLGİ TEKNOLOJİLERİ / YAZILIM
('bt_yazilim',
 'Kullanılan yazılım ve aboneliklerin envanteri; lisans türü ve yenileme tarihiyle takip edilir.'),
('bt_donanim',
 'Şirket donanımlarını (bilgisayar, telefon, ağ cihazı) seri numarası ve zimmetli kişisiyle izler.'),
('bt_ag_guvenlik',
 'Güvenlik olaylarını ve periyodik kontrolleri önem derecesi ve çözüm durumuyla kayıt altına alır.'),

-- ============================================== ÜRÜN YÖNETİMİ
('uyd_urunler',
 'Şirketin ürün ve hizmetlerini fiyatı ve görseliyle tanımlar; şirket anasayfasında kart olarak listelenir.'),

-- ============================================== MÜŞTERİ İLİŞKİLERİ
('mid_musteri_modulu',
 'Temas edilen kişi ve kurumların kaydı; iletişim bilgisi ve müşteri durumu tek yerde tutulur.'),
('mid_sikayet_oneri',
 'Müşteriden gelen şikayet ve önerileri açıktan çözüme kadar takip eder.'),
('mid_teknik_destek',
 'Destek taleplerini önceliği, geliş kanalı ve sorumlusuyla açıktan kapanışa kadar yönetir.'),

-- ============================================== HUKUK ve UYUM
('hud_sozlesme',
 'Müşteri, tedarikçi ve ortaklık sözleşmelerini taraf ve tarih aralığıyla takip eder; bitişi yaklaşanları öne çıkarır.'),
('hud_marka_patent_telif',
 'Marka, patent ve telif tescillerini başvuru/yenileme tarihleriyle izler; hak kaybı yaratacak gecikmeleri uyarır.'),
('hud_mevzuatlar',
 'Şirketi bağlayan mevzuat ve düzenlemeleri uyum durumuyla birlikte arşivler.'),

-- ============================================== HOLDİNG GENELİ
('holding_analiz',
 'Holdinge bağlı tüm şirketlerin verisini tek ekranda karşılaştırır. Veri girişi yoktur, okur (panel).'),
('holding_raporlama',
 'Holding geneli konsolide raporlar üretir. Veri girişi yoktur, okur (panel).'),
('holding_denetim',
 'Holdinge bağlı şirketlerdeki değişiklik ve süreç izini gösterir. Veri girişi yoktur, okur (panel).')

) as v(key, description)
where module_catalog.key = v.key;
