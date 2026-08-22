/**
 * mammoth kendi tip tanımlarını göndermiyor ve DefinitelyTyped'da da yok.
 * Yalnızca kullandığımız yüzey burada tanımlanır — paketin tamamını modellemeye
 * gerek yok, aksi halde her sürümde bakım yükü doğar.
 */
declare module "mammoth" {
  export function extractRawText(input: { buffer: Buffer }): Promise<{
    value: string;
    messages: { type: string; message: string }[];
  }>;
}
