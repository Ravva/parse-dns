'use client';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/lib/supabase';
import type { ParsingSchedule } from '@/lib/types';
import { CalendarClock, Loader2, Play, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const INTERVALS = [
  { value: 60, label: '1 ч' },
  { value: 240, label: '4 ч' },
  { value: 720, label: '12 ч' },
  { value: 1440, label: '24 ч' },
];

export function Scheduler() {
  const [schedule, setSchedule] = useState<ParsingSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetchSchedule();
  }, []);

  async function fetchSchedule() {
    try {
      const { data, error } = await supabase
        .from('parsing_schedules')
        .select('*')
        .eq('source', 'all')
        .single();
      if (!error && data) setSchedule(data as ParsingSchedule);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    if (!schedule) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('parsing_schedules')
        .update({ is_enabled: enabled })
        .eq('id', schedule.id);
      if (error) throw error;
      setSchedule({ ...schedule, is_enabled: enabled });
      toast.success(enabled ? 'Расписание включено' : 'Расписание выключено');
    } catch {
      toast.error('Ошибка обновления');
    } finally {
      setSaving(false);
    }
  }

  async function setIntervalMinutes(minutes: number) {
    if (!schedule) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('parsing_schedules')
        .update({ interval_minutes: minutes })
        .eq('id', schedule.id);
      if (error) throw error;
      setSchedule({ ...schedule, interval_minutes: minutes });
      toast.success(`Интервал: ${minutes / 60} ч`);
    } catch {
      toast.error('Ошибка обновления');
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setRunning(true);
    try {
      const res = await fetch('/api/parse', { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      toast.success('Парсер запущен', { description: 'Выполняется в фоновом режиме…' });
    } catch {
      toast.error('Ошибка запуска парсера');
    } finally {
      setTimeout(() => setRunning(false), 3000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        <span className="text-sm">Загрузка…</span>
      </div>
    );
  }

  if (!schedule) return null;

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('ru-RU', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '—';

  return (
    <div className="space-y-5">
      {/* Toggle Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              schedule.is_enabled
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium">Авто-парсинг</div>
            <div className="text-xs text-muted-foreground">
              {schedule.is_enabled ? 'Включён' : 'Выключен'}
            </div>
          </div>
        </div>
        <Switch checked={schedule.is_enabled} onCheckedChange={toggleEnabled} disabled={saving} />
      </div>

      {/* Interval Selector */}
      <div>
        <div className="mb-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Timer className="h-3 w-3" />
          Интервал
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {INTERVALS.map((i) => (
            <Button
              key={i.value}
              variant={schedule.interval_minutes === i.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIntervalMinutes(i.value)}
              disabled={saving}
              className={
                schedule.interval_minutes === i.value ? 'bg-primary hover:bg-primary/90' : 'text-xs'
              }
            >
              {i.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Schedule Info */}
      <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Следующий запуск</span>
          <span className="font-medium">{fmtDate(schedule.next_run_at)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Последний запуск</span>
          <span className="font-medium">{fmtDate(schedule.last_run_at)}</span>
        </div>
      </div>

      {/* Run Now */}
      <Button className="w-full" variant="outline" onClick={handleRunNow} disabled={running}>
        {running ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Play className="mr-2 h-4 w-4" />
        )}
        {running ? 'Запускается…' : 'Запустить сейчас'}
      </Button>
    </div>
  );
}
