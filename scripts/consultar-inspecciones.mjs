import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  console.log("=== 1. BUSCANDO TODAS LAS INSPECCIONES EN AGENDA_CITAS ===");
  const { data: citas = [], error: errCitas } = await sb
    .from("agenda_citas")
    .select(`
      id,
      fecha,
      hora_inicio,
      hora_fin,
      tipo_cita,
      estado,
      expediente_id,
      prospecto_id,
      cliente_nombre,
      cliente_telefono,
      fraccionamiento,
      notas,
      perfil_id,
      asignados_ids
    `)
    .order("fecha", { ascending: false });

  if (errCitas) console.error("Error al leer agenda_citas:", errCitas);

  // Obtener perfiles para mapear nombres
  const { data: perfiles = [] } = await sb.from("perfiles").select("id, nombre, rol");
  const mapPerfiles = new Map((perfiles || []).map((p) => [p.id, p.nombre]));

  // Obtener todos los expedientes
  const { data: expedientes = [] } = await sb
    .from("expedientes")
    .select("id, prospecto_id, cliente, fraccionamiento, direccion_propiedad, etapa, tipo_negocio, asesor_id, operador_id");
  const mapExpedientes = new Map((expedientes || []).map((e) => [e.id, e]));

  // Agrupar expedientes por prospecto_id
  const mapExpedientesPorProspecto = new Map();
  for (const exp of expedientes || []) {
    if (exp.prospecto_id) {
      if (!mapExpedientesPorProspecto.has(exp.prospecto_id)) {
        mapExpedientesPorProspecto.set(exp.prospecto_id, []);
      }
      mapExpedientesPorProspecto.get(exp.prospecto_id).push(exp);
    }
  }

  // Prospectos
  const { data: prospectos = [] } = await sb
    .from("prospectos")
    .select("id, nombre, primer_apellido, direccion, ciudad, asesor_id, operador_id");
  const mapProspectos = new Map((prospectos || []).map((p) => [p.id, p]));

  console.log(`Total citas en agenda: ${citas?.length || 0}`);

  const resultadoCitas = [];
  for (const c of citas || []) {
    const esInspeccion =
      c.tipo_cita === "inspeccion" ||
      c.tipo_cita === "visita" ||
      (c.notas && c.notas.toLowerCase().includes("inspección")) ||
      (c.notas && c.notas.toLowerCase().includes("inspeccion"));

    // Buscar expediente directo o por prospecto
    let exp = c.expediente_id ? mapExpedientes.get(c.expediente_id) : null;
    if (!exp && c.prospecto_id) {
      const exps = mapExpedientesPorProspecto.get(c.prospecto_id) || [];
      if (exps.length > 0) exp = exps[0];
    }

    const prsp = c.prospecto_id ? mapProspectos.get(c.prospecto_id) : null;

    // Asesor asignado
    let asesorNombre = mapPerfiles.get(c.perfil_id);
    if (!asesorNombre && c.asignados_ids && c.asignados_ids.length > 0) {
      asesorNombre = c.asignados_ids.map((id) => mapPerfiles.get(id) || id).join(" y ");
    }
    if (!asesorNombre && exp?.asesor_id) {
      asesorNombre = mapPerfiles.get(exp.asesor_id);
    }
    if (!asesorNombre && prsp?.asesor_id) {
      asesorNombre = mapPerfiles.get(prsp.asesor_id);
    }

    // Dirección o Colonia
    const direccionOColonia =
      c.fraccionamiento ||
      exp?.fraccionamiento ||
      exp?.direccion_propiedad ||
      prsp?.direccion ||
      prsp?.ciudad ||
      "No registrada";

    if (esInspeccion || c.tipo_cita === "instalacion") {
      resultadoCitas.push({
        id: c.id,
        fecha: c.fecha,
        hora: c.hora_inicio ? c.hora_inicio.slice(0, 5) : "",
        tipo: c.tipo_cita,
        estado: c.estado,
        cliente: c.cliente_nombre || (prsp ? `${prsp.nombre} ${prsp.primer_apellido || ""}`.trim() : "Cliente"),
        expediente: exp ? exp.id : (c.expediente_id || "Sin expediente"),
        colonia_direccion: direccionOColonia,
        asesor_asignado: asesorNombre || "Sin asignar",
        notas: c.notas || "",
      });
    }
  }

  console.log("\n--- RESULTADO DE INSPECCIONES EN AGENDA ---");
  console.table(resultadoCitas);

  // 2. Revisar reportes de visitas técnicas
  console.log("\n=== 2. REPORTES DE VISITAS TÉCNICAS (visitas_reportes) ===");
  const { data: reportes = [] } = await sb.from("visitas_reportes").select("*");
  const { data: cotizaciones = [] } = await sb.from("cotizaciones").select("id, prospecto_id, expediente_id, servicio_tipo");
  const mapCotizaciones = new Map((cotizaciones || []).map((c) => [c.id, c]));

  const resultadoReportes = [];
  for (const r of reportes || []) {
    const cot = mapCotizaciones.get(r.cotizacion_id);
    let exp = cot?.expediente_id ? mapExpedientes.get(cot.expediente_id) : null;
    let prsp = cot?.prospecto_id ? mapProspectos.get(cot.prospecto_id) : null;

    const fechaFormat = r.fecha_inspeccion ? r.fecha_inspeccion.slice(0, 10) : (r.created_at ? r.created_at.slice(0, 10) : "");
    const inspectorNombre = mapPerfiles.get(r.inspector_id) || r.medidas?.tecnicoNombre || "Alejandro";

    const direccionOColonia =
      exp?.fraccionamiento ||
      exp?.direccion_propiedad ||
      prsp?.direccion ||
      prsp?.ciudad ||
      "No registrada";

    resultadoReportes.push({
      id: r.id,
      fecha: fechaFormat,
      cotizacion: r.cotizacion_id,
      expediente: exp ? exp.id : (cot?.expediente_id || "Sin expediente"),
      cliente: prsp ? `${prsp.nombre} ${prsp.primer_apellido || ""}`.trim() : "Cliente",
      colonia_direccion: direccionOColonia,
      inspector_asesor: inspectorNombre,
      observaciones: r.observaciones_tecnicas || r.condiciones_sitio || "",
    });
  }

  console.table(resultadoReportes);

  // 3. Revisar expedientes con etapa 'visita' o 'inspeccion'
  console.log("\n=== 3. EXPEDIENTES EN ETAPA DE VISITA / INSPECCIÓN ===");
  const expsVisita = (expedientes || []).filter(
    (e) => e.etapa === "visita" || e.etapa === "inspeccion" || e.etapa === "inspeccion_programada"
  );
  console.log(`Total expedientes en etapa visita/inspección: ${expsVisita.length}`);
  const resultadoExps = expsVisita.map((e) => {
    const asesor = mapPerfiles.get(e.asesor_id) || mapPerfiles.get(e.operador_id) || "Sin asignar";
    return {
      expediente: e.id,
      cliente: e.cliente,
      etapa: e.etapa,
      tipo_negocio: e.tipo_negocio,
      colonia_direccion: e.fraccionamiento || e.direccion_propiedad || "No registrada",
      asesor_asignado: asesor,
    };
  });
  console.table(resultadoExps);
}

main().catch(console.error);
