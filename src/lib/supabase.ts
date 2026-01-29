import { createClient } from '@supabase/supabase-js';

// A DEFINIÇÃO DA TIPAGEM É O SEGREDO
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: 'regional_admin' | 'school_manager'; // Aqui definimos que role existe!
          school_id: string | null;
        };
      };
    };
  };
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// NOTE O <Database> AQUI EMBAIXO
export const supabase = createClient<Database>(supabaseUrl, supabaseKey);