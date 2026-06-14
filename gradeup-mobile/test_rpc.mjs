import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: { user }, error: authError } = await supabase.auth.signInWithPassword({
    email: 'test@example.com',
    password: 'password123'
  });
  console.log('Auth:', user?.id, authError?.message);

  if (!user) {
    // If no user, let's just query confessions
    const { data, error } = await supabase.from('confessions').select('*').limit(1);
    console.log('Confessions:', data, error);
    return;
  }

  // Fetch a confession
  const { data: confs } = await supabase.from('confessions').select('id').limit(1);
  if (confs && confs.length > 0) {
    const cid = confs[0].id;
    const { error: rpcErr } = await supabase.rpc('set_confession_reaction', { p_confession_id: cid, p_reaction: '😂' });
    console.log('RPC set reaction error:', rpcErr);

    const { data: check } = await supabase.rpc('get_confession', { p_id: cid });
    console.log('Get confession after:', check);
  }
}
test();
