export function cardFeeShares(
  amountCents: number,
  rateBps: number,
  lines: { id: string; priceCents: number; commissionCents: number; abatementCents: number }[],
  sharePercent = 50,
) {
  const feeCents = Math.round((amountCents * rateBps) / 10_000);
  const percent = Math.min(100, Math.max(0, Math.round(sharePercent)));
  const professionalCents = Math.floor((feeCents * percent) / 100);
  const eligible = lines.filter((line) => line.priceCents > 0 && line.commissionCents - line.abatementCents > 0);
  const base = eligible.reduce((sum, line) => sum + line.priceCents, 0);
  if (feeCents < 1 || professionalCents < 1 || base < 1) return { feeCents, shares: [] as { id: string; abatementCents: number }[] };
  let left = professionalCents;
  const shares = eligible
    .map((line, index) => {
      const room = line.commissionCents - line.abatementCents;
      const raw = index === eligible.length - 1 ? left : Math.floor((professionalCents * line.priceCents) / base);
      const share = Math.max(0, Math.min(raw, room, left));
      left -= share;
      return { id: line.id, abatementCents: share };
    })
    .filter((share) => share.abatementCents > 0);
  return { feeCents, shares };
}
