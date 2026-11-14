import { Component, DestroyRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';

/** Ô tìm kiếm: chờ 300ms sau khi ngừng gõ mới phát sự kiện (search) */
@Component({
  selector: 'app-search-box',
  standalone: false,
  template: `
    <label class="search-box">
      <span aria-hidden="true">⌕</span>
      <input type="search" [placeholder]="placeholder" [value]="value" (input)="typed$.next($any($event.target).value)" aria-label="Tìm sản phẩm" />
    </label>
  `,
  styles: [`
    .search-box { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; background: #fff; border: 1px solid var(--pf-line); border-radius: var(--pf-radius); color: var(--pf-muted); }
    .search-box:focus-within { border-color: var(--pf-lavender); box-shadow: 0 0 0 3px var(--pf-pink-50); }
    input { flex: 1; min-width: 0; border: 0; outline: 0; font: inherit; font-size: 14px; color: var(--pf-ink); }
  `],
})
export class SearchBox {
  @Input() value = '';
  @Input() placeholder = 'Tìm theo tên, mô tả...';
  @Output() search = new EventEmitter<string>();

  readonly typed$ = new Subject<string>();

  constructor() {
    this.typed$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((q) => this.search.emit(q.trim()));
  }
}
