import { clsx } from 'clsx';
import type { ReactNode } from 'react';

export function Panel({ title, hint, right, children, className }: {
  title?: string; hint?: string; right?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={clsx('rounded-lg border border-edge bg-surface', className)}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 border-b border-edge px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-medium tracking-tight">{title}</h2>}
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, tone = 'default' }: {
  label: string; value: string; sub?: string; tone?: 'default' | 'warn' | 'bad' | 'good';
}) {
  const toneClass = { default: 'text-white', warn: 'text-warn', bad: 'text-bad', good: 'text-good' }[tone];
  return (
    <div className="rounded-lg border border-edge bg-surface px-5 py-6">
      <p className="text-xs uppercase tracking-widest text-muted">{label}</p>
      <p className={clsx('tnum mt-3 text-4xl font-semibold leading-none tracking-tight', toneClass)}>{value}</p>
      {sub && <p className="mt-2 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const tones = {
    muted: 'border-edge text-muted',
    good: 'border-good/40 text-good',
    warn: 'border-warn/40 text-warn',
    bad: 'border-bad/40 text-bad',
    accent: 'border-accent/40 text-accent',
  } as const;
  return (
    <span className={clsx('inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] leading-none', tones[tone])}>
      {children}
    </span>
  );
}

/** Amber triangle shown wherever a name can't be trusted. Used site-wide. */
export function UnverifiedName({ label }: { label?: string }) {
  return (
    <span title="Name unverified — pending review" className="inline-flex items-center gap-1 text-warn">
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
        <path d="M8 1.5 15 14H1L8 1.5Zm0 4.2a.7.7 0 0 0-.7.75l.2 3.1a.5.5 0 0 0 1 0l.2-3.1A.7.7 0 0 0 8 5.7Zm0 5.4a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
      </svg>
      {label && <span className="text-xs">{label}</span>}
      <span className="sr-only">Name unverified</span>
    </span>
  );
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'accent'; children: ReactNode }) {
  const tones = {
    warn: 'border-warn/30 bg-warn/5 text-warn',
    bad: 'border-bad/30 bg-bad/5 text-bad',
    accent: 'border-accent/30 bg-accent/5 text-accent',
  } as const;
  return <div className={clsx('rounded-md border px-3.5 py-2.5 text-xs leading-relaxed', tones[tone])}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted">{children}</p>;
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={clsx('whitespace-nowrap px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted', className)}>{children}</th>;
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={clsx('whitespace-nowrap px-3 py-2.5 text-sm', className)}>{children}</td>;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}
