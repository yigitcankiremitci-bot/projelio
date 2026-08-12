// Node'un modül çözümleyicisine küçük bir ek.
//
// Node 22 TypeScript dosyalarını doğrudan çalıştırabiliyor (tip silme) ama
// uzantısız göreli import'ları ("./shared") çözemiyor — bunlar TypeScript'in
// kendi kuralı. Bu kanca, çözülemeyen göreli bir import'a sırayla .ts / .tsx /
// /index.ts ekleyerek yeniden dener.
//
// Böylece test için bir paketleyiciye (esbuild/vitest) gerek kalmıyor.

const CANDIDATES = [".ts", ".tsx", "/index.ts", "/index.tsx", ".js"];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    if (!relative) throw err;
    for (const ext of CANDIDATES) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        // sıradaki uzantıyı dene
      }
    }
    throw err;
  }
}
