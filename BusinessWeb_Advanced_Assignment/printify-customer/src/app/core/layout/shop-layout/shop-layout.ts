import { Component } from '@angular/core';

/** Khung trang phía khách: navbar + nội dung trang (router-outlet) */
@Component({
  selector: 'app-shop-layout',
  standalone: false,
  template: `
    <app-navbar></app-navbar>
    <router-outlet></router-outlet>
  `,
})
export class ShopLayout {}
