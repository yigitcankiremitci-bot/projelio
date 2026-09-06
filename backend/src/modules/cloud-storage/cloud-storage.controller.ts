import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { CloudStorageService } from "./cloud-storage.service";
import { OrganizationStorageService } from "./organization-storage.service";
import type { StorageProvider } from "./cloud-storage.types";

function normalizeProvider(value: string): StorageProvider {
  return value === "microsoft" ? "microsoft" : "google";
}

/**
 * Bulut hesaplarının ve şirket depo seçiminin uçları.
 *
 * Google ve Microsoft uçları sağlayıcıya özgü kalmaya devam ediyor (bağlama,
 * kesme, kota); buradaki uçlar iki sağlayıcıyı da kapsayan SEÇİM işleri:
 * "hangi hesaplarım var" ve "bu şirket hangisini kullansın".
 */
@Controller()
@UseGuards(AuthGuard("jwt"))
export class CloudStorageController {
  constructor(
    private cloudStorage: CloudStorageService,
    private orgStorage: OrganizationStorageService
  ) {}

  /** Ayarlar > Bağlı hesaplar listesi. */
  @Get("cloud-storage/accounts")
  async accounts(@Req() req: any) {
    const rows = await this.cloudStorage.listAccountsForUser(req.user.userId);
    return rows.map((row) => ({
      provider: row.provider,
      id: row.account.id,
      email: row.account.email,
      label: row.account.label,
      pictureUrl: row.account.pictureUrl,
      driveReady: row.driveReady,
      isLoginIdentity: row.isLoginIdentity,
      needsReconnect: Boolean(row.account.driveRevokedAt),
      connectedAt: row.account.connectedAt,
    }));
  }

  /** Hesaba ad verir ("Şirket Drive'ı") — iki hesap aynı ekranda ayırt edilebilsin. */
  @Patch("cloud-storage/accounts/:provider/:id")
  async rename(
    @Req() req: any,
    @Param("provider") provider: string,
    @Param("id") id: string,
    @Body("label") label?: string
  ) {
    const target = normalizeProvider(provider);
    const account = await this.cloudStorage.findById(target, id);
    // Sahiplik teyidi: hesap kimliği istemciden geliyor.
    if (!account || account.userId !== req.user.userId) return { ok: false as const };
    await this.cloudStorage.setLabel(target, id, label ?? "");
    return { ok: true as const };
  }

  @Get("organizations/:id/storage")
  async organizationStorage(@Param("id") organizationId: string) {
    const binding = await this.orgStorage.find(organizationId);
    if (!binding) return { selected: false as const };

    const account = await this.cloudStorage.findById(binding.provider, binding.accountId);
    return {
      selected: true as const,
      provider: binding.provider,
      accountId: binding.accountId,
      email: account?.email,
      label: account?.label,
      driveReady: this.cloudStorage.isDriveReady(binding.provider, account),
      folderWebViewLink: binding.folderWebViewLink,
    };
  }

  // POST: web istemcisinin http yardımcısında PUT yok (bkz. api/client.ts).
  @Post("organizations/:id/storage")
  async setOrganizationStorage(
    @Req() req: any,
    @Param("id") organizationId: string,
    @Body() body: { provider?: string; accountId?: string }
  ) {
    const binding = await this.orgStorage.set({
      organizationId,
      userId: req.user.userId,
      provider: normalizeProvider(body?.provider ?? "google"),
      accountId: String(body?.accountId ?? ""),
    });
    return { ok: true as const, provider: binding.provider, accountId: binding.accountId };
  }

  @Delete("organizations/:id/storage")
  async clearOrganizationStorage(@Req() req: any, @Param("id") organizationId: string) {
    await this.orgStorage.clear(organizationId, req.user.userId);
    return { ok: true as const };
  }
}
