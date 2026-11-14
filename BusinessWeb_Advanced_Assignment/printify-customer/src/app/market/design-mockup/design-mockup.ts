import { Component, Input, OnChanges } from '@angular/core';
import { PrintArea, Product } from '../../models/product.model';

/**
 * Mockup: ghép thiết kế lên ảnh sản phẩm theo vùng in (printArea, tỉ lệ 0–1 trên ảnh).
 * mix-blend-mode: multiply giúp hình "ăn" vào nếp vải / bóng sáng như in thật.
 * Khung luôn vuông; ảnh sản phẩm giữ đúng tỉ lệ, vùng in tính theo chính ảnh đó.
 */
@Component({
  selector: 'app-design-mockup',
  standalone: false,
  template: `
    <div class="frame" [class.rounded]="rounded" (contextmenu)="$event.preventDefault()">
      <div class="stage">
        <img class="product" [src]="product.img_display" [alt]="alt || product.name" loading="lazy" draggable="false" appImgFallback />
        <img class="art" [src]="currentArt" alt="" draggable="false" (error)="useFallback()"
          [style.left.%]="area.x * 100" [style.top.%]="area.y * 100"
          [style.width.%]="area.width * 100" [style.height.%]="area.height * 100" />
      </div>
      @if (watermark) { <div class="wm" [style.background-image]="pattern" aria-hidden="true"></div> }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .frame { position: relative; aspect-ratio: 1; overflow: hidden; background: #fff; display: flex; justify-content: center; user-select: none; }
    .frame.rounded { border-radius: 20px; }
    .stage { position: relative; height: 100%; }
    .product { display: block; height: 100%; width: auto; max-width: none; }
    .art { position: absolute; object-fit: contain; mix-blend-mode: multiply; pointer-events: none; }
    .wm { position: absolute; inset: 0; background-repeat: repeat; background-size: 220px 140px; pointer-events: none; }
  `],
})
export class DesignMockup implements OnChanges {
  @Input({ required: true }) product!: Product;
  @Input({ required: true }) area!: PrintArea;
  /** File in nền trong suốt */
  @Input({ required: true }) art = '';
  /** Ảnh dự phòng khi thiếu file in (ví dụ ảnh xem trước của thiết kế) */
  @Input() fallbackArt = '';
  @Input() alt = '';
  @Input() rounded = false;
  /** Chữ watermark chìm, để trống = không phủ */
  @Input() watermark = '';

  currentArt = '';
  pattern = '';

  ngOnChanges(): void {
    this.currentArt = this.art || this.fallbackArt;
    if (this.watermark) {
      const safe = this.watermark.replace(/[<>&"']/g, '');
      const svg =
        `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='140'><text x='110' y='75' text-anchor='middle' ` +
        `transform='rotate(-24 110 70)' font-family='Arial,sans-serif' font-size='14' font-weight='700' fill='#786d8a' ` +
        `fill-opacity='.18'>${safe}</text></svg>`;
      this.pattern = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
    }
  }

  useFallback(): void {
    if (this.fallbackArt && this.currentArt !== this.fallbackArt) this.currentArt = this.fallbackArt;
  }
}
