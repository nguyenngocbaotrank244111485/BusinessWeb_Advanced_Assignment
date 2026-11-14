import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { VndPipe } from './vnd.pipe';
import { StatusBadge } from './status-badge';

/** Dùng chung cho mọi màn Admin */
@NgModule({
  declarations: [VndPipe, StatusBadge],
  imports: [CommonModule, RouterModule],
  exports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, VndPipe, StatusBadge],
})
export class SharedModule {}
