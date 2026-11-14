
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { SurveyQuestionsComponent } from './survey-questions-component/survey-questions-component';

import { customerAuthGuard }
  from './guards/customer-auth';

const routes: Routes = [
  {path: 'printify-homepage', component: PrintifyHomepage,
    pathMatch: 'full'
  }, 

  // Đăng nhập
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./login-component/login-component')
        .then(m => m.LoginComponent)
  },

  // Đăng ký
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./register-component/register-component')
        .then(m => m.RegisterComponent)
  },

  {
    path: 'survey-question',
    component: SurveyQuestionsComponent,
    canActivate: [customerAuthGuard]
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
