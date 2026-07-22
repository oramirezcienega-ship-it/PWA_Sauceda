const { createClient } = require("@supabase/supabase-js");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error("Missing SUPABASE URL or KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, key);
  
  console.log("Listing buckets...");
  const { data, error } = await supabase.storage.listBuckets();
  if (error) {
    console.error("Error listing buckets:", error.message);
  } else {
    console.log("=== BUCKETS ===");
    console.dir(data, { depth: null });
  }

  process.exit(0);
}

main().catch(console.error);
