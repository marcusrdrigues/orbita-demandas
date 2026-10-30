import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { cabecalhosInterceptor } from './core/cabecalhos.interceptor';

// Zoneless é o padrão no Angular 21; não usar provideZoneChangeDetection.
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideHttpClient(withInterceptors([cabecalhosInterceptor]))],
};
