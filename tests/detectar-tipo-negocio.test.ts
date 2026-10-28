import { test } from "node:test";
import assert from "node:assert/strict";
import { detectarTipoNegocio, extraerAtribucionEtiquetas } from "../src/lib/types.ts";

test("detectarTipoNegocio: Campaña o adset con 'Tramite' clasifica como solo_tramite", () => {
  const r1 = detectarTipoNegocio("Hola", "SAUCEDA Compra Tramite - Sep 2026", "Tramite y Asesoria", "Tramite Asesoria Gratis");
  assert.equal(r1, "solo_tramite");

  const r2 = detectarTipoNegocio("Quiero información", "Campaña Trámite Infonavit");
  assert.equal(r2, "solo_tramite");

  const r3 = detectarTipoNegocio("Hola", "Campaña Leads", "Acompañamiento Infonavit");
  assert.equal(r3, "solo_tramite");

  const r4 = detectarTipoNegocio("Hola", "Asesoría Infonavit 2026");
  assert.equal(r4, "solo_tramite");
});

test("detectarTipoNegocio: Mensajes de trámite, acompañamiento, precalificación o crédito clasifican como solo_tramite", () => {
  assert.equal(detectarTipoNegocio("Hola, vi su anuncio de trámite de Infonavit"), "solo_tramite");
  assert.equal(detectarTipoNegocio("Necesito acompañamiento para mi crédito Infonavit"), "solo_tramite");
  assert.equal(detectarTipoNegocio("Quiero saber mis puntos infonavit y precalificación"), "solo_tramite");
  assert.equal(detectarTipoNegocio("Cuánto cobran por el trámite de una casa?"), "solo_tramite");
  assert.equal(detectarTipoNegocio("Quiero comprar casa con mi crédito"), "solo_tramite");
  assert.equal(detectarTipoNegocio("Cuánto me prestan de crédito infonavit"), "solo_tramite");
});

test("detectarTipoNegocio: Campañas o mensajes de Traspaso / Compra directa con deuda van a traspaso_compra", () => {
  assert.equal(detectarTipoNegocio("Hola", "Sauceda Campaña leads 05.2026", "Sauceda Leads", "Traspaso directo"), "traspaso_compra");
  assert.equal(detectarTipoNegocio("Quiero traspasar mi casa con adeudo"), "traspaso_compra");
  assert.equal(detectarTipoNegocio("Ustedes compran casas con deuda?"), "traspaso_compra");
  assert.equal(detectarTipoNegocio("Traspaso mi casa que debo a infonavit"), "traspaso_compra");
});

test("detectarTipoNegocio: Servicios de Construcción se mantienen intactos", () => {
  assert.equal(detectarTipoNegocio("Cotización de portón y protecciones"), "construccion-herreria");
  assert.equal(detectarTipoNegocio("Quiero impermeabilizar mi azotea"), "construccion-impermeabilizacion");
  assert.equal(detectarTipoNegocio("Piso de concreto estampado"), "construccion-piso-estampado");
  assert.equal(detectarTipoNegocio("Limpieza de aljibe y cisterna"), "construccion-mantenimiento-cisternas");
  assert.equal(detectarTipoNegocio("Lavado de tinaco rotoplas"), "construccion-mantenimiento-tinacos");
});

test("detectarTipoNegocio: Saludo genérico sin campaña devuelve 'otro'", () => {
  assert.equal(detectarTipoNegocio("Hola buenas tardes"), "otro");
  assert.equal(detectarTipoNegocio("Informes por favor"), "otro");
});

test("detectarTipoNegocio: Campañas o mensajes de Seguridad y Videovigilancia clasifican como seguridad", () => {
  assert.equal(detectarTipoNegocio("Hola", "Campaña Seguridad Meta 2026", "Kits Camaras", "Anuncio Camara"), "seguridad");
  assert.equal(detectarTipoNegocio("Quiero cotizar cámaras de seguridad para mi casa"), "seguridad");
  assert.equal(detectarTipoNegocio("Instalan alarmas para negocio?"), "seguridad");
  assert.equal(detectarTipoNegocio("Precio de sistema de videovigilancia y cctv"), "seguridad");
  assert.equal(detectarTipoNegocio("Cotización de cerco eléctrico y videoportero"), "seguridad");
  assert.equal(detectarTipoNegocio("Información sobre el kit de seguridad"), "seguridad");
  // Asegurar que seguridad social no caiga en seguridad
  assert.equal(detectarTipoNegocio("Quiero consultar mis puntos con mi número de seguridad social"), "solo_tramite");
});



