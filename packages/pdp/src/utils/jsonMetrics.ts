export function jsonDepth(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v !== "object") return 1;
  if (Array.isArray(v)) {
    if (v.length === 0) return 2;
    return 1 + Math.max(...v.map(jsonDepth));
  }
  const vals = Object.values(v);
  if (vals.length === 0) return 2;
  return 1 + Math.max(...vals.map(jsonDepth));
}

export function maxArrayLength(v: any): number {
  let max = 0;
  const walk = (x: any) => {
    if (x && typeof x === "object") {
      if (Array.isArray(x)) {
        max = Math.max(max, x.length);
        for (const i of x) walk(i);
      } else {
        for (const val of Object.values(x)) walk(val);
      }
    }
  };
  walk(v);
  return max;
}
