/** ui/kanji — 数を漢数字へ（〜九万九千九百九十九）。 */
const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const UNITS: Array<[number, string]> = [
  [10000, '万'],
  [1000, '千'],
  [100, '百'],
  [10, '十'],
];
export function toKanji(value: number): string {
  let n = Math.max(0, Math.floor(value));
  if (n === 0) return '零';
  let out = '';
  for (const [unit, label] of UNITS) {
    const d = Math.floor(n / unit);
    if (d > 0) {
      // 「一万」は一を添え、「千・百・十」は一を略す
      out += (d === 1 && unit !== 10000 ? '' : DIGITS[d]) + label;
      n -= d * unit;
    }
  }
  return out + DIGITS[n];
}
