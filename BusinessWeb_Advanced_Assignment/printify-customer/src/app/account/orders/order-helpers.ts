import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Order, OrderItem, PAYMENT_METHODS } from '../../models/order.model';
import { Product } from '../../models/product.model';
import { ProductService } from '../../services/product-service';
import { DesignService } from '../../services/design-service';
import { CartService } from '../../services/cart-service';

/** Dùng chung cho C14 / C15: ảnh, tên biến thể, mua lại */
@Injectable({ providedIn: 'root' })
export class OrderHelpers {
  private readonly ps = inject(ProductService);
  private readonly designs = inject(DesignService);
  private readonly cart = inject(CartService);
  private readonly products = toSignal(this.ps.getProducts(), { initialValue: [] as Product[] });

  product(id: string): Product | undefined {
    return this.products().find((p) => p._id === id);
  }

  /** Ảnh dòng đơn: ảnh thiết kế (nếu có) > ảnh màu đã chọn > ảnh sản phẩm */
  image(i: OrderItem): string {
    if (i.designId) {
      const d = this.designs.get(i.designId);
      if (d?.previewUrl) return d.previewUrl;
    }
    if (i.imageUrl) return i.imageUrl;
    const p = this.product(i.productId);
    const v = p?.variants.find((x) => x._id === i.variantId);
    return v?.imageUrl || p?.img_display || '';
  }

  variantText(i: OrderItem): string {
    const p = this.product(i.productId);
    const v = p?.variants.find((x) => x._id === i.variantId);
    const color = i.color || v?.color;
    const size = i.size ?? v?.size;
    return [color ? this.ps.colorLabel(color) : '', size ? 'Size ' + size : ''].filter(Boolean).join(' · ');
  }

  payment(o: Order): string {
    const m = PAYMENT_METHODS[o.paymentMethod ?? 'BANK'];
    return m.icon + ' ' + m.label;
  }

  /** Mua lại: đưa các dòng còn hàng vào giỏ. Trả về số dòng thêm được */
  rebuy(o: Order): { added: number; skipped: string[] } {
    let added = 0;
    const skipped: string[] = [];
    for (const i of o.items) {
      const p = this.product(i.productId);
      const v = p?.variants.find((x) => x._id === i.variantId);
      if (!p || !v || !p.isActive || v.stock < 1) {
        skipped.push(i.productName);
        continue;
      }
      const qty = Math.min(i.qty, v.stock);
      const d = i.designId ? this.designs.get(i.designId) : undefined;
      const ok = d
        ? this.cart.addDesigned(p, v, qty, { designId: d._id, previewUrl: d.previewUrl, listingId: d.listingId })
        : this.cart.add(p, v, qty);
      if (ok) added++;
      else skipped.push(i.productName);
    }
    return { added, skipped };
  }
}
