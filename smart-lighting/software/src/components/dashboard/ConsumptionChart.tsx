import { Card } from "@/components/ui/card";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKwh, formatBRL } from "@/lib/energy";

export interface SeriesPoint {
  label: string;
  kwh: number;
  cost: number;
}

interface Props {
  data: SeriesPoint[];
  title: string;
  subtitle?: string;
}

export function ConsumptionChart({ data, title, subtitle }: Props) {
  return (
    <Card className="border-border/60 bg-[var(--gradient-panel)] p-5">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="kwhFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.55} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 4" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              minTickGap={16}
            />
            <YAxis
              stroke="var(--muted-foreground)"
              tickLine={false}
              axisLine={false}
              fontSize={11}
              width={44}
              tickFormatter={(v: number) =>
                v >= 1 ? `${v.toFixed(1)} kWh` : `${(v * 1000).toFixed(0)} Wh`
              }
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
              }}
              labelStyle={{ color: "var(--muted-foreground)" }}
              formatter={(_v, _n, entry) => {
                const p = entry.payload as SeriesPoint;
                return [`${formatKwh(p.kwh)} · ${formatBRL(p.cost)}`, "Consumo"];
              }}
            />
            <Area
              type="monotone"
              dataKey="kwh"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill="url(#kwhFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}