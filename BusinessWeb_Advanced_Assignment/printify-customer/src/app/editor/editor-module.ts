import { NgModule } from '@angular/core';
import { CanDeactivateFn, RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../shared/shared-module';
import { authGuard } from '../core/guards/auth-guard';
import { EditorPage } from './editor-page/editor-page';

/** Rời editor khi chưa lưu -> hộp thoại Lưu / Không lưu / Ở lại */
export const editorLeaveGuard: CanDeactivateFn<EditorPage> = (page) => page.canLeave();

const editorRoute = { component: EditorPage, canActivate: [authGuard], canDeactivate: [editorLeaveGuard] };

/** Phần dùng chung: khai báo EditorPage 1 lần (không kèm route) */
@NgModule({
  declarations: [EditorPage],
  imports: [SharedModule],
  exports: [EditorPage],
})
export class EditorCoreModule {}

/** /editor/:productId (NEW) | /editor/designs/:designId (EDIT) */
const routes: Routes = [
  { path: 'designs/:designId', ...editorRoute, title: 'Sửa thiết kế | PrintiFy' },
  { path: ':productId', ...editorRoute, title: 'Thiết kế sản phẩm | PrintiFy' },
];

@NgModule({ imports: [EditorCoreModule, RouterModule.forChild(routes)] })
export class EditorModule {}

/** /account/orders/:orderId/items/:itemId/edit (SAMPLE_EDIT) */
@NgModule({
  imports: [EditorCoreModule, RouterModule.forChild([{ path: '', ...editorRoute, title: 'Sửa mẫu in | PrintiFy' }])],
})
export class EditorSampleModule {}
