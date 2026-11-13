
import { Component, OnInit } from '@angular/core';
import { Product, ProductService } from '../services/product-service';

@Component({
  selector: 'app-printify-homepage',
  standalone: false,
  styleUrl: './printify-homepage.css',
  templateUrl: './printify-homepage.html',
})
export class PrintifyHomepage implements OnInit {
  products: Product[] = [];
  categories: string[] = [];

  isLoading = true;
  errorMessage = '';

  activeCategory = 'all';
  searchTerm = '';
  brokenImageIds = new Set<Product['_id']>();

  constructor(private productService: ProductService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.productService.getProducts().subscribe({
      next: (data) => {
        this.products = data.filter(
          product => product.isActive === true
        );

        this.categories = [
          ...new Set(
            this.products.map(product => product.category)
          )
        ];

        this.isLoading = false;
      },
      error: (error) => {
        console.error('Lỗi tải sản phẩm:', error);
        this.errorMessage = 'Không thể tải sản phẩm.';
        this.isLoading = false;
      }
    });
  }

  // Lọc sản phẩm theo danh mục và từ khóa
  get visibleProducts(): Product[] {
    const keyword = this.searchTerm.trim().toLowerCase();

    return this.products.filter(product => {
      const matchCategory =
        this.activeCategory === 'all' ||
        product.category === this.activeCategory;

      const matchSearch =
        !keyword ||
        product.name.toLowerCase().includes(keyword);

      return matchCategory && matchSearch;
    });
  }

  // Chọn danh mục
  selectCategory(category: string): void {
    this.activeCategory = category;
  }

  // Nhập từ khóa tìm kiếm
  onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm = input.value;
  }

  // Xóa bộ lọc
  clearFilters(): void {
    this.activeCategory = 'all';
    this.searchTerm = '';
  }

  // Hiển thị tên danh mục
  categoryLabel(category: string): string {
    return category;
  }

  // Icon danh mục
  categoryIcon(category: string): string {
    const name = category.toLowerCase();

    if (name.includes('áo')) return '👕';
    if (name.includes('ly') || name.includes('cốc')) return '☕';
    if (name.includes('túi')) return '👜';
    if (name.includes('móc khóa')) return '🔑';
    if (name.includes('sticker')) return '✨';
    if (name.includes('sổ')) return '📓';

    return '🎨';
  }

  // Icon dự phòng cho sản phẩm
  productIcon(category: string): string {
    return this.categoryIcon(category);
  }

  // Định dạng giá tiền
  formatPrice(price: number): string {
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: 'VND',
      maximumFractionDigits: 0
    }).format(price);
  }

  // Xử lý khi ảnh sản phẩm không tải được
  onProductImageError(id: Product['_id']): void {
    this.brokenImageIds.add(id);
  }
}
