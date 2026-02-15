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
      <main className="flex-1 pl-64">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
