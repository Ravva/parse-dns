import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';

const envPath = resolve(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');

const env: Record<string, string> = {};
envContent.split('\n').forEach((line) => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(
  env['NEXT_PUBLIC_SUPABASE_URL']!,
  env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!
);

async function checkCounts() {
  const { data, error } = await supabase.from('products').select('category_id, source, id');

  if (error) {
    console.error(error);
    return;
  }

  const counts: Record<string, { dns: number; citilink: number }> = {};

  data.forEach((p) => {
    if (!counts[p.category_id]) {
      counts[p.category_id] = { dns: 0, citilink: 0 };
    }
    if (p.source === 'dns-shop') counts[p.category_id].dns++;
    if (p.source === 'citilink') counts[p.category_id].citilink++;
  });

  console.table(counts);
}

checkCounts();
