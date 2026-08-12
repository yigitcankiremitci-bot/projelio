// `node --import ./scripts/register-ts-resolve.mjs` ile yüklenir; çözümleyici
// kancasını kaydeder (bkz. ts-resolve.mjs).
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolve.mjs", pathToFileURL(import.meta.filename));
