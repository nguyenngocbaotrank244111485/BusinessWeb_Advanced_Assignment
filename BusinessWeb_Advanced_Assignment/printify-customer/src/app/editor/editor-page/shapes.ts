/** Hình khối cho Editor: path SVG trong hộp 100×100, dùng cả để vẽ icon menu lẫn tạo object Fabric */
export interface ShapeDef {
  key: string;
  label: string;
  d: string;
  fill: string;
}

/** Đa giác đều / ngôi sao nội tiếp hộp 100×100 */
function polygon(points: number, inner = 0): string {
  const n = inner ? points * 2 : points;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = inner && i % 2 ? 50 * inner : 50;
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

export const SHAPES: ShapeDef[] = [
  { key: 'square', label: 'Hình vuông', d: 'M0 0H100V100H0Z', fill: '#b19cd9' },
  { key: 'rect', label: 'Hình chữ nhật', d: 'M0 20H100V80H0Z', fill: '#b19cd9' },
  {
    key: 'rounded',
    label: 'Vuông bo góc',
    d: 'M18 0H82Q100 0 100 18V82Q100 100 82 100H18Q0 100 0 82V18Q0 0 18 0Z',
    fill: '#d6b8e6',
  },
  { key: 'circle', label: 'Hình tròn', d: 'M0 50A50 50 0 1 0 100 50A50 50 0 1 0 0 50Z', fill: '#ffa6c9' },
  { key: 'oval', label: 'Hình oval', d: 'M0 50A50 32 0 1 0 100 50A50 32 0 1 0 0 50Z', fill: '#ffa6c9' },
  { key: 'triangle', label: 'Tam giác', d: 'M50 0L100 100H0Z', fill: '#8b57c4' },
  { key: 'right-triangle', label: 'Tam giác vuông', d: 'M0 0L100 100H0Z', fill: '#8b57c4' },
  { key: 'diamond', label: 'Hình thoi', d: 'M50 0L100 50L50 100L0 50Z', fill: '#b5528f' },
  { key: 'pentagon', label: 'Ngũ giác', d: polygon(5), fill: '#b19cd9' },
  { key: 'hexagon', label: 'Lục giác', d: 'M25 0H75L100 50L75 100H25L0 50Z', fill: '#b19cd9' },
  { key: 'star', label: 'Ngôi sao', d: polygon(5, 0.42), fill: '#f4b400' },
  { key: 'star-6', label: 'Sao 6 cánh', d: polygon(6, 0.55), fill: '#f4b400' },
  {
    key: 'heart',
    label: 'Trái tim',
    d: 'M50 92C20 70 0 52 0 30C0 12 14 0 30 0C40 0 47 6 50 14C53 6 60 0 70 0C86 0 100 12 100 30C100 52 80 70 50 92Z',
    fill: '#e2456f',
  },
  { key: 'arrow', label: 'Mũi tên', d: 'M0 35H60V10L100 50L60 90V65H0Z', fill: '#8b57c4' },
  {
    key: 'bubble',
    label: 'Bong bóng chat',
    d: 'M12 0H88Q100 0 100 12V58Q100 70 88 70H42L20 96V70H12Q0 70 0 58V12Q0 0 12 0Z',
    fill: '#d6b8e6',
  },
  {
    key: 'cloud',
    label: 'Đám mây',
    d: 'M25 85C11 85 0 75 0 62C0 50 9 41 21 40C22 24 35 12 51 12C64 12 75 20 79 32C91 33 100 43 100 56C100 72 88 85 72 85Z',
    fill: '#a7c7f2',
  },
];
