import LegalDocPage from "../components/LegalDocPage";

/**
 * Kullanıcı sözleşmesi — herkese açık, giriş gerektirmez.
 * Metin `lib/legal/termsOfService.ts`, çizim `components/LegalDocPage.tsx`.
 */
export default function Terms() {
  return <LegalDocPage kind="terms" />;
}
