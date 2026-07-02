import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format, startOfDay, endOfDay, subDays, eachDayOfInterval, eachHourOfInterval, differenceInHours, isSameDay, startOfHour } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Activity, Calendar as CalendarIcon, DollarSign, Lightbulb, Timer, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { FloorPlan } from "@/components/dashboard/FloorPlan";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { ConsumptionChart, type SeriesPoint } from "@/components/dashboard/ConsumptionChart";
import { RoomBreakdown, type RoomStat } from "@/components/dashboard/RoomBreakdown";

import {
  subscribeReadings,
  subscribeCurrentStates,
  subscribeUsers,
  type Reading,
  type UserOption,
} from "@/lib/data";
import { ROOMS, type RoomId } from "@/lib/rooms";
import { formatBRL, formatKwh, formatHours } from "@/lib/energy";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel de Consumo — Iluminação Inteligente" },
      { name: "description", content: "Monitore o gasto energético da sua iluminação inteligente por cômodo e período." },
      { property: "og:title", content: "Painel de Consumo — Iluminação Inteligente" },
      { property: "og:description", content: "Monitore o gasto energético da sua iluminação inteligente por cômodo e período." },
    ],
  }),
  component: Dashboard,
});

type Preset = "today" | "7d" | "30d" | "custom";

