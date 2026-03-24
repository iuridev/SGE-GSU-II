import { createClient } from '@supabase/supabase-js';

export type Database = {
  public: {
    Tables: {
      profiles: {  // TIPOS DE USUARIOS
        Row: {
          id: string;
          full_name: string | null;
          role: 'regional_admin' | 'school_manager'| 'supervisor' | 'dirigente' | 'ure_servico' | 'ure_ecc';
          school_id: string | null;
          supervisor_schools: string[] | null;
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: 'regional_admin' | 'school_manager'| 'supervisor' | 'dirigente' | 'ure_servico' | 'ure_ecc';
          school_id?: string | null;
          supervisor_schools: string[] | null;
        };
        Update: {
          full_name?: string | null;
          role?: 'regional_admin' | 'school_manager'| 'supervisor' | 'dirigente' | 'ure_servico' | 'ure_ecc';
          school_id?: string | null;
          supervisor_schools: string[] | null;
        };
      };
      // ESTA É A PARTE QUE ESTAVA FALTANDO OU ERRADA:
      maintenance_tickets: {
        Row: {
          id: string;
          school_id: string | null;
          title: string;
          description: string | null;
          status: string;
          priority: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          school_id?: string | null;
          title: string;
          description?: string | null;
          status?: string;
          priority?: string;
          created_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          status?: string;
          priority?: string;
        };
      };
      water_consumption: {
        Row: {
          id: string;
          reading_date: string;
          cubic_meters: number;
          invoice_value: number | null;
          photo_url: string | null;
          status: string | null;
        };
        Insert: {
          id?: string;
          reading_date: string;
          cubic_meters: number;
          invoice_value?: number | null;
          photo_url?: string | null;
          status?: string | null;
        };
        Update: { /* ... */ };
      };
    };
  };
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);