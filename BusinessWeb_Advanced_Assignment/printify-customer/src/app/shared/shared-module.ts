import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProductCard } from './product-card/product-card';
import { Pagination } from './pagination/pagination';
import { EmptyState } from './empty-state/empty-state';
import { VndPipe } from './pipes/vnd-pipe';
import { StatusBadge } from './status-badge/status-badge';
import { ImgFallbackDirective } from './img-fallback.directive';

/** Component/pipe dùng lại ở nhiều module (Ch.II 2.3: @Input/@Output) */
@NgModule({
  declarations: [ProductCard, Pagination, EmptyState, VndPipe, StatusBadge],
  imports: [CommonModule, RouterModule, ImgFallbackDirective],
  exports: [CommonModule, RouterModule, ImgFallbackDirective, ProductCard, Pagination, EmptyState, VndPipe, StatusBadge],
})
export class SharedModule {}
