import AppShell from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/lib/types';
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

  // Get product counts per category
  const { data: productsByCategory } = await supabase.from('products').select('category_id');

  const categoryCounts: Record<string, number> = {};
  for (const p of productsByCategory ?? []) {
    categoryCounts[p.category_id] = (categoryCounts[p.category_id] ?? 0) + 1;
  }

  // Get source counts
  const { data: productsBySource } = await supabase.from('products').select('source');
  const sourceCounts: Record<string, number> = {};
  for (const p of productsBySource ?? []) {
    sourceCounts[p.source] = (sourceCounts[p.source] ?? 0) + 1;
  }

  return (
    <AppShell>
      <div className="mb-8 fade-in slide-in-from-bottom-4 duration-700 animate-in">
        <h1 className="text-gradient text-3xl font-bold tracking-tight">Дашборд</h1>
        <p className="mt-1 text-muted-foreground">
          Обзор распарсированных комплектующих ПК
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3 fade-in slide-in-from-bottom-5 duration-1000 animate-in fill-mode-backwards">
        <Card className="glass-card border-l-4 border-l-primary/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Всего товаров
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{totalProducts ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-4 border-l-accent/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">DNS-Shop</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{sourceCounts['dns-shop'] ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="glass-card border-l-4 border-l-secondary/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Citilink</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-foreground">{sourceCounts['citilink'] ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Last parse run */}
      {lastRun && (
        <div className="mb-8 fade-in slide-in-from-bottom-6 duration-1000 animate-in fill-mode-backwards delay-100">
          <div className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-muted-foreground shadow-sm">
            <span>Последний парсинг: {new Date(lastRun.started_at).toLocaleString('ru-RU')}</span>
            <span className="h-1 w-1 rounded-full bg-border" />
            <Badge variant={lastRun.status === 'completed' ? 'default' : 'destructive'} className="shadow-none">
              {lastRun.status}
            </Badge>
          </div>
        </div>
      )}

      {/* Category grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 fade-in slide-in-from-bottom-8 duration-1000 animate-in fill-mode-backwards delay-200">
        {(categories as Category[])?.map((cat) => (
          <Link key={cat.id} href={`/category/${cat.id}`} className="group">
            <Card className="glass-card h-full transition-all duration-500 group-hover:-translate-y-1 group-hover:shadow-primary/10 group-hover:border-primary/20">
              <CardContent className="flex items-center gap-5 pt-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-background to-muted shadow-inner ring-1 ring-border/50 group-hover:from-primary/10 group-hover:to-accent/10 transition-colors duration-500">
                  <span className="text-2xl group-hover:scale-110 transition-transform duration-300">{CATEGORY_ICONS[cat.id] ?? '📦'}</span>
                </div>
                <div>
                  <div className="font-semibold text-lg group-hover:text-primary transition-colors">{cat.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {categoryCounts[cat.id] ?? 0} товаров
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
