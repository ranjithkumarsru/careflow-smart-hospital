export function money(value: number | string, currency = "INR"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}
