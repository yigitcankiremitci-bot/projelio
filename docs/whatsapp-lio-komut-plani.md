# WhatsApp'tan Lio'ya komut — plan

> **DURUM (2026-09-03): uçtan uca uygulandı, sunucuda AÇILMAYI bekliyor.**
>
> Akış kapandı: kullanıcının bağlı telefonundan gelen serbest metin Lio'nun
> araçlı akışına giriyor ve cevap aynı konuşmaya kuyruklanıyor. Canlıya
> çıkması için iki elle adım kaldı: **migration 085'i uygulamak** ve
> **`WHATSAPP_LIO_KOMUT=1`** tanımlamak. İkisi de yapılmadan özellik sessizce
> kapalı — kod eskisi gibi davranır.
>
> | Bölüm | Durum | Nerede |
> |---|---|---|
> | §3.1 Araç süzgeci | ✅ | `ai-assistant.tools.ts` (`WRITE_TOOLS`, `toolsForChannel`) + testi |
> | §3.2 `chat()` kanal parametresi | ✅ | `ai-assistant.service.ts` (`channel`, `allowWrites`, kanal istemi, savunma dalı) |
> | §3.3 Köprü | ✅ | `whatsapp-lio.service.ts` (`handleUserCommand`) |
> | §3.4 Webhook'a bağlama | ✅ | `whatsapp-webhook.service.ts` (`onUserMessage`) |
> | §3.5 Migration | ✅ yazıldı, ⬜ **uygulanmadı** | `database/migrations/085_whatsapp_lio_komut.sql` |
> | §3.6 Sınırlar + sessiz saat muafiyeti | ✅ | `lio-komut-sinir.ts`, `whatsapp-rate-limit.ts`, `whatsapp-send.processor.ts` |
> | §3.7 Biçimlendirme | ✅ | `whatsapp-lio-format.ts` + testi |
> | §3.8 Yazma izni anahtarı | ✅ | `WhatsappLioWritesToggle.tsx`, `setLioAllowWrites` |
>
> Testler: 1084 geçiyor, kırılan yok. `npm run typecheck` temiz.
>
Aşağıdaki metin özgün planıdır; tasarım gerekçeleri hâlâ geçerli.

**Amaç:** Kullanıcı kendi telefonundan Projelio numarasına "günlük bütçe raporu
çıkar" yazınca, Lio'nun araçlarıyla cevabı üretip aynı WhatsApp konuşmasına
göndermesi.

**Plan yazıldığındaki durum (artık geçmiş):** Kullanıcının kendi telefonundan
gelen serbest metin `onUserMessage`'da `command.kind === "none"` olup sessizce
düşüyordu. Lio'nun araçlı akışına bağlı tek gelen-mesaj yolu `replyToInbound`
idi ve o `draftText` kullanıyordu — araçsız, yalnızca müşteri konuşmalarında.
Bu akış artık kapandı (bkz. yukarıdaki durum tablosu); aşağısı özgün plandır.

Bu plan yalnızca **kullanıcının kendi telefonu** (kind=user, opted_in) içindir.
Müşteri konuşmalarındaki otomatik yanıt (`replyToInbound`) olduğu gibi kalıyor:
orası dışarıdan gelen güvenilmez metin, oraya araç açılmıyor.

---

## 1. Neden yeni bir katman gerekiyor

`AiAssistantService.chat()` doğrudan çağrılamaz. Üç engel var:

**a) Onay akışı web'e bağlı.** `chat()` kritik bir araç görünce
`{ type: "confirmation", actionId, ... }` döndürüp koşuyu `pendingRuns` içinde
dondurur; devamı `confirmAction(actionId, userId, confirmed)` ile gelir
(`ai-assistant.service.ts:1754`, `:2391`). WhatsApp'ta bu diyaloğu gösterecek
ekran yok.

**b) `pendingRuns` bellekte.** Dondurulan koşu süreç belleğinde duruyor;
backend yeniden başlarsa kaybolur. Web'de bu sorun değil (kullanıcı ekranın
başında, saniyeler içinde onaylıyor), WhatsApp'ta cevap dakikalar sonra
gelebilir.

**c) Cevap biçimi web için.** `chat()` markdown, `projelio:file/<id>` bağlantısı
ve uzun metin üretiyor; WhatsApp'ta düz metin ve kısa mesaj gerekiyor.

---

## 2. Karar: okuma + yazma açık, kritik araçlar kapalı, izin kullanıcıda

