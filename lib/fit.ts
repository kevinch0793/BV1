// Color for an ATS fit score (0-100), changing every 2%:
//   - 100%        -> dark green
//   - 60% .. 100% -> a gradient interpolated between light red (60) and dark
//                    green (100)
//   - under 60%   -> all light red (flat)
// Computed in HSL and returned as CSS color strings used via inline `style`.
// Text color is chosen by background luminance for readable contrast.

export const FIT_THRESHOLD = 60;

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255)) as [number, number, number];
}

function luminance(h: number, s: number, l: number): number {
  const [r, g, b] = hslToRgb(h, s, l).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function fitColor(score: number): { bg: string; text: string } {
  const clamped = Math.max(0, Math.min(100, score));
  const v = Math.floor(clamped / 2) * 2; // even bucket -> color changes every 2%
  // 0 below the threshold (flat light red), ramping to 1 at 100%.
  const t = Math.max(0, Math.min(1, (v - FIT_THRESHOLD) / (100 - FIT_THRESHOLD)));
  const sat = 72;
  const hue = t * 145; //        red (0deg)   -> green (145deg)
  const light = 75 - t * 47; //  light (75%)  -> dark (28%)
  const bg = `hsl(${hue.toFixed(1)} ${sat}% ${light.toFixed(1)}%)`;
  const text = luminance(hue, sat, light) > 0.4 ? `hsl(${hue.toFixed(1)} 65% 22%)` : "#ffffff";
  return { bg, text };
}
