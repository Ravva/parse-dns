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
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Дашборд</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Обзор распарсированных комплектующих ПК
        </p>
      </div>

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Всего товаров
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalProducts ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">DNS-Shop</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{sourceCounts['dns-shop'] ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Citilink</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{sourceCounts['citilink'] ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Last parse run */}
      {lastRun && (
        <div className="mb-8">
          <p className="text-xs text-muted-foreground">
            Последний парсинг: {new Date(lastRun.started_at).toLocaleString('ru-RU')}{' '}
            <Badge variant={lastRun.status === 'completed' ? 'default' : 'destructive'}>
              {lastRun.status}
            </Badge>
          </p>
        </div>
      )}

      {/* Category grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(categories as Category[])?.map((cat) => (
          <Link key={cat.id} href={`/category/${cat.id}`}>
            <Card className="transition-colors hover:border-primary/40 hover:bg-accent/30">
              <CardContent className="flex items-center gap-4 pt-6">
                <span className="text-3xl">{CATEGORY_ICONS[cat.id] ?? '📦'}</span>
                <div>
                  <div className="font-medium">{cat.name}</div>
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
