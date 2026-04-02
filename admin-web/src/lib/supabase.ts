import { createClient } from '@supabase/supabase-js';

function must(name: string): string {
  const v = (import.meta as any).env?.[name];
  if (!v || typeof v !== 'string') throw new Error(`Missing environment variable: ${name}`);
  return v;
}

export const supabaseUrl = must('VITE_SUPABASE_URL');
export const supabaseAnonKey = must('VITE_SUPABASE_ANON_KEY');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

