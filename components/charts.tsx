'use client';

import {
  Line, LineChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const AXIS = { stroke: '#8a8a94', fontSize: 11 };
const GRID = '#1f1f23';

const tip = {
  contentStyle: { background: '#121214', border: '1px solid #1f1f23', borderRadius: 6, fontSize: 12 },
  labelStyle: { color: '#8a8a94' },
};

export function GrowthChart({ data }: { data: { date: string; joined: number; churned: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }}
               tickFormatter={(v: string) => v.slice(8)} minTickGap={18} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tip} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8a8a94' }} />
        <Line type="monotone" dataKey="joined" name="New" stroke="#6366f1" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="churned" name="Churned" stroke="#ef4444" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AttributionBars({ data }: {
  data: { channel: string; applications: number; leads: number; closes: number; cash: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="channel" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tip} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8a8a94' }} />
        <Bar dataKey="applications" name="Applications" fill="#3f3f6b" />
        <Bar dataKey="leads" name="Leads" fill="#4f4fa8" />
        <Bar dataKey="closes" name="Closes" fill="#6366f1" />
        <Bar dataKey="cash" name="Cash (€)" fill="#a5a6f6" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CashVsContract({ data }: { data: { month: string; cash: number; contract: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false}
               tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip {...tip} formatter={(v: any) => `€${Number(v).toLocaleString()}`} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#8a8a94' }} />
        <Bar dataKey="cash" name="Cash collected" fill="#6366f1" />
        <Bar dataKey="contract" name="New contract value" fill="#3f3f6b" />
      </BarChart>
    </ResponsiveContainer>
  );
}