Kritik araçlara WhatsApp'tan iki adımlı ("şunu yapayım mı? EVET yazın") teyit
akışı kurmak **bu planın kapsamı dışında**. Sebebi ikisi de gerçek:

- "EVET" kelimesi zaten `parseInboundCommand`'da `confirm` komutu — profil
  telefonu eşleşmesi onayı için ayrılmış. İkinci bir anlam yüklemek o akışı
  belirsizleştirir.
- Dondurulmuş koşuyu dakikalarca bellekte tutmak (b) güvenilmez; kalıcı hâle
  getirmek ayrı bir iş.

Bunun yerine üç kademeli bir set:

| Kademe | WhatsApp'ta | Örnek |
|---|---|---|
| Okuma | **açık** | bütçe raporu, görev listesi, konuşma okuma |
| Yazma (kritik değil) | **açık** — kullanıcı kapatabilir | görev aç, not ekle, kayıt güncelle |
| `CRITICAL_TOOLS` | **kapalı** — modele hiç verilmez | sil, arşivle, bütçe hareketi |
| `whatsapp_*` | **kapalı** | WhatsApp'tan WhatsApp mesajı göndertme |

Kritik araçlar modele **hiç verilmediği** için onay durumu doğmaz; kullanıcı
"görevi sil" derse Lio "bunu uygulamadan yapmanız gerekiyor" der. İleride teyit
akışı eklenirse bu tasarım engel değil — set genişletilir.

**Yazma izni ayardan açılıp kapanır (KARAR).** Kullanıcı WhatsApp'tan yazma
işlemi yapılmasını istemiyorsa tek anahtarla salt-okunura düşürebilir; ayar
kapalıyken set §2'deki ilk satıra iner. Varsayılan **açık** — özelliğin kendisi
zaten env bayrağıyla ve kullanıcı bağlantısıyla kapalı geliyor (§3.6), üstüne
üçüncü bir kapı koymak özelliği kullanılmaz kılardı.

Depolama: repoda ayrı bir `user_settings` tablosu **yok** — ayarlar ilgili
tabloda kolon olarak duruyor (`whatsapp_threads.lio_auto_reply` gibi). Aynı
deseni izle: `whatsapp_contacts.lio_allow_writes boolean not null default true`
(migration 085). Kişi bazında olması doğru: izin, kullanıcının *o telefonuna*
ait — biri iki numara bağlarsa (iş/özel) ayrı ayrı ayarlanabilir.

---

## 3. Yapılacaklar

### 3.1 Kanal kavramı: `AI_TOOLS`'u süz

**Dosya:** `backend/src/modules/ai-assistant/ai-assistant.tools.ts`

`CRITICAL_TOOLS`'un yanına ekle:

Veri değiştiren ama kritik olmayan araçların adı bir yerde toplanmalı — yazma
izni kapalıyken bunlar da düşecek:

```ts
/**
 * Veri değiştiren ama kritik olmayan araçlar (kritik olanlar CRITICAL_TOOLS'ta).
 * WhatsApp'ta kullanıcı yazma iznini kapattıysa bunlar da modele verilmez.
 */
export const WRITE_TOOLS = new Set<string>([
  "create_task", "create_tasks", "update_task", /* … tam liste çıkarılacak … */
]);

/**
 * Kanala göre araç seti. Kritik araçların onay diyaloğu web'e bağlı
 * (bkz. chat() → type:"confirmation"); WhatsApp'ta gösterilecek ekran yok.
 * Araç modele hiç verilmezse onay durumu da doğmaz.
 *
 * whatsapp_* araçları ayrıca dışarıda: WhatsApp'tan WhatsApp mesajı
 * göndertmek, tek mesajla zincir kurmanın en kolay yolu.
 */
export function toolsForChannel(
  channel: "web" | "whatsapp",
  opts: { allowWrites?: boolean } = {}
): Anthropic.Tool[] {
  if (channel === "web") return AI_TOOLS;
  const allowWrites = opts.allowWrites ?? true;
  return AI_TOOLS.filter(
    (t) =>
      !CRITICAL_TOOLS.has(t.name) &&
      !t.name.startsWith("whatsapp_") &&
      (allowWrites || !WRITE_TOOLS.has(t.name))
  );
}
```

`WRITE_TOOLS`'un tam listesi `AI_TOOLS` taranarak çıkarılacak (create_*,
update_*, add_*, set_*, move_*, assign_* önekleri + elle gözden geçirme).

