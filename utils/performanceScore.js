function lerpScore(value, goodMax, poorMin) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  if (value <= goodMax) return 100;
  if (value >= poorMin) return 0;
  const t = (value - goodMax) / (poorMin - goodMax);
  return Math.max(0, Math.min(100, 100 - t * 100));
}

function calculatePerformanceScore(percentiles) {
  if (!percentiles) {
    return { score: 0, lcpScore: 0, clsScore: 0, fidScore: 0, ttfbScore: 0, basis: 'p75' };
  }

  const lcp = percentiles.lcp_p75;
  const cls = percentiles.cls_p75;
  const fid = percentiles.fid_p75;
  const ttfb = percentiles.ttfb_p75;

  const lcpScore = lerpScore(lcp, 2500, 4000);
  const clsScore = lerpScore(cls, 0.1, 0.25);
  const fidScore = lerpScore(fid, 100, 300);
  const ttfbScore = lerpScore(ttfb, 800, 1800);

  const score = Math.round((lcpScore + clsScore + fidScore + ttfbScore) / 4);

  return {
    score,
    lcpScore: Math.round(lcpScore),
    clsScore: Math.round(clsScore),
    fidScore: Math.round(fidScore),
    ttfbScore: Math.round(ttfbScore),
    basis: 'p75',
  };
}

module.exports = {
  calculatePerformanceScore,
};
