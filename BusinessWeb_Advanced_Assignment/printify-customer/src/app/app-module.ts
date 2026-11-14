import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';

import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { ImgFallbackDirective } from './shared/img-fallback.directive';
import { ProductList } from './product-list/product-list';
import { ProductDetail } from './product-detail/product-detail';
import { ComingSoon } from './coming-soon/coming-soon';
import { SiteHeader } from './shared/site-header/site-header';
import { SurveyQuestionsComponent } from './survey-questions-component/survey-questions-component';

@NgModule({
  declarations: [App, PrintifyHomepage, SurveyQuestionsComponent, ProductList, ProductDetail, SiteHeader, ComingSoon],
  imports: [BrowserModule, AppRoutingModule, ImgFallbackDirective, ReactiveFormsModule],
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient()],
  bootstrap: [App],
})
export class AppModule {}
