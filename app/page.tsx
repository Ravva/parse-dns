import AppShell from '@/components/app-shell';
import { ModeToggle } from '@/components/mode-toggle';
import { Scheduler } from '@/components/scheduler';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import type { Category, ParseRun } from '@/lib/types';
import { Package, Store } from 'lucide-react';
import Link from 'next/link';

const CATEGORY_ICONS: Record<string, string> = {
  cpu: '⚡',
  gpu: '🖥️',
  motherboard: '🔲',
  ram: '🧩',
  ssd: '💾',
  hdd: '💿',
  psu: '🔌',
  case: '📦',
  cooler: '❄️',
};

export const revalidate = 60;

export default async function DashboardPage() {
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });

  const { data: lastRun } = await supabase
    .from('parse_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(1)
    .single();

  const { data: productsByCategory } = await supabase.from('products').select('category_id');
  const categoryCounts: Record<string, number> = {};
  for (const p of productsByCategory ?? []) {
    categoryCounts[p.category_id] = (categoryCounts[p.category_id] ?? 0) + 1;
  }

  const { data: productsBySource } = await supabase.from('products').select('source');
  const sourceCounts: Record<string, number> = {};
  for (const p of productsBySource ?? []) {
    sourceCounts[p.source] = (sourceCounts[p.source] ?? 0) + 1;
  }

  return (
    <AppShell>
      {/* ─── Header ─── */}
      <div className="mb-10 flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-gradient">Дашборд</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Обзор и управление парсингом комплектующих
          </p>
        </div>
        <ModeToggle />
      </div>

      {/* ─── Stats Row ─── */}
      <div className="mb-8 grid grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-75">
        <StatCard
          label="Всего товаров"
          value={totalProducts ?? 0}
          icon={<Package className="h-4 w-4" />}
        />
        <StatCard
          label="DNS-Shop"
          value={sourceCounts['dns-shop'] ?? 0}
          icon={<Store className="h-4 w-4" />}
          color="text-orange-500"
        />
        <StatCard
          label="Citilink"
          value={sourceCounts.citilink ?? 0}
          icon={<Store className="h-4 w-4" />}
          color="text-blue-500"
        />
      </div>

      {/* ─── Categories Grid ─── */}
      <div className="mb-8 animate-in fade-in slide-in-from-bottom-5 duration-500 delay-150">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Категории
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {(categories as Category[])?.map((cat) => (
            <Link key={cat.id} href={`/category/${cat.id}`} className="group">
              <Card className="glass-card h-full border-transparent hover:border-primary/30 transition-all duration-300 group-hover:-translate-y-0.5">
                <CardContent className="flex items-center gap-3 p-3">
                  <span className="text-2xl shrink-0 transition-transform duration-300 group-hover:scale-110">
                    {CATEGORY_ICONS[cat.id] ?? '📦'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight group-hover:text-primary transition-colors truncate">
                      {cat.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {categoryCounts[cat.id] ?? 0} шт
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* ─── Bottom: Control Panel ─── */}
      <div className="animate-in fade-in slide-in-from-bottom-6 duration-500 delay-200">
        <Card className="glass-card overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch">
            {/* Left: Scheduler */}
            <div className="p-6">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Управление парсингом
              </h2>
              <Scheduler />
            </div>

            {/* Divider */}
            <Separator orientation="vertical" className="hidden md:block" />
            <Separator orientation="horizontal" className="block md:hidden" />

            {/* Right: Last Run */}
            <div className="p-6 flex flex-col">
              <h2 className="mb-5 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Последний запуск
              </h2>
              {lastRun ? (
                <LastRunInfo run={lastRun as ParseRun} />
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                  Запусков пока не было
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

/* ─── Sub-components ─── */

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted/60">
          <span className={color ?? 'text-foreground'}>{icon}</span>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`text-xl font-bold tabular-nums ${color ?? ''}`}>
            {value.toLocaleString('ru-RU')}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LastRunInfo({ run }: { run: ParseRun }) {
  const started = new Date(run.started_at);
  return (
    <div className="flex flex-1 flex-col justify-between gap-4">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="text-3xl font-bold tabular-nums">
            {started.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
          </div>
          <Badge
            variant={run.status === 'completed' ? 'default' : 'destructive'}
            className="uppercase tracking-wider text-[10px]"
          >
            {run.status}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          {started.toLocaleDateString('ru-RU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </div>
      </div>

      <div className="rounded-lg bg-muted/40 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Товаров обработано</span>
          <span className="font-semibold tabular-nums">+{run.products_count}</span>
        </div>
      </div>
    </div>
  );
}
