import { Component, computed, inject } from '@angular/core';
import { AdminAuthService } from '../../services/admin-auth.service';
import { AdminDataService } from '../../services/admin-data.service';
import { AdminNotificationService } from '../../services/admin-notification.service';
import { confirmSubOf } from '../../models/labels';

/** D0 – Trang chủ Admin: việc cần làm hôm nay + điều hướng nhanh */
@Component({
  selector: 'app-admin-homepage',
  standalone: false,
  templateUrl: './admin-homepage.html',
  styleUrl: './admin-homepage.css',
})
export class AdminHomepage {
  readonly auth = inject(AdminAuthService);
  readonly data = inject(AdminDataService);
  readonly notes = inject(AdminNotificationService);

  private count(sub: string): number {
    return this.data.orders().filter((o) => confirmSubOf(o) === sub).length;
  }

  readonly todo = computed(() => [
    { icon: '💳', label: 'Xác nhận thanh toán', value: this.count('payment_review'), hint: 'Khách đã báo chuyển khoản', link: '/admin/orders-list', q: { tab: 'confirm', sub: 'payment_review' } },
    { icon: '🎨', label: 'Kiểm tra mẫu in', value: this.count('design_review'), hint: 'File thiết kế chờ duyệt trước khi in mẫu', link: '/admin/orders-list', q: { tab: 'confirm', sub: 'design_review' } },
    { icon: '🛑', label: 'Yêu cầu hủy đơn', value: this.count('cancel_request'), hint: 'Khách xin hủy trước khi in', link: '/admin/orders-list', q: { tab: 'confirm', sub: 'cancel_request' } },
    { icon: '🚚', label: 'Sẵn sàng giao', value: this.data.orders().filter((o) => o.orderStatus === 'PRINT_COMPLETED').length, hint: 'In xong, chờ nhập mã vận đơn', link: '/admin/orders-list', q: { tab: 'printed' } },
    { icon: '🏷️', label: 'Tin chờ duyệt', value: this.data.listings().filter((l) => l.status === 'PENDING_REVIEW').length, hint: 'Thiết kế khách gửi lên Marketplace', link: '/admin/marketplace', q: { tab: 'PENDING_REVIEW' } },
    { icon: '🚩', label: 'Báo cáo vi phạm', value: this.data.reports().filter((r) => r.status === 'OPEN').length, hint: 'Khách báo cáo bản quyền', link: '/admin/marketplace', q: { tab: 'reports' } },
    { icon: '📉', label: 'Sắp hết / hết hàng', value: this.data.products().filter((p) => p.isActive && this.data.stockLevel(p) !== 'ok').length, hint: 'Sản phẩm có biến thể dưới ngưỡng', link: '/admin/products-list', q: { stock: 'low' } },
  ]);

  readonly shortcuts = [
    { icon: '📊', label: 'Dashboard', text: 'Doanh thu, trạng thái đơn, tồn kho, khảo sát TAM', link: '/admin/dashboard' },
    { icon: '👕', label: 'Quản lý sản phẩm', text: 'Giá, mô tả, biến thể, tồn kho, vùng in', link: '/admin/products-list' },
    { icon: '📦', label: 'Quản lý đơn hàng', text: 'Thanh toán, kiểm tra mẫu, in, giao hàng, hủy đơn', link: '/admin/orders-list' },
    { icon: '🎨', label: 'Marketplace', text: 'Duyệt tin đăng, doanh số thiết kế, báo cáo vi phạm', link: '/admin/marketplace' },
    { icon: '🔔', label: 'Thông báo', text: 'Các việc đang chờ xử lý', link: '/admin/notifications' },
  ];

  readonly hello = (() => {
    const h = new Date().getHours();
    return h < 11 ? 'Chào buổi sáng' : h < 14 ? 'Chào buổi trưa' : h < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  })();
}
