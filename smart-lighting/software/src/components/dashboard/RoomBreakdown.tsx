import { Card } from "@/components/ui/card";
import { ROOM_BY_ID, type RoomId } from "@/lib/rooms";
import { formatBRL, formatKwh, formatHours } from "@/lib/energy";
import { cn } from "@/lib/utils";

export interface RoomStat {
  roomId: RoomId;
  kwh: number;
  cost: number;
  hoursOn: number;
}

interface Props {
  stats: RoomStat[];
  selected: RoomId | "all";
  onSelect: (id: RoomId | "all") => void;
}

export function RoomBreakdown({ stats, selected, onSelect }: Props) {
  const max = Math.max(...stats.map((s) => s.kwh), 0.0001);
  return (
    <Card className="border-border/60 bg-[var(--gradient-panel)] p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Consumo por cômodo</h3>
        <p className="text-xs text-muted-foreground">No período selecionado</p>
      </div>
      <div className="space-y-3">
        {stats.map((s) => {
          const room = ROOM_BY_ID[s.roomId];
          const pct = (s.kwh / max) * 100;
          const active = selected === s.roomId;
          return (
            <button
              key={s.roomId}
              onClick={() => onSelect(active ? "all" : s.roomId)}
              className={cn(
                "w-full rounded-lg border border-transparent p-2 text-left transition-colors",
                active ? "border-primary/50 bg-primary/10" : "hover:bg-secondary/40",
              )}
            >
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ background: room.color }}
                  />
                  <span className="font-medium">{room.name}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatHours(s.hoursOn)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary/60">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    background: room.color,
                    boxShadow: `0 0 12px ${room.color}`,
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                <span>{formatKwh(s.kwh)}</span>
                <span className="font-medium text-foreground/90">
                  {formatBRL(s.cost)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}