Test: `ai-assistant.tools.test.ts` (yeni)
- whatsapp setinde hiçbir `CRITICAL_TOOLS` üyesi ve hiçbir `whatsapp_*` yok
- `allowWrites: false` → hiçbir `WRITE_TOOLS` üyesi yok, okuma araçları duruyor
- `allowWrites: true` → yazma araçları var
- web seti tam (`AI_TOOLS` ile birebir)
- **`WRITE_TOOLS` ∩ `CRITICAL_TOOLS` = ∅** (bir araç iki listede birden olmasın)

### 3.2 `chat()`'e kanal parametresi

**Dosya:** `ai-assistant.service.ts`

`chat()` imzasına opsiyonel `options?: { channel?: "web" | "whatsapp" }` ekle
(varsayılan `"web"` → mevcut çağıranlar değişmez). `PendingRun`'a `channel`
alanı koy, `runLoop` içinde `tools: AI_TOOLS` verilen yeri
`toolsForChannel(run.channel)` yap.

Aynı yerde iki küçük ek:

- Sistem istemine kanal notu: WhatsApp ise "Cevabın WhatsApp'tan gidecek: düz
  metin yaz, madde işareti/başlık/markdown kullanma, en fazla ~800 karakter,
  uzunsa özetle ve uygulamada bakılmasını söyle."
- `channel === "whatsapp"` iken kritik araç dalı (`:1754`) zaten tetiklenmez
  ama savunma amaçlı: o dalda `run.channel === "whatsapp"` ise onay yerine
  araç sonucu olarak "bu işlem WhatsApp'tan yapılamaz" dönsün.

### 3.3 Köprü: `WhatsappLioService.handleUserCommand`

**Dosya:** `whatsapp-lio.service.ts`

`replyToInbound`'un yanına ikinci giriş noktası. Farkı: bu **kullanıcının
kendi** mesajı, dolayısıyla araçlı `chat()` çağrılır.

```
handleUserCommand(thread, contact, conn, userId, text):
  1. Konuşma sürekliliği: thread.ai_conversation_id, ai_conversation_at
     6 saatten yeniyse kullanılır; değilse yeni conversation açılır (§3.5).
  2. result = await ai().chat(userId, userRole, text, convId, "fast",
                              undefined,
                              { channel: "whatsapp",
                                allowWrites: contact.lio_allow_writes })
  3. result.type'a göre:
     - "message"        → metni WhatsApp'a uygun kısalt, enqueue
     - "out_of_credits" → "Krediniz bitti" + uygulama linki
     - "continuation"   → doneSummary + "işin kalanı için uygulamaya bakın"
     - "confirmation"   → oluşmamalı; oluşursa logla, kullanıcıya
                          "bu işlem uygulamadan yapılmalı" de
  4. thread.ai_conversation_id / _at güncellenir
  5. enqueue(thread.id, reply, { sentBy: "lio", sentByUserId: userId,
                                 bypassQuietHours: true })
```

