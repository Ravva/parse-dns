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
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="h-7 w-7 bg-primary" />
        <span className="text-sm font-semibold tracking-tight">Parse DNS</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Обзор
        </div>
        <Link
          href="/"
          className={cn(
            'mb-1 flex items-center gap-2 px-2 py-1.5 text-sm transition-colors',
            pathname === '/'
              ? 'bg-accent text-accent-foreground font-medium'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
          )}
        >
          <span className="text-base">📊</span>
          Дашборд
        </Link>

        <div className="mb-2 mt-5 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Категории
        </div>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/category/${cat.id}`}
            className={cn(
              'mb-0.5 flex items-center gap-2 px-2 py-1.5 text-sm transition-colors',
              pathname === `/category/${cat.id}`
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            )}
          >
            <span className="text-base">{CATEGORY_ICONS[cat.id] ?? '📦'}</span>
            {cat.name}
          </Link>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">DNS-Shop · Citilink</p>
      </div>
    </aside>
  );
}
