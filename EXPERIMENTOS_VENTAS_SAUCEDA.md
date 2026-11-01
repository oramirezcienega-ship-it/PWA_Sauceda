# Bitácora de Experimentos Comerciales y Optimización de Ventas · SAUCEDA

> **Objetivo:** Registro científico y auditable de hipótesis comerciales, variantes de flujo en IA (Sofía), lead scoring y contraste de resultados entre cohortes para maximizar la tasa de conversión a visitas técnicas y ventas cerradas.

---

## 📌 Experimento 01: Optimización de Conversión en Impermeabilización (Holdout 90/10)

| Parámetro | Detalle |
| :--- | :--- |
| **Línea de Negocio** | Impermeabilización (`construccion-impermeabilizacion`) |
| **Fecha de Inicio** | 01 de Noviembre de 2026 |
| **Duración Estimada** | 15 días (Cierre de cohorte: 15 de Noviembre de 2026) |
| **Población Objetivo** | Leads nuevos entrantes por WhatsApp y pautas de Meta / Google en León, Gto. |
| **Distribución de Tráfico** | **90% Variante Optimizada (`variante_v2`)** vs **10% Grupo Control (`control_v1`)** |
| **Línea Base Histórica (Octubre 2026)** | 174 expedientes · 62% congelados en `contactado` · 83% sin oferta de visita · 1 venta (\$28,670) |

---

### 1. Hipótesis Comercial

1. **Hipótesis 1 (Residencial Premium / Tier 1):** En clientes de fraccionamientos residenciales de alta plusvalía (*Mayorazgo, Gran Jardín, El Molino, Campestre, Sierra Nogal, Punta del Este, etc.*), eliminar el cuestionario de metros cuadrados e inmediatamente ofrecer la inspección técnica presencial o llamada del especialista aumentará la tasa de agendamiento de visitas de un 5% a más del 30%.
2. **Hipótesis 2 (Urgente / Gotera Activa):** El cliente con daño activo o gotera no quiere teoría; conectar de inmediato con la visita de auxilio técnico sin costo en menos de 24 horas evitará que busque a otro proveedor local.
3. **Hipótesis 3 (Cuidadoso / Infonavit):** Ofrecer un paquete cerrado orientativo (\$11,250 MXN por ~50 m² con manto de 3.5mm y 5 años de garantía) disipará el miedo al costo por metro y aumentará la respuesta al segundo mensaje en más de un 40%.
4. **Hipótesis 4 (Lead Scoring >= 75):** Los prospectos con score $\ge 75$ asignados inmediatamente para llamada del técnico cerrarán más del 60% de las visitas en contratos firmados.

---

### 2. Configuración Técnica en Sistema

* **Columnas creadas en `expedientes` y `prospectos`:**
  * `lead_score`: Entero (0 a 100 puntos).
  * `arquetipo`: `urgente_dano` | `residencial_premium` | `cuidadoso_infonavit` | `curioso_general`.
  * `zona_tier`: `tier_1_premium` | `tier_2_medio` | `tier_3_popular`.
  * `experimento_flujo`: `variante_v2` (90%) | `control_v1` (10%).
* **Motor de Scoring (`src/lib/lead-scoring.ts`):**
  * Puntos por Ubicación Tier 1 (+20 pts).
  * Puntos por Metraje amplio (+15 pts).
  * Puntos por Compartir Ubicación GPS / Maps (+20 pts).
  * Puntos por Preguntar Fecha / Agenda / Cita (+15 pts).
  * Puntos por Solicitar Llamada (+15 pts).
  * Alerta VIP: Gatillo automático cuando `score >= 75`.

---

### 3. Métricas y KPIs de Evaluación

$$\text{Tasa de Agendamiento de Visitas} = \frac{\text{Visitas Agendadas}}{\text{Total Leads Entrantes}}$$

$$\text{Tasa de Congelamiento en Contactado} = \frac{\text{Leads estancados en contactado}}{\text{Total Leads Entrantes}}$$

$$\text{Facturación Cerrada Total (\$ MXN)}$$

| Métrica | Línea Base (Octubre - Control Histórico) | Meta Cohorte Noviembre (`variante_v2`) |
| :--- | :---: | :---: |
| **Tasa de Visitas Agendadas** | 1.1% (2 visitas de 174) | **$\ge 20\%$** |
| **Leads con precio/paquete claro** | 53% | **$\ge 80\%$** |
| **Tasa de Congelados en Contactado** | 62% | **$\le 25\%$** |
| **Cierres de Contrato / OT** | 1 cierre (\$28,670) | **$\ge 5$ cierres** |

---

### 4. Bitácora de Revisiones

* **01/Nov/2026:** Despliegue de migración de base de datos, motor de scoring `lead-scoring.ts` e inyección de variantes en `agente.ts`. Inicio de recolección de cohorte de Noviembre.
* **08/Nov/2026 (Programada):** Primera auditoría semanal de 7 días.
* **15/Nov/2026 (Programada):** Cierre de cohorte formal de 15 días y comparativa de resultados vs Grupo Control.
