import { Sidebar } from '@/components/sidebar';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/lib/types';

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  return (
    <div className="flex min-h-screen">
      <Sidebar categories={(categories as Category[]) ?? []} />
      <main className="flex-1 pl-64 transition-all duration-300">
        <div className="mx-auto max-w-7xl px-8 py-10 animate-in fade-in zoom-in-95 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
