#!/usr/bin/env python3
"""
Mobil uygulama ikonlarını apps/web/public/logo.png'den üretir.

NEDEN AYRI BETİK — iki ayrı tuzak var:

1. Logoyu doğrudan ikon olarak vermek çalışmıyor. Android "adaptive icon"da
   simgenin dış kenarlarını cihaza göre değişen bir maske (daire, squircle,
   kare) kesiyor; garanti görünen alan ortadaki dairedir. Kenarlara dayanmış
   bir logo bu yüzden kırpılmış görünüyordu. Burada işaret küçültülüp
   ortalanıyor, ön katman arka katmandan daha da içeride tutuluyor.

2. Logonun renkleri DEĞİŞTİRİLMİYOR. Koyu zemin denendi ve reddedildi:
   işaretin lacivert (#3E4858) kısımları koyu zeminle neredeyse aynı, küçük
   boyutta kayboluyor. Rengi açmak da markayı bozuyor. Çözüm zemini açık
   tutmak — bu yüzden ACIK_ZEMIN sabiti burada, koyu bir değerle
   değiştirilirse simge okunmaz hâle gelir.

Üretilenler (apps/mobile/assets/):
  icon.png             — eski tip kare ikon (maske uygulamayan cihazlar)
  icon-foreground.png  — adaptive ikonun ön katmanı (şeffaf)
  icon-background.png  — adaptive ikonun arka katmanı (düz renk)
  splash.png           — açılış ekranı

Sonrasında: npx @capacitor/assets generate --android
(ikisini birden yapmak için: npm run ikon --workspace @projelio/mobile)
"""
from pathlib import Path
from PIL import Image, ImageDraw

KOK = Path(__file__).resolve().parents[3]
LOGO = KOK / "apps/web/public/logo.png"
CIKTI = KOK / "apps/mobile/assets"

# packages/shared/src/theme.ts -> light.background. Bkz. yukarıdaki 2. madde.
ACIK_ZEMIN = (247, 248, 250, 255)
# Açılış ekranının zemini: uygulamanın varsayılan teması karanlık
# (bkz. 369ddf5), açık bir açılış ekranı göz alan bir beyaz çakma yaratıyor.
KOYU_ZEMIN = (28, 34, 44, 255)


def isaret(boy: int) -> Image.Image:
    """Logoyu şeffaf zeminde, kendi sınırlarına kırpılmış olarak verir."""
    im = Image.open(LOGO).convert("RGBA")
    im = im.crop(im.split()[3].getbbox())
    o = boy / max(im.size)
    return im.resize((max(1, round(im.width * o)), max(1, round(im.height * o))), Image.LANCZOS)


def ortala(tuval: Image.Image, mark: Image.Image) -> Image.Image:
    tuval.alpha_composite(mark, ((tuval.width - mark.width) // 2, (tuval.height - mark.height) // 2))
    return tuval


def karo(boy: int, oran: float, yuvarlak: bool = False) -> Image.Image:
    """Açık zeminli ikon karosu; `yuvarlak` ise köşeleri squircle'a kırpar."""
    im = ortala(Image.new("RGBA", (boy, boy), ACIK_ZEMIN), isaret(round(boy * oran)))
    if yuvarlak:
        maske = Image.new("L", (boy * 4, boy * 4), 0)
        ImageDraw.Draw(maske).rounded_rectangle([0, 0, boy * 4 - 1, boy * 4 - 1], radius=boy * 4 * 0.28, fill=255)
        im.putalpha(maske.resize((boy, boy), Image.LANCZOS))
    return im


def uret() -> None:
    CIKTI.mkdir(parents=True, exist_ok=True)

    # Kare ikon maskelenmiyor, işaret rahat durabilir.
    karo(1024, 0.62).save(CIKTI / "icon.png")

    # Adaptive ön katman kare ikonla AYNI oranda. Burada ayrıca küçültmek
    # cazip görünüyor (maske kenarları kesiyor) ama YANLIŞ: @capacitor/assets
    # bu görseli 108dp'lik tuvale yerleştirirken zaten %16,7 iç boşluk
    # uyguluyor, yani güvenli alana indirmeyi kendisi yapıyor. Bir de burada
    # küçültmek çarpışıyor ve işaret cılız kalıyor.
    ortala(Image.new("RGBA", (1024, 1024), (0, 0, 0, 0)), isaret(round(1024 * 0.62))).save(
        CIKTI / "icon-foreground.png"
    )
    Image.new("RGBA", (1024, 1024), ACIK_ZEMIN).save(CIKTI / "icon-background.png")

    # Açılış ekranı: logoyu koyu zemine DÜZ koymak, tam da ikonda kaçındığımız
    # düşük kontrastı üretiyor. Onun yerine ikonun kendisi (açık zeminli karo)
    # koyu zeminin üstünde duruyor — ne renk bozuluyor ne de açıktan koyuya
    # geçerken beyaz çakma oluyor.
    sp = Image.new("RGBA", (2732, 2732), KOYU_ZEMIN)
    ortala(sp, karo(round(2732 * 0.30), 0.62, yuvarlak=True)).save(CIKTI / "splash.png")

    print(f"ikonlar üretildi -> {CIKTI}")


# @capacitor/assets'in ÜRETTİĞİ xml'i düzeltir; onun çalışmasından SONRA koşar.
ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground>
        <inset android:drawable="@mipmap/ic_launcher_foreground" android:inset="16.7%" />
    </foreground>
</adaptive-icon>
"""

ARKA_RENK_XML = """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#F7F8FA</color>
</resources>
"""


def android_duzelt() -> None:
    """
    @capacitor/assets arka katmana da %16,7 iç boşluk veriyor
    (`<inset drawable="@mipmap/ic_launcher_background" inset="16.7%">`).
    Sonuç: zemin tuvalin tamamını kaplamıyor, simgenin çevresinde BOŞ bir
    çerçeve kalıyor ve cihazda siyah bir halka gibi görünüyor.

    Arka katmanın iç boşluğu olmaz — 108dp'lik tuvalin tamamını doldurmalı,
    maskeden taşan kısmı zaten kırpılıyor. Ön katmandaki iç boşluk DOĞRU ve
    korunuyor (işaretin maskeye girmesini o sağlıyor).

    Zemin düz renk olduğu için görsel yerine renk kaynağı veriliyor; hem
    dosya boyutu düşüyor hem de her yoğunlukta tam olarak aynı renk çıkıyor.
    """
    res = KOK / "apps/mobile/android/app/src/main/res"
    for ad in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (res / "mipmap-anydpi-v26" / ad).write_text(ADAPTIVE_XML, encoding="utf-8")
    (res / "values" / "ic_launcher_background.xml").write_text(ARKA_RENK_XML, encoding="utf-8")
    # Artık kullanılmayan arka plan görselleri yer kaplamasın.
    for png in res.glob("mipmap-*/ic_launcher_background.png"):
        png.unlink()
    print("adaptive ikon xml'i düzeltildi (arka katmanın iç boşluğu kaldırıldı)")


if __name__ == "__main__":
    import sys

    if "--android-duzelt" in sys.argv:
        android_duzelt()
    else:
        uret()
