// Modül eşyaları: odada bir Projelio modülünü temsil eden nesneler
// (eşleştirme lib/ofisOyunu.ts MODUL_ESYALARI'nda).
//
// Her eşya ~0,9 × 0,7 m'lik bir ize sığar ve önü +z'ye bakar; motor onu
// duvarın önüne, yüzü odaya dönük koyar. Panoların yüzleri kodla çizilen
// dokulardır — kanban sütunları, mantar panodaki kartvizitler, huni grafiği —
// böylece eşya hangi modülü temsil ettiğini bir bakışta anlatır.

import * as THREE from "three";
import type { IstasyonBilgisi, ModulEsyasi, Plaket } from "../../lib/ofisOyunu";
import { RAF_KAPASITESI } from "../../lib/ofisOyunu";
import { findCoverPreset, isCoverPreset, presetForSeed } from "../../lib/covers";
import { esyaModeli, kutu, malzeme } from "./modeller";
import { varlik } from "./varliklar";

const YAZI = "'Bricolage Grotesque', system-ui, sans-serif";

function yerlestir<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

function silindir(r1: number, r2: number, h: number, m: THREE.Material, p = 16): THREE.Mesh {
  const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, p), m);
  s.castShadow = true;
  s.receiveShadow = true;
  return s;
}

