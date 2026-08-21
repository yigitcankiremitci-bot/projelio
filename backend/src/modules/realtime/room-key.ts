/**
 * Oda adının çözümlenmesi.
 *
 * Oda = sayfa. Ad "<tür>:<id>" ile başlar, isteğe bağlı "/…" eki alabilir:
 *
 *   project:9f1c…                       → proje sayfası
 *   department:3ab…/module/crm_musteri  → o departmanın CRM modülü sayfası
 *
 * Ek NEDEN VAR: aynı departmanın iki farklı modül sayfasında çalışan iki kişi
 * birbirinin sayfasında sayılmamalı. Yetki ise ekten bağımsızdır — modülü
 * görebilmek departmanı görebilmekten geçtiği için kontrol kök kapsamda yapılır
 * (bkz. realtime.gateway.ts).
 *
 * Ayrı dosyada: gateway dekoratör kullandığı için test koşucusunda (tip silme)
 * doğrudan import edilemiyor; kuralın kendisi burada, sınanabilir halde durur.
 */
export const ROOM_SCOPES = ["project", "department", "job", "operation", "organization", "group"] as const;

export type RoomScopeType = (typeof ROOM_SCOPES)[number];

export interface RoomScope {
  type: RoomScopeType;
  id: string;
}

export function parseRoomKey(room: string): RoomScope | null {
  if (typeof room !== "string") return null;
  const head = room.trim().split("/")[0];
  const sep = head.indexOf(":");
  if (sep <= 0) return null;

  const type = head.slice(0, sep);
  const id = head.slice(sep + 1).trim();
  if (!id) return null;
  if (!(ROOM_SCOPES as readonly string[]).includes(type)) return null;

  return { type: type as RoomScopeType, id };
}
