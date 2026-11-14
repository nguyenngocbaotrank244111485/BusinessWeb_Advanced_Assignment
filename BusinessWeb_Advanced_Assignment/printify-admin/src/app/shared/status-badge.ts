import { Component, Input } from '@angular/core';

/** Nhãn trạng thái màu: tone = ok | warn | bad | info | action */
@Component({
  selector: 'app-badge',
  standalone: false,
  template: `<span class="badge" [class]="'badge ' + (tone || '')">{{ label }}</span>`,
})
export class StatusBadge {
  @Input({ required: true }) label = '';
  @Input() tone: string = '';
}
