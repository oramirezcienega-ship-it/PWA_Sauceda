/**
 * Motor de Generación y Composición Visual de Fachadas
 * Proyecta las variantes arquitectónicas de herrería y pergolado sobre el vano detectado.
 * SAUCEDA Bienes Raíces y Construcción
 */

export interface RenderVarianteConfig {
  model_id: string;
  bounding_box_normalized: [number, number, number, number]; // [ymin, xmin, ymax, xmax]
  ancho_m?: number;
  alto_m?: number;
}

/**
 * Genera el SVG arquitectónico vectorial que se superpone con precisión milimétrica
 * sobre el vano detectado en la fotografía original.
 */
export function generarSvgSuperposicionVano(
  modelId: string,
  anchoPx: number = 800,
  altoPx: number = 600
): string {
  switch (modelId) {
    case "porton_duela":
      return generarSvgPortonDuela(anchoPx, altoPx);
    case "porton_laser":
      return generarSvgPortonLaser(anchoPx, altoPx);
    case "porton_mixto":
      return generarSvgPortonMixto(anchoPx, altoPx);
    case "pergola_estructural":
      return generarSvgPergolaEstructural(anchoPx, altoPx);
    case "pergola_cristal":
      return generarSvgPergolaCristal(anchoPx, altoPx);
    case "pergola_bioclimatica":
      return generarSvgPergolaBioclimatica(anchoPx, altoPx);
    default:
      return generarSvgPortonDuela(anchoPx, altoPx);
  }
}

function generarSvgPortonDuela(w: number, h: number): string {
  const numDuelas = 12;
  const grosorMarco = Math.max(10, Math.round(w * 0.025));
  const espacioInternoW = w - grosorMarco * 2;
  const espacioInternoH = h - grosorMarco * 2;
  const altoDuela = espacioInternoH / numDuelas;

  let duelasSvg = "";
  for (let i = 0; i < numDuelas; i++) {
    const y = grosorMarco + i * altoDuela;
    const esPar = i % 2 === 0;
    const fill = esPar ? "url(#duelaGrad1)" : "url(#duelaGrad2)";
    duelasSvg += `
      <rect x="${grosorMarco}" y="${y}" width="${espacioInternoW}" height="${altoDuela - 2}" fill="${fill}" rx="1" />
      <line x1="${grosorMarco}" y1="${y + altoDuela - 2}" x2="${w - grosorMarco}" y2="${y + altoDuela - 2}" stroke="#101720" stroke-width="2" />
    `;
  }

  const jaladeraX = Math.round(w * 0.88);
  const jaladeraY = Math.round(h * 0.38);
  const jaladeraH = Math.round(h * 0.28);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
      <defs>
        <linearGradient id="marcoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1A202C" />
          <stop offset="50%" stop-color="#2D3748" />
          <stop offset="100%" stop-color="#1A202C" />
        </linearGradient>
        <linearGradient id="duelaGrad1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#3A4454" />
          <stop offset="30%" stop-color="#2B3340" />
          <stop offset="100%" stop-color="#1F2530" />
        </linearGradient>
        <linearGradient id="duelaGrad2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#343D4D" />
          <stop offset="30%" stop-color="#262D38" />
          <stop offset="100%" stop-color="#1B2028" />
        </linearGradient>
        <linearGradient id="aceroInox" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#B0B5BA" />
          <stop offset="50%" stop-color="#FFFFFF" />
          <stop offset="100%" stop-color="#8C9298" />
        </linearGradient>
        <filter id="sombraVano" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#000000" flood-opacity="0.65" />
        </filter>
      </defs>

      <!-- Sombra interior de vano -->
      <rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#000000" stroke-width="6" opacity="0.4" />

      <!-- Fondo y marco perimetral PTR -->
      <g filter="url(#sombraVano)">
        <rect x="0" y="0" width="${w}" height="${h}" fill="url(#marcoGrad)" rx="3" />
        <rect x="${grosorMarco}" y="${grosorMarco}" width="${espacioInternoW}" height="${espacioInternoH}" fill="#151A22" />
      </g>

      <!-- Duelas horizontales con micropestaña -->
      ${duelasSvg}

      <!-- Poste vertical de refuerzo central -->
      <rect x="${Math.round(w * 0.495)}" y="${grosorMarco}" width="${Math.round(w * 0.012)}" height="${espacioInternoH}" fill="url(#marcoGrad)" />

      <!-- Jaladera arquitectónica de acero inoxidable 304 -->
      <rect x="${jaladeraX}" y="${jaladeraY}" width="8" height="${jaladeraH}" fill="url(#aceroInox)" rx="4" filter="url(#sombraVano)" />
      <rect x="${jaladeraX - 3}" y="${jaladeraY + 10}" width="14" height="6" fill="#6A727A" rx="1" />
      <rect x="${jaladeraX - 3}" y="${jaladeraY + jaladeraH - 16}" width="14" height="6" fill="#6A727A" rx="1" />
    </svg>
  `;
}

function generarSvgPortonLaser(w: number, h: number): string {
  const grosorMarco = Math.max(12, Math.round(w * 0.03));
  const panelW = (w - grosorMarco * 3) / 2;
  const panelH = h - grosorMarco * 2;

  // Generación de patrón geométrico corte láser CNC
  let patronLaser = "";
  const cols = 6;
  const rows = 10;
  const celdaW = panelW / cols;
  const celdaH = panelH / rows;

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const cx1 = grosorMarco + c * celdaW + celdaW * 0.5;
      const cy1 = grosorMarco + r * celdaH + celdaH * 0.5;
      const rSize = Math.min(celdaW, celdaH) * 0.35;
      patronLaser += `<polygon points="${cx1},${cy1 - rSize} ${cx1 + rSize},${cy1} ${cx1},${cy1 + rSize} ${cx1 - rSize},${cy1}" fill="#0D1117" />`;

      const cx2 = grosorMarco * 2 + panelW + c * celdaW + celdaW * 0.5;
      patronLaser += `<polygon points="${cx2},${cy1 - rSize} ${cx2 + rSize},${cy1} ${cx2},${cy1 + rSize} ${cx2 - rSize},${cy1}" fill="#0D1117" />`;
    }
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
      <defs>
        <linearGradient id="laserGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#21262D" />
          <stop offset="50%" stop-color="#30363D" />
          <stop offset="100%" stop-color="#161B22" />
        </linearGradient>
        <linearGradient id="chapaTrasera" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#12161C" />
          <stop offset="100%" stop-color="#090C10" />
        </linearGradient>
      </defs>

      <!-- Fondo y marco estructural -->
      <rect x="0" y="0" width="${w}" height="${h}" fill="#161B22" rx="4" />

      <!-- Panel Izquierdo CNC -->
      <rect x="${grosorMarco}" y="${grosorMarco}" width="${panelW}" height="${panelH}" fill="url(#laserGrad)" rx="2" />
      <rect x="${grosorMarco * 2 + panelW}" y="${grosorMarco}" width="${panelW}" height="${panelH}" fill="url(#laserGrad)" rx="2" />

      <!-- Perforaciones Láser -->
      ${patronLaser}

      <!-- Jaladera y cerradura central -->
      <rect x="${w * 0.5 - 4}" y="${h * 0.4}" width="8" height="${h * 0.22}" fill="#C9D1D9" rx="3" />
    </svg>
  `;
}

