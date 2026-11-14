import { Component, Input } from '@angular/core';
import { Product } from '../../../models/product.model';

/** "Sản phẩm tương tự" (tối đa 4) – dùng product-card dạng thu gọn */
@Component({
  selector: 'app-similar-products',
  standalone: false,
  template: `
    @if (products.length) {
      <section aria-labelledby="similar-title">
        <h2 id="similar-title">{{ title }}</h2>
        <div class="grid">
          @for (p of products.slice(0, 4); track p._id) {
            <app-product-card [product]="p" [compact]="true"></app-product-card>
          }
        </div>
      </section>
    }
  `,
  styles: [`
    h2 { font-size: 22px; letter-spacing: -.02em; color: var(--pf-ink); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 16px; }
  `],
})
export class SimilarProducts {
  @Input() products: Product[] = [];
  @Input() title = 'Sản phẩm tương tự';
}
