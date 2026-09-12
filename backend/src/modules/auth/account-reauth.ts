import { BadRequestException, ForbiddenException } from "@nestjs/common";

export type ReauthSession = { loginAt?: number; agent?: boolean };

/** İlk şifre/cihaz, başıboş kalmış bir oturumdan eklenip kasa kilidi aşılmasın. */
export function assertRecentInteractiveLogin(session: ReauthSession = {}, now = Date.now() / 1000): void {
  const age = now - (session.loginAt ?? 0);
  if (session.agent || !session.loginAt || !Number.isFinite(age) || age < 0 || age > 300) {
    throw new ForbiddenException("Güvenliğiniz için çıkış yapıp yeniden giriş yapın; ardından beş dakika içinde tekrar deneyin.");
  }
}

/** Şifreli hesap mevcut şifreyi, Google hesabı yakın tarihli gerçek girişi kanıtlar. */
export async function assertPasskeyEnrollment(
  passwordHash: string | null | undefined,
  password: string | undefined,
  session: ReauthSession,
  verify: (plain: string, hash: string) => Promise<boolean>
): Promise<void> {
  if (!passwordHash) {
    assertRecentInteractiveLogin(session);
    return;
  }
  if (typeof password !== "string" || !password) throw new BadRequestException("Mevcut şifreni gir.");
  if (!(await verify(password, passwordHash))) throw new BadRequestException("Mevcut şifre hatalı.");
}
