export const eur = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-IE', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(Number(n));

export const num = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-IE').format(Number(n));

export const pct = (a: number, b: number) => (b === 0 ? '—' : `${Math.round((a / b) * 100)}%`);

export const shortDate = (d: string | null | undefined) =>
  !d ? '—' : new Date(d).toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: '2-digit' });

export const daysBetween = (target: string | null | undefined) => {
  if (!target) return null;
  const ms = new Date(target).getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
};

/** True when the stored name can't be trusted. Drives the amber warning icon. */
export const nameUnverified = (nameSource: string | null | undefined, fullName: string | null | undefined) =>
  !fullName || nameSource === 'unverified_pending_review';

export const displayName = (fullName: string | null | undefined, email: string) =>
  fullName && fullName.trim() !== '' ? fullName : email;

export const monthBounds = (d = new Date()) => {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
};

export const isoDaysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const toCsv = (rows: Record<string, unknown>[]) => {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
};
