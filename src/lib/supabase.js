import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://bkutbqlwjytbcxfrpuat.supabase.co";
const supabaseAnonKey = "sb_publishable_wS29Q4vj-tVBmBJ6bbVU5Q_l45BgPRr";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log("SUPABASE_URL =", supabaseUrl);
console.log("SUPABASE_KEY =", supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltam as variáveis REACT_APP_SUPABASE_URL e/ou REACT_APP_SUPABASE_ANON_KEY."
  );
}
