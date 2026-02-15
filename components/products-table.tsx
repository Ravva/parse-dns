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
      <div className="py-16 text-center">
        <p className="text-lg text-muted-foreground">Товары ещё не загружены</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Запустите парсинг командой{' '}
          <code className="bg-muted px-1.5 py-0.5 text-xs">bun run parse</code>
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="border border-border rounded-md overflow-hidden">
        <Table className="whitespace-nowrap">
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-[300px] cursor-pointer select-none"
                onClick={() => handleSort('name')}
              >
                Название{sortIndicator('name')}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort('brand')}
              >
                Бренд{sortIndicator('brand')}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort('price')}
              >
                Цена{sortIndicator('price')}
              </TableHead>
              <TableHead>Описание</TableHead>
              <TableHead className="w-[80px]">Источник</TableHead>
              <TableHead className="text-center w-[80px]">Наличие</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="py-2 max-w-[300px]">
                  <a
                    href={product.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:text-primary transition-colors whitespace-normal line-clamp-2 block"
                    title={product.name}
                  >
                    {product.name}
                  </a>
                </TableCell>
                <TableCell className="py-2 text-sm font-medium">
                  {product.brand ?? '—'}
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums">
                  <div className="text-sm font-bold">{formatPrice(product.price_current)}</div>
                  {product.price_old != null && product.price_old > 0 && (
                    <div className="text-[10px] text-muted-foreground line-through">
                      {formatPrice(product.price_old)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="py-2 max-w-[350px]">
                  <p className="text-xs text-muted-foreground whitespace-normal line-clamp-2">
                    {product.key_specs && typeof product.key_specs === 'object'
                      ? Object.values(product.key_specs).join(' · ')
                      : '—'}
                  </p>
                </TableCell>
                <TableCell className="py-2">
                  <Badge
                    variant={product.source === 'dns-shop' ? 'default' : 'secondary'}
                    className={`text-[10px] px-1.5 py-0 ${product.source === 'dns-shop'
                        ? 'bg-orange-500 hover:bg-orange-600 text-white border-none'
                        : 'bg-blue-500 hover:bg-blue-600 text-white border-none'
                      }`}
                  >
                    {product.source === 'dns-shop' ? 'DNS' : 'Citilink'}
                  </Badge>
                </TableCell>
                <TableCell className="py-2 text-center">
                  {product.in_stock ? (
                    <div className="flex justify-center">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" title="В наличии" />
                    </div>
                  ) : (
                    <div className="flex justify-center">
                      <span className="h-2 w-2 rounded-full bg-stone-300 dark:bg-stone-700" title="Нет в наличии" />
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">Всего товаров: {sorted.length}</p>
    </div>
  );
}
