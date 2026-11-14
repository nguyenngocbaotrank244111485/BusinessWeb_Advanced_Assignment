import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TIERS } from '../../models/membership.model';
import { Category, Product } from '../../models/product.model';
import { ConfigService } from '../../services/config-service';
import { MarketService } from '../../services/market-service';
import { ProductService } from '../../services/product-service';

interface Faq {
  q: string;
  a: string;
}

/**
 * C04 – Giới thiệu: /about
 * Số liệu (sản phẩm, danh mục, thiết kế Marketplace, phí) lấy từ dữ liệu thật để không bị lệch khi dữ liệu đổi.
 */
@Component({
  selector: 'app-about-page',
  standalone: false,
  templateUrl: './about-page.html',
  styleUrl: './about-page.css',
})
export class AboutPage {
  readonly ps = inject(ProductService);
  private readonly market = inject(MarketService);
  readonly cfg = inject(ConfigService).config;

  private readonly products = toSignal(this.ps.getActiveProducts(), { initialValue: [] as Product[] });
  readonly categories = toSignal(this.ps.getCategories(), { initialValue: [] as Category[] });

  readonly productCount = computed(() => this.products().length);
  readonly designCount = computed(() => this.market.approved().length);
  readonly feePercent = computed(() => Math.round(this.cfg().platformFeeRate * 100));
  /** Hạng thành viên (C18): Đồng / Bạc / Vàng – dùng chung luật với Giỏ hàng, Checkout */
  readonly tiers = TIERS;

  /** 4 ảnh minh họa: mỗi danh mục 1 sản phẩm */
  readonly showcase = computed(() => {
    const seen = new Set<string>();
    return this.products().filter((p) => !seen.has(p.category) && !!seen.add(p.category)).slice(0, 4);
  });
  /** Ảnh đại diện mỗi danh mục */
  readonly categoryImage = computed(() => {
    const map = new Map<string, string>();
    for (const p of this.products()) if (!map.has(p.category)) map.set(p.category, p.img_display);
    return map;
  });

  readonly steps = [
    { icon: '👕', title: 'Chọn phôi', text: 'Áo, túi, cốc, sổ tay, tranh… đủ màu và size, xem tồn kho ngay trên trang.' },
    { icon: '🎨', title: 'Tự thiết kế', text: 'Thêm chữ, ảnh, hình khối, bút vẽ trên cả mặt trước và mặt sau. Hoặc dùng mẫu có sẵn từ Marketplace.' },
    { icon: '📱', title: 'Đặt hàng, quét QR', text: 'Kiểm tra giỏ, điền địa chỉ rồi chuyển khoản bằng mã QR. Mã có hiệu lực trong vài phút.' },
    { icon: '📦', title: 'Duyệt mẫu & nhận hàng', text: 'PrintiFy xác nhận thanh toán, gửi mẫu in để bạn duyệt rồi mới in và giao tận nơi.' },
  ];

  readonly promises = [
    { icon: '✨', title: 'In đúng như bạn thấy', text: 'Vùng in hiển thị rõ trên Editor, phần ngoài khung nét đứt sẽ không được in.' },
    { icon: '🛡️', title: 'Bảo vệ người sáng tạo', text: 'Thiết kế trên Marketplace chỉ hiện ảnh có watermark, người mua không tải được file gốc.' },
    { icon: '💜', title: 'Giá minh bạch', text: 'Thấy đủ tiền phôi, phí thiết kế, ưu đãi thành viên và phí giao hàng trước khi thanh toán.' },
    { icon: '✅', title: 'Duyệt trước khi in', text: 'Đơn có thiết kế riêng được gửi mẫu cho bạn duyệt, chưa ưng thì chỉnh lại.' },
  ];

  readonly openFaq = signal<number | null>(0);

  readonly faqs = computed<Faq[]>(() => {
    const c = this.cfg();
    const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
    return [
      {
        q: 'Thanh toán như thế nào?',
        a: `Sau khi đặt hàng, bạn chuyển khoản bằng mã QR. Mã có hiệu lực ${c.orderPaymentMinutes} phút. Bấm “Tôi đã thanh toán” để PrintiFy đối soát; đơn chỉ được in sau khi nhân viên xác nhận đã nhận tiền.`,
      },
      {
        q: 'Phí giao hàng và ưu đãi ra sao?',
        a: `Phí giao hàng ${vnd(c.shippingFeeVnd)} mỗi đơn. Thành viên được giảm trên tiền hàng theo hạng: ${TIERS.map((t) => `${t.label} ${Math.round(t.discountRate * 100)}%${t.minSpent ? ` (chi tiêu từ ${vnd(t.minSpent)})` : ''}`).join(', ')}. Ưu đãi không áp vào phí thiết kế và phí giao hàng.`,
      },
      {
        q: 'Phí thiết kế Marketplace tính thế nào?',
        a: `Phí thiết kế tính một lần cho mỗi dòng sản phẩm, không nhân theo số lượng. Người bán nhận đúng giá họ đặt, PrintiFy thu thêm ${Math.round(c.platformFeeRate * 100)}% phí sàn.`,
      },
      {
        q: 'Tôi có thể bán thiết kế của mình không?',
        a: 'Có. Vào My marketplace, chọn thiết kế bạn tự tạo, đặt tên, mô tả và giá rồi gửi duyệt. Tin chỉ hiện công khai sau khi được duyệt. Thiết kế mua từ người khác thì không được bán lại.',
      },
      {
        q: 'Nếu thấy thiết kế vi phạm bản quyền thì sao?',
        a: 'Bấm “Báo cáo vi phạm bản quyền” trên trang thiết kế, chọn lý do và mô tả. Nhóm kiểm duyệt sẽ xem xét và gỡ tin nếu vi phạm.',
      },
      {
        q: 'Có cần tài khoản để mua không?',
        a: 'Bạn xem sản phẩm và thêm vào giỏ mà không cần đăng nhập. Khi thanh toán, tự thiết kế hoặc dùng mẫu Marketplace thì cần đăng nhập để lưu đơn và thiết kế của bạn.',
      },
    ];
  });

  toggle(i: number): void {
    this.openFaq.set(this.openFaq() === i ? null : i);
  }
}
