import { ROOMS, type RoomId } from "./rooms";
import { ensureDb } from "./firebase";
import {
  collection,
  onSnapshot,
  query as fsQuery,
  where,
  orderBy,
  Timestamp,
} from "firebase/firestore";

export interface Reading {
  roomId: RoomId;
  createdAt: Date;
  secondsOn: number;
  presenceCount: number;
  presenceDetected: boolean;
  energyKwh: number;
  estimatedCostBrl: number;
  userId?: string;
}

export interface Query {
  from: Date;
  to: Date;
  roomId?: RoomId | "all";
  userId?: string | "all";
}

interface RawDoc {
  roomId: RoomId;
  createdAt?: Timestamp;
  epoch?: number;
  secondsOn?: number;
  presenceCount?: number;
  presenceDetected?: boolean;
  energyKwh?: number;
  estimatedCostBrl?: number;
  userId?: string;
}

function toReading(v: RawDoc): Reading | null {
  const createdAt = v.createdAt
    ? v.createdAt.toDate()
    : v.epoch
      ? new Date(v.epoch * 1000)
      : null;
  if (!createdAt || !v.roomId) return null;
  return {
    roomId: v.roomId,
    createdAt,
    secondsOn: v.secondsOn ?? 0,
    presenceCount: v.presenceCount ?? 0,
    presenceDetected: v.presenceDetected ?? false,
    energyKwh: v.energyKwh ?? 0,
    estimatedCostBrl: v.estimatedCostBrl ?? 0,
    userId: v.userId,
  };
}

/**
 * Subscribe to the readings collection with a live listener. Returns an
 * unsubscribe function. Calls `cb` whenever the snapshot updates.
 */
export async function subscribeReadings(
  q: Query,
  cb: (r: Reading[]) => void,
  onError?: (e: unknown) => void,
): Promise<() => void> {
  const db = await ensureDb();
  if (!db) {
    cb([]);
    return () => {};
  }
  const col = collection(db, "readings");
  const constraints = [
    where("createdAt", ">=", Timestamp.fromDate(q.from)),
    where("createdAt", "<=", Timestamp.fromDate(q.to)),
    orderBy("createdAt", "asc"),
  ];
  if (q.roomId && q.roomId !== "all") {
    constraints.push(where("roomId", "==", q.roomId));
  }
  if (q.userId && q.userId !== "all") {
    constraints.push(where("userId", "==", q.userId));
  }
  const qy = fsQuery(col, ...constraints);
  return onSnapshot(
    qy,
    (snap) => {
      const out: Reading[] = [];
      for (const d of snap.docs) {
        const r = toReading(d.data() as RawDoc);
        if (r) out.push(r);
      }
      cb(out);
    },
    (err) => {
      console.error("[firestore] readings subscription error:", err);
      onError?.(err);
    },
  );
}

/**
 * Subscribe to the last ~5 minutes of readings across all rooms and derive a
 * live "on / presence" state per room.
 */
export async function subscribeCurrentStates(
  cb: (s: Record<RoomId, { on: boolean; recentPresence: boolean }>) => void,
  userId?: string | "all",
): Promise<() => void> {
  const db = await ensureDb();
  const empty = {} as Record<RoomId, { on: boolean; recentPresence: boolean }>;
  for (const r of ROOMS) empty[r.id] = { on: false, recentPresence: false };
  if (!db) {
    cb(empty);
    return () => {};
  }
  const windowMs = 5 * 60 * 1000;
  const from = new Date(Date.now() - windowMs);
  const constraints = [where("createdAt", ">=", Timestamp.fromDate(from))];
  if (userId && userId !== "all") {
    constraints.push(where("userId", "==", userId));
  }
  const qy = fsQuery(collection(db, "readings"), ...constraints);
  return onSnapshot(
    qy,
    (snap) => {
      const state = { ...empty };
      for (const r of ROOMS) state[r.id] = { on: false, recentPresence: false };
      // Track most recent doc per room to determine current on/presence.
      const latest: Partial<Record<RoomId, Reading>> = {};
      for (const d of snap.docs) {
        const r = toReading(d.data() as RawDoc);
        if (!r) continue;
        const prev = latest[r.roomId];
        if (!prev || r.createdAt > prev.createdAt) latest[r.roomId] = r;
      }
      for (const room of ROOMS) {
        const r = latest[room.id];
        if (!r) continue;
        state[room.id] = {
          on: r.secondsOn > 0 || r.energyKwh > 0,
          recentPresence: r.presenceDetected || r.presenceCount > 0,
        };
      }
      cb(state);
    },
    (err) => console.error("[firestore] states subscription error:", err),
  );
}

export interface UserOption {
  id: string;
  userName: string;
}

export async function subscribeUsers(
  cb: (users: UserOption[]) => void,
): Promise<() => void> {
  const db = await ensureDb();
  if (!db) {
    cb([]);
    return () => {};
  }
  const qy = collection(db, "users");
  return onSnapshot(
    qy,
    (snap) => {
      const out: UserOption[] = [];
      for (const d of snap.docs) {
        const v = d.data() as { userName?: string };
        const userName = v.userName?.trim();
        if (!userName) continue;
        out.push({ id: d.id, userName });
      }
      out.sort((a, b) => a.userName.localeCompare(b.userName));
      cb(out);
    },
    (err) => console.error("[firestore] users subscription error:", err),
  );
}
