/**
 * Motor de Generación y Composición Visual Arquitectónica 3D de Fachadas
 * Proyecta pérgolas y portones con perspectiva espacial real, columnas al piso,
 * vigas estructurales, sombras arrojadas y materiales de alta definición.
 * SAUCEDA Bienes Raíces y Construcción
 */

export interface Punto2D {
  x: number; // 0.0 a 1.0 (normalizado)
  y: number; // 0.0 a 1.0 (normalizado)
}

export interface GeometriaVano3D {
  // Puntos clave de anclaje
  p_techo_izq: Punto2D;     // Anclaje muro/techo superior izquierdo
  p_techo_der: Punto2D;     // Anclaje muro/techo superior derecho
  p_piso_izq: Punto2D;      // Apoyo en piso/pasto inferior izquierdo
  p_piso_der: Punto2D;      // Apoyo en piso/pasto inferior derecho
  // Para pérgolas: profundidad del alero frontal
  profundidad_alero?: number; // 0.0 a 1.0
  altura_viga_muro?: number;  // 0.0 a 1.0
}

/**
 * Calcula una geometría 3D por defecto según el tipo de proyecto
 */
export function obtenerGeometriaInicial(
  tipo: "porton" | "pergola",
  bbox?: [number, number, number, number]
): GeometriaVano3D {
  if (tipo === "porton") {
    // Portón: vano vertical entre muros y piso
    const [ymin, xmin, ymax, xmax] = bbox || [0.2, 0.15, 0.9, 0.85];
    return {
      p_techo_izq: { x: xmin, y: ymin },
      p_techo_der: { x: xmax, y: ymin },
      p_piso_izq: { x: xmin, y: ymax },
      p_piso_der: { x: xmax, y: ymax },
    };
  } else {
    // Pérgola: estructura tridimensional con columnas al piso y techo en perspectiva
    // Por defecto abarca el jardín / terraza con caída hacia el frente
    return {
      p_techo_izq: { x: 0.15, y: 0.22 }, // Anclaje superior trasero izq (muro)
      p_techo_der: { x: 0.85, y: 0.18 }, // Anclaje superior trasero der (muro)
      p_piso_izq: { x: 0.18, y: 0.82 },  // Base columna frontal izquierda (piso)
      p_piso_der: { x: 0.82, y: 0.78 },  // Base columna frontal derecha (piso)
      profundidad_alero: 0.38,           // Altura donde conecta la viga frontal
    };
  }
}

/**
 * Renderiza el SVG con perspectiva espacial realista
 */
export function generarSvgArquitectonicoPerspectiva(
  modelId: string,
  geo: GeometriaVano3D,
  w: number = 1000,
  h: number = 700
): string {
  const esPergola = modelId.startsWith("pergola");

  if (esPergola) {
    return renderPergolaEspacial3D(modelId, geo, w, h);
  } else {
    return renderPortonPerspectiva3D(modelId, geo, w, h);
  }
}

/**
 * RENDER DE PÉRGOLAS EN PERSPECTIVA 3D
 * - Columnas estructurales que nacen del piso/césped
 * - Vigas de carga IPR frontales y perimetrales
 * - Viguetas transversales en perspectiva
 * - Cubierta reflectante (cristal ahumado, policarbonato o celosías)
 * - Sombra proyectada en el suelo
 */
