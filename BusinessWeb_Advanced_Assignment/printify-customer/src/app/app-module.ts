import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';

import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';

import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { SurveyQuestionsComponent } from './survey-questions-component/survey-questions-component';

@NgModule({
  declarations: [App, PrintifyHomepage, SurveyQuestionsComponent],
  imports: [BrowserModule, AppRoutingModule],
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient()],
  bootstrap: [App],
})
export class AppModule {}
