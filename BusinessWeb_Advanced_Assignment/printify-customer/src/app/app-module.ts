import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';

import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { SurveyQuestionsComponent } from './survey-questions-component/survey-questions-component';
import { CoreModule } from './core/core-module';
import { SharedModule } from './shared/shared-module';
import { ShopModule } from './shop/shop-module';

@NgModule({
  declarations: [App, PrintifyHomepage, SurveyQuestionsComponent],
  // ShopModule phải đứng TRƯỚC AppRoutingModule để route ** (404) nằm cuối cùng
  imports: [BrowserModule, ReactiveFormsModule, CoreModule, SharedModule, ShopModule, AppRoutingModule],
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient()],
  bootstrap: [App],
})
export class AppModule {}
