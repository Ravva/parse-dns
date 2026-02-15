import { resolve } from 'path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env.local') });

import { supabase } from '../lib/supabase';

async function verifyCoverage() {
  console.log('Verifying coverage per category and source...');

  // Get all products
  const { data, error } = await supabase.from('products').select('category_id, source');

  if (error) {
    console.error('Error:', error);
    return;
  }

  const stats: Record<string, { dns: number; citilink: number }> = {};

  const categories = ['cpu', 'gpu', 'motherboard', 'ram', 'ssd', 'hdd', 'psu', 'case', 'cooler'];
  categories.forEach((c) => (stats[c] = { dns: 0, citilink: 0 }));

  data.forEach((p) => {
    if (stats[p.category_id]) {
      if (p.source === 'dns-shop') stats[p.category_id].dns++;
      else if (p.source === 'citilink') stats[p.category_id].citilink++;
    }
  });

  console.table(stats);
}

verifyCoverage();