function renderPergolaEspacial3D(
  modelId: string,
  geo: GeometriaVano3D,
  w: number,
  h: number
): string {
  // Coordenadas absolutas en píxeles
  const wallL = { x: geo.p_techo_izq.x * w, y: geo.p_techo_izq.y * h };
  const wallR = { x: geo.p_techo_der.x * w, y: geo.p_techo_der.y * h };
  const groundL = { x: geo.p_piso_izq.x * w, y: geo.p_piso_izq.y * h };
  const groundR = { x: geo.p_piso_der.x * w, y: geo.p_piso_der.y * h };

  // Altura del alero frontal (tope de las columnas frontales)
  // Generalmente un poco más bajo que el muro para pendiente de desagüe
  const colHeightFraction = 0.58; // Altura de columna relativa a la distancia piso-techo
  const roofFrontL = {
    x: groundL.x,
    y: wallL.y + (groundL.y - wallL.y) * (1 - colHeightFraction),
  };
  const roofFrontR = {
    x: groundR.x,
    y: wallR.y + (groundR.y - wallR.y) * (1 - colHeightFraction),
  };

  const grosorColumna = Math.max(14, Math.round(w * 0.022));
  const numViguetas = modelId === "pergola_bioclimatica" ? 18 : 7;

  // 1. SOMBRA EN EL SUELO (Sombra de las vigas sobre el césped/terraza)
  const sombraPoligono = `
    ${groundL.x - 30},${groundL.y + 10}
    ${groundR.x + 30},${groundR.y + 10}
    ${(wallR.x + groundR.x) * 0.5 + 40},${(wallR.y + groundR.y) * 0.5 + 40}
    ${(wallL.x + groundL.x) * 0.5 - 40},${(wallL.y + groundL.y) * 0.5 + 40}
  `;

  let sombraRayas = "";
  for (let i = 1; i <= numViguetas; i++) {
    const t = i / (numViguetas + 1);
    const sx1 = groundL.x + (groundR.x - groundL.x) * t;
    const sy1 = groundL.y + (groundR.y - groundL.y) * t + 5;
    const sx2 = (wallL.x + (wallR.x - wallL.x) * t + sx1) * 0.5;
    const sy2 = (wallL.y + (wallR.y - wallL.y) * t + sy1) * 0.5;
    sombraRayas += `
      <line x1="${sx1}" y1="${sy1}" x2="${sx2}" y2="${sy2}" stroke="#000000" stroke-width="${modelId === "pergola_bioclimatica" ? 8 : 16}" stroke-opacity="0.25" stroke-linecap="round"/>
    `;
  }

  // 2. VIGUETAS EN PERSPECTIVA (Del muro hacia la viga frontal)
  let viguetasSvg = "";
  for (let i = 0; i <= numViguetas; i++) {
    const t = i / numViguetas;
    const pWall = {
      x: wallL.x + (wallR.x - wallL.x) * t,
      y: wallL.y + (wallR.y - wallL.y) * t,
    };
    const pFront = {
      x: roofFrontL.x + (roofFrontR.x - roofFrontL.x) * t,
      y: roofFrontL.y + (roofFrontR.y - roofFrontL.y) * t,
    };

    if (modelId === "pergola_bioclimatica") {
      // Lamas orientables con sombreado dinámico
      viguetasSvg += `
        <polygon points="${pWall.x - 3},${pWall.y - 6} ${pFront.x - 4},${pFront.y - 8} ${pFront.x + 4},${pFront.y} ${pWall.x + 3},${pWall.y}" fill="#1E293B" stroke="#0F172A" stroke-width="1.5" />
        <line x1="${pWall.x}" y1="${pWall.y - 4}" x2="${pFront.x}" y2="${pFront.y - 6}" stroke="#64748B" stroke-width="1.5"/>
      `;
    } else {
      // Vigas estructurales de acero tipo IPR/PTR en color grafito mate
      viguetasSvg += `
        <polygon points="${pWall.x - 5},${pWall.y} ${pFront.x - 6},${pFront.y} ${pFront.x - 6},${pFront.y + 14} ${pWall.x - 5},${pWall.y + 10}" fill="#1A202C" />
        <polygon points="${pWall.x - 5},${pWall.y} ${pFront.x - 6},${pFront.y} ${pFront.x + 6},${pFront.y} ${pWall.x + 5},${pWall.y}" fill="#2D3748" />
        <polygon points="${pWall.x + 5},${pWall.y} ${pFront.x + 6},${pFront.y} ${pFront.x + 6},${pFront.y + 14} ${pWall.x + 5},${pWall.y + 10}" fill="#111827" />
      `;
    }
  }

  // 3. MATERIAL DE LA CUBIERTA DEL TECHO (Polígono en perspectiva)
  const roofPoly = `${wallL.x},${wallL.y} ${wallR.x},${wallR.y} ${roofFrontR.x},${roofFrontR.y} ${roofFrontL.x},${roofFrontL.y}`;
  let cubiertaSvg = "";

  if (modelId === "pergola_cristal") {
    // Cristal templado reflectante 9.5mm con reflejos celestes y biseles
    cubiertaSvg = `
      <polygon points="${roofPoly}" fill="url(#cristalGrad)" stroke="#93C5FD" stroke-width="2" stroke-opacity="0.8"/>
      <!-- Reflejos especulares diagonales de sol -->
      <polygon points="${wallL.x + 40},${wallL.y + 10} ${(wallL.x + wallR.x) * 0.5},${(wallL.y + wallR.y) * 0.5} ${(roofFrontL.x + roofFrontR.x) * 0.3},${roofFrontL.y - 5} ${roofFrontL.x + 20},${roofFrontL.y}" fill="#FFFFFF" fill-opacity="0.22"/>
      <!-- Arañas de fijación de acero inoxidable -->
      <circle cx="${(wallL.x + roofFrontL.x) * 0.5}" cy="${(wallL.y + roofFrontL.y) * 0.5}" r="7" fill="#E2E8F0" stroke="#475569" stroke-width="2"/>
      <circle cx="${(wallR.x + roofFrontR.x) * 0.5}" cy="${(wallR.y + roofFrontR.y) * 0.5}" r="7" fill="#E2E8F0" stroke="#475569" stroke-width="2"/>
    `;
  } else if (modelId === "pergola_estructural") {
    // Policarbonato alveolar bronce con textura acanalada anti-rayos UV
    cubiertaSvg = `
      <polygon points="${roofPoly}" fill="url(#policarbonatoGrad)" stroke="#D97706" stroke-width="2" stroke-opacity="0.6"/>
      <!-- Perfiles de unión H de aluminio anodizado -->
      <line x1="${(wallL.x + wallR.x) * 0.33}" y1="${(wallL.y + wallR.y) * 0.33}" x2="${(roofFrontL.x + roofFrontR.x) * 0.33}" y2="${(roofFrontL.y + roofFrontR.y) * 0.33}" stroke="#B45309" stroke-width="3"/>
      <line x1="${(wallL.x + wallR.x) * 0.66}" y1="${(wallL.y + wallR.y) * 0.66}" x2="${(roofFrontL.x + roofFrontR.x) * 0.66}" y2="${(roofFrontL.y + roofFrontR.y) * 0.66}" stroke="#B45309" stroke-width="3"/>
    `;
  }

  // 4. COLUMNAS ESTRUCTURALES Y BASES AL PISO
  const columnaIzquierdaSvg = `
    <!-- Placa de anclaje inferior en piso -->
    <polygon points="${groundL.x - grosorColumna},${groundL.y + 6} ${groundL.x + grosorColumna * 1.3},${groundL.y + 6} ${groundL.x + grosorColumna},${groundL.y - 4} ${groundL.x - grosorColumna * 0.7},${groundL.y - 4}" fill="#0F172A" />
    <circle cx="${groundL.x - grosorColumna * 0.5}" cy="${groundL.y + 1}" r="2.5" fill="#94A3B8"/>
    <circle cx="${groundL.x + grosorColumna * 0.7}" cy="${groundL.y + 1}" r="2.5" fill="#94A3B8"/>

    <!-- Fuste de columna PTR 4"x4" con bisel de luz -->
    <polygon points="${groundL.x - grosorColumna * 0.5},${groundL.y} ${groundL.x + grosorColumna * 0.5},${groundL.y} ${roofFrontL.x + grosorColumna * 0.5},${roofFrontL.y} ${roofFrontL.x - grosorColumna * 0.5},${roofFrontL.y}" fill="#1E293B" filter="url(#sombraEstructural)"/>
    <line x1="${groundL.x - grosorColumna * 0.2}" y1="${groundL.y}" x2="${roofFrontL.x - grosorColumna * 0.2}" y2="${roofFrontL.y}" stroke="#475569" stroke-width="2"/>
  `;

  const columnaDerechaSvg = `
    <!-- Placa de anclaje inferior en piso -->
    <polygon points="${groundR.x - grosorColumna * 1.3},${groundR.y + 6} ${groundR.x + grosorColumna},${groundR.y + 6} ${groundR.x + grosorColumna * 0.7},${groundR.y - 4} ${groundR.x - grosorColumna},${groundR.y - 4}" fill="#0F172A" />
    <circle cx="${groundR.x - grosorColumna * 0.7}" cy="${groundR.y + 1}" r="2.5" fill="#94A3B8"/>
    <circle cx="${groundR.x + grosorColumna * 0.5}" cy="${groundR.y + 1}" r="2.5" fill="#94A3B8"/>

    <!-- Fuste de columna PTR 4"x4" -->
    <polygon points="${groundR.x - grosorColumna * 0.5},${groundR.y} ${groundR.x + grosorColumna * 0.5},${groundR.y} ${roofFrontR.x + grosorColumna * 0.5},${roofFrontR.y} ${roofFrontR.x - grosorColumna * 0.5},${roofFrontR.y}" fill="#1E293B" filter="url(#sombraEstructural)"/>
    <line x1="${groundR.x + grosorColumna * 0.2}" y1="${groundR.y}" x2="${roofFrontR.x + grosorColumna * 0.2}" y2="${roofFrontR.y}" stroke="#475569" stroke-width="2"/>
  `;

  // 5. VIGA PRINCIPAL FRONTAL (Header cargador sobre las columnas)
  const vigaFrontalSvg = `
    <polygon points="${roofFrontL.x - grosorColumna * 0.8},${roofFrontL.y - 12} ${roofFrontR.x + grosorColumna * 0.8},${roofFrontR.y - 12} ${roofFrontR.x + grosorColumna * 0.8},${roofFrontR.y + 14} ${roofFrontL.x - grosorColumna * 0.8},${roofFrontL.y + 14}" fill="#0F172A" stroke="#1E293B" stroke-width="2" filter="url(#sombraEstructural)"/>
    <line x1="${roofFrontL.x - grosorColumna * 0.8}" y1="${roofFrontL.y}" x2="${roofFrontR.x + grosorColumna * 0.8}" y2="${roofFrontR.y}" stroke="#475569" stroke-width="2"/>

    <!-- Tira de luz LED cálida integrada debajo de la viga frontal -->
    <line x1="${roofFrontL.x + grosorColumna}" y1="${roofFrontL.y + 13}" x2="${roofFrontR.x - grosorColumna}" y2="${roofFrontR.y + 13}" stroke="#FEF08A" stroke-width="3" stroke-opacity="0.8" filter="url(#brilloLed)"/>
  `;

  // 6. VIGA TRASERA DE ANCLAJE A MURO
  const vigaMuroSvg = `
    <polygon points="${wallL.x - 10},${wallL.y - 10} ${wallR.x + 10},${wallR.y - 10} ${wallR.x + 10},${wallR.y + 12} ${wallL.x - 10},${wallL.y + 12}" fill="#181D24" stroke="#0B0E14" stroke-width="1.5" />
    <line x1="${wallL.x - 10}" y1="${wallL.y - 8}" x2="${wallR.x + 10}" y2="${wallR.y - 8}" stroke="#334155" stroke-width="2"/>
  `;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
      <defs>
        <!-- Gradientes arquitectónicos fotorrealistas -->
        <linearGradient id="cristalGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#93C5FD" stop-opacity="0.38"/>
          <stop offset="30%" stop-color="#DBEAFE" stop-opacity="0.52"/>
          <stop offset="65%" stop-color="#60A5FA" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="#1D4ED8" stop-opacity="0.35"/>
        </linearGradient>

        <linearGradient id="policarbonatoGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#D97706" stop-opacity="0.38"/>
          <stop offset="40%" stop-color="#F59E0B" stop-opacity="0.48"/>
          <stop offset="100%" stop-color="#78350F" stop-opacity="0.42"/>
        </linearGradient>

        <filter id="sombraEstructural" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="8" flood-color="#000000" flood-opacity="0.55"/>
        </filter>

        <filter id="brilloLed" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="4" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      <!-- Capa 1: Sombra arrojada en el piso/pasto -->
      <polygon points="${sombraPoligono}" fill="#000000" fill-opacity="0.22" filter="url(#sombraEstructural)"/>
      ${sombraRayas}

      <!-- Capa 2: Viga trasera anclada al muro -->
      ${vigaMuroSvg}

      <!-- Capa 3: Viguetas estructurales -->
      ${viguetasSvg}

      <!-- Capa 4: Cubierta reflectante (Cristal o Policarbonato) -->
      ${cubiertaSvg}

      <!-- Capa 5: Columnas al piso con bases sólidas -->
      ${columnaIzquierdaSvg}
      ${columnaDerechaSvg}

      <!-- Capa 6: Viga cargadora frontal con tira LED -->
      ${vigaFrontalSvg}
    </svg>
  `;
}

/**
 * RENDER DE PORTÓN EN PERSPECTIVA 3D
 * - Encaje en 4 vértices del vano con perspectiva real
 * - Marco perimetral reforzado con solera
 * - Duelas horizontales con relieve y textura metálica / madera teka
 * - Jaladeras cilíndricas de acero inox con sombras realistas
 */
function renderPortonPerspectiva3D(
  modelId: string,
  geo: GeometriaVano3D,
  w: number,
  h: number
): string {
  const tl = { x: geo.p_techo_izq.x * w, y: geo.p_techo_izq.y * h };
  const tr = { x: geo.p_techo_der.x * w, y: geo.p_techo_der.y * h };
  const bl = { x: geo.p_piso_izq.x * w, y: geo.p_piso_izq.y * h };
  const br = { x: geo.p_piso_der.x * w, y: geo.p_piso_der.y * h };

  const numDuelas = 13;
  let panelesSvg = "";

  for (let i = 0; i < numDuelas; i++) {
    const t0 = i / numDuelas;
    const t1 = (i + 1) / numDuelas;

    // Coordenadas cuadrilátero de cada duela
    const p1 = { x: tl.x + (bl.x - tl.x) * t0, y: tl.y + (bl.y - tl.y) * t0 };
    const p2 = { x: tr.x + (br.x - tr.x) * t0, y: tr.y + (br.y - tr.y) * t0 };
    const p3 = { x: tr.x + (br.x - tr.x) * t1, y: tr.y + (br.y - tr.y) * t1 };
    const p4 = { x: tl.x + (bl.x - tl.x) * t1, y: tl.y + (bl.y - tl.y) * t1 };

    if (modelId === "porton_mixto") {
      // Madera teka sintética con vetas y acero negro
      const fillMadera = i % 2 === 0 ? "url(#maderaTeka1)" : "url(#maderaTeka2)";
      panelesSvg += `
        <polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}" fill="${fillMadera}" stroke="#1E1611" stroke-width="2"/>
        <line x1="${p4.x}" y1="${p4.y}" x2="${p3.x}" y2="${p3.y}" stroke="#0F0C0A" stroke-width="2.5"/>
      `;
    } else if (modelId === "porton_laser") {
      // Corte láser con patrones CNC
      const fillLaser = i % 2 === 0 ? "#1E293B" : "#161E2E";
      panelesSvg += `
        <polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}" fill="${fillLaser}" stroke="#0F172A" stroke-width="1.5"/>
        <!-- Perforaciones geométricas decorativas -->
        <circle cx="${(p1.x + p2.x) * 0.3}" cy="${(p1.y + p4.y) * 0.5}" r="6" fill="#090D14"/>
        <circle cx="${(p1.x + p2.x) * 0.5}" cy="${(p1.y + p4.y) * 0.5}" r="8" fill="#090D14"/>
        <circle cx="${(p1.x + p2.x) * 0.7}" cy="${(p1.y + p4.y) * 0.5}" r="6" fill="#090D14"/>
      `;
    } else {
      // Duela horizontal de acero grafito contemporánea
      const fillDuela = i % 2 === 0 ? "url(#aceroGrafito1)" : "url(#aceroGrafito2)";
      panelesSvg += `
        <polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}" fill="${fillDuela}" stroke="#101720" stroke-width="1.5"/>
        <line x1="${p1.x}" y1="${p1.y + 2}" x2="${p2.x}" y2="${p2.y + 2}" stroke="#4A5568" stroke-width="1" stroke-opacity="0.6"/>
        <line x1="${p4.x}" y1="${p4.y}" x2="${p3.x}" y2="${p3.y}" stroke="#0A0E14" stroke-width="2"/>
      `;
    }
  }

  // Poste vertical divisorio central
  const midTop = { x: (tl.x + tr.x) * 0.5, y: (tl.y + tr.y) * 0.5 };
  const midBot = { x: (bl.x + br.x) * 0.5, y: (bl.y + br.y) * 0.5 };

  // Jaladera de acero inoxidable vertical
  const jTop = { x: tr.x * 0.88 + tl.x * 0.12, y: tr.y + (br.y - tr.y) * 0.38 };
  const jBot = { x: tr.x * 0.88 + tl.x * 0.12, y: tr.y + (br.y - tr.y) * 0.65 };

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" height="100%">
      <defs>
        <linearGradient id="aceroGrafito1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#333D4B"/>
          <stop offset="35%" stop-color="#252D37"/>
          <stop offset="100%" stop-color="#181E25"/>
        </linearGradient>

        <linearGradient id="aceroGrafito2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2B3441"/>
          <stop offset="35%" stop-color="#1F252E"/>
          <stop offset="100%" stop-color="#14181E"/>
        </linearGradient>

        <linearGradient id="maderaTeka1" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#784421"/>
          <stop offset="30%" stop-color="#8F542C"/>
          <stop offset="70%" stop-color="#7A4623"/>
          <stop offset="100%" stop-color="#643719"/>
        </linearGradient>

        <linearGradient id="maderaTeka2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#6E3D1D"/>
          <stop offset="40%" stop-color="#854E27"/>
          <stop offset="80%" stop-color="#734120"/>
          <stop offset="100%" stop-color="#5A3015"/>
        </linearGradient>

        <linearGradient id="inoxGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#94A3B8"/>
          <stop offset="50%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="#64748B"/>
        </linearGradient>

        <filter id="sombraPorton" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="12" stdDeviation="10" flood-color="#000000" flood-opacity="0.6"/>
        </filter>
      </defs>

      <!-- Sombra de encaje en el vano -->
      <polygon points="${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}" fill="#000000" fill-opacity="0.45" filter="url(#sombraPorton)"/>

      <!-- Paneles horizontales en perspectiva -->
      ${panelesSvg}

      <!-- Marco perimetral estructural PTR -->
      <polygon points="${tl.x},${tl.y} ${tr.x},${tr.y} ${br.x},${br.y} ${bl.x},${bl.y}" fill="none" stroke="#0F172A" stroke-width="12"/>

      <!-- Poste vertical de refuerzo central -->
      <line x1="${midTop.x}" y1="${midTop.y}" x2="${midBot.x}" y2="${midBot.y}" stroke="#0F172A" stroke-width="10"/>

      <!-- Jaladera de lujo en acero inoxidable 304 -->
      <line x1="${jTop.x}" y1="${jTop.y}" x2="${jBot.x}" y2="${jBot.y}" stroke="url(#inoxGrad)" stroke-width="9" stroke-linecap="round" filter="url(#sombraPorton)"/>
      <circle cx="${jTop.x}" cy="${jTop.y}" r="6" fill="#475569"/>
      <circle cx="${jBot.x}" cy="${jBot.y}" r="6" fill="#475569"/>
    </svg>
  `;
}
