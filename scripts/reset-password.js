const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// Manual env parsing from .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || "";
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      process.env[key] = value;
    }
  });
}

async function main() {
  const email = "alex_cordova_barajas@hotmail.com";
  const newPassword = process.argv[2];

  if (!newPassword) {
    console.error("Por favor ingresa la nueva contraseña como argumento. Ej: node reset-password.js MiNuevaContra123");
    process.exit(1);
  }

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error("Faltan las variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false }
  });

  console.log(`Buscando usuario en Auth Admin con correo: ${email}...`);
  
  // 1. Buscar el usuario en la lista de usuarios de Auth
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("Error listando usuarios:", listError.message);
    process.exit(1);
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    console.error(`No se encontró ningún usuario con el correo: ${email}`);
    process.exit(1);
  }

  console.log(`Usuario encontrado! ID: ${user.id}`);
  console.log("Actualizando contraseña...");

  // 2. Actualizar la contraseña usando el API de Admin
  const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { password: newPassword, email_confirm: true } // Confirmar email para asegurar acceso
  );

  if (updateError) {
    console.error("Error al actualizar la contraseña:", updateError.message);
    process.exit(1);
  }

  console.log("¡Contraseña actualizada con éxito mediante el API de Supabase Auth!");
  process.exit(0);
}

main().catch(console.error);
