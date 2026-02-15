import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envPath = resolve(process.cwd(), '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  console.error('⚠ .env.local not found.');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function runParser() {
  console.log('🚀 Triggering parser...');
  return new Promise<void>((resolve, reject) => {
    const child = spawn('bun', ['run', 'parse'], { stdio: 'inherit', shell: true });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Parser finished successfully');
        resolve();
      } else {
        console.error(`❌ Parser failed with code ${code}`);
        reject(new Error(`Parser failed with code ${code}`));
      }
    });
  });
}

async function checkSchedule() {
  console.log('Checking schedule...');
  const { data: schedule, error } = await supabase
    .from('parsing_schedules')
    .select('*')
    .eq('source', 'all')
    .single();

  if (error || !schedule) {
    console.error('Error fetching schedule:', error);
    return;
  }

  if (!schedule.is_enabled) {
    console.log('⏸ Schedule is disabled.');
    return;
  }

  const now = new Date();
  const nextRun = schedule.next_run_at ? new Date(schedule.next_run_at) : new Date(0);

  if (now >= nextRun) {
    console.log('⏰ Time to run parser!');

    // Update DB immediately to separate "running" state if needed,
    // but for now we just update last/next AFTER run or BEFORE?
    // Updating BEFORE prevents double runs if logic takes time, but strictly we valid success after.
    // Let's run first.

    try {
      await runParser();

      const finishedAt = new Date();
      const next = new Date(finishedAt.getTime() + schedule.interval_minutes * 60000);

      await supabase
        .from('parsing_schedules')
        .update({
          last_run_at: finishedAt.toISOString(),
          next_run_at: next.toISOString(),
        })
        .eq('id', schedule.id);

      console.log(`📅 Next run scheduled for: ${next.toLocaleString()}`);
    } catch (e) {
      console.error('Run failed:', e);
    }
  } else {
    console.log(`⏳ Next run: ${nextRun.toLocaleString()}`);
  }
}

console.log('🤖 Scheduler Daemon Started');
setInterval(checkSchedule, 60000); // Check every minute
checkSchedule(); // check immediately
