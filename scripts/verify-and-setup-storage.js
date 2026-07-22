const { createClient } = require("@supabase/supabase-js");

async function main() {
  console.log("Env keys available:", Object.keys(process.env).filter(k => k.includes("SUPABASE") || k.includes("NEXT_PUBLIC")));
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  console.log("Using key length:", key ? key.length : 0);

  if (!url || !key) {
    console.error("Error: Missing SUPABASE_URL or key. URL length:", url ? url.length : 0, "Key length:", key ? key.length : 0);
    process.exit(1);
  }

  const supabase = createClient(url, key);

  console.log("1. Checking Storage Buckets...");
  const { data: buckets, error: errBuckets } = await supabase.storage.listBuckets();
  if (errBuckets) {
    console.error("Error listing buckets:", errBuckets.message);
  } else {
    console.log("Current buckets:", buckets.map(b => b.name));

    const requiredBuckets = [
      { name: "documentos-ventas", public: true },
      { name: "formularios", public: false }
    ];

    for (const req of requiredBuckets) {
      const exists = buckets.some(b => b.name === req.name);
      if (exists) {
        console.log(`Bucket "${req.name}" already exists.`);
      } else {
        console.log(`Bucket "${req.name}" is missing. Creating...`);
        const { data, error } = await supabase.storage.createBucket(req.name, {
          public: req.public,
          fileSizeLimit: 16777216, // 16MB
        });
        if (error) {
          console.error(`Error creating bucket "${req.name}":`, error.message);
        } else {
          console.log(`Bucket "${req.name}" created successfully (public: ${req.public}).`);
        }
      }
    }
  }

  console.log("\n2. Checking Database Tables...");
  const tablesToCheck = ["documentos_ventas", "productos_servicios", "cotizaciones"];
  for (const table of tablesToCheck) {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      console.error(`Table "${table}" check: ERROR ->`, error.message);
      if (table === "documentos_ventas") {
        console.log(`
Please run the following SQL in your Supabase SQL Editor to create the table:

CREATE TABLE IF NOT EXISTS public.documentos_ventas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  descripcion text,
  url text NOT NULL,
  nombre_archivo text NOT NULL,
  tipo_mime text,
  tamano_bytes bigint NOT NULL,
  subido_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.documentos_ventas ENABLE ROW LEVEL SECURITY;
        `);
      }
    } else {
      console.log(`Table "${table}" check: OK.`);
    }
  }

  process.exit(0);
}

main().catch(console.error);
