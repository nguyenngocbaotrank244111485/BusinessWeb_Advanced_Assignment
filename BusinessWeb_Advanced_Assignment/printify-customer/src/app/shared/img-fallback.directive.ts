import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import { PLACEHOLDER_IMAGE } from '../services/product-service';

/**
 * Dùng: <img [src]="product.img_display" appImgFallback>
 * Khi ảnh lỗi 404: thử lần lượt đuôi .webp/.jpg/.jpeg/.png cùng tên,
 * nếu vẫn lỗi thì hiện ảnh placeholder (không bị icon ảnh vỡ).
 */
@Directive({
  selector: 'img[appImgFallback]',
  standalone: true,
})
export class ImgFallbackDirective {
  /** Ảnh thay thế tuỳ chọn, mặc định là placeholder */
  @Input() appImgFallback: string | '' = '';

  private tried = new Set<string>();
  private queue: string[] | null = null;

  constructor(private el: ElementRef<HTMLImageElement>) {}

  @HostListener('error')
  onError(): void {
    const img = this.el.nativeElement;
    const current = img.getAttribute('src') ?? '';
    this.tried.add(current);

    if (this.queue === null) {
      const base = current.replace(/\.(webp|jpe?g|png)$/i, '');
      const exts = ['.webp', '.jpg', '.jpeg', '.png'];
      this.queue = base !== current ? exts.map((e) => base + e) : [];
      this.queue.push(this.appImgFallback || PLACEHOLDER_IMAGE);
    }

    const next = this.queue.find((src) => !this.tried.has(src));
    if (next) {
      img.src = next;
    }
  }
}
