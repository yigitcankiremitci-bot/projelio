import { useCallback, useEffect, useMemo, useState } from "react";
import { filesApi } from "../api/files";

/**
 * Dosya önizlemeleri: tek istekte imzalı jeton + başarısızları unutmama.
 *
 * NEDEN ORTAK: önizleme artık İYİMSER. Sunucu "bu tür önizlenebilir" diyor
 * (bkz. backend previewableMime), gerçek küçük resim ilk istekte sağlayıcıdan
 * çekiliyor. Çıkmayan önizleme kırık resim ikonu bırakmasın diye her yerde
 * onError ile tür ikonuna düşmek gerekiyor — bunu her dosya listesinde ayrı
 * yazmak yerine tek yerde tutuyoruz (bkz. components/FileThumb.tsx).
 */
/**
 * Tek seferde kaç dosya için önizleme istenir.
 *
 * Jeton ucu dosya BAŞINA erişim doğrulaması yapıyor (bkz. FilesService.findById)
 * ve önizleme türe bakılarak istendiği için artık neredeyse her görsel bu
 * listeye giriyor. Tavan olmadan 300 dosyalık bir klasör tek açılışta yüzlerce
 * paralel veritabanı isteği demekti — PostgREST havuzu bu yükte daha önce de
 * darboğaz olmuştu. Ekranda aynı anda bu kadarı zaten görünmüyor.
 */
const MAX_ONIZLEME = 60;

export interface FileThumbnails {
  /** Önizleme adresi; jeton yoksa ya da görsel yüklenemediyse undefined. */
  urlFor: (fileId: string) => string | undefined;
  /** Görsel yüklenemedi: bu dosya için bir daha denenmez. */
  markFailed: (fileId: string) => void;
}

export function useFileThumbnails(files: { id: string; hasThumbnail?: boolean }[]): FileThumbnails {
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});

  // Liste her tazelemede yeni bir dizi olarak geliyor; jetonları içeriği
  // değişmediği hâlde yeniden istememek için anahtar kimliklerden türetiliyor.
  const key = useMemo(
    () =>
      files
        .filter((f) => f.hasThumbnail)
        .slice(0, MAX_ONIZLEME)
        .map((f) => f.id)
        .join(","),
    [files]
  );

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) {
      setTokens({});
      return;
    }
    let iptal = false;
    filesApi
      .accessTokens(ids)
      .then(({ tokens: alinan }) => {
        if (!iptal) setTokens(alinan);
      })
      // Önizleme kritik değil: alınamazsa tür ikonu gösterilir.
      .catch(() => undefined);
    return () => {
      iptal = true;
    };
  }, [key]);

  const urlFor = useCallback(
    (fileId: string) =>
      !failed[fileId] && tokens[fileId] ? filesApi.thumbnailUrlWithToken(fileId, tokens[fileId]) : undefined,
    [tokens, failed]
  );

  const markFailed = useCallback((fileId: string) => {
    setFailed((prev) => (prev[fileId] ? prev : { ...prev, [fileId]: true }));
  }, []);

  return { urlFor, markFailed };
}