/** Kodla çizilen yüz dokusu (en/boy oranı korunur). */
function doku(gen: number, yuk: number, ciz: (x: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = gen;
  c.height = yuk;
  const x = c.getContext("2d")!;
  ciz(x, gen, yuk);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function yuvarlak(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number, renk: string): void {
  x.fillStyle = renk;
  x.beginPath();
  x.roundRect(a, b, w, h, r);
  x.fill();
}

/** Yüzü dokulu, kalınlığı olan bir levha (ön yüz +z). */
function levha(w: number, h: number, kalin: number, yuz: THREE.Texture, kenar = "#F4F5F7"): THREE.Mesh {
  const k = malzeme(kenar, { parlak: 0.4 });
  const on = new THREE.MeshStandardMaterial({ map: yuz, roughness: 0.6 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, kalin), [k, k, k, k, on, k]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Tekerlekli seyyar pano: iki ayak, alt kızak, üstte yüzü dokulu levha. */
function seyyarPano(yuz: THREE.Texture, w = 0.86, h = 0.62): THREE.Group {
  const g = new THREE.Group();
  const metal = malzeme("#B9BEC7", { metal: 0.6, parlak: 0.5 });
  for (const x of [-w / 2 + 0.03, w / 2 - 0.03]) {
    g.add(yerlestir(kutu(0.035, 1.6, 0.035, metal, 0.01), x, 0.82, 0));
    g.add(yerlestir(kutu(0.05, 0.03, 0.48, metal, 0.01), x, 0.05, 0));
    for (const z of [-0.2, 0.2]) g.add(yerlestir(silindir(0.025, 0.025, 0.03, malzeme("#2B2F38"), 10), x, 0.02, z));
  }
  const l = levha(w, h, 0.03, yuz);
  l.position.set(0, 1.22, 0.02);
  g.add(l);
  // Alt kalem rafı
  g.add(yerlestir(kutu(w * 0.8, 0.025, 0.07, metal, 0.008), 0, 0.88, 0.06));
  return g;
}

// ------------------------------------------------------------------ pano yüzleri

function kanbanYuzu(): THREE.Texture {
  return doku(512, 370, (x, w, h) => {
    yuvarlak(x, 0, 0, w, h, 8, "#FBFBFC");
    const sutun = ["Potansiyel", "Teklif", "Görüşme", "Kazanıldı"];
    const renk = ["#E0B077", "#8C9BE8", "#D29A58", "#5FBE94"];
    const sw = (w - 50) / 4;
    sutun.forEach((ad, i) => {
      const sx = 10 + i * (sw + 10);
      yuvarlak(x, sx, 12, sw, h - 24, 8, "#EEF0F3");
      x.fillStyle = "#3E4858";
      x.font = `600 22px ${YAZI}`;
      x.fillText(ad, sx + 10, 44);
      const kart = 4 - i + (i === 3 ? 1 : 0);
      for (let k = 0; k < kart; k++) {
        yuvarlak(x, sx + 8, 60 + k * 62, sw - 16, 50, 6, renk[i]);
        x.fillStyle = "rgba(255,255,255,0.75)";
        x.fillRect(sx + 18, 74 + k * 62, sw - 50, 6);
        x.fillRect(sx + 18, 88 + k * 62, sw - 70, 6);
      }
    });
  });
}

function mantarYuzu(): THREE.Texture {
  return doku(512, 370, (x, w, h) => {
    x.fillStyle = "#C79A66";
    x.fillRect(0, 0, w, h);
    // Mantar dokusu: küçük koyu benekler.
    for (let i = 0; i < 900; i++) {
      x.fillStyle = `rgba(${90 + ((i * 37) % 40)},${60 + ((i * 17) % 30)},30,0.25)`;
      x.fillRect((i * 97) % w, (i * 53) % h, 2 + (i % 3), 2);
    }
    const pin = ["#C13434", "#3E4858", "#2F7A5B", "#C0813F", "#4A5FC1", "#9C3F52"];
    for (let i = 0; i < 6; i++) {
      const cx = 40 + (i % 3) * 155 + (i % 2) * 10;
      const cy = 50 + Math.floor(i / 3) * 160;
      x.save();
      x.translate(cx + 60, cy + 40);
      x.rotate(((i * 7) % 5) * 0.03 - 0.06);
      yuvarlak(x, -62, -40, 124, 80, 4, "#FFFFFF");
      x.fillStyle = "#3E4858";
      x.fillRect(-48, -22, 60, 8);
      x.fillStyle = "#9AA2B0";
      x.fillRect(-48, -4, 84, 5);
      x.fillRect(-48, 8, 70, 5);
      x.fillStyle = pin[i];
      x.beginPath();
      x.arc(0, -34, 8, 0, Math.PI * 2);
      x.fill();
      x.restore();
    }
  });
}

function personaYuzu(): THREE.Texture {
  return doku(512, 370, (x, w, h) => {
    yuvarlak(x, 0, 0, w, h, 8, "#FBFBFC");
    x.fillStyle = "#3E4858";
    x.font = `600 24px ${YAZI}`;
    x.fillText("Hedef kitle", 20, 40);
    const ten = ["#F2CBA9", "#D9A27A", "#B47B57"];
    const zemin = ["#F7ECDD", "#E9EDF3", "#E3F2EA"];
    for (let i = 0; i < 3; i++) {
      const sx = 18 + i * 162;
      yuvarlak(x, sx, 62, 150, 288, 10, zemin[i]);
      x.fillStyle = ten[i];
      x.beginPath();
      x.arc(sx + 75, 120, 32, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = "#3E4858";
      x.beginPath();
      x.arc(sx + 75, 200, 46, Math.PI, 0);
      x.fill();
      x.fillStyle = "#66707F";
      for (let s = 0; s < 4; s++) x.fillRect(sx + 18, 228 + s * 26, 114 - s * 16, 8);
    }
  });
}

function huniYuzu(): THREE.Texture {
  return doku(512, 370, (x, w, h) => {
    yuvarlak(x, 0, 0, w, h, 8, "#FBFBFC");
    const katman = [
      ["Ziyaret", "#E0B077", 420],
      ["Kayıt", "#D29A58", 320],
      ["Deneme", "#C0813F", 220],
      ["Müşteri", "#8C5A28", 130],
    ] as const;
    katman.forEach(([ad, renk, gen], i) => {
      const y = 28 + i * 82;
      x.fillStyle = renk;
      x.beginPath();
      const alt = katman[i + 1]?.[2] ?? gen - 60;
      x.moveTo(w / 2 - gen / 2, y);
      x.lineTo(w / 2 + gen / 2, y);
      x.lineTo(w / 2 + alt / 2, y + 72);
      x.lineTo(w / 2 - alt / 2, y + 72);
      x.closePath();
      x.fill();
      x.fillStyle = "#FFFFFF";
      x.font = `600 22px ${YAZI}`;
      x.textAlign = "center";
      x.fillText(ad, w / 2, y + 44);
      x.textAlign = "left";
    });
  });
}

function markaYuzu(): THREE.Texture {
  const t = doku(370, 512, (x, w, h) => {
    yuvarlak(x, 0, 0, w, h, 6, "#1C222C");
  });
  const c = t.image as HTMLCanvasElement;
  const x = c.getContext("2d")!;
  const ciz = (logo?: HTMLImageElement) => {
    const w = c.width;
    const h = c.height;
    yuvarlak(x, 0, 0, w, h, 6, "#1C222C");
    yuvarlak(x, w / 2 - 70, 90, 140, 140, 26, "#FFFFFF");
    if (logo) x.drawImage(logo, w / 2 - 50, 110, 100, 100);
    x.fillStyle = "#D9A868";
    x.font = `600 56px ${YAZI}`;
    x.textAlign = "center";
    x.fillText("Projelio", w / 2, 300);
    x.fillStyle = "#9AA2B0";
    x.font = `400 22px ${YAZI}`;
    x.fillText("Marka kimliği", w / 2, 336);
    ["#3E4858", "#C0813F", "#F7F8FA", "#8C5A28"].forEach((r, i) => yuvarlak(x, 60 + i * 66, 392, 52, 52, 12, r));
    x.textAlign = "left";
    t.needsUpdate = true;
  };
  ciz();
  const logo = new Image();
  logo.onload = () => ciz(logo);
  logo.src = "/logo.png";
  return t;
}

function reklamYuzu(): THREE.Texture {
  return doku(370, 512, (x, w, h) => {
    yuvarlak(x, 0, 0, w, h, 6, "#C0813F");
    x.fillStyle = "#FFFFFF";
    x.font = `700 46px ${YAZI}`;
    x.textAlign = "center";
    x.fillText("YENİ", w / 2, 120);
    x.font = `700 120px ${YAZI}`;
    x.fillText("%20", w / 2, 260);
    x.font = `600 34px ${YAZI}`;
    x.fillText("kampanya", w / 2, 320);
    yuvarlak(x, w / 2 - 110, 380, 220, 64, 32, "#1C222C");
    x.fillStyle = "#FFFFFF";
    x.font = `600 28px ${YAZI}`;
    x.fillText("Hemen dene", w / 2, 422);
    x.textAlign = "left";
  });
}

function panelYuzu(): THREE.Texture {
  return doku(512, 300, (x, w, h) => {
    x.fillStyle = "#12151B";
    x.fillRect(0, 0, w, h);
    // KPI kutuları
    const kpi = [
      ["Ziyaret", "12,4B", "#5FBE94"],
      ["Tıklama", "%3,8", "#D9A868"],
      ["Dönüşüm", "412", "#8C9BE8"],
    ] as const;
    kpi.forEach(([ad, deger, renk], i) => {
      yuvarlak(x, 16 + i * 166, 16, 152, 80, 10, "#1B2028");
      x.fillStyle = "#9AA2B0";
      x.font = `400 18px ${YAZI}`;
      x.fillText(ad, 30 + i * 166, 44);
      x.fillStyle = renk;
      x.font = `600 30px ${YAZI}`;
      x.fillText(deger, 30 + i * 166, 82);
    });
    // Çizgi grafik
    yuvarlak(x, 16, 110, w - 32, h - 126, 10, "#1B2028");
    x.strokeStyle = "#D9A868";
    x.lineWidth = 5;
    x.beginPath();
    const n = [0.3, 0.42, 0.38, 0.55, 0.5, 0.66, 0.72, 0.68, 0.84];
    n.forEach((v, i) => {
      const px = 36 + (i * (w - 72)) / (n.length - 1);
      const py = h - 30 - v * (h - 160);
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    });
    x.stroke();
  });
}

function dartYuzu(): THREE.Texture {
  return doku(512, 512, (x, w) => {
    const c = w / 2;
    x.fillStyle = "#1C222C";
    x.beginPath();
    x.arc(c, c, c, 0, Math.PI * 2);
    x.fill();
    for (let i = 0; i < 20; i++) {
      x.fillStyle = i % 2 ? "#F4EAD9" : "#1C222C";
      x.beginPath();
      x.moveTo(c, c);
      x.arc(c, c, c * 0.86, (i / 20) * Math.PI * 2, ((i + 1) / 20) * Math.PI * 2);
      x.fill();
    }
    for (const [r, renk] of [
      [0.86, "#2F7A5B"],
      [0.8, null],
      [0.55, "#C13434"],
      [0.49, null],
    ] as const) {
      if (!renk) continue;
      x.strokeStyle = renk;
      x.lineWidth = c * 0.06;
      x.beginPath();
      x.arc(c, c, c * (r - 0.03), 0, Math.PI * 2);
      x.stroke();
    }
    x.fillStyle = "#2F7A5B";
    x.beginPath();
    x.arc(c, c, c * 0.1, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = "#C13434";
    x.beginPath();
    x.arc(c, c, c * 0.05, 0, Math.PI * 2);
    x.fill();
  });
}

function dunyaYuzu(): THREE.Texture {
  return doku(512, 256, (x, w, h) => {
    x.fillStyle = "#5C8FC7";
    x.fillRect(0, 0, w, h);
    x.fillStyle = "#6FAE73";
    // Kabaca kıtalar: birkaç yamuk leke.
    const leke = [
      [70, 70, 90, 55],
      [120, 150, 45, 70],
      [250, 60, 70, 45],
      [260, 120, 50, 70],
      [330, 70, 110, 50],
      [400, 160, 50, 30],
      [230, 220, 120, 18],
    ];
    for (const [a, b, c, d] of leke) {
      x.beginPath();
      x.ellipse(a, b, c / 2, d / 2, 0.3, 0, Math.PI * 2);
      x.fill();
    }
    // Bayi noktaları
    x.fillStyle = "#D9A868";
    for (const [a, b] of [
      [80, 70],
      [270, 70],
      [300, 130],
      [360, 80],
      [130, 160],
    ])
      x.beginPath(), x.arc(a, b, 6, 0, Math.PI * 2), x.fill();
  });
}

// ------------------------------------------------------------------ eşyalar

function dosyaDolabi(): THREE.Group {
  const g = new THREE.Group();
  const govde = malzeme("#8A93A3", { metal: 0.35, parlak: 0.45 });
  const kulp = malzeme("#D9DDE3", { metal: 0.7, parlak: 0.6 });
  for (const x of [-0.22, 0.22]) {
    g.add(yerlestir(kutu(0.42, 1.25, 0.6, govde, 0.02), x, 0.625, 0));
    for (let i = 0; i < 4; i++) {
      const y = 0.17 + i * 0.3;
      g.add(yerlestir(kutu(0.38, 0.26, 0.012, malzeme("#9AA3B2", { metal: 0.3, parlak: 0.4 }), 0.01), x, y, 0.305));
      g.add(yerlestir(kutu(0.14, 0.025, 0.03, kulp, 0.008), x, y + 0.04, 0.32));
      g.add(yerlestir(kutu(0.1, 0.05, 0.005, malzeme("#F7F8FA"), 0.003), x, y - 0.05, 0.313));
    }
  }
  // Üstte dosya klasörleri
  ["#C0813F", "#3E4858", "#2F7A5B"].forEach((r, i) => g.add(yerlestir(kutu(0.05, 0.28, 0.24, malzeme(r), 0.01), -0.3 + i * 0.07, 1.39, -0.05)));
  return g;
}

function kure(): THREE.Group {
  const g = new THREE.Group();
  const masa = varlik("yanMasa");
  g.add(masa);
  const ayak = malzeme("#8C5A28", { metal: 0.4, parlak: 0.5 });
  g.add(yerlestir(silindir(0.09, 0.11, 0.03, ayak), 0, 0.68, 0));
  g.add(yerlestir(silindir(0.015, 0.015, 0.18, ayak), 0, 0.78, 0));
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 20), new THREE.MeshStandardMaterial({ map: dunyaYuzu(), roughness: 0.45 }));
  top.position.set(0, 0.98, 0);
  top.rotation.z = 0.41;
  top.castShadow = true;
  g.add(top);
  const halka = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.008, 8, 40, Math.PI * 1.2), ayak);
  halka.position.set(0, 0.98, 0);
  halka.rotation.set(0, Math.PI / 2, 0.41 - Math.PI / 2);
  g.add(halka);
  g.userData.guncelle = (t: number) => {
    top.rotation.y = t * 0.25;
  };
  return g;
}

function buyukEkran(): THREE.Group {
  const g = new THREE.Group();
  const metal = malzeme("#3B4048", { metal: 0.5, parlak: 0.5 });
  g.add(yerlestir(kutu(0.7, 0.04, 0.45, metal, 0.02), 0, 0.02, 0));
  g.add(yerlestir(kutu(0.07, 1.15, 0.07, metal, 0.02), 0, 0.6, -0.05));
  g.add(yerlestir(kutu(0.9, 0.56, 0.05, malzeme("#16181D", { parlak: 0.7 }), 0.02), 0, 1.3, 0));
  const ekran = levha(0.85, 0.5, 0.005, panelYuzu(), "#16181D");
  (ekran.material as THREE.MeshStandardMaterial[])[4].emissive = new THREE.Color("#ffffff");
  (ekran.material as THREE.MeshStandardMaterial[])[4].emissiveMap = (ekran.material as THREE.MeshStandardMaterial[])[4].map;
  (ekran.material as THREE.MeshStandardMaterial[])[4].emissiveIntensity = 0.55;
  ekran.position.set(0, 1.3, 0.028);
  ekran.castShadow = false;
  g.add(ekran);
  return g;
}

function dizustu(): THREE.Group {
  const g = new THREE.Group();
  g.add(varlik("yanMasa"));
  const l = varlik("laptop");
  l.position.set(-0.05, 0.66, 0.02);
  g.add(l);
  const b = varlik("bitkiKucuk1");
  b.position.set(0.32, 0.66, -0.05);
  g.add(b);
  return g;
}

function halkaIsik(): THREE.Group {
  const g = new THREE.Group();
  const siyah = malzeme("#22252B", { metal: 0.4, parlak: 0.5 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const ayak = kutu(0.025, 0.85, 0.025, siyah, 0.008);
    ayak.position.set(Math.sin(a) * 0.16, 0.4, Math.cos(a) * 0.16);
    // Ayaklar yukarıda ortadaki direkte birleşir, aşağıda açılır (işaret ters
    // olunca tepe dışa, ayak içe açılıyordu).
    ayak.rotation.set(-Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38);
    g.add(ayak);
  }
  g.add(yerlestir(kutu(0.03, 0.9, 0.03, siyah, 0.01), 0, 1.15, 0));
  const isik = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.03, 12, 48),
    new THREE.MeshStandardMaterial({ color: "#FFF6E8", emissive: "#FFF1DA", emissiveIntensity: 1.4, roughness: 0.4 })
  );
  isik.position.set(0, 1.62, 0);
  g.add(isik);
  // Ortada telefon
  g.add(yerlestir(kutu(0.08, 0.15, 0.012, malzeme("#1C1E24", { parlak: 0.7 }), 0.01), 0, 1.62, 0.01));
  g.add(yerlestir(kutu(0.07, 0.13, 0.002, malzeme("#E1306C", { isik: "#C13584" }), 0.004), 0, 1.62, 0.018));
  return g;
}

function mektupKutusu(): THREE.Group {
  const g = new THREE.Group();
  g.add(varlik("yanMasa"));
  const tepsi = malzeme("#3E4858", { metal: 0.3, parlak: 0.5 });
  for (let k = 0; k < 2; k++) {
    const y = 0.68 + k * 0.1;
    g.add(yerlestir(kutu(0.36, 0.015, 0.26, tepsi, 0.005), -0.1, y, 0));
    for (const x of [-0.28, 0.08]) g.add(yerlestir(kutu(0.012, 0.06, 0.26, tepsi, 0.004), x, y + 0.03, 0));
    for (let i = 0; i < 3; i++) {
      const zarf = kutu(0.3, 0.008, 0.2, malzeme(i === 1 ? "#F7ECDD" : "#FFFFFF"), 0.003);
      zarf.position.set(-0.1 + (i - 1) * 0.01, y + 0.015 + i * 0.01, (i - 1) * 0.01);
      zarf.rotation.y = (i - 1) * 0.08;
      g.add(zarf);
    }
  }
  // @ işareti olan küçük levha
  const at = doku(128, 128, (x, w) => {
    yuvarlak(x, 0, 0, w, w, 24, "#C0813F");
    x.fillStyle = "#FFFFFF";
    x.font = `700 92px ${YAZI}`;
    x.textAlign = "center";
    x.fillText("@", w / 2, 96);
  });
  const l = levha(0.16, 0.16, 0.02, at, "#C0813F");
  l.position.set(0.28, 0.76, 0);
  l.rotation.y = -0.25;
  g.add(l);
  return g;
}

function urunKutulari(): THREE.Group {
  const g = new THREE.Group();
  const karton = malzeme("#C9A27A");
  const etiket = doku(256, 128, (x, w, h) => {
    yuvarlak(x, 0, 0, w, h, 6, "#C9A27A");
    yuvarlak(x, 20, 24, w - 40, h - 48, 10, "#FFFFFF");
    x.fillStyle = "#3E4858";
    x.font = `600 34px ${YAZI}`;
    x.textAlign = "center";
    x.fillText("ÜRÜN", w / 2, h / 2 + 12);
  });
  const kutuEkle = (w: number, h: number, d: number, x: number, y: number, z: number, don = 0) => {
    const k = levha(w, h, d, etiket, "#C9A27A");
    k.position.set(x, y + h / 2, z);
    k.rotation.y = don;
    g.add(k);
    // Bant
    g.add(yerlestir(kutu(0.06, 0.004, d + 0.002, malzeme("#B08A60"), 0.001), x, y + h + 0.002, z));
  };
  kutuEkle(0.42, 0.34, 0.38, -0.2, 0, 0, 0.05);
  kutuEkle(0.36, 0.3, 0.34, 0.22, 0, 0.04, -0.1);
  kutuEkle(0.32, 0.26, 0.3, -0.16, 0.34, 0.02, -0.12);
  g.add(yerlestir(kutu(0.2, 0.18, 0.2, karton, 0.01), 0.2, 0.39, 0.02));
  return g;
}

/** A tipi kaldırım panosu (reklam). */
function reklamPanosu(): THREE.Group {
  const g = new THREE.Group();
  const yuz = reklamYuzu();
  for (const yon of [1, -1]) {
    const l = levha(0.62, 0.95, 0.03, yuz, "#1C222C");
    l.position.set(0, 0.5, yon * 0.16);
    l.rotation.x = yon * -0.18;
    if (yon < 0) l.rotation.y = Math.PI;
    g.add(l);
  }
  return g;
}

/** Ayaklı poster çerçevesi (marka). */
function posterStandi(yuz: THREE.Texture): THREE.Group {
  const g = new THREE.Group();
  const metal = malzeme("#2B2F38", { metal: 0.5, parlak: 0.5 });
  g.add(yerlestir(kutu(0.5, 0.03, 0.4, metal, 0.01), 0, 0.015, 0));
  g.add(yerlestir(kutu(0.04, 0.7, 0.04, metal, 0.01), 0, 0.37, -0.02));
  const l = levha(0.6, 0.84, 0.03, yuz, "#2B2F38");
  l.position.set(0, 1.12, 0);
  l.rotation.x = -0.04;
  g.add(l);
  return g;
}

/** Ayaklı dart tahtası (büyüme hedefleri). */
function dartTahtasi(): THREE.Group {
  const g = new THREE.Group();
  const ahsap = malzeme("#6E4630");
  g.add(yerlestir(kutu(0.5, 0.03, 0.4, ahsap, 0.01), 0, 0.015, 0));
  g.add(yerlestir(kutu(0.06, 1.2, 0.04, ahsap, 0.01), 0, 0.6, -0.04));
  const tahta = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 48), [
    malzeme("#1C222C"),
    new THREE.MeshStandardMaterial({ map: dartYuzu(), roughness: 0.7 }),
    malzeme("#1C222C"),
  ]);
  tahta.rotation.x = Math.PI / 2;
  tahta.position.set(0, 1.3, 0);
  tahta.castShadow = true;
  g.add(tahta);
  // Saplanmış iki dart
  for (const [x, y] of [
    [0.05, 1.33],
    [-0.08, 1.24],
  ]) {
    const d = silindir(0.006, 0.006, 0.12, malzeme("#C0813F"), 6);
    d.rotation.x = Math.PI / 2;
    d.position.set(x, y, 0.08);
    g.add(d);
  }
  return g;
}

