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
  // 1. Perfiles
  const { data: perfiles = [] } = await sb.from("perfiles").select("id, nombre, rol, telefono");
  const pMap = new Map((perfiles || []).map((p) => [p.id, p]));

  // 2. Prospectos
  const { data: prospectos = [] } = await sb.from("prospectos").select("*");
  const prspMap = new Map((prospectos || []).map((p) => [p.id, p]));

  // 3. Expedientes
  const { data: expedientes = [] } = await sb.from("expedientes").select("*");
  const expMap = new Map((expedientes || []).map((e) => [e.id, e]));

  // 4. Agenda Citas
  const { data: citas = [] } = await sb.from("agenda_citas").select("*").order("fecha", { ascending: false });

  // 5. Visitas Reportes
  const { data: reportes = [] } = await sb.from("visitas_reportes").select("*");

  // 6. Cotizaciones
  const { data: cotizaciones = [] } = await sb.from("cotizaciones").select("*");

  const todasInspecciones = [];

  // A. De Agenda Citas
  for (const c of citas || []) {
    const esInspeccion =
      c.tipo_cita === "inspeccion" ||
      c.tipo_cita === "visita" ||
      (c.notas && c.notas.toLowerCase().includes("inspeccion")) ||
      (c.notas && c.notas.toLowerCase().includes("inspección"));

    if (esInspeccion || c.tipo_cita === "instalacion") {
      let exp = c.expediente_id ? expMap.get(c.expediente_id) : null;
      let prsp = c.prospecto_id ? prspMap.get(c.prospecto_id) : null;
      if (!exp && prsp) {
        exp = expedientes.find((e) => e.prospecto_id === prsp.id);
      }

      const asesor =
        pMap.get(c.perfil_id)?.nombre ||
        (c.asignados_ids?.length ? c.asignados_ids.map((id) => pMap.get(id)?.nombre || id).join(", ") : null) ||
        pMap.get(exp?.asesor_id)?.nombre ||
        pMap.get(prsp?.asesor_id)?.nombre ||
        "Sin asignar";

      const dir =
        c.fraccionamiento ||
        exp?.fraccionamiento ||
        exp?.direccion_propiedad ||
        prsp?.direccion ||
        prsp?.ciudad ||
        "No especificada";

      todasInspecciones.push({
        origen: "agenda_citas",
        id_registro: c.id,
        fecha: c.fecha,
        hora: c.hora_inicio ? c.hora_inicio.slice(0, 5) : "--:--",
        expediente: exp?.id || c.expediente_id || "Sin expediente",
        prospecto_id: prsp?.id || c.prospecto_id || "N/A",
        cliente: c.cliente_nombre || (prsp ? `${prsp.nombre} ${prsp.primer_apellido || ""}`.trim() : "Cliente"),
        telefono: c.cliente_telefono || prsp?.telefono || "N/A",
        colonia_direccion: dir,
        servicio: c.servicio_tipo || exp?.tipo_negocio || "inspeccion",
        asesor_asignado: asesor,
        estado: c.estado,
        notas: c.notas || "",
      });
    }
  }

  // B. De Visitas Reportes (Levantamientos ya hechos)
  for (const r of reportes || []) {
    const cot = cotizaciones.find((c) => c.id === r.cotizacion_id);
    const exp = cot?.expediente_id ? expMap.get(cot.expediente_id) : null;
    const prsp = cot?.prospecto_id ? prspMap.get(cot.prospecto_id) : null;

    const fechaInspeccion = r.fecha_inspeccion
      ? r.fecha_inspeccion.slice(0, 10)
      : r.created_at
      ? r.created_at.slice(0, 10)
      : "--";
    const hora = r.medidas?.horaVisita || "--:--";

    const asesor =
      pMap.get(r.inspector_id)?.nombre ||
      r.medidas?.tecnicoNombre ||
      pMap.get(exp?.asesor_id)?.nombre ||
      "Alejandro";

    const dir =
      exp?.fraccionamiento ||
      exp?.direccion_propiedad ||
      prsp?.direccion ||
      prsp?.ciudad ||
      "No registrada";

    todasInspecciones.push({
      origen: "visitas_reportes",
      id_registro: r.id,
      fecha: fechaInspeccion,
      hora,
      expediente: exp?.id || cot?.expediente_id || "Sin expediente",
      prospecto_id: prsp?.id || cot?.prospecto_id || "N/A",
      cliente: prsp ? `${prsp.nombre} ${prsp.primer_apellido || ""}`.trim() : exp?.cliente || "Cliente",
      telefono: prsp?.telefono || exp?.telefono || "N/A",
      colonia_direccion: dir,
      servicio: cot?.servicio_tipo || exp?.tipo_negocio || "impermeabilizacion",
      asesor_asignado: asesor,
      estado: "completada",
      notas: r.observaciones_tecnicas || r.condiciones_sitio || "Levantamiento técnico realizado con fotografías",
    });
  }

  // C. De Cotizaciones con visita programada / solicitada que no estén ya en la lista
  for (const cot of cotizaciones || []) {
    if (cot.requiere_visita || cot.fecha_visita) {
      const exp = cot.expediente_id ? expMap.get(cot.expediente_id) : null;
      const prsp = cot.prospecto_id ? prspMap.get(cot.prospecto_id) : null;

      // Verificar si ya está en la lista por expediente o prospecto
      const yaExiste = todasInspecciones.some(
        (t) => (t.expediente !== "Sin expediente" && t.expediente === exp?.id) || (prsp && t.prospecto_id === prsp.id)
      );

      if (!yaExiste) {
        const fechaVisita = cot.fecha_visita ? cot.fecha_visita.slice(0, 10) : cot.created_at.slice(0, 10);
        const hora = cot.fecha_visita ? cot.fecha_visita.slice(11, 16) : "--:--";

        const asesor =
          pMap.get(cot.inspector_id)?.nombre ||
          pMap.get(exp?.asesor_id)?.nombre ||
          pMap.get(exp?.operador_id)?.nombre ||
          pMap.get(prsp?.asesor_id)?.nombre ||
          "Por asignar";

        const dir =
          exp?.fraccionamiento ||
          exp?.direccion_propiedad ||
          prsp?.direccion ||
          prsp?.ciudad ||
          "Por definir";

        todasInspecciones.push({
          origen: "cotizaciones",
          id_registro: cot.id,
          fecha: fechaVisita,
          hora,
          expediente: exp?.id || "Sin expediente",
          prospecto_id: prsp?.id || "N/A",
          cliente: prsp ? `${prsp.nombre} ${prsp.primer_apellido || ""}`.trim() : exp?.cliente || "Cliente",
          telefono: prsp?.telefono || exp?.telefono || "N/A",
          colonia_direccion: dir,
          servicio: cot.servicio_tipo || exp?.tipo_negocio || "impermeabilizacion",
          asesor_asignado: asesor,
          estado: cot.estatus === "esperando_visita" ? "esperando_visita" : cot.estatus,
          notas: cot.notas_internas || `Cotización ${cot.id} (${cot.servicio_tipo})`,
        });
      }
    }
  }

  // D. De Expedientes en etapa 'visita' que no estén ya en la lista
  for (const exp of expedientes || []) {
    if (exp.etapa === "visita") {
      const prsp = exp.prospecto_id ? prspMap.get(exp.prospecto_id) : null;
      const yaExiste = todasInspecciones.some((t) => t.expediente === exp.id);

      if (!yaExiste) {
        const fecha = exp.fecha_fotos_agendadas || exp.fecha_confirmacion || exp.created_at.slice(0, 10);
        const asesor =
          pMap.get(exp.asesor_id)?.nombre ||
          pMap.get(exp.operador_id)?.nombre ||
          pMap.get(prsp?.asesor_id)?.nombre ||
          "Por asignar";

        const dir = exp.fraccionamiento || exp.direccion_propiedad || prsp?.direccion || "Por definir";

        todasInspecciones.push({
          origen: "expedientes",
          id_registro: exp.id,
          fecha,
          hora: "--:--",
          expediente: exp.id,
          prospecto_id: prsp?.id || "N/A",
          cliente: exp.cliente || (prsp ? `${prsp.nombre} ${prsp.primer_apellido || ""}`.trim() : "Cliente"),
          telefono: exp.telefono || prsp?.telefono || "N/A",
          colonia_direccion: dir,
          servicio: exp.tipo_negocio || "inspeccion",
          asesor_asignado: asesor,
          estado: "visita_solicitada",
          notas: exp.necesidad || exp.notas || "En etapa visita en embudo",
        });
      }
    }
  }

  console.log(`\nTOTAL DE REGISTROS DE INSPECCIÓN CONSOLIDADOS: ${todasInspecciones.length}\n`);
  console.log(JSON.stringify(todasInspecciones, null, 2));
}

main().catch(console.error);
