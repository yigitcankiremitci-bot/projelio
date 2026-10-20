# İlçe sınırları (il başına bir dosya: <plaka>.json)

Müşteri haritasında bir ile çift tıklayınca açılan ilçe haritasının verisi
(`MusteriHaritasi.tsx`, `import.meta.glob` ile il başına ayrı parça olarak,
yalnızca açılan il yüklenir).

Biçim: `{ "plaka": 34, "ilceler": [{ "ad": "KADIKÖY", "d": "<SVG yolu>" }, …] }`.
Çizim alanı (viewBox) dosyada yok, tarayıcıda ölçülür (getBBox): bazı yollar
yay komutu içeriyor, metin üzerinde güvenle hesaplanamıyordu.

Kaynak: turkey-district-maps-3@1.2.3 (npm), yalnızca VERİ alındı — paketin
React bileşeni ve bağımlılığı projeye eklenmedi. Koordinatlar bir ondalığa
yuvarlandı (yay içeren yollar hariç). 81 il, 973 ilçe. Elle düzenlenmez.

Lisans (kaynağın kendi metni):

MIT License

Copyright (c) 2021 ritzykey

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
