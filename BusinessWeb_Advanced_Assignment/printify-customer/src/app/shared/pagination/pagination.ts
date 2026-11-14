import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Phân trang dùng lại: <app-pagination [page]="p" [totalPages]="n" (pageChange)="go($event)"> */
@Component({
  selector: 'app-pagination',
  standalone: false,
  template: `
    @if (totalPages > 1) {
      <nav class="pagination" aria-label="Phân trang">
        <button type="button" [disabled]="page <= 1" (click)="go(page - 1)" aria-label="Trang trước">‹</button>
        @for (n of pages; track n) {
          <button type="button" [class.active]="n === page" [attr.aria-current]="n === page ? 'page' : null" (click)="go(n)">{{ n }}</button>
        }
        <button type="button" [disabled]="page >= totalPages" (click)="go(page + 1)" aria-label="Trang sau">›</button>
      </nav>
    }
  `,
  styles: [`
    .pagination { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; margin-top: 28px; }
    button { min-width: 38px; height: 38px; border: 1px solid var(--pf-line); border-radius: var(--pf-radius-sm); background: #fff; color: var(--pf-ink); font: inherit; font-weight: 700; cursor: pointer; }
    button.active { background: var(--pf-primary); border-color: var(--pf-primary); color: #fff; }
    button:disabled { opacity: .4; cursor: default; }
  `],
})
export class Pagination {
  @Input() page = 1;
  @Input() totalPages = 1;
  @Output() pageChange = new EventEmitter<number>();

  get pages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  go(n: number): void {
    if (n >= 1 && n <= this.totalPages && n !== this.page) this.pageChange.emit(n);
  }
}
