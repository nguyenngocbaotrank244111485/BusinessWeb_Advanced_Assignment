import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';

const routes: Routes = [
  {
    path: '',
    component: PrintifyHomepage,
    pathMatch: 'full'
  },
  {
    path: 'printify-homepage',
    component: PrintifyHomepage
  }
];


@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
