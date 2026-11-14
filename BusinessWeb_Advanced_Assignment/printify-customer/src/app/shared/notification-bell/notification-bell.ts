import { Component, ElementRef, HostListener, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification, NotificationService } from '../../services/notification-service';

/**
 * Chuông thông báo trên header (cạnh giỏ hàng): chấm đỏ khi có thông báo chưa đọc,
 * bấm mở danh sách 5 thông báo mới nhất. Dùng ở navbar và trang chủ.
 */
@Component({
  selector: 'app-notification-bell',
  standalone: false,
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.css',
})
export class NotificationBell {
  readonly ns = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly open = signal(false);
  readonly latest = computed(() => this.ns.items().slice(0, 5));

  toggle(): void {
    this.open.update((v) => !v);
  }

  openItem(n: AppNotification): void {
    this.ns.markRead(n._id);
    this.open.set(false);
    const link = this.ns.safeLink(n);
    if (link) void this.router.navigateByUrl(link);
  }

  viewAll(): void {
    this.open.set(false);
    void this.router.navigate(['/account/notifications']);
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    this.open.set(false);
  }
}
