# UI v1: eski anasayfa

Kapak, kişi kartı ve sekmeli anasayfanın `565fb06` öncesi hâli. `/uiv1` adresinden
ve Admin panelindeki bağlantıdan açılır; yeni tasarım oturana kadar başvuru için
duruyor. Klasör ortak koda dokunmaz, ona yalnızca `App.tsx` bağlanır: işi bitince
klasörü, `App.tsx`'teki `uiv1` satırlarını ve `landing/next.config.mjs`'teki
yönlendirmeyi silmek yeterli.

Eski tanıtım sayfası `projelio.app/tr/uiv1` adresinde (`landing/src/app/[lang]/(site)/uiv1/`);
bu ekranda ve Admin panelinde bağlantısı var. İşi bitince o klasör de silinir.

Buradan çıkan bağlantılar (iş, departman, Ana Sayfa) güncel sayfalara gider.
