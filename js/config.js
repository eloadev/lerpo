// =====================================================================
//  Configuración de Supabase
//  Supabase → Project Settings → API (o "API Keys")
//  · SUPABASE_URL:  "Project URL"
//  · SUPABASE_KEY:  la "Publishable key" (sb_publishable_...) o la "anon public"
//
//  Es SEGURO que esta llave sea pública: solo identifica tu proyecto.
//  La seguridad real la hace Row Level Security en la base de datos.
//  ⚠️ NUNCA pongas aquí la "secret" / "service_role" key.
// =====================================================================

export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_KEY = 'TU_PUBLISHABLE_KEY';
