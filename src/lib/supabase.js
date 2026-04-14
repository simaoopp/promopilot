import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltam variáveis do Supabase (REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_ANON_KEY). Verifica o ficheiro .env."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);