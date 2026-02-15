import AppShell from '@/components/app-shell';
import { ProductsTable } from '@/components/products-table';
import { supabase } from '@/lib/supabase';
import type { Category, Product } from '@/lib/types';
import { notFound } from 'next/navigation';

export const revalidate = 60;

export async function generateStaticParams() {
  const { data: categories } = await supabase.from('categories').select('id');
  return (categories ?? []).map((c) => ({ slug: c.id }));
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const { data: category } = await supabase.from('categories').select('*').eq('id', slug).single();

  if (!category) {
    notFound();
  }

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('category_id', slug)
    .order('price_current', { ascending: true });

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{(category as Category).name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {(products as Product[])?.length ?? 0} товаров
        </p>
      </div>

      <ProductsTable products={(products as Product[]) ?? []} />
    </AppShell>
  );
}