/** Para kasası (Yönetim odası → şirketin Kasa sayfası): çelik gövde, kadranlı kapı, üstünde altınlar. */
function kasa(): THREE.Group {
  const g = new THREE.Group();
  const celik = malzeme("#3E4858", { metal: 0.5, parlak: 0.45 });
  const kapi = malzeme("#4A5568", { metal: 0.55, parlak: 0.5 });
  const altin = malzeme("#C0813F", { metal: 0.7, parlak: 0.6 });
  // Ayaklar ve gövde
  for (const [x, z] of [
    [-0.28, -0.22],
    [0.28, -0.22],
    [-0.28, 0.22],
    [0.28, 0.22],
  ])
    g.add(yerlestir(kutu(0.07, 0.06, 0.07, celik, 0.01), x, 0.03, z));
  g.add(yerlestir(kutu(0.7, 0.8, 0.56, celik, 0.035), 0, 0.46, 0));
  // Kapı: gövdeden hafif taşan levha, kenarında iki menteşe
  g.add(yerlestir(kutu(0.58, 0.68, 0.03, kapi, 0.02), 0, 0.46, 0.29));
  for (const y of [0.3, 0.62]) g.add(yerlestir(kutu(0.03, 0.1, 0.04, altin, 0.008), -0.3, y, 0.29));
  // Şifre kadranı ve çevirme kolu
  const kadran = silindir(0.085, 0.085, 0.035, altin, 32);
  kadran.rotation.x = Math.PI / 2;
  kadran.position.set(0.05, 0.52, 0.32);
  g.add(kadran);
  const ic = silindir(0.05, 0.05, 0.04, malzeme("#1C222C", { parlak: 0.5 }), 24);
  ic.rotation.x = Math.PI / 2;
  ic.position.set(0.05, 0.52, 0.33);
  g.add(ic);
  for (let i = 0; i < 3; i++) {
    const kol = kutu(0.022, 0.2, 0.022, altin, 0.008);
    kol.position.set(0.05, 0.34, 0.33);
    kol.rotation.z = (i * Math.PI) / 3;
    g.add(kol);
  }
  // Üstte istif altınlar
  [
    [-0.15, 0.02, 3],
    [0.08, -0.05, 2],
  ].forEach(([x, z, adet]) => {
    for (let i = 0; i < adet; i++) g.add(yerlestir(silindir(0.06, 0.06, 0.02, altin, 20), x + i * 0.004, 0.87 + i * 0.022, z));
  });
  return g;
}

