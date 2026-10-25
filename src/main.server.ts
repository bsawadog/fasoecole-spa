import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, PrerenderFallback, RenderMode, withRoutes } from '@angular/ssr';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { PUBLIC_PAGES } from './app/core/seo/public-pages';

const config=mergeApplicationConfig(appConfig,{
 providers:[provideServerRendering(withRoutes([
  ...Object.keys(PUBLIC_PAGES).filter(path=>!path.startsWith('/services/')).map(path=>({path:path.slice(1),renderMode:RenderMode.Prerender as const})),
  {path:'services/:slug',renderMode:RenderMode.Prerender,fallback:PrerenderFallback.Client,
   getPrerenderParams:async()=>Object.keys(PUBLIC_PAGES).filter(path=>path.startsWith('/services/')).map(path=>({slug:path.split('/')[2]}))},
  {path:'**',renderMode:RenderMode.Client},
 ]))],
});
export default (context:BootstrapContext)=>bootstrapApplication(App,config,context);
