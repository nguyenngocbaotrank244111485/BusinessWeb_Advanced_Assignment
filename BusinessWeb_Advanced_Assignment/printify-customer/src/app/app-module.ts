import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';

import { BrowserModule } from '@angular/platform-browser';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { ImgFallbackDirective } from './shared/img-fallback.directive';
import { SurveyQuestionsComponent } from './survey-questions-component/survey-questions-component';

@NgModule({
  declarations: [App, PrintifyHomepage, SurveyQuestionsComponent],
  imports: [BrowserModule, AppRoutingModule, ImgFallbackDirective, ReactiveFormsModule],
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient()],
  bootstrap: [App],
})
export class AppModule {}
