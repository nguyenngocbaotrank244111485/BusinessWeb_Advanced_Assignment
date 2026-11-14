import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../shared/shared-module';
import { AboutPage } from './about-page/about-page';

/** AboutModule (lazy) – C04 Giới thiệu: /about */
@NgModule({
  declarations: [AboutPage],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: AboutPage, title: 'Giới thiệu | PrintiFy' }])],
})
export class AboutModule {}
