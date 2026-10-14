// Solo para `npm test`: permite que los módulos de src/ se importen entre sí
// sin extensión (como en Next.js), probando `<ruta>.ts` cuando falta.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(especificador, contexto, siguiente) {
  try {
    return await siguiente(especificador, contexto);
  } catch (err) {
    if (err?.code === "ERR_MODULE_NOT_FOUND" && especificador.startsWith(".") && !/\\.[cm]?[jt]s$/.test(especificador)) {
      return siguiente(especificador + ".ts", contexto);
    }
    throw err;
  }
}`),
  import.meta.url,
);
