export type Category = {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
};

export type Product = {
  id: string;
  source: 'dns-shop' | 'citilink';
  source_url: string;
  category_id: string;
  name: string;
  brand: string | null;
  price_current: number | null;
  price_old: number | null;
  in_stock: boolean;
  image_url: string | null;
  specs: Record<string, unknown>;
  key_specs: Record<string, string>;
  rating: number | null;
  parsed_at: string;
  created_at: string;
};

export type ParseRun = {
  id: string;
  source: string;
  category_id: string | null;
  status: 'running' | 'completed' | 'failed';
  products_count: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
};

export type ParsingSchedule = {
  id: string;
  source: 'dns-shop' | 'citilink' | 'all';
  interval_minutes: number;
  last_run_at: string | null;
  next_run_at: string | null;
  is_enabled: boolean;
};
