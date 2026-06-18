-- ============================================================
-- MÓDULO: BIOMÉTRICOS (Autenticación WebAuthn)
-- ------------------------------------------------------------
-- Guarda las llaves públicas de los dispositivos móviles (iOS/Android)
-- autorizados para iniciar sesión mediante FaceID o huella digital.
-- ============================================================

create table if not exists public.credenciales_biometricas (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references auth.users(id) on delete cascade,
  credential_id  text not null unique,
  public_key     text not null, -- PEM o SPKI DER en Base64
  device_name    text not null default 'Dispositivo',
  created_at     timestamptz not null default now()
);

-- Habilitar RLS (Seguridad a Nivel de Fila)
alter table public.credenciales_biometricas enable row level security;

-- Políticas de seguridad: Un usuario solo puede crear, leer o borrar sus propios biométricos
create policy "Los usuarios pueden gestionar sus propios biometricos"
  on public.credenciales_biometricas
  for all
  using (auth.uid() = usuario_id);
