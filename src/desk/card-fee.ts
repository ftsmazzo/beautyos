export function cardFeeShares(
  amountCents: number,
  rateBps: number,
  lines: { id: string; priceCents: number; commissionCents: number; abatementCents: number }[],
) {
  const feeCents = Math.round((amountCents * rateBps) / 10_000);
  const half = Math.floor(feeCents / 2);
  const eligible = lines.filter((line) => line.priceCents > 0 && line.commissionCents - line.abatementCents > 0);
  const base = eligible.reduce((sum, line) => sum + line.priceCents, 0);
  if (feeCents < 1 || half < 1 || base < 1) return { feeCents, shares: [] as { id: string; abatementCents: number }[] };
  let left = half;
  const shares = eligible
    .map((line, index) => {
      const room = line.commissionCents - line.abatementCents;
      const raw = index === eligible.length - 1 ? left : Math.floor((half * line.priceCents) / base);
      const share = Math.max(0, Math.min(raw, room, left));
      left -= share;
      return { id: line.id, abatementCents: share };
    })
    .filter((share) => share.abatementCents > 0);
  return { feeCents, shares };
}
