import { Pipe, PipeTransform } from '@angular/core';

/** Định dạng tiền Việt: {{ 180000 | vnd }} -> "180.000đ" */
@Pipe({ name: 'vnd', standalone: false })
export class VndPipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    if (value == null || isNaN(value)) return '';
    return new Intl.NumberFormat('vi-VN').format(value) + 'đ';
  }
}
