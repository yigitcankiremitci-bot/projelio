import type { OkunanKisi } from "./kartvizit-plani";

/**
 * vCard / MECARD → kartvizit kişisi — saf ayrıştırıcı.
 *
 * Üç kaynaktan geliyor: WhatsApp'ta paylaşılan kişi (telefonla QR okutup
 * "kişiyi paylaş"), QR kodun içindeki vCard/MECARD ve dijital kartvizit
 * sayfasının .vcf bağlantısı. Üçünde de veri ALAN ALAN gelir: fotoğraftan
 * okumanın aksine harf hatası olmaz — bu yüzden Lio'nun okumasının önüne geçer.
 *
 * Gerçek dünyadaki varyantlar: iPhone "item1.EMAIL" grup öneki, satır katlama
 * (devam satırı boşlukla başlar), eski Android'in QUOTED-PRINTABLE kodlaması,
 * "tel:" önekli numara, vCard 2.1'in TYPE'sız parametreleri (TEL;CELL:…).
 */

function qpCoz(metin: string): string {
  const baytlar: number[] = [];
  const temiz = metin.replace(/=\r?\n/g, "");
  for (let i = 0; i < temiz.length; i++) {
    if (temiz[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(temiz.slice(i + 1, i + 3))) {
      baytlar.push(parseInt(temiz.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      baytlar.push(...Buffer.from(temiz[i], "utf8"));
    }
  }
  return Buffer.from(baytlar).toString("utf8");
}

function kacisCoz(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

interface Satir {
  ad: string;
  parametreler: string[];
  deger: string;
}

function satirlar(blok: string): Satir[] {
  // Katlanmış satırları birleştir (RFC 6350 §3.2), QP'nin yumuşak satır sonunu da.
  const duz = blok.replace(/\r\n/g, "\n").replace(/=\n/g, "").replace(/\n[ \t]/g, "");
  const sonuc: Satir[] = [];
  for (const ham of duz.split("\n")) {
    const iki = ham.indexOf(":");
    if (iki <= 0) continue;
    const sol = ham.slice(0, iki);
    let deger = ham.slice(iki + 1);
    const [adGrup, ...parametreler] = sol.split(";");
    const ad = adGrup.replace(/^[^.]+\./, "").toUpperCase(); // "item1.EMAIL" → EMAIL
    const params = parametreler.map((p) => p.toUpperCase());
    if (params.some((p) => p.includes("QUOTED-PRINTABLE"))) deger = qpCoz(deger);
    sonuc.push({ ad, parametreler: params, deger });
  }
  return sonuc;
}

function sosyalMi(url: string): "linkedin" | "instagram" | null {
  if (/linkedin\.com\//i.test(url)) return "linkedin";
  if (/instagram\.com\//i.test(url)) return "instagram";
  return null;
}

function vcardKisisi(blok: string): OkunanKisi | null {
  const s = satirlar(blok);
  const ilk = (ad: string) => s.find((x) => x.ad === ad);
  const k: Partial<OkunanKisi> = {};

  const fn = ilk("FN") && kacisCoz(ilk("FN")!.deger);
  const n = ilk("N")?.deger.split(";").map(kacisCoz);
  const nAdi = n ? [n[3], n[1], n[2], n[0], n[4]].filter(Boolean).join(" ").trim() : "";
  const org = ilk("ORG") && kacisCoz(ilk("ORG")!.deger.split(";")[0]);
  const ad = fn || nAdi;
  if (ad) {
    k.displayName = ad;
    if (org) k.kurum = org;
  } else if (org) {
    // Kişi adı yok, yalnızca kurum: kurum kartı.
    k.displayName = org;
    k.partyType = "company";
  } else {
    return null;
  }

  const unvan = ilk("TITLE") ?? ilk("ROLE");
  if (unvan) k.unvan = kacisCoz(unvan.deger);

  const tel = s.filter((x) => x.ad === "TEL");
  const cep = tel.find((x) => x.parametreler.some((p) => /CELL|MOBILE/.test(p))) ?? tel[0];
  if (cep) k.phone = kacisCoz(cep.deger.replace(/^tel:/i, ""));

  const eposta = ilk("EMAIL");
  if (eposta) k.email = kacisCoz(eposta.deger.replace(/^mailto:/i, ""));

  for (const x of s.filter((x) => x.ad === "URL" || x.ad === "X-SOCIALPROFILE")) {
    const url = kacisCoz(x.deger);
    const tur = sosyalMi(url) ?? (x.parametreler.some((p) => p.includes("LINKEDIN")) ? "linkedin" : null);
    if (tur && !k[tur]) k[tur] = url;
    else if (!tur && x.ad === "URL" && !k.website) k.website = url;
  }

  const adr = ilk("ADR")?.deger.split(";").map(kacisCoz);
  if (adr) {
    // ;;sokak;şehir;bölge;posta kodu;ülke
    if (adr[2]) k.adres = adr[2];
    if (adr[3]) k.sehir = adr[3];
  }
  return k as OkunanKisi;
}

/**
 * MECARD (eski Japon telefon biçimi, birçok QR üreticisi hâlâ kullanıyor):
 * "MECARD:N:Yılmaz,Ayşe;TEL:…;EMAIL:…;URL:…;ORG:…;;"
 */
function mecardKisisi(metin: string): OkunanKisi | null {
  const govde = metin.replace(/^MECARD:/i, "");
  const alan = (ad: string) => {
    const m = new RegExp(`(?:^|;)${ad}:((?:\\\\;|[^;])*)`, "i").exec(govde);
    return m ? kacisCoz(m[1]) : undefined;
  };
  const n = alan("N");
  const ad = n ? n.split(",").map((p) => p.trim()).filter(Boolean).reverse().join(" ") : undefined;
  const org = alan("ORG");
  if (!ad && !org) return null;
  const k: OkunanKisi = ad ? { displayName: ad } : { displayName: org!, partyType: "company" };
  if (ad && org) k.kurum = org;
  const tel = alan("TEL");
  if (tel) k.phone = tel;
  const eposta = alan("EMAIL");
  if (eposta) k.email = eposta;
  const url = alan("URL");
  if (url) {
    const tur = sosyalMi(url);
    if (tur) k[tur] = url;
    else k.website = url;
  }
  const adr = alan("ADR");
  if (adr) k.adres = adr;
  const unvan = alan("TITLE");
  if (unvan) k.unvan = unvan;
  return k;
}

/** Metindeki tüm vCard'lar (bir .vcf dosyasında birden çok kişi olabilir) ya da tek MECARD. */
export function kartvizitMetniCoz(metin: string): OkunanKisi[] {
  const t = metin.trim();
  if (/^MECARD:/i.test(t)) {
    const k = mecardKisisi(t);
    return k ? [k] : [];
  }
  const bloklar = t.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) ?? [];
  return bloklar.map(vcardKisisi).filter((k): k is OkunanKisi => k !== null);
}

/** Bu metin bir kartvizit verisi mi (vCard ya da MECARD)? */
export function kartvizitMetniMi(metin: string): boolean {
  return /BEGIN:VCARD/i.test(metin) || /^\s*MECARD:/i.test(metin);
}

/**
 * WAHA yükündeki paylaşılan kişi kartları (vCard metinleri).
 *
 * Motora göre farklı yerde: WAHA'nın ortak alanı `vCards`; ham mesajda
 * `contactMessage.vcard` (tek kişi) ya da `contactsArrayMessage.contacts[].vcard`
 * (çoklu). Alan adının yazımı da motora göre değişiyor (vcard / vCard).
 */
export function vcardlariAl(payload: any): string[] {
  const sonuc: string[] = [];
  const ekle = (v: unknown) => {
    if (typeof v === "string" && /BEGIN:VCARD/i.test(v)) sonuc.push(v);
  };
  if (Array.isArray(payload?.vCards)) payload.vCards.forEach(ekle);
  const d = payload?._data ?? {};
  const msg = d.message ?? d.Message ?? {};
  const tek = msg.contactMessage ?? msg.ContactMessage;
  ekle(tek?.vcard ?? tek?.vCard ?? tek?.Vcard);
  const coklu = msg.contactsArrayMessage ?? msg.ContactsArrayMessage;
  for (const c of coklu?.contacts ?? coklu?.Contacts ?? []) ekle(c?.vcard ?? c?.vCard ?? c?.Vcard);
  return [...new Set(sonuc)];
}
