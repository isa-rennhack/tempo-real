import { ROOMS, type RoomId } from "@/lib/rooms";
import { cn } from "@/lib/utils";

interface Props {
  states: Record<RoomId, { on: boolean; recentPresence: boolean }>;
  selected: RoomId | "all";
  onSelect: (id: RoomId | "all") => void;
  visibleRooms?: RoomId[];
}

export function FloorPlan({ states, selected, onSelect, visibleRooms }: Props) {
  const rooms = visibleRooms
    ? ROOMS.filter((r) => visibleRooms.includes(r.id))
    : ROOMS;
  return (
    <div className="relative w-full overflow-hidden">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Planta da casa</h3>
          <p className="text-xs text-muted-foreground">
            Clique em um cômodo para filtrar
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[var(--glow-accent)]" />
            Luz acesa
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-primary/60" />
            Presença
          </span>
        </div>
      </div>

      <div
        className="relative mx-auto flex w-full items-center justify-center overflow-hidden"
        style={{ perspective: "1400px", perspectiveOrigin: "50% 30%" }}
      >
        <div
          className="relative grid gap-1.5 rounded-2xl border border-border/60 bg-[var(--gradient-panel)] p-3"
          style={{
            width: "min(90%, 460px)",
            aspectRatio: "6 / 3",
            gridTemplateColumns: "repeat(6, 1fr)",
            gridTemplateRows: "repeat(3, 1fr)",
            transform: "rotateX(42deg) rotateZ(-22deg) scale(0.82)",
            transformStyle: "preserve-3d",
            boxShadow: "0 30px 60px -20px rgba(0,0,0,0.55)",
          }}
        >
          {rooms.length === 0 && (
            <div className="col-span-6 row-span-3 flex items-center justify-center text-xs text-muted-foreground">
              Nenhum cômodo com dados no período
            </div>
          )}
          {rooms.map((room) => {
            const s = states[room.id];
            const active = selected === room.id;
            return (
              <button
                key={room.id}
                onClick={() => onSelect(active ? "all" : room.id)}
                className={cn(
                  "group relative rounded-lg border transition-all duration-300",
                  "flex flex-col items-start justify-end p-2 text-left",
                  s.on
                    ? "border-accent/60 bg-accent/25"
                    : "border-border/50 bg-secondary/40 hover:bg-secondary/70",
                  active && "!border-primary bg-primary/30 outline outline-2 outline-primary",
                )}
                style={{
                  gridColumn: `${room.col} / span ${room.colSpan}`,
                  gridRow: `${room.row} / span ${room.rowSpan}`,
                  transform: active
                    ? "translateZ(32px)"
                    : s.on
                      ? "translateZ(18px)"
                      : "translateZ(4px)",
                  boxShadow: active
                    ? "0 0 0 3px hsl(var(--primary)), var(--glow-primary, 0 0 30px hsl(var(--primary) / 0.6))"
                    : s.on
                      ? "var(--glow-accent)"
                      : "none",
                }}
              >
                {/* Bulb indicator */}
                <span
                  className={cn(
                    "absolute right-2 top-2 h-2.5 w-2.5 rounded-full transition-all",
                    s.on
                      ? "bg-accent shadow-[0_0_12px_currentColor]"
                      : "bg-muted-foreground/30",
                  )}
                  style={{ transform: "rotateZ(22deg) rotateX(-42deg)" }}
                />
                {s.recentPresence && (
                  <span
                    className="absolute left-2 top-2 h-2 w-2 rounded-full bg-primary"
                    style={{ transform: "rotateZ(22deg) rotateX(-42deg)" }}
                  />
                )}
                <span
                  className="text-[10px] font-medium uppercase tracking-wider text-foreground/85"
                  style={{ transform: "rotateZ(22deg) rotateX(-42deg)" }}
                >
                  {room.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}