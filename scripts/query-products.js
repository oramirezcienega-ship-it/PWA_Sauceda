const { createClient } = require("@supabase/supabase-js");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing SUPABASE URL or KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  
  console.log("Fetching products...");
  const { data: prods, error: errProds } = await supabase.from("productos_servicios").select("*");
  if (errProds) {
    console.error("Error fetching products:", errProds.message);
  } else {
    console.log("=== CATALOG PRODUCTS ===");
    console.dir(prods, { depth: null });
  }

  console.log("\nFetching concepts...");
  const { data: concepts, error: errConcepts } = await supabase.from("cotizacion_conceptos").select("*");
  if (errConcepts) {
    console.error("Error fetching concepts:", errConcepts.message);
  } else {
    console.log("=== COTIZACION CONCEPTOS ===");
    console.dir(concepts, { depth: null });
  }

  process.exit(0);
}

main().catch(console.error);
