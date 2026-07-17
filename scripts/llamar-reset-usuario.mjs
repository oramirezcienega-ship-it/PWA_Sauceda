async function main() {
  const url = "https://crm-staging.saucedamx.com/api/ia/reset-usuario?token=saucedamkt2026sec";
  console.log("Ejecutando llamada y leyendo texto de respuesta...");
  
  const res = await fetch(url);
  const texto = await res.text();
  
  console.log("Status:", res.status);
  console.log("Respuesta del servidor (primeros 500 caract.):");
  console.log(texto.slice(0, 500));
}

main().catch(console.error);
