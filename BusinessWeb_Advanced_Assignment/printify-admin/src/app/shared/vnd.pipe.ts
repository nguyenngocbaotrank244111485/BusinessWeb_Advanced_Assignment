import { Pipe, PipeTransform } from '@angular/core';

/** 180000 -> "180.000đ" */
@Pipe({ name: 'vnd', standalone: false })
export class VndPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    return new Intl.NumberFormat('vi-VN').format(Math.round(value ?? 0)) + 'đ';
  }
}
