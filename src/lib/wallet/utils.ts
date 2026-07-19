// ============================================================
// Wallet utilities — formatting + helpers
// ============================================================

export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

export function formatFcfaShort(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(".", ",")} M FCFA`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)} k FCFA`;
  return `${amount} FCFA`;
}

export function percentOf(part: number, whole: number): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 100);
}

export function groupByMonth(
  items: { createdAt: string; amountFcfa: number }[]
): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = item.createdAt.slice(0, 7);
    map.set(key, (map.get(key) ?? 0) + item.amountFcfa);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => ({
      label: formatMonthLabel(key),
      value,
    }));
}

function formatMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-");
  const months = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc"];
  return `${months[Number(month) - 1]} ${year}`;
}

export function isToday(isoDate: string): boolean {
  return isoDate.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

export function isThisMonth(isoDate: string): boolean {
  return isoDate.slice(0, 7) === new Date().toISOString().slice(0, 7);
}
