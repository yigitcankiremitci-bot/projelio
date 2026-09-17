/**
 * İlerleme bildiren gönderim — fetch'in yerine yalnızca yüklemede.
 *
 * NEDEN XHR: fetch gönderilen baytları bildirmiyor. İlerleme bu yüzden
 * yalnızca istek BİTİNCE ilerliyordu: 8 MB altındaki dosyada %10'dan %100'e
 * atlıyor, büyük dosyada 8 MB'lık parça bitene kadar yerinde duruyordu —
 * kullanıcı için ikisi de "yükleme takıldı" demekti. XHR'ın `upload.onprogress`
 * olayı tarayıcının gerçekten gönderdiği baytı veriyor.
 *
 * Dönen değer gerçek bir `Response`: çağıranlar fetch yolundaki durum/başlık
 * okuma kodunu olduğu gibi kullanabilsin, iki ayrı hata işleme yazılmasın.
 */
export function sendWithProgress(
  url: string,
  init: { method: string; headers?: Record<string, string>; body: XMLHttpRequestBodyInit; signal?: AbortSignal },
  onProgress: (loadedBytes: number) => void
): Promise<Response> {
  return new Promise((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(new DOMException("Yükleme iptal edildi", "AbortError"));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open(init.method, url);
    for (const [ad, deger] of Object.entries(init.headers ?? {})) xhr.setRequestHeader(ad, deger);

    xhr.upload.onprogress = (e) => onProgress(e.loaded);

    const iptal = () => xhr.abort();
    init.signal?.addEventListener("abort", iptal, { once: true });
    const temizle = () => init.signal?.removeEventListener("abort", iptal);

    xhr.onload = () => {
      temizle();
      const headers = new Headers();
      for (const satir of xhr.getAllResponseHeaders().trim().split(/[\r\n]+/)) {
        const i = satir.indexOf(":");
        if (i > 0) headers.append(satir.slice(0, i).trim(), satir.slice(i + 1).trim());
      }
      // Response yalnızca 200–599 kabul ediyor; bu aralık dışı bir durum
      // (pratikte görülmüyor) bağlantı hatası gibi ele alınır.
      if (xhr.status < 200 || xhr.status > 599) {
        reject(new TypeError("Failed to fetch"));
        return;
      }
      // 204/304 gövde taşıyamaz; Response kurucusu gövde verilirse hata atıyor.
      const govdesiz = xhr.status === 204 || xhr.status === 304;
      resolve(new Response(govdesiz ? null : xhr.responseText, { status: xhr.status, headers }));
    };
    // Mesaj fetch'inkiyle aynı: kuyruk "bağlantı koptu" metnini buna bakarak
    // seçiyor (bkz. lib/uploadQueue.ts uploadHatasi).
    xhr.onerror = () => {
      temizle();
      reject(new TypeError("Failed to fetch"));
    };
    xhr.onabort = () => {
      temizle();
      reject(new DOMException("Yükleme iptal edildi", "AbortError"));
    };

    xhr.send(init.body);
  });
}
