// Metin içindeki "@kullaniciadi" etiketlerini bulup tekilleştirilmiş, küçük harfli
// kullanıcı adı listesi olarak döner. Kullanıcı adı formatı users.username ile birebir
// aynıdır (bkz. migration 013): a-z, 0-9, "_" ve "." karakterleri, 3-30 uzunluk.
export function extractMentionHandles(body: string): string[] {
  const matches = body.match(/@([a-z0-9_.]{3,30})/gi) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
}
