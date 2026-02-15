'use client';

import type { Category } from '@/lib/types';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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

export function Sidebar({ categories }: { categories: Category[] }) {
  const pathname = usePathname();

  return (
    <aside className="glass fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r-0 shadow-2xl">
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="from-primary to-accent flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br shadow-md shadow-primary/20">
          <span className="text-lg">⚡</span>
        </div>
        <span className="text-lg font-bold tracking-tight">Parse DNS</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6 scrollbar-none">
        <div className="mb-3 px-3 text-xs font-bold uppercase tracking-widest opacity-50">
          Обзор
        </div>
        <Link
          href="/"
          className={cn(
            'mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
            pathname === '/'
              ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
              : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground hover:pl-4'
          )}
        >
          <span className="text-lg">📊</span>
          Дашборд
        </Link>

        <div className="mb-3 mt-8 px-3 text-xs font-bold uppercase tracking-widest opacity-50">
          Категории
        </div>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/category/${cat.id}`}
            className={cn(
              'mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
              pathname === `/category/${cat.id}`
                ? 'bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20'
                : 'text-muted-foreground hover:bg-accent/10 hover:text-foreground hover:pl-4'
            )}
          >
            <span className="text-lg">{CATEGORY_ICONS[cat.id] ?? '📦'}</span>
            {cat.name}
          </Link>
        ))}
      </nav>

      <div className="px-6 py-6">
        <div className="glass rounded-xl p-4 text-center text-xs">
          <p className="font-semibold text-foreground/80">DNS-Shop · Citilink</p>
          <p className="text-muted-foreground mt-1 text-[10px]">Data Aggregator</p>
        </div>
      </div>
    </aside>
  );
}
