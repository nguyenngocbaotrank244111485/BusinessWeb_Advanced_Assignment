
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Product {
  _id: string;
  name: string;
  category: string;
  price: number;
  img_display: string;
  isActive: boolean;
  allowCustomization: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {

  private readonly apiUrl = '/dataset/products.json';

  constructor(private http: HttpClient) {}

  getProducts(): Observable<Product[]> {
    return this.http.get<Product[]>(this.apiUrl);
  }
}
