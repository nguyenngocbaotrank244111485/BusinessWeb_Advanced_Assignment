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
    inject(HttpClient)
      .get<Partial<PublicConfig>>('/dataset/appConfig.json')
      .pipe(catchError(() => of({} as Partial<PublicConfig>)))
      .subscribe((c) => this._config.set({ ...DEFAULTS, ...c }));
  }
}
