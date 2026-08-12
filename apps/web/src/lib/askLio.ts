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

export function askLio(message: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENT_NAME, { detail: message }));
}

export function onAskLio(handler: (message: string) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