// ------------------------------------------------------------------ stüdyo

const DURUM_RENGI = { gecikti: "#D9534F", yaklasti: "#E3A23B", yolunda: "#4CAF7A" };

function istasyonDurumu(b: IstasyonBilgisi): keyof typeof DURUM_RENGI {
  return b.gecikti ? "gecikti" : b.yaklasti ? "yaklasti" : "yolunda";
}

/** Kısa Türkçe tarih: "12 Kas". */
function kisaTarih(gun: string): string {
  const [y, a, g] = gun.slice(0, 10).split("-").map(Number);
  return new Date(y, a - 1, g).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/** Satırı genişliğe sığdırır (en çok `satir` satır, taşan sonda "…"). */
function sar(x: CanvasRenderingContext2D, metin: string, gen: number, satir: number): string[] {
  const sonuc: string[] = [];
  let sira = "";
  for (const k of metin.split(/\s+/)) {
    const aday = sira ? `${sira} ${k}` : k;
    if (x.measureText(aday).width <= gen || !sira) sira = aday;
    else {
      sonuc.push(sira);
      sira = k;
    }
  }
  if (sira) sonuc.push(sira);
  if (sonuc.length > satir) {
    const kalan = sonuc.slice(0, satir);
    let son = kalan[satir - 1];
    while (son.length > 1 && x.measureText(`${son}…`).width > gen) son = son.slice(0, -1);
    kalan[satir - 1] = `${son}…`;
    return kalan;
  }
  return sonuc.map((l) => {
    let t = l;
    while (t.length > 1 && x.measureText(t).width > gen) t = t.slice(0, -1);
    return t === l ? l : `${t}…`;
  });
}

function istasyonYuzu(ad: string, b: IstasyonBilgisi): THREE.Texture {
  return doku(512, 370, (x, w, h) => {
    const durum = istasyonDurumu(b);
    yuvarlak(x, 0, 0, w, h, 10, "#FBFBFC");
    // Üst şerit: projenin durumu.
    x.fillStyle = DURUM_RENGI[durum];
    x.fillRect(0, 0, w, 14);
    x.fillStyle = "#3E4858";
    x.font = `700 38px ${YAZI}`;
    sar(x, ad, w - 48, 2).forEach((l, i) => x.fillText(l, 24, 70 + i * 44));
    // İlerleme çubuğu
    const oran = b.toplam ? b.biten / b.toplam : 0;
    yuvarlak(x, 24, 186, w - 48, 30, 15, "#E8EAEE");
    if (oran > 0) yuvarlak(x, 24, 186, Math.max(30, (w - 48) * oran), 30, 15, oran >= 1 ? DURUM_RENGI.yolunda : "#C0813F");
    x.font = `600 28px ${YAZI}`;
    x.fillStyle = "#5B6577";
    x.fillText(b.toplam ? `${b.biten}/${b.toplam} görev · %${Math.round(oran * 100)}` : "Henüz görev yok", 24, 262);
    if (b.teslim) {
      x.font = `700 30px ${YAZI}`;
      x.fillStyle = durum === "yolunda" ? "#3E4858" : DURUM_RENGI[durum];
      x.fillText(`${b.gecikti ? "Gecikti" : "Teslim"} · ${kisaTarih(b.teslim)}`, 24, 326);
    }
  });
}

/** Proje istasyonu: seyyar pano (adı, ilerlemesi, teslimi) ve tepesinde durum ışığı. */
function projeIstasyonu(ad: string, b: IstasyonBilgisi): THREE.Group {
  const g = seyyarPano(istasyonYuzu(ad, b));
  const metal = malzeme("#B9BEC7", { metal: 0.6, parlak: 0.5 });
  g.add(yerlestir(silindir(0.012, 0.012, 0.12, metal, 8), 0, 1.6, 0.02));
  const renk = DURUM_RENGI[istasyonDurumu(b)];
  const isik = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 20, 14),
    new THREE.MeshStandardMaterial({ color: renk, emissive: renk, emissiveIntensity: 1.4, roughness: 0.3 })
  );
  isik.position.set(0, 1.7, 0.02);
  g.add(isik);
  return g;
}

