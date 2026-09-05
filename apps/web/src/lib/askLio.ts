/**
 * Uygulamanın herhangi bir yerinden Lio'yu bir soruyla açmak.
 *
 * Lio'nun paneli AiLauncher'ın içinde, sayfa ağacının tamamen dışında yaşıyor
 * (sağ altta sabit duran maskot). Takvim sayfasının "Lio ile planla" düğmesi
 * gibi noktaların onu açıp bir de mesaj göndermesi gerekiyor. Bunu bir context
 * ile yapmak, tek bir düğme için tüm uygulamayı saran bir provider demekti;
 * cloudStorageEvents'teki aynı yaklaşım burada da yeterli.
 *
 * Mesaj OTOMATİK GÖNDERİLİR, yalnızca kutuya yazılmaz: kullanıcı "Lio ile
 * planla"ya bastıysa niyeti bellidir, bir de "gönder"e basmasını istemek
 * gereksiz bir adım.
 */
const EVENT_NAME = "projelio:ask-lio";

export interface AskLioRequest {
  message: string;
  /**
   * true  — mesaj anında gönderilir (Takvim'deki "Lio ile planla" gibi niyeti
   *         net, tek anlamlı düğmeler).
   * false — mesaj yalnızca yazı kutusuna yazılır; kullanıcı okur, isterse
   *         düzenler, göndermeye kendi karar verir. Varlıkların yanındaki Lio
   *         simgeleri bunu kullanır: "bu proje hakkında konuşmak istiyorum"
   *         cümlesi bir başlangıç, kullanıcının asıl sorusu değil.
   */
  autoSend: boolean;
}

/** Mesajı gönderir. */
export function askLio(message: string): void {
  window.dispatchEvent(new CustomEvent<AskLioRequest>(EVENT_NAME, { detail: { message, autoSend: true } }));
}

/** Mesajı yalnızca yazı kutusuna yazar — göndermeyi kullanıcıya bırakır. */
export function askLioDraft(message: string): void {
  window.dispatchEvent(new CustomEvent<AskLioRequest>(EVENT_NAME, { detail: { message, autoSend: false } }));
}

export function onAskLio(handler: (request: AskLioRequest) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<AskLioRequest>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

/**
 * Kartların/başlıkların üstündeki Lio simgesinin (bkz. components/AskLioButton)
 * konusu. Uygulamadaki her varlık türü buraya bir etiketle bağlanır.
 */
export type LioSubjectKind =
  | "gorev"
  | "altgorev"
  | "proje"
  | "is"
  | "rutin"
  | "cikti"
  | "departman"
  | "organizasyon"
  | "grup"
  | "modul";

// Modül düzeyinde kanca çağrılamaz: Türkçe metin ANAHTAR olarak duruyor,
// çeviri kullanıldığı yerde yapılır (bkz. lioSubjectLabel çağıranları).
const KIND_LABEL: Record<LioSubjectKind, string> = {
  gorev: "görev", // dil:anahtar
  altgorev: "alt görev", // dil:anahtar
  proje: "proje", // dil:anahtar
  is: "iş", // dil:anahtar
  rutin: "rutin", // dil:anahtar
  cikti: "çıktı", // dil:anahtar
  departman: "departman", // dil:anahtar
  organizasyon: "organizasyon", // dil:anahtar
  grup: "grup", // dil:anahtar
  modul: "modül", // dil:anahtar
};

export interface LioSubject {
  kind: LioSubjectKind;
  title: string;
  /**
   * Varlığın id'si. Lio'nun araçları (bkz. ai-assistant.tools.ts) işi/projeyi/
   * görevi id ile bulabiliyor; ada göre arama yapmak zorunda kalmasın diye
   * mesaja ekleniyor.
   */
  id?: string;
  /** Kısa ek bağlam (durum, tarih, tutar…) — Lio'nun ilk cevabını isabetli kılar. */
  note?: string;
}

/**
 * Bir varlık hakkında Lio sohbetini açar.
 *
 * Mesaj Türkçe ve tam cümle: doğrudan sohbete yazılıp gönderiliyor, yani
 * kullanıcının konuşma geçmişinde de okunabilir durmalı.
 */
export function askLioAbout(subject: LioSubject): void {
  askLioDraft(lioSubjectMessage(subject));
}

/**
 * Tek bir varlık için açılış cümlesi.
 *
 * Cümle ÇEVRİLMİYOR: burası bir React bileşeni değil, kanca çağrılamıyor ve
 * modül düzeyinde geçerli dili okuyan bir yol yok. Metin kullanıcının kendi
 * sohbet balonunda görünüyor; İngilizce arayüzde de Türkçe kalıyor. Düzeltmek
 * için kancasız bir çevirmen erişimi (lib/i18n) gerekiyor.
 */
export function lioSubjectMessage(subject: LioSubject): string {
  const label = KIND_LABEL[subject.kind];
  const parts = [`"${subject.title}" adlı ${label} hakkında konuşmak istiyorum.`]; // dil:atla
  if (subject.id) parts.push(`(${label} id: ${subject.id})`);
  if (subject.note) parts.push(subject.note);
  parts.push("Önce durumunu kısaca özetle, sonra ne yapmamı önerdiğini söyle."); // dil:atla
  return parts.join(" ");
}

/**
 * Birden fazla varlık için tek açılış cümlesi — "Seç" kipinde seçilen görevleri
 * toplu olarak Lio'ya aktarmak için (bkz. TaskSelectionBar).
 */
export function askLioAboutMany(subjects: LioSubject[]): void {
  if (subjects.length === 0) return;
  if (subjects.length === 1) {
    askLioAbout(subjects[0]);
    return;
  }
  const label = KIND_LABEL[subjects[0].kind];
  const list = subjects
    .map((s) => `- "${s.title}"${s.id ? ` (id: ${s.id})` : ""}${s.note ? ` — ${s.note}` : ""}`)
    .join("\n");
  // Çevrilmiyor — gerekçesi lioSubjectMessage'ın başında.
  askLioDraft(
    `Şu ${subjects.length} ${label} hakkında konuşmak istiyorum:\n${list}\n\n` + // dil:atla
      "Hepsini birlikte değerlendir: durumlarını özetle ve nasıl bir sıra izlemem gerektiğini söyle." // dil:atla
  );
}

export function lioSubjectLabel(kind: LioSubjectKind): string {
  return KIND_LABEL[kind];
}

/**
 * "Seç" kipindeki id kümesini Lio konularına çevirir — seçim çubuğunun
 * "Lio'ya sor" düğmesi için (bkz. TaskSelectionBar). Listede olmayan id'ler
 * (başka bir sütunda seçilmiş, bu listede bulunmayan görev) sessizce atlanır.
 */
export function selectedLioTasks(
  tasks: { id: string; title: string }[],
  selectedIds: Set<string>
): LioSubject[] {
  return tasks
    .filter((t) => selectedIds.has(t.id))
    .map((t) => ({ kind: "gorev" as const, title: t.title, id: t.id }));
}
