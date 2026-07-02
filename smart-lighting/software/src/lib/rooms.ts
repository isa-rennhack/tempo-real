export type RoomId = "sala" | "cozinha" | "quarto1" | "quarto2" | "banheiro";

export interface Room {
  id: RoomId;
  name: string;
  /** Position on the isometric floor plan grid (columns/rows) */
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  color: string; // chart color token
}

export const ROOMS: Room[] = [
  { id: "sala",     name: "Sala",     col: 1, row: 2, colSpan: 3, rowSpan: 2, color: "var(--chart-1)" },
  { id: "cozinha",  name: "Cozinha",  col: 4, row: 2, colSpan: 2, rowSpan: 2, color: "var(--chart-2)" },
  { id: "quarto1",  name: "Quarto 1", col: 1, row: 1, colSpan: 2, rowSpan: 1, color: "var(--chart-3)" },
  { id: "quarto2",  name: "Quarto 2", col: 3, row: 1, colSpan: 2, rowSpan: 1, color: "var(--chart-4)" },
  { id: "banheiro", name: "Banheiro", col: 5, row: 1, colSpan: 1, rowSpan: 1, color: "var(--chart-5)" },
];

export const ROOM_BY_ID: Record<RoomId, Room> = Object.fromEntries(
  ROOMS.map((r) => [r.id, r]),
) as Record<RoomId, Room>;