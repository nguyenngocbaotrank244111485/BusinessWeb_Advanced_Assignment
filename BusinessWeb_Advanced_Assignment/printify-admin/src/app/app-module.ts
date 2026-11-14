import { NgModule, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { AppRoutingModule } from './app-routing-module';
import { App } from './app';
import { SharedModule } from './shared/shared-module';
import { AdminLayout } from './core/layout/admin-layout';
import { AdminLogin } from './core/login/admin-login';
import { AdminForbidden, AdminNotFound } from './core/errors/admin-errors';

@NgModule({
  declarations: [
    App, AdminLayout, AdminLogin, AdminForbidden, AdminNotFound,
  ],
  imports: [BrowserModule, SharedModule, AppRoutingModule],
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient()],
  bootstrap: [App],
})
export class AppModule {}