function Dashboard() {
  const [preset, setPreset] = useState<Preset>("7d");
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({});
  const [roomId, setRoomId] = useState<RoomId | "all">("all");
  const [userId, setUserId] = useState<string | "all">("all");
  const [users, setUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      const u = await subscribeUsers(setUsers);
      if (cancelled) u();
      else unsub = u;
    })();
    return () => { cancelled = true; unsub(); };
  }, []);

  const { from, to, label } = useMemo(() => {
    const now = new Date();
    if (preset === "today") {
      return { from: startOfDay(now), to: endOfDay(now), label: "Hoje" };
    }
    if (preset === "7d") {
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), label: "Últimos 7 dias" };
    }
    if (preset === "30d") {
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), label: "Últimos 30 dias" };
    }
    const f = range.from ? startOfDay(range.from) : startOfDay(subDays(now, 6));
    const t = range.to ? endOfDay(range.to) : endOfDay(now);
    return {
      from: f,
      to: t,
      label: `${format(f, "dd/MM", { locale: ptBR })} — ${format(t, "dd/MM", { locale: ptBR })}`,
    };
  }, [preset, range]);

  const [readings, setReadings] = useState<Reading[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      const u = await subscribeReadings({ from, to, roomId, userId }, (rows) => {
        setReadings(rows);
        setConnected(true);
      });
      if (cancelled) u();
      else unsub = u;
    })();
    return () => {
      cancelled = true;
      unsub();
    };
  }, [from, to, roomId, userId]);

  const totals = useMemo(() => {
    const secondsOn = readings.reduce((a, r) => a + r.secondsOn, 0);
    const presence = readings.reduce((a, r) => a + r.presenceCount, 0);
    const kwh = readings.reduce((a, r) => a + r.energyKwh, 0);
    const cost = readings.reduce((a, r) => a + r.estimatedCostBrl, 0);
    return { hoursOn: secondsOn / 3600, kwh, cost, presence };
  }, [readings]);

  const [allReadings, setAllReadings] = useState<Reading[]>([]);
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      const u = await subscribeReadings({ from, to, roomId: "all", userId }, setAllReadings);
      if (cancelled) u();
      else unsub = u;
    })();
    return () => { cancelled = true; unsub(); };
  }, [from, to, userId]);

  const availableRoomIds = useMemo(() => {
    const set = new Set<RoomId>();
    for (const r of allReadings) set.add(r.roomId);
    return Array.from(set);
  }, [allReadings]);

  const availableRooms = useMemo(
    () => ROOMS.filter((r) => availableRoomIds.includes(r.id)),
    [availableRoomIds],
  );

  useEffect(() => {
    if (roomId !== "all" && availableRoomIds.length > 0 && !availableRoomIds.includes(roomId as RoomId)) {
      setRoomId("all");
    }
  }, [availableRoomIds, roomId]);

  const roomStats: RoomStat[] = useMemo(() => {
    return availableRooms.map((r) => {
      const rows = allReadings.filter((x) => x.roomId === r.id);
      const hoursOn = rows.reduce((a, x) => a + x.secondsOn, 0) / 3600;
      const kwh = rows.reduce((a, x) => a + x.energyKwh, 0);
      const cost = rows.reduce((a, x) => a + x.estimatedCostBrl, 0);
      return { roomId: r.id, hoursOn, kwh, cost };
    }).sort((a, b) => b.kwh - a.kwh);
  }, [allReadings, availableRooms]);

  const series: SeriesPoint[] = useMemo(() => {
    const hoursSpan = differenceInHours(to, from);
    if (hoursSpan <= 48) {
      const hours = eachHourOfInterval({ start: from, end: to });
      return hours.map((h) => {
        const bucket = readings.filter((r) => startOfHour(r.createdAt).getTime() === h.getTime());
        const kwh = bucket.reduce((a, r) => a + r.energyKwh, 0);
        const cost = bucket.reduce((a, r) => a + r.estimatedCostBrl, 0);
        return {
          label: format(h, hoursSpan <= 24 ? "HH:mm" : "dd/MM HH'h'", { locale: ptBR }),
          kwh,
          cost,
        };
      });
    }
    const days = eachDayOfInterval({ start: from, end: to });
    return days.map((d) => {
      const bucket = readings.filter((r) => isSameDay(r.createdAt, d));
      const kwh = bucket.reduce((a, r) => a + r.energyKwh, 0);
      const cost = bucket.reduce((a, r) => a + r.estimatedCostBrl, 0);
      return {
        label: format(d, "dd/MM", { locale: ptBR }),
        kwh,
        cost,
      };
    });
  }, [readings, from, to]);

  const emptyStates = useMemo(() => {
    const s = {} as Record<RoomId, { on: boolean; recentPresence: boolean }>;
    for (const r of ROOMS) s[r.id] = { on: false, recentPresence: false };
    return s;
  }, []);
  const [states, setStates] = useState(emptyStates);
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;
    (async () => {
      const u = await subscribeCurrentStates(setStates, userId);
      if (cancelled) u();
      else unsub = u;
    })();
    return () => { cancelled = true; unsub(); };
  }, [userId]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-primary">
              <Zap className="h-3.5 w-3.5" />
              Iluminação Inteligente
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Painel de Consumo
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              LED 1W · Tarifa R$ 0,92/kWh · Dados via ESP32 + Firebase
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={userId} onValueChange={(v) => setUserId(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Usuário" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os usuários</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.userName}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={roomId} onValueChange={(v) => setRoomId(v as RoomId | "all")}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Cômodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cômodos</SelectItem>
                {availableRooms.map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex overflow-hidden rounded-md border border-border">
              {(["today", "7d", "30d"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium transition-colors",
                    preset === p
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  {p === "today" ? "Hoje" : p === "7d" ? "7d" : "30d"}
                </button>
              ))}
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(preset === "custom" && "border-primary text-primary")}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {preset === "custom" && range.from
                    ? `${format(range.from, "dd/MM")}${range.to ? ` — ${format(range.to, "dd/MM")}` : ""}`
                    : "Personalizado"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: range.from, to: range.to }}
                  onSelect={(r) => {
                    if (r) {
                      setRange({ from: r.from, to: r.to });
                      setPreset("custom");
                    }
                  }}
                  numberOfMonths={2}
                  className="pointer-events-auto p-3"
                />
              </PopoverContent>
            </Popover>
          </div>
        </header>

        {/* KPI grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Consumo"
            value={formatKwh(totals.kwh)}
            sub={label}
            icon={<Zap className="h-5 w-5" />}
            accent="primary"
          />
          <KpiCard
            label="Custo estimado"
            value={formatBRL(totals.cost)}
            sub={`Tarifa R$ 0,92/kWh`}
            icon={<DollarSign className="h-5 w-5" />}
            accent="accent"
          />
          <KpiCard
            label="Tempo aceso"
            value={formatHours(totals.hoursOn)}
            sub={roomId === "all" ? "Todos os cômodos" : ROOMS.find((r) => r.id === roomId)?.name}
            icon={<Timer className="h-5 w-5" />}
            accent="chart3"
          />
          <KpiCard
            label="Detecções de presença"
            value={totals.presence.toLocaleString("pt-BR")}
            sub="Eventos no período"
            icon={<Activity className="h-5 w-5" />}
            accent="chart4"
          />
        </div>

        {/* Main grid */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-border/60 bg-[var(--gradient-panel)] p-5">
              <FloorPlan
                states={states}
                selected={roomId}
                onSelect={setRoomId}
                visibleRooms={availableRoomIds}
              />
            </Card>
            <ConsumptionChart
              data={series}
              title={roomId === "all" ? "Consumo total" : `Consumo — ${ROOMS.find((r) => r.id === roomId)?.name}`}
              subtitle={label}
            />
          </div>

          <div className="space-y-6">
            <RoomBreakdown stats={roomStats} selected={roomId} onSelect={setRoomId} />

            <Card className="border-border/60 bg-[var(--gradient-panel)] p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Como o cálculo funciona</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    A ESP32 envia ao Firebase o tempo em que o LED (1W) ficou aceso
                    a cada hora. Multiplicamos <span className="text-foreground">horas × 1W</span>{" "}
                    para obter kWh e aplicamos a tarifa de R$ 0,92.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <footer className="mt-10 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected ? "bg-accent shadow-[0_0_8px_currentColor]" : "bg-muted-foreground/40",
            )}
          />
          {connected ? "Ao vivo · Firestore · smart-lighting-d0e03" : "Conectando ao Firestore…"}
        </footer>
      </div>
    </div>
  );
}
