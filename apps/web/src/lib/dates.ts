// Sunucudan gelen zaman damgaları Postgres'te "timestamp without time zone" (UTC)
// olarak tutulur ve saat dilimi bilgisi OLMADAN gelir. Tarayıcı `new Date(iso)`
// derken bunları yerel saat sanır ve Türkiye'de her şey 3 saat "eski" görünürdü
// (ör. bildirimlerde aktivite zamanı yanlış görünüyordu). Bu yüzden zaman dilimi
// bilgisi yoksa UTC kabul ederek parse ediyoruz.
export function parseServerDate(iso: string): Date {
  if (!iso) return new Date(NaN);
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}

export function timeAgo(iso: string): string {
  const diffMs = Date.now() - parseServerDate(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} sa önce`;
  const day = Math.floor(hour / 24);
  return `${day} gün önce`;
}

export function formatDateTime(iso: string): string {
  const d = parseServerDate(iso);
  return `${d.toLocaleDateString("tr-TR")} ${d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}`;
}
