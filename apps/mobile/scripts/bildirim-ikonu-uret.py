"""
Bildirim çubuğundaki KÜÇÜK ikonu (ic_stat_projelio) üretir.

NEDEN AYRI BİR İKON: Android 5'ten beri durum çubuğu ve bildirim başlığındaki
ikon yalnızca ALFA kanalıyla çizilir — renkler yok sayılır, her opak piksel
beyaza boyanır. Uygulama ikonu (arka planı dolu bir kare) oraya verilirse
bildirimde düz beyaz bir kare görünür. Kullanıcıların "bildirim tuhaf
görünüyor" dediği şeyin yarısı bu. Bu betik logonun ŞEKLİNİ beyaz-saydam
olarak çıkarır; renk (turuncu vurgu) manifestteki default_notification_color'dan
gelir.

Kaynak: assets/icon-foreground.png (beyaz zeminde renkli logo).
Çalıştır: python3 scripts/bildirim-ikonu-uret.py
"""
from pathlib import Path
from PIL import Image

KOK = Path(__file__).resolve().parent.parent
KAYNAK = KOK / "assets" / "icon-foreground.png"
RES = KOK / "android" / "app" / "src" / "main" / "res"

# Android'in bildirim ikonu ölçüleri: 24dp, kenarlarda ~1dp güvenli pay.
OLCULER = {"mdpi": 24, "hdpi": 36, "xhdpi": 48, "xxhdpi": 72, "xxxhdpi": 96}

img = Image.open(KAYNAK).convert("RGBA")
# Beyaz zemin → saydam; logo pikselleri → opak. Eşik yumuşak tutuluyor ki
# kenarlar tırtıklı olmasın: "beyazdan ne kadar uzak" = ne kadar opak.
maske = Image.new("L", img.size, 0)
px, mp = img.load(), maske.load()
for y in range(img.height):
    for x in range(img.width):
        r, g, b, a = px[x, y]
        uzaklik = 255 - min(r, g, b)
        mp[x, y] = min(255, int(uzaklik * 2.2)) * a // 255

kutu = maske.getbbox()
maske = maske.crop(kutu)

for ad, olcu in OLCULER.items():
    ic = round(olcu * 22 / 24)
    oran = min(ic / maske.width, ic / maske.height)
    kucuk = maske.resize((max(1, round(maske.width * oran)), max(1, round(maske.height * oran))), Image.LANCZOS)
    cikti = Image.new("RGBA", (olcu, olcu), (255, 255, 255, 0))
    beyaz = Image.new("RGBA", kucuk.size, (255, 255, 255, 255))
    cikti.paste(beyaz, ((olcu - kucuk.width) // 2, (olcu - kucuk.height) // 2), kucuk)
    klasor = RES / f"drawable-{ad}"
    klasor.mkdir(exist_ok=True)
    cikti.save(klasor / "ic_stat_projelio.png")
    print(klasor / "ic_stat_projelio.png")