test("detectarTipoNegocio: Atribución orgánica del sitio web clasifica correctamente con contexto de página", () => {
  assert.equal(detectarTipoNegocio("Hola SAUCEDA 👋, quisiera recibir asesoría y cotización.", "Google SEO León", "saucedamx.com", "Página Impermeabilización"), "construccion-impermeabilizacion");
  assert.equal(detectarTipoNegocio("Hola SAUCEDA 👋, quisiera recibir asesoría y cotización.", "Google SEO León", "saucedamx.com", "Página Concreto Estampado"), "construccion-piso-estampado");
  assert.equal(detectarTipoNegocio("Hola SAUCEDA 👋, quisiera recibir asesoría y cotización.", "Google SEO León", "saucedamx.com", "Página Herrería"), "construccion-herreria");
  assert.equal(detectarTipoNegocio("Hola SAUCEDA Protege 🛡️, quisiera asesoría y cotización.", "Google SEO León", "saucedamx.com", "Página Protege"), "seguridad");
  assert.equal(detectarTipoNegocio("Hola SAUCEDA 👋, quisiera recibir asesoría y cotización.", "Google SEO León", "saucedamx.com", "Página Trámite"), "solo_tramite");
});

test("extraerAtribucionEtiquetas: extrae tag dinámico de página web y clasifica negocio", () => {
  const at1 = extraerAtribucionEtiquetas("Hola SAUCEDA 👋, quisiera cotizar [WEB:impermeabilizacion:SEO-Google]");
  assert.ok(at1);
  assert.equal(at1.origenLead, "sitio-web");
  assert.equal(at1.campaign_name, "Orgánico Web (SEO-Google)");
  assert.equal(at1.ad_name, "Página Impermeabilizacion");
  assert.equal(detectarTipoNegocio("Hola", at1.campaign_name, at1.adset_name, at1.ad_name), "construccion-impermeabilizacion");

  const at2 = extraerAtribucionEtiquetas("Hola SAUCEDA 👋, quisiera cotizar [WEB:concreto-estampado:Google]");
  assert.ok(at2);
  assert.equal(at2.ad_name, "Página Concreto Estampado");
  assert.equal(detectarTipoNegocio("Hola", at2.campaign_name, at2.adset_name, at2.ad_name), "construccion-piso-estampado");
});

test("extraerAtribucionEtiquetas: extrae tags de Google Maps, Instagram, Facebook y Volantes", () => {
  const atGmaps = extraerAtribucionEtiquetas("Hola, los encontré en Google Maps y quiero cotizar [G-MAPS]");
  assert.ok(atGmaps);
  assert.equal(atGmaps.campaign_name, "Google Maps Orgánico");
  assert.equal(atGmaps.ad_name, "Ficha Google Maps León");

  const atIg = extraerAtribucionEtiquetas("Hola, vi su perfil en Instagram [IG-BIO]");
  assert.ok(atIg);
  assert.equal(atIg.origenLead, "instagram");
  assert.equal(atIg.campaign_name, "Instagram Orgánico");

  const atFb = extraerAtribucionEtiquetas("Hola, vi su página [FB-ORG]");
  assert.ok(atFb);
  assert.equal(atFb.origenLead, "facebook");
  assert.equal(atFb.campaign_name, "Facebook Orgánico");

  const atVolante = extraerAtribucionEtiquetas("Hola, me dieron un folleto [VOLANTE]");
  assert.ok(atVolante);
  assert.equal(atVolante.origenLead, "volante");
  assert.equal(atVolante.campaign_name, "Volante Físico León");
});