function generarSvgPortonMixto(w: number, h: number): string {
  const grosorMarco = Math.max(12, Math.round(w * 0.028));
  const numDuelas = 10;
  const panelH = h - grosorMarco * 2;
  const altoDuela = panelH / numDuelas;

  let duelasMadera = "";
  for (let i = 0; i < numDuelas; i++) {
    const y = grosorMarco + i * altoDuela;
    duelasMadera += `
      <rect x="${grosorMarco}" y="${y}" width="${w - grosorMarco * 2}" height="${altoDuela - 3}" fill="url(#tekaMadera)" rx="2" />
      <line x1="${grosorMarco}" y1="${y + altoDuela - 3}" x2="${w - grosorMarco}" y2="${y + altoDuela - 3}" stroke="#1E1915" stroke-width="3" />
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
      <defs>
        <linearGradient id="tekaMadera" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#6F4423" />
          <stop offset="25%" stop-color="#8B572A" />
          <stop offset="60%" stop-color="#7B4A21" />
          <stop offset="85%" stop-color="#9C6233" />
          <stop offset="100%" stop-color="#643D1F" />
        </linearGradient>
        <linearGradient id="aceroNegro" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2D3136" />
          <stop offset="100%" stop-color="#14171A" />
        </linearGradient>
      </defs>

      <!-- Marco exterior en acero negro mate -->
      <rect x="0" y="0" width="${w}" height="${h}" fill="url(#aceroNegro)" rx="4" />

      <!-- Duelas de teka sintética para exteriores -->
      ${duelasMadera}

      <!-- Franja divisoria de perfiles en acero negro -->
      <rect x="${w * 0.72}" y="0" width="${grosorMarco * 1.2}" height="${h}" fill="url(#aceroNegro)" />

      <!-- Jaladera contemporánea en negro y titanio -->
      <rect x="${w * 0.72 + grosorMarco * 1.5}" y="${h * 0.38}" width="10" height="${h * 0.25}" fill="#222" stroke="#444" rx="3" />
    </svg>
  `;
}

function generarSvgPergolaEstructural(w: number, h: number): string {
  const numVigas = 7;
  const pasoViga = w / (numVigas + 1);

  let vigasSvg = "";
  for (let i = 1; i <= numVigas; i++) {
    const x = i * pasoViga;
    vigasSvg += `
      <rect x="${x - 7}" y="10" width="14" height="${h - 20}" fill="#24292F" stroke="#0D1117" stroke-width="1.5" />
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
      <defs>
        <linearGradient id="policarbonatoBronce" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D97706" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#92400E" stop-opacity="0.45" />
        </linearGradient>
      </defs>

      <!-- Cubierta translúcida de policarbonato alveolar -->
      <rect x="5" y="5" width="${w - 10}" height="${h - 10}" fill="url(#policarbonatoBronce)" rx="4" />

      <!-- Viga cargadora frontal IPR -->
      <rect x="0" y="${h * 0.82}" width="${w}" height="24" fill="#1C2128" stroke="#0D1117" />
      <line x1="0" y1="${h * 0.82 + 12}" x2="${w}" y2="${h * 0.82 + 12}" stroke="#30363D" stroke-width="2" />

      <!-- Vigas secundarias transversales -->
      ${vigasSvg}

      <!-- Columnas esquineras PTR -->
      <rect x="12" y="${h * 0.82}" width="20" height="${h * 0.18}" fill="#161B22" />
      <rect x="${w - 32}" y="${h * 0.82}" width="20" height="${h * 0.18}" fill="#161B22" />
    </svg>
  `;
}

function generarSvgPergolaCristal(w: number, h: number): string {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
      <defs>
        <linearGradient id="cristalReflejo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#93C5FD" stop-opacity="0.4" />
          <stop offset="35%" stop-color="#DBEAFE" stop-opacity="0.55" />
          <stop offset="50%" stop-color="#60A5FA" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#2563EB" stop-opacity="0.3" />
        </linearGradient>
      </defs>

      <!-- Planchas de cristal templado 9.5mm con reflejos celestes -->
      <rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="url(#cristalReflejo)" rx="3" stroke="#93C5FD" stroke-opacity="0.6" stroke-width="1.5" />

      <!-- Reflejo diagonal de luz solar -->
      <polygon points="20,10 ${w * 0.6},10 ${w * 0.4},${h - 10} 10,${h - 10}" fill="#FFFFFF" fill-opacity="0.12" />

      <!-- Estructura de aluminio anodizado negro -->
      <rect x="0" y="0" width="${w}" height="14" fill="#0F172A" />
      <rect x="0" y="${h * 0.48}" width="${w}" height="12" fill="#0F172A" />
      <rect x="0" y="${h - 16}" width="${w}" height="16" fill="#0F172A" />
      <rect x="${w * 0.33}" y="0" width="12" height="${h}" fill="#0F172A" />
      <rect x="${w * 0.66}" y="0" width="12" height="${h}" fill="#0F172A" />

      <!-- Herrajes tipo araña de acero inoxidable 316 -->
      <circle cx="${w * 0.33 + 6}" cy="${h * 0.48 + 6}" r="6" fill="#E2E8F0" />
      <circle cx="${w * 0.66 + 6}" cy="${h * 0.48 + 6}" r="6" fill="#E2E8F0" />
    </svg>
  `;
}

function generarSvgPergolaBioclimatica(w: number, h: number): string {
  const numLamas = 16;
  const pasoLama = w / numLamas;
  let lamas = "";
  for (let i = 0; i < numLamas; i++) {
    const x = i * pasoLama;
    lamas += `
      <polygon points="${x},12 ${x + pasoLama * 0.7},22 ${x + pasoLama * 0.7},${h - 18} ${x},${h - 26}" fill="#1E293B" stroke="#0F172A" stroke-width="1" />
      <line x1="${x + pasoLama * 0.35}" y1="17" x2="${x + pasoLama * 0.35}" y2="${h - 22}" stroke="#475569" stroke-width="1.5" />
    `;
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
      <!-- Marco perimetral bioclimático con fascia -->
      <rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#0F172A" stroke-width="18" rx="4" />

      <!-- Celosías / Lamas orientables de aluminio -->
      ${lamas}

      <!-- Tira LED cálida perimetral de cortesía -->
      <rect x="12" y="12" width="${w - 24}" height="${h - 24}" fill="none" stroke="#FDE68A" stroke-width="2" stroke-opacity="0.35" />
    </svg>
  `;
}
