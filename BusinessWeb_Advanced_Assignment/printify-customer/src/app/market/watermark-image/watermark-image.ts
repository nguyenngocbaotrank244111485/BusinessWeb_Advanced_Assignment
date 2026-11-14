import { Component, Input } from '@angular/core';

/**
 * Ảnh xem trước có watermark lặp chéo (BR18: chỉ công khai bản watermark).
 * Giai đoạn mock: phủ watermark bằng CSS; khi có backend, watermarkUrl đã là ảnh được xử lý sẵn.
 */
@Component({
  selector: 'app-watermark-image',
  standalone: false,
  template: `
    <div class="wm" [class.rounded]="rounded" (contextmenu)="$event.preventDefault()">
      <img [src]="src" [alt]="alt" loading="lazy" draggable="false" appImgFallback />
      <div class="overlay" [style.background-image]="pattern" aria-hidden="true"></div>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .wm { position: relative; aspect-ratio: 1; overflow: hidden; background: var(--pf-soft); user-select: none; }
    .wm.rounded { border-radius: 20px; }
    img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .overlay { position: absolute; inset: 0; background-repeat: repeat; background-size: 220px 140px; pointer-events: none; }
  `],
})
export class WatermarkImage {
  @Input({ required: true }) src = '';
  @Input() alt = '';
  @Input() rounded = false;

  private _label = 'PrintiFy · bản xem trước';
  private _pattern = this.build(this._label);

  /** Chữ in chìm, mặc định "PrintiFy · bản xem trước" */
  @Input() set label(value: string | null | undefined) {
    this._label = value || 'PrintiFy · bản xem trước';
    this._pattern = this.build(this._label);
  }

  get pattern(): string {
    return this._pattern;
  }

  private build(text: string): string {
    const safe = text.replace(/[<>&"']/g, '');
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='140'>` +
      `<text x='110' y='75' text-anchor='middle' transform='rotate(-24 110 70)' ` +
      `font-family='Arial,sans-serif' font-size='15' font-weight='700' fill='white' fill-opacity='.55' ` +
      `stroke='black' stroke-opacity='.18' stroke-width='.6'>${safe}</text></svg>`;
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
  }
}
