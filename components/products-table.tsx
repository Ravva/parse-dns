'use client';

import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Product } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(price);
}

type SortKey = 'name' | 'price' | 'brand';
type SortDir = 'asc' | 'desc';

export function ProductsTable({ products }: { products: Product[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>('price');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = [...products].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'name':
        return dir * (a.name ?? '').localeCompare(b.name ?? '', 'ru');
      case 'price':
        return dir * ((a.price_current ?? 0) - (b.price_current ?? 0));
      case 'brand':
        return dir * (a.brand ?? '').localeCompare(b.brand ?? '', 'ru');
      default:
        return 0;
    }
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  if (products.length === 0) {
    return (
      <div className="glass-card py-16 text-center rounded-xl">
        <p className="text-lg text-muted-foreground">Товары ещё не загружены</p>
        <div className="mt-4">
          <span className="text-4xl">🤷‍♂️</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in slide-in-from-bottom-8 duration-700 animate-in fill-mode-backwards delay-300">
      <div className="glass-card rounded-xl overflow-hidden border-border/50">
        <Table className="whitespace-nowrap">
          <TableHeader className="bg-muted/30">
            <TableRow className="hover:bg-transparent border-border/50">
              <TableHead
                className="w-[300px] cursor-pointer select-none font-bold text-foreground"
                onClick={() => handleSort('name')}
              >
                Название{sortIndicator('name')}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none font-bold text-foreground"
                onClick={() => handleSort('brand')}
              >
                Бренд{sortIndicator('brand')}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right font-bold text-foreground"
                onClick={() => handleSort('price')}
              >
                Цена{sortIndicator('price')}
              </TableHead>
              <TableHead className="font-bold text-foreground">Описание</TableHead>
              <TableHead className="w-[80px] font-bold text-foreground">Источник</TableHead>
              <TableHead className="text-center w-[80px] font-bold text-foreground">
                Наличие
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((product) => (
              <TableRow
                key={product.id}
                className="cursor-pointer transition-colors hover:bg-muted/40 border-border/40"
                onClick={() => router.push(`/product/${product.id}`)}
              >
                <TableCell className="py-3 max-w-[300px]">
                  <span className="text-sm font-medium whitespace-normal line-clamp-2 block leading-relaxed">
                    {product.name}
                  </span>
                </TableCell>
                <TableCell className="py-3 text-sm font-medium text-muted-foreground">
                  {product.brand ?? '—'}
                </TableCell>
                <TableCell className="py-3 text-right tabular-nums">
                  <div className="text-sm font-bold text-primary">
                    {formatPrice(product.price_current)}
                  </div>
                  {product.price_old != null && product.price_old > 0 && (
                    <div className="text-[10px] text-muted-foreground line-through">
                      {formatPrice(product.price_old)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="py-3 max-w-[350px]">
                  <p className="text-xs text-muted-foreground whitespace-normal line-clamp-2 leading-relaxed">
                    {product.key_specs && typeof product.key_specs === 'object'
                      ? Object.values(product.key_specs).join(' · ')
                      : '—'}
                  </p>
                </TableCell>
                <TableCell className="py-3">
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0.5 border font-normal ${
                      product.source === 'dns-shop'
                        ? 'border-orange-500/50 text-orange-500 bg-orange-500/10'
                        : 'border-blue-500/50 text-blue-500 bg-blue-500/10'
                    }`}
                  >
                    {product.source === 'dns-shop' ? 'DNS' : 'Citilink'}
                  </Badge>
                </TableCell>
                <TableCell className="py-3 text-center">
                  {product.in_stock ? (
                    <div className="flex justify-center">
                      <div
                        className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        title="В наличии"
                      />
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <div
                        className="h-2.5 w-2.5 rounded-full bg-stone-300 dark:bg-stone-700"
                        title="Нет в наличии"
                      />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex justify-between items-center px-2">
        <p className="text-xs text-muted-foreground font-medium">Всего товаров: {sorted.length}</p>
      </div>
    </div>
  );
}
