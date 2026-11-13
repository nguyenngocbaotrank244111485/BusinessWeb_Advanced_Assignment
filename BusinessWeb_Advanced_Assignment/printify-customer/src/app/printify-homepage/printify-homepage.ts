import { Component, OnInit } from '@angular/core';
import { Product, ProductService } from '../services/product-service';

@Component({
  selector: 'app-printify-homepage',
  standalone: false,
  styleUrl: './printify-homepage.css',
  templateUrl: './printify-homepage.html',
})
export class PrintifyHomepage implements OnInit{
  products: Product[] = [];
  categories: string[] = [];

  isLoading = true;
  errorMessage = '';

  constructor(private productService: ProductService) {}

  ngOnInit(): void {
    this.loadProducts();
  }

  loadProducts(): void {
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
}
