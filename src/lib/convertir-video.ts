/**
 * Conversión de videos en el navegador para que WhatsApp los acepte.
 *
 * WhatsApp Cloud API solo admite video/mp4 y video/3gpp (H.264 + AAC) y un máximo
 * de 16 MB. El iPhone graba en .mov (video/quicktime), muchas veces en HEVC, así que
 * antes de subir convertimos a MP4: si el video ya es H.264 y cabe, solo se cambia
 * el contenedor (rápido, sin pérdida); si no, se recodifica a H.264 ajustando el
 * bitrate para quedar por debajo del límite.
 */

const LIMITE_BYTES = 16 * 1024 * 1024;
// Margen para el audio, el contenedor y la imprecisión del bitrate del encoder.
const OBJETIVO_BYTES = 14 * 1024 * 1024;
// Estimación del audio para calcular cuánto bitrate le queda al video.
const BITRATE_AUDIO = 128_000;
const BITRATE_VIDEO_MAX = 4_000_000;
const BITRATE_VIDEO_MIN = 250_000;

const TIPOS_VIDEO_ACEPTADOS = ["video/mp4", "video/3gpp"];

/** true si el archivo es un video que WhatsApp no aceptaría tal cual. */
export function videoRequiereConversion(file: File): boolean {
  const esVideo = file.type.startsWith("video/") || /\.(mov|qt|m4v|webm|mkv)$/i.test(file.name);
  if (!esVideo) return false;
  return !TIPOS_VIDEO_ACEPTADOS.includes(file.type) || file.size > LIMITE_BYTES;
}

/**
 * Devuelve un File MP4 (H.264/AAC) listo para WhatsApp. Lanza un Error con mensaje
 * en español si el navegador no puede convertirlo.
 */
export async function convertirVideoParaWhatsApp(
  file: File,
  onProgreso?: (porcentaje: number) => void,
): Promise<File> {
  const {
    Input,
    Output,
    Conversion,
    BlobSource,
    BufferTarget,
    Mp4OutputFormat,
    ALL_FORMATS,
    Quality,
  } = await import("mediabunny");

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const pistaVideo = await input.getPrimaryVideoTrack();
  if (!pistaVideo) throw new Error("El archivo no contiene una pista de video legible.");

  const duracion = await input.computeDuration();
  const cabe = file.size <= OBJETIVO_BYTES;
  const recodificar = pistaVideo.codec !== "avc" || !cabe;

  let bitrateVideo = BITRATE_VIDEO_MAX;
  if (duracion > 0) {
    const disponible = (OBJETIVO_BYTES * 8) / duracion - BITRATE_AUDIO;
    bitrateVideo = Math.min(BITRATE_VIDEO_MAX, Math.floor(disponible));
  }
  if (recodificar && bitrateVideo < BITRATE_VIDEO_MIN) {
    throw new Error(
      `El video es demasiado largo (${Math.round(duracion)} s) para enviarlo por WhatsApp (máx. 16 MB). Recórtalo e inténtalo de nuevo.`,
    );
  }

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });

  const conversion = await Conversion.init({
    input,
    output,
    video: recodificar
      ? {
          codec: "avc",
          quality: new Quality(bitrateVideo),
          // 720p es suficiente para WhatsApp y acelera mucho la recodificación en el celular.
          width: Math.min(pistaVideo.displayWidth, pistaVideo.displayHeight) > 720
            ? (pistaVideo.displayWidth >= pistaVideo.displayHeight ? 1280 : 720)
            : undefined,
          forceTranscode: true,
        }
      : { codec: "avc" },
    // Sin `quality`: si el audio ya es AAC (lo normal en iPhone) se copia tal cual. Pedir una
    // calidad obliga a recodificarlo, y en navegadores sin encoder AAC el audio se perdía.
    audio: { codec: "aac" },
  });

  const pistaAudio = await input.getPrimaryAudioTrack();
  const descartada = (tipo: "video" | "audio") => conversion.discardedTracks.some((d) => d.track.type === tipo);
  if (!conversion.isValid || descartada("video") || (!!pistaAudio && descartada("audio"))) {
    throw new Error(
      "Este navegador no puede convertir el video a MP4. Envíalo desde la galería en formato «Más compatible» o desde una computadora.",
    );
  }

  if (onProgreso) {
    conversion.onProgress = (p) => onProgreso(Math.round(p * 100));
  }
  await conversion.execute();

  const buffer = (output.target as InstanceType<typeof BufferTarget>).buffer;
  if (!buffer) throw new Error("La conversión del video no produjo ningún archivo.");
  if (buffer.byteLength > LIMITE_BYTES) {
    throw new Error("El video convertido sigue superando los 16 MB que permite WhatsApp. Recórtalo e inténtalo de nuevo.");
  }

  const nombre = file.name.replace(/\.[^.]+$/, "") + ".mp4";
  return new File([buffer], nombre, { type: "video/mp4" });
}