/**
 * Kapağın tuvaldeki karşılığı. Hazır kapaklar CSS gradyanı olduğu için tuvale
 * doğrudan çizilemez: son (taban) linear-gradient'in iki rengi alınır — desenli
 * kapakların (dalga, ızgara) üst katmanları düşer, ana renk kalır.
 */
function kapakRenkleri(kapak: string | undefined, tohum: string): [string, string] {
  const preset = findCoverPreset(kapak) ?? (kapak && !isCoverPreset(kapak) ? undefined : presetForSeed(tohum));
  const arka = preset?.background ?? presetForSeed(tohum).background;
  const eslesmeler = [...arka.matchAll(/linear-gradient\(135deg,\s*(#[0-9A-Fa-f]{6})[^,]*,\s*(#[0-9A-Fa-f]{6})/g)];
  const son = eslesmeler[eslesmeler.length - 1];
  return son ? [son[1], son[2]] : ["#4A5567", "#1C222C"];
}

/** Plaketin önü: ahşap çerçeve, üstte projenin kapağı, altta pirinç ad levhası. */
function plaketYuzu(p: Plaket): THREE.CanvasTexture {
  let gorsel: HTMLImageElement | null = null;
  const ciz = (x: CanvasRenderingContext2D, w: number, h: number) => {
    const cerceve = x.createLinearGradient(0, 0, w, h);
    cerceve.addColorStop(0, "#5A3E2B");
    cerceve.addColorStop(1, "#2E1F15");
    x.fillStyle = cerceve;
    x.fillRect(0, 0, w, h);
    // Kapak alanı
    const k = { x: 26, y: 26, w: w - 52, h: Math.round(h * 0.6) };
    const [r1, r2] = kapakRenkleri(p.kapak, p.projeId);
    const grad = x.createLinearGradient(k.x, k.y, k.x + k.w, k.y + k.h);
    grad.addColorStop(0, r1);
    grad.addColorStop(1, r2);
    x.fillStyle = grad;
    x.fillRect(k.x, k.y, k.w, k.h);
    if (gorsel) {
      // "cover" kırpması: kapak alanını doldurur, taşan kenar kesilir.
      const o = Math.max(k.w / gorsel.naturalWidth, k.h / gorsel.naturalHeight);
      const gw = k.w / o;
      const gh = k.h / o;
      x.drawImage(gorsel, (gorsel.naturalWidth - gw) / 2, (gorsel.naturalHeight - gh) / 2, gw, gh, k.x, k.y, k.w, k.h);
    } else {
      // Fotoğrafsız kapakta projenin baş harfi: plaketler yalnızca renkle ayırt edilmesin.
      x.fillStyle = "rgba(255,255,255,0.82)";
      x.font = `700 ${Math.round(k.h * 0.5)}px ${YAZI}`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText((p.ad.trim()[0] ?? "P").toLocaleUpperCase("tr"), k.x + k.w / 2, k.y + k.h / 2);
      x.textAlign = "start";
      x.textBaseline = "alphabetic";
    }
    x.strokeStyle = "rgba(0,0,0,0.35)";
    x.lineWidth = 4;
    x.strokeRect(k.x, k.y, k.w, k.h);
    // Pirinç ad levhası
    const l = { x: 30, y: k.y + k.h + 24, w: w - 60, h: h - (k.y + k.h + 24) - 26 };
    const pirinc = x.createLinearGradient(0, l.y, 0, l.y + l.h);
    pirinc.addColorStop(0, "#E9C77B");
    pirinc.addColorStop(0.5, "#C99A45");
    pirinc.addColorStop(1, "#A57A30");
    x.fillStyle = pirinc;
    x.beginPath();
    x.roundRect(l.x, l.y, l.w, l.h, 8);
    x.fill();
    x.fillStyle = "#3A2A12";
    x.textAlign = "center";
    x.font = `700 36px ${YAZI}`;
    const satirlar = sar(x, p.ad, l.w - 24, 2);
    const ust = l.y + (p.tarih ? 56 : 70) - (satirlar.length - 1) * 20;
    satirlar.forEach((t, i) => x.fillText(t, w / 2, ust + i * 40));
    if (p.tarih) {
      x.font = `600 26px ${YAZI}`;
      x.fillStyle = "#5A4220";
      x.fillText(`${kisaTarih(p.tarih)} ${p.tarih.slice(0, 4)}`, w / 2, l.y + l.h - 22);
    }
    x.textAlign = "start";
  };
  const t = doku(380, 600, ciz);
  if (p.kapak && !isCoverPreset(p.kapak)) {
    // Fotoğraf sonradan gelir; WebGL dokusu için CORS izni gerekir. Gelmezse
    // (izin yok, bağlantı koptu) plaket kapağın rengiyle kalır.
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      gorsel = img;
      const c = t.image as HTMLCanvasElement;
      ciz(c.getContext("2d")!, c.width, c.height);
      t.needsUpdate = true;
    };
    img.src = p.kapak;
  }
  return t;
}

/** Plaket ölçüsü (m): raf başına dört tane sığar. */
const PLAKET = { w: 0.19, h: 0.3, kalin: 0.022 };
/** Plaketlerin dizildiği raflar: üstten aşağı (en yenisi göz hizasına yakın üstte). */
const PLAKET_RAFLARI = [0.84, 0.44, 0.04];

/**
 * Biten projelerin rafı: her biten proje kapağı ve adı yazılı bir plaket (en
 * çok RAF_KAPASITESI). Plaketin her parçası userData.plaket'te projenin
 * kimliğini taşır: motor, rafa yaklaşıldığında tıklananı projeye götürür.
 */
function kupaRafi(plaketler: Plaket[], adet: number): THREE.Group {
  const g = new THREE.Group();
  const ahsap = malzeme("#8A6446");
  // Gövde: iki yan, arka, üç raf.
  for (const x of [-0.42, 0.42]) g.add(yerlestir(kutu(0.04, 1.2, 0.34, ahsap, 0.01), x, 0.6, 0));
  g.add(yerlestir(kutu(0.88, 1.2, 0.02, ahsap, 0.005), 0, 0.6, -0.16));
  for (const y of [0.04, 0.44, 0.84, 1.2]) g.add(yerlestir(kutu(0.88, 0.035, 0.34, ahsap, 0.01), 0, y, 0));
  // Eski veride yalnızca sayı olabilir: kapaksız, adsız plaketler sayı kadar dizilir.
  const liste = (plaketler.length ? plaketler : Array.from({ length: adet }, (_, i) => ({ projeId: `bos-${i}`, ad: "" }))).slice(
    0,
    RAF_KAPASITESI
  );
  const kenar = malzeme("#3A2819", { parlak: 0.3 });
  liste.forEach((p, i) => {
    const sira = Math.floor(i / 4);
    const rafta = Math.min(4, liste.length - sira * 4);
    const x = ((i % 4) - (rafta - 1) / 2) * (PLAKET.w + 0.015);
    const y = PLAKET_RAFLARI[sira] + 0.0175;
    const on = new THREE.MeshStandardMaterial({ map: plaketYuzu(p), roughness: 0.55 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(PLAKET.w, PLAKET.h, PLAKET.kalin), [kenar, kenar, kenar, kenar, on, kenar]);
    m.castShadow = true;
    m.receiveShadow = true;
    // Arkaya yaslı: alt kenar rafın ortasında, üstü arka panele doğru yatık.
    const egim = 0.13;
    m.rotation.x = -egim;
    m.position.set(x, y + (PLAKET.h / 2) * Math.cos(egim), -0.06 - (PLAKET.h / 2) * Math.sin(egim));
    if (p.ad) m.userData.plaket = p.projeId;
    g.add(m);
  });
  return g;
}

export function modulEsyasi(tur: ModulEsyasi, ek: { ad?: string; bilgi?: IstasyonBilgisi } = {}): THREE.Group {
  switch (tur) {
    case "kanban":
      return seyyarPano(kanbanYuzu());
    case "mantarPano":
      return seyyarPano(mantarYuzu());
    case "personaPanosu":
      return seyyarPano(personaYuzu());
    case "huni":
      return seyyarPano(huniYuzu());
    case "dosyaDolabi":
      return dosyaDolabi();
    case "kure":
      return kure();
    case "kitaplik":
      return esyaModeli("kitaplik");
    case "markaPosteri":
      return posterStandi(markaYuzu());
    case "buyukEkran":
      return buyukEkran();
    case "dizustu":
      return dizustu();
    case "halkaIsik":
      return halkaIsik();
    case "mektupKutusu":
      return mektupKutusu();
    case "reklamPanosu":
      return reklamPanosu();
    case "urunKutulari":
      return urunKutulari();
    case "dartTahtasi":
      return dartTahtasi();
    case "kasa":
      return kasa();
    case "projeIstasyonu":
      return projeIstasyonu(ek.ad ?? "Proje", ek.bilgi ?? { biten: 0, toplam: 0 });
    case "kupaRafi":
      return kupaRafi(ek.bilgi?.plaketler ?? [], ek.bilgi?.kupa ?? 0);
  }
}
