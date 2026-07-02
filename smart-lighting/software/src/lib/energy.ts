export const TARIFF_BRL_PER_KWH = 0.92;
export const LED_POWER_W = 1;

export function hoursOnToKwh(hoursOn: number, powerW = LED_POWER_W) {
  return (hoursOn * powerW) / 1000;
}

export function kwhToBRL(kwh: number, tariff = TARIFF_BRL_PER_KWH) {
  return kwh * tariff;
}

export function formatBRL(v: number) {
  if (v > 0 && v < 0.1) {
    return v.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    });
  }
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatKwh(v: number) {
  if (v < 0.001) return `${(v * 1_000_000).toFixed(0)} µWh`;
  if (v < 1) return `${(v * 1000).toFixed(1)} Wh`;
  return `${v.toFixed(3)} kWh`;
}

export function formatHours(h: number) {
  const totalMin = Math.round(h * 60);
  const hh = Math.floor(totalMin / 60);
  const mm = totalMin % 60;
  if (hh === 0) return `${mm}min`;
  return `${hh}h ${mm.toString().padStart(2, "0")}min`;
}