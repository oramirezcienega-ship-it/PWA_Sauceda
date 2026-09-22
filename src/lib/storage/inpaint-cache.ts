/**
 * Utilidad de Almacenamiento Persistente en IndexedDB para Renders de IA
 * Permite guardar las imágenes generadas por modelo y fachada para evitar
 * regenerarlas innecesariamente y reducir costos de API y tiempos de espera.
 */

const DB_NAME = "sauceda_inpaint_cache_v1";
const STORE_NAME = "renders";
const DB_VERSION = 1;

export interface RegistroRenderCache {
  id: string; // `${imageHash}_${modelId}`
  imageHash: string;
  modelId: string;
  projectType: string;
  dataUrl: string;
  createdAt: number;
}

/**
 * Calcula un hash criptográfico SHA-256 rápido para una imagen en base64 o URL.
 */
export async function calcularHashImagen(dataUrl: string): Promise<string> {
  try {
    if (typeof window !== "undefined" && window.crypto && window.crypto.subtle) {
      // Tomar una muestra representativa si es muy grande para que el hash sea casi instantáneo
      const muestra = dataUrl.length > 32768
        ? dataUrl.slice(0, 16384) + dataUrl.length + dataUrl.slice(-16384)
        : dataUrl;

      const encoder = new TextEncoder();
      const data = encoder.encode(muestra);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch (e) {
    console.warn("Fallo al calcular SHA-256, usando hash alternativo:", e);
  }

  // Fallback para entornos donde subtle crypto no esté disponible
  let hash = 0;
  const str = dataUrl.slice(0, 5000) + dataUrl.length;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_${Math.abs(hash)}_${dataUrl.length}`;
}

/**
 * Abre o inicializa la base de datos de IndexedDB.
 */
function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB no está disponible en este entorno."));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("imageHash", "imageHash", { unique: false });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Guarda un render generado en IndexedDB.
 */
export async function guardarRenderCache(
  imageHash: string,
  modelId: string,
  projectType: string,
  dataUrl: string
): Promise<void> {
  try {
    const db = await abrirDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const registro: RegistroRenderCache = {
      id: `${imageHash}_${modelId}`,
      imageHash,
      modelId,
      projectType,
      dataUrl,
      createdAt: Date.now(),
    };

    store.put(registro);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn("No se pudo guardar el render en IndexedDB:", error);
  }
}

/**
 * Obtiene todos los renders generados previamente para una imagen específica (por su hash).
 * Devuelve un diccionario { [modelId]: dataUrl }
 */
export async function obtenerRendersCache(
  imageHash: string
): Promise<Record<string, string>> {
  try {
    const db = await abrirDb();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("imageHash");

    const request = index.getAll(imageHash);

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const registros: RegistroRenderCache[] = request.result || [];
        const resultado: Record<string, string> = {};
        for (const reg of registros) {
          resultado[reg.modelId] = reg.dataUrl;
        }
        resolve(resultado);
      };
      request.onerror = () => {
        console.warn("Error al leer renders de IndexedDB:", request.error);
        resolve({});
      };
    });
  } catch (error) {
    console.warn("IndexedDB no disponible al recuperar renders:", error);
    return {};
  }
}

/**
 * Limpia renders con más de 15 días de antigüedad para mantener ligero el almacenamiento.
 */
export async function limpiarRendersAntiguos(maxDias = 15): Promise<void> {
  try {
    const db = await abrirDb();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("createdAt");

    const limiteTiempo = Date.now() - maxDias * 24 * 60 * 60 * 1000;
    const range = IDBKeyRange.upperBound(limiteTiempo);

    const request = index.openCursor(range);
    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
  } catch (e) {
    console.warn("Error al limpiar registros antiguos de IndexedDB:", e);
  }
}