`userRole` için `users` tablosundan `role` okunur (webhook'ta elde yok).

`enqueue`'nun `meta` tipine `bypassQuietHours?: boolean` eklenir ve
`bypass_quiet_hours` kolonuna yazılır (varsayılan false — diğer çağıranlar
değişmez).

### 3.4 Webhook'u bağla

**Dosya:** `whatsapp-webhook.service.ts` → `onUserMessage`

Şu an ilk satır:

```ts
if (command.kind === "none") return;
```

Bunun yerine: komut değilse, kişi bağlı bir kullanıcıysa (`contact.user_id`),
opted_in ise ve özellik açıksa Lio'ya devret:

```ts
if (command.kind === "none") {
  if (!contact.user_id || contact.opt_in_state !== "opted_in") return;
  if (!isLioCommandEnabled()) return;          // env bayrağı, bkz. 3.6
  if (!body.trim()) return;
  await this.waha.sendSeen(...).catch(() => {});
  await this.lio.handleUserCommand(thread, contact, conn, contact.user_id, body)
    .catch((e) => this.logger.warn(`Lio komutu başarısız (${thread.id}): ${e}`));
  return;
}
```

Dikkat: `onUserMessage` sonuna kadar akmasın — `command.kind === "none"`
dalında `sendImmediate` çağrılmıyor, cevap kuyruktan gidiyor.

### 3.5 Konuşma sürekliliği (migration)

"Bütçe raporu çıkar" → "peki geçen aya göre?" çalışsın diye WhatsApp thread'i
ile AI conversation'ı eşleşmeli.

**Migration:** `database/migrations/085_whatsapp_lio_komut.sql`
(en yüksek numara şu an 084)

```sql
-- Konuşma sürekliliği: WhatsApp thread'i ↔ Lio sohbeti.
alter table whatsapp_threads
  add column if not exists ai_conversation_id uuid references ai_conversations(id) on delete set null,
  add column if not exists ai_conversation_at timestamptz;

-- Yazma izni: kullanıcı WhatsApp'tan veri değiştirilmesini kapatabilir (§2).
alter table whatsapp_contacts
  add column if not exists lio_allow_writes boolean not null default true;

-- Kullanıcının kendi isteğine cevap sessiz saatte de gider (§3.6).
alter table whatsapp_messages
  add column if not exists bypass_quiet_hours boolean not null default false;
```

Kural: son mesajın üzerinden **6 saat** geçtiyse yeni conversation açılır
(KARAR — WhatsApp'ta konuşma günlerce açık kalıyor; eski bağlamı taşımak hem
pahalı hem kafa karıştırıcı). Aynı 6 saat kuyruktaki `MAX_QUEUE_AGE_MS` ile
de tutarlı.

`ai_conversations` tablosunun gerçek adı doğrulanmalı
(`ai-conversations.service.ts`); farklıysa referans ona göre yazılır.

### 3.6 Güvenlik ve maliyet sınırları

**Env bayrağı — varsayılan KAPALI.**
`WHATSAPP_LIO_KOMUT=1` verilene kadar özellik çalışmaz. Sunucuda elle
açılacaklar listesine girer (CLAUDE.md'deki tabloya satır eklenir).

**Ayrı hız sınırı.** WhatsApp'tan araçlı tur atmak web'e göre çok kolay ve
`draftText`'ten belirgin pahalı. Kullanıcı başına **saatte 10 istek** öner;
`whatsapp-rate-limit.ts`'in yanına saf fonksiyon olarak (`lio-komut-sinir.ts`)
+ testi. Sınır aşılınca "Çok fazla istek gönderdiniz, biraz sonra tekrar
deneyin" cevabı.

**Kademe sabit `fast`.** WhatsApp'tan pahalı kademe seçilemez.

**Uzunluk tavanı.** Gelen metin 1000 karakterden uzunsa işlenmez ("Uzun
istekler için uygulamayı kullanın") — WhatsApp'tan roman yapıştırıp kredi
yakmanın önü kesilir.

**Sessiz saat muafiyeti — KARAR: cevap hemen gitsin.**

Sessiz saat `decideSend()` içinde, `paused`'dan hemen sonra uygulanıyor
(`whatsapp-rate-limit.ts`). Kural ban riskini düşürmek için var: gece
yarısı *bildirim* atmak tetikleyici. Ama kullanıcının kendi sorusuna cevap
vermek istenmeyen mesaj değil — konuşmayı o başlattı ve cevabı bekliyor.

Uygulama: `whatsapp_messages`'a `bypass_quiet_hours boolean not null
default false` kolonu (migration 085 içinde). `handleUserCommand`'ın
`enqueue`'sü bunu `true` yazar; başka hiçbir çağıran yazmaz.

`decideSend`'e `SendWindowFacts`'e değil ayrı bir alan olarak girer —
sessiz saat kararı *mesaja* özel, pencere gerçeklerine değil:

```ts
export interface SendWindowFacts {
  ...
  /** Kullanıcının kendi isteğine cevap: sessiz saat uygulanmaz. */
  bypassQuietHours?: boolean;
}
// decideSend içinde:
if (!facts.bypassQuietHours && isQuietHour(config, facts.localHour)) {
  return { allowed: false, reason: "quiet_hours" };
}
```

Diğer tavanlar (dakika/saat/gün/kişi) **muaf değil** — onlar ban riskinin
asıl kaynağı olan hacim kuralları.

Test (`whatsapp-rate-limit.test.ts`'e eklenir): sessiz saatte
`bypassQuietHours: true` → allowed; `false` → `quiet_hours`; muafiyet
`perMinute` tavanını **aşamaz**.

`whatsapp-send.processor.ts`'te `processConnection` sorgusuna
`bypass_quiet_hours` kolonu eklenir ve `decideSend`'e taşınır.

### 3.7 Metin biçimlendirme

**Dosya:** `whatsapp-lio-format.ts` (yeni, saf fonksiyon + test)

- markdown temizliği: `**kalın**` → düz, `#` başlıklar → düz satır,
  `- ` madde işaretleri korunabilir (WhatsApp'ta okunur) ama `|` tablo →
  satır satır düz metne çevrilir.
- `[ad](projelio:file/<id>)` → `ad` (bağlantı WhatsApp'ta açılmaz).
- 800 karakteri aşarsa kes + "…\n\nTamamı için: <webAppUrl>".

### 3.8 Yazma izni ayarı (arayüz)

**Backend:** `whatsapp.service.ts`'e `setLioAllowWrites(contactId, userId,
enabled)` — `setAutoReply` ile birebir aynı desen: önce yetki kontrolü
(kişi gerçekten bu kullanıcıya mı bağlı, `contact.user_id === userId`),
sonra kolonu güncelle. `whatsapp.controller.ts`'e ilgili uç.

`WhatsappContact` tipine (`packages/shared/src/types.ts`) `lioAllowWrites`
alanı eklenir; kişiyi dönen map fonksiyonu doldurur.

**Web:** Ayarlar › Bağlantılar sekmesinde, bağlı telefonun altında tek
anahtar:

> **WhatsApp'tan değişiklik yapılabilsin** — Lio WhatsApp'tan gelen
> isteklerle görev açabilir, kayıt güncelleyebilir. Kapalıyken yalnızca
> soruları yanıtlar. Silme ve bütçe işlemleri WhatsApp'tan hiçbir zaman
> yapılamaz.

Son cümle önemli: kullanıcı anahtarı açarken neyin *hâlâ* kapalı olduğunu
görmeli, yoksa "her şeyi açtım" sanır.

---

## 4. Dosya özeti

| Dosya | Durum |
|---|---|
| `ai-assistant.tools.ts` | `WRITE_TOOLS` + `toolsForChannel()` eklenir |
| `ai-assistant.tools.test.ts` | yeni |
| `ai-assistant.service.ts` | `chat()` kanal+allowWrites parametresi, sistem istemi notu, kritik dal koruması |
| `whatsapp-lio.service.ts` | `handleUserCommand()` eklenir |
| `whatsapp-webhook.service.ts` | `onUserMessage` "none" dalı Lio'ya devreder |
| `whatsapp.service.ts` | `enqueue` meta'sına `bypassQuietHours`, `setLioAllowWrites()` |
| `whatsapp.controller.ts` | yazma izni ucu |
| `whatsapp-rate-limit.ts` + test | sessiz saat muafiyeti |
| `whatsapp-send.processor.ts` | `bypass_quiet_hours` kolonunu okur, `decideSend`'e taşır |
| `whatsapp-lio-format.ts` + test | yeni |
| `lio-komut-sinir.ts` + test | yeni |
| `packages/shared/src/types.ts` | `WhatsappContact.lioAllowWrites` |
| `apps/web/src/pages/` Ayarlar › Bağlantılar | yazma izni anahtarı |
| `database/migrations/085_whatsapp_lio_komut.sql` | yeni — **elle uygulanacak** |
| `CLAUDE.md` | env tablosuna `WHATSAPP_LIO_KOMUT` satırı |
| `docs/whatsapp-qr-plan.md` | bu akışın özeti |

---

## 5. Alınan kararlar

1. **Sessiz saat** — kullanıcının kendi isteğine cevap gece de gider; diğer
   tavanlar muaf değil. (§3.6)
2. **Araç seti** — okuma + kritik olmayan yazma açık; `CRITICAL_TOOLS` ve
   `whatsapp_*` kapalı. Yazma, kişi bazında ayardan kapatılabilir,
   varsayılan açık. (§2, §3.8)
3. **Konuşma penceresi** — 6 saat. (§3.5)

Uygulama sırasında netleşecek tek şey `WRITE_TOOLS`'un tam listesi (§3.1);
`AI_TOOLS` taranıp çıkarılacak, sınırda kalan araç olursa sorulacak.

---

## 6. Sıra

1. §3.1 `WRITE_TOOLS` + `toolsForChannel` + test (bağımsız)
2. §3.7 format + test (bağımsız)
3. §3.6 hız sınırı + sessiz saat muafiyeti + test (bağımsız)
4. §3.2 kanal parametresi
5. §3.5 migration
6. §3.3 köprü
7. §3.4 webhook bağlama
8. §3.8 ayar ucu + web anahtarı
9. `npm run typecheck` + `npm test -- --filter=whatsapp`
10. Migration'ı elle uygula, env bayrağını aç, tek kullanıcıyla dene
