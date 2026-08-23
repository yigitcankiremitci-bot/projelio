// Backend tsconfig'inde esModuleInterop kapalı (NestJS CommonJS derlemesi
// gereği), bu yüzden namespace import kullanılıyor.
import * as assert from "node:assert/strict";
import { describe, test } from "node:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Yönetici uçlarının rol kontrolü olmadan eklenmesini engelleyen koruma testi.
 *
 * NEDEN BÖYLE BİR TEST: projede iki ayrı rol kontrolü yöntemi kullanılıyor ve
 * ikisi de geliştiricinin hatırlamasına bağlı:
 *
 *   1. Bildirimsel — @UseGuards(RolesGuard) + @Roles("admin")
 *      (admin.controller.ts, support.controller.ts, users.controller.ts)
 *   2. Elle — handler içinde this.assertAdmin(req)
 *      (ai-assistant.controller.ts, 8 uç)
 *
 * İkisinin de aynı sessiz hata biçimi var: yeni bir `admin/...` ucu eklenip
 * kontrol unutulursa, uç GİRİŞ YAPMIŞ HERKESE açık olur ve hiçbir yerde hata
 * görünmez. Repoda ESLint yok (bkz. CLAUDE.md), dolayısıyla bunu yakalayacak
 * tek otomatik yer burası.
 *
 * Test yeni bir kural DAYATMIYOR — bugün geçen durumu sabitliyor. Kırıldığında
 * yapılacak şey testi gevşetmek değil, eklenen uca rol kontrolü koymaktır.
 */

// Yol çalışma dizininden türetiliyor: test koşucusu tipleri sıyırıp dosyayı ES
// modülü olarak yüklüyor, bu yüzden __dirname yok; import.meta ise backend'in
// CommonJS tsconfig'inde derlenmiyor. Koşucu depo kökünden çalışıyor ama tek
// başına `backend/` içinden de çalıştırılabilsin diye iki yol da deneniyor.
const MODULES_DIR = [join(process.cwd(), "backend", "src", "modules"), join(process.cwd(), "src", "modules")].find(
  (candidate) => existsSync(candidate)
);
const ROUTE_DECORATOR = /@(Get|Post|Patch|Put|Delete)\(\s*(["'`])([^"'`]*)\2/g;

function controllerFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...controllerFiles(full));
    else if (entry.endsWith(".controller.ts")) found.push(full);
  }
  return found;
}

/** Rol kontrolü olmayan yönetici uçlarını döndürür: "dosya → rota" listesi. */
function unprotectedAdminRoutes(file: string, source: string): string[] {
  // Sınıf düzeyinde @Roles("admin") varsa tüm rotalar kapsanmıştır.
  const classLevelRoles = /@Controller\([^)]*\)[\s\S]{0,400}?@Roles\(\s*["'`]admin/.test(source);
  if (classLevelRoles) return [];

  const problems: string[] = [];
  const matches = [...source.matchAll(ROUTE_DECORATOR)];

  matches.forEach((match, index) => {
    const path = match[3];
    if (!/(^|\/)admin(\/|$)/.test(path)) return;

    // Bu rotanın gövdesi: kendi dekoratöründen bir sonraki rotanın başına kadar.
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index ?? source.length) : source.length;
    const block = source.slice(start, end);

    // Dekoratörden hemen önce gelen @Roles da bu rotaya aittir.
    const before = source.slice(Math.max(0, start - 200), start);

    const guarded = /assertAdmin\s*\(/.test(block) || /@Roles\(\s*["'`]admin/.test(block + before);
    if (!guarded) problems.push(`${file.split("/modules/")[1]} → ${match[1]} ${path}`);
  });

  return problems;
}

describe("yönetici uçları rol kontrolü olmadan eklenemez", () => {
  test("her admin rotasında @Roles(\"admin\") ya da assertAdmin var", () => {
    assert.ok(MODULES_DIR, "modules klasörü bulunamadı — tarama yapılamadı");
    const files = controllerFiles(MODULES_DIR);
    // Tarama boşa düşerse test sessizce "geçer" ve koruma çalışmayı bırakır.
    assert.ok(files.length > 30, `beklenenden az controller tarandı: ${files.length}`);

    const problems = files.flatMap((file) =>
      unprotectedAdminRoutes(file, readFileSync(file, "utf8"))
    );

    assert.deepEqual(
      problems,
      [],
      `Rol kontrolü olmayan yönetici uçları:\n  ${problems.join("\n  ")}\n\n` +
        `Çözüm: uca @Roles("admin") ekle (controller'da RolesGuard varsa) ya da ` +
        `handler'ın başında assertAdmin(req) çağır.`
    );
  });

  test("tarama gerçekten çalışıyor — korumasız bir uç yakalanır", () => {
    const sahte = `
      @Controller()
      export class SahteController {
        @Get("admin/gizli")
        gizli(@Req() req: any) {
          return this.service.hepsi();
        }
      }
    `;
    assert.equal(unprotectedAdminRoutes("/x/modules/sahte/sahte.controller.ts", sahte).length, 1);
  });

  test("korumalı uç yakalanmaz", () => {
    const korumali = `
      @Controller()
      export class SahteController {
        @Get("admin/gizli")
        gizli(@Req() req: any) {
          this.assertAdmin(req);
          return this.service.hepsi();
        }
      }
    `;
    assert.deepEqual(unprotectedAdminRoutes("/x/modules/sahte/sahte.controller.ts", korumali), []);
  });
});
