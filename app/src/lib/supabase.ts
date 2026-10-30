import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  'https://phhsdjeduxahoeridpec.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoaHNkamVkdXhhaG9lcmlkcGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2MzQ5NzEsImV4cCI6MjEwODIxMDk3MX0.HkEDmCPl7ce_5XZP0r8j00EtrXCni6EyPkZFWVBJOA4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
