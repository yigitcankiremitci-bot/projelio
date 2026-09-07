import { useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Geri bağlantısının hedefi: sabit ebeveyn mi, gelinen yer mi?
 *
 * PROBLEM: bir görev kartına çift tıklayınca kullanıcı proje (ya da departman)
 * sayfasına atlıyor, ama oradaki geri bağlantısı SABİT bir hedefe bakıyordu —
 * "← Projeler", yani işin varsayılan sekmesi. Kullanıcı İşler sekmesinden
 * gelmişse geri dönünce Projeler sekmesine düşüyor ve bulunduğu yeri elle
 * bulmak zorunda kalıyordu. Atlama ne kadar hızlıysa dönüş o kadar zahmetliydi.
 *
 * ÇÖZÜM: atlamayı yapan taraf nereden geldiğini `location.state.from` içinde
 * söyler; hedef sayfa varsa onu, yoksa kendi sabit ebeveynini kullanır.
 *
 * NEDEN `navigate(-1)` DEĞİL: tarayıcı geçmişi uygulamanın dışını da içerir.
 * Kullanıcı proje sayfasına doğrudan bir bağlantıyla girdiyse -1 onu uygulamadan
 * atar; sekmeyi yeni açtıysa hiçbir yere gitmez. `from` yoksa sayfa yine
 * anlamlı bir ebeveyne dönüyor — geçmişte ne olduğundan bağımsız.
 *
 * `state` history kaydında durduğu için sayfa yenilense de, ileri/geri
 * yapılsa da korunur.
 */
export interface BackTarget {
  /** react-router yolu; "/" ile başlamalı. */
  to: string;
  /** Bağlantıda yazan ad. Genelde gelinen sayfanın adı ("Pist Development"). */
  label: string;
}

/** Atlamayı yapan taraf bunu `navigate(to, { state: { from } })` ile geçirir. */
export function backState(from: BackTarget): { from: BackTarget } {
  return { from };
}

function isBackTarget(value: unknown): value is BackTarget {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<BackTarget>;
  return typeof v.to === "string" && v.to.startsWith("/") && typeof v.label === "string" && v.label.length > 0;
}

/**
 * Saf karar: geçerli bir `from` varsa o, yoksa sayfanın sabit ebeveyni.
 *
 * Doğrulama şart — `state`i uygulamanın herhangi bir yeri (ve kullanıcının
 * tarayıcı geçmişi) yazabiliyor; bozuk bir değer geri bağlantısını boş bir
 * sayfaya, dış bir adrese ya da hiçbir yere götürürdü.
 */
export function resolveBackTarget(from: unknown, fallback: BackTarget): BackTarget {
  return isBackTarget(from) ? from : fallback;
}

/**
 * Hatırlanan hedef: hangi adres için, nereye.
 *
 * NEDEN HATIRLAMAK GEREKİYOR: `location.state` sayfaya varır varmaz siliniyor.
 * Proje sayfası açılışta iki şey yapıyor ve ikisi de state'i düşürüyor —
 * `setSearchParams(…, { replace: true })` state taşımadan yeni bir history
 * kaydı yazıyor, hemen ardından `window.history.replaceState({}, "")` kaydı
 * büsbütün temizliyor (o satırın kendi gerekçesi var: yenilemede aynı göreve
 * tekrar ışınlanmayı engelliyor). Yani `from`u yalnızca `location.state`ten
 * okumak çalışmıyordu: değer ilk render'da geliyor, bir sonrakinde yok oluyor
 * ve geri bağlantısı sessizce sabit hedefe düşüyordu.
 *
 * Bu yüzden ilk görüldüğünde bir kez yakalanıyor. Adres değişirse (departman A
 * → departman B, sayfa yeniden monte edilmiyor) hatıra düşürülüyor: yoksa
 * kullanıcı ikinci departmandayken birincinin geri bağlantısını görürdü.
 */
export interface BackMemo {
  pathname: string;
  from: BackTarget;
}

/** Saf geçiş kuralı; hook yalnızca bunu sarmalıyor. */
export function nextBackMemo(prev: BackMemo | null, pathname: string, from: unknown): BackMemo | null {
  if (isBackTarget(from)) return { pathname, from };
  if (prev && prev.pathname === pathname) return prev;
  return null;
}

/**
 * Sabit uygulama sayfalarının adları. Yalnızca ADI VERİLERİ OLMADAN BİLİNEN
 * sayfalar var: `/jobs/:id` gibi detay sayfalarının adı ancak kayıt yüklenince
 * belli olur, o yüzden onlar burada YOK — `hereAsBack` null döner ve hedef
 * sayfa kendi sabit ebeveynine düşer (zaten doğru olan davranış).
 */
const SAYFA_ADLARI: Record<string, string> = {
  "/": "Ana Sayfa",
  "/tasks": "Yapılacaklar",
  "/calendar": "Takvim",
  "/organizations": "Şirketler",
  "/groups": "Gruplar",
  "/archive": "Arşiv",
  "/settings": "Ayarlar",
};

/** Anasayfanın sekmeleri ayrı birer sayfa gibi geziliyor (bkz. Dashboard ?tab=). */
const ANASAYFA_SEKMELERI: Record<string, string> = {
  budget: "Kasa",
  files: "Dosyalar",
  modules: "Modüller",
};

/**
 * Şu an bulunulan sayfayı bir geri hedefi olarak paketler.
 *
 * NEDEN: departman sayfasına sidebar'dan girildiğinde geri bağlantısı hep
 * "← Departmanlar" (şirketin departman sekmesi) diyordu — kullanıcı anasayfadan
 * gelmişse hiç görmediği bir sayfaya düşüyordu. Atlamayı yapan taraf nereden
 * gelindiğini söylemediği sürece hedef sayfanın bunu bilmesinin yolu yok.
 *
 * Adı bilinmeyen sayfalarda null döner: yanlış bir etiketle geri göndermektense
 * sayfanın kendi sabit ebeveynine düşmek daha doğru.
 */
export function hereAsBack(pathname: string, search: string): BackTarget | null {
  const label =
    pathname === "/"
      ? ANASAYFA_SEKMELERI[new URLSearchParams(search).get("tab") ?? ""] ?? SAYFA_ADLARI["/"]
      : SAYFA_ADLARI[pathname];
  if (!label) return null;
  return { to: `${pathname}${search}`, label };
}

export function useHereAsBack(): BackTarget | null {
  const location = useLocation();
  return hereAsBack(location.pathname, location.search);
}

export function useBackTarget(fallback: BackTarget): BackTarget {
  const location = useLocation();
  const memo = useRef<BackMemo | null>(null);
  // Render sırasında hesaplanması bilerek: efekte bırakılsaydı ilk boyamada
  // sabit hedef görünüp bir kare sonra değişirdi.
  memo.current = nextBackMemo(memo.current, location.pathname, (location.state as { from?: unknown } | null)?.from);
  return memo.current?.from ?? fallback;
}
