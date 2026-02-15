import AppShell from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { ArrowLeft, ExternalLink, Share2, ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const revalidate = 60;

export async function generateStaticParams() {
  // Generate params for top 50 products to speed up build, or all if feasible.
  // For now, let's just do a small subset or rely on dynamic rendering for most.
  // actually, let's just generate paths for the first 100 products to avoid build timeouts
  const { data: products } = await supabase.from('products').select('id').limit(50);
  return (products ?? []).map((p) => ({ id: p.id }));
}

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: product } = await supabase.from('products').select('*').eq('id', id).single();

  if (!product) {
    notFound();
  }

  const p = product as Product;
  const specs = (p.specs as Record<string, any>) ?? {};
  const keySpecs = (p.key_specs as Record<string, string>) ?? {};

  // Combine specs: Display key specs first, then the rest
  const allSpecsEntries = Object.entries(specs);

  return (
    <AppShell>
      <div className="mb-6 fade-in slide-in-from-bottom-4 duration-700 animate-in">
        <Link
          href={`/category/${p.category_id}`}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад к категории
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 fade-in slide-in-from-bottom-8 duration-700 animate-in fill-mode-backwards delay-100">
        {/* Left Column: Image & Actions */}
        <div className="space-y-6">
          <Card className="glass-card overflow-hidden border-border/50">
            <div className="aspect-square flex items-center justify-center bg-muted/20 p-8">
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="max-h-full max-w-full object-contain drop-shadow-xl transition-transform duration-500 hover:scale-105"
                />
              ) : (
                <div className="text-6xl text-muted-foreground/20">📷</div>
              )}
            </div>
          </Card>

          <Card className="glass-card border-border/50">
            <CardContent className="pt-6 space-y-4">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-muted-foreground">Цена</span>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    {formatPrice(p.price_current)}
                  </div>
                  {p.price_old ? (
                    <div className="text-sm text-muted-foreground line-through">
                      {formatPrice(p.price_old)}
                    </div>
                  ) : null}
                </div>
              </div>

              <Button className="w-full h-12 text-lg shadow-lg shadow-primary/20" asChild>
                <a href={p.source_url} target="_blank" rel="noopener noreferrer">
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  Купить в {p.source === 'dns-shop' ? 'DNS' : 'Citilink'}
                </a>
              </Button>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground text-center">
                  <span className="mb-1 block font-medium text-foreground">Наличие</span>
                  {p.in_stock ? (
                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> В наличии
                    </span>
                  ) : (
                    <span className="text-destructive font-medium">Нет в наличии</span>
                  )}
                </div>
                <div className="flex flex-col items-center justify-center p-3 rounded-lg bg-muted/30 text-xs text-muted-foreground text-center">
                  <span className="mb-1 block font-medium text-foreground">Рейтинг</span>
                  <span className="font-bold text-yellow-500">★ {p.rating ?? '—'}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Details & Specs */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <Badge variant="outline" className="mb-2 border-primary/20 bg-primary/5 text-primary">
              {p.brand ?? 'Бренд не указан'}
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-gradient leading-tight mb-4">
              {p.name}
            </h1>

            {/* Source Badge */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Источник:</span>
              <Badge
                variant="secondary"
                className={
                  p.source === 'dns-shop'
                    ? 'bg-orange-500/10 text-orange-500 border-orange-500/20'
                    : 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                }
              >
                {p.source === 'dns-shop' ? 'DNS-Shop' : 'Citilink'}
              </Badge>
              <a
                href={p.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors ml-auto"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          <Separator className="bg-border/50" />

          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Характеристики</h2>

            {allSpecsEntries.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
                {allSpecsEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="flex justify-between py-2 border-b border-border/40 hover:bg-muted/20 px-2 rounded transition-colors break-words"
                  >
                    <span className="text-sm text-muted-foreground font-medium">{key}</span>
                    <span className="text-sm font-semibold text-foreground text-right ml-4">
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Нет подробных характеристик
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
