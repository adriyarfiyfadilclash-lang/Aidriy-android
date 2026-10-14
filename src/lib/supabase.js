import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://dcnpaofsxhcgrhzbwbqr.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_G9Np7NIBjSmNopEMoQVG5Q_tfcTiSNV';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
