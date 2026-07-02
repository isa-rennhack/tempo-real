import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  accent?: "primary" | "accent" | "chart3" | "chart4";
}

const accentMap = {
  primary: "text-primary",
  accent: "text-accent",
  chart3: "text-[color:var(--chart-3)]",
  chart4: "text-[color:var(--chart-4)]",
} as const;

export function KpiCard({ label, value, sub, icon, accent = "primary" }: Props) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-[var(--gradient-panel)] p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          {sub && (
            <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg bg-background/60",
            accentMap[accent],
          )}
        >
          {icon}
        </div>
      </div>
    </Card>
  );
}