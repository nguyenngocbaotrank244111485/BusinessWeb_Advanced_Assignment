import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';

/** Tham số công khai trong appConfig.json (GET /api/config/public khi có backend) */
export interface PublicConfig {
  shippingFeeVnd: number;
  discountRate: number;
  discountThresholdVnd: number;
  platformFeeRate: number;
  orderPaymentMinutes: number;
  qrImageUrl: string;
}

const DEFAULTS: PublicConfig = {
  shippingFeeVnd: 20000,
  discountRate: 0.05,
  discountThresholdVnd: 5000000,
  platformFeeRate: 0.1,
  orderPaymentMinutes: 10,
  qrImageUrl: '/dataset/images/qr/printify-qr.png',
};

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly _config = signal<PublicConfig>(DEFAULTS);
  readonly config = this._config.asReadonly();

  constructor() {
    const http = inject(HttpClient);
    // GET /api/config/public; server chưa chạy thì đọc tạm appConfig.json
    http
      .get<Partial<PublicConfig>>('/api/config/public')
      .pipe(
        catchError(() => http.get<Partial<PublicConfig>>('/dataset/appConfig.json')),
        catchError(() => of({} as Partial<PublicConfig>)),
      )
      .subscribe((c) => this._config.set({ ...DEFAULTS, ...c }));
  }
}
