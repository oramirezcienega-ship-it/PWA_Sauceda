import zlib from "zlib";

/**
 * Genera un buffer de imagen PNG en escala de grises (1 canal)
 * con una máscara binaria (negro = 0 = conservar, blanco = 255 = inpaint).
 * No requiere librerías externas pesadas (utiliza zlib nativo de Node.js).
 */
export function crearMascaraPng(
  width: number,
  height: number,
  polygonPoints: Array<[number, number]>
): Buffer {
  const w = Math.round(width);
  const h = Math.round(height);

  // Algoritmo de punto en polígono (Ray-casting)
  function insidePoly(x: number, y: number, vs: Array<[number, number]>): boolean {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i][0] * w;
      const yi = vs[i][1] * h;
      const xj = vs[j][0] * w;
      const yj = vs[j][1] * h;
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // Buffer de datos crudos: 1 byte de filtro por línea + 1 byte por píxel
  const rowSize = 1 + w;
  const rawData = Buffer.alloc(rowSize * h);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filtro tipo 0 (None)
    for (let x = 0; x < w; x++) {
      const isInside = insidePoly(x, y, polygonPoints);
      rawData[rowOffset + 1 + x] = isInside ? 255 : 0;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // Firma oficial de archivo PNG
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // Chunk IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: escala de grises
  ihdr[10] = 0; // compresión deflate
  ihdr[11] = 0; // filtro estándar
  ihdr[12] = 0; // sin entrelazado

  // Tabla CRC32 para cálculo de verificación PNG
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[i] = c;
  }

  function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type: string, data: Buffer): Buffer {
    const len = data.length;
    const buf = Buffer.alloc(4 + 4 + len + 4);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4);
    data.copy(buf, 8);
    const crc = crc32(buf.subarray(4, 8 + len));
    buf.writeUInt32BE(crc, 8 + len);
    return buf;
  }

  const ihdrChunk = makeChunk("IHDR", ihdr);
  const idatChunk = makeChunk("IDAT", compressed);
  const iendChunk = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}
