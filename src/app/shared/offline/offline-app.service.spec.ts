import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import { OfflineAppService } from './offline-app.service';

describe('Offline application preparation', () => {
  const descriptor=Object.getOwnPropertyDescriptor(navigator,'serviceWorker');
  beforeEach(() => {
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{ready:Promise.resolve({}),controller:{}}});
    vi.stubGlobal('caches',{keys:async()=>['application'],open:async()=>({match:async()=>new Response('shell',{status:200})})});
    TestBed.configureTestingModule({providers:[{provide:SwUpdate,useValue:{isEnabled:true}}]});
  });
  afterEach(() => {
    TestBed.resetTestingModule();vi.unstubAllGlobals();
    if(descriptor)Object.defineProperty(navigator,'serviceWorker',descriptor);
    else Reflect.deleteProperty(navigator,'serviceWorker');
  });
  it('does not announce readiness when the worker is active but files are still downloading',async()=>{
    let complete!:(response:Response)=>void;
    const download=vi.fn(()=>new Promise<Response>(resolve=>{complete=resolve;}));
    vi.stubGlobal('fetch',download);
    const service=TestBed.inject(OfflineAppService),prepared=service.prepare();
    await vi.waitFor(()=>expect(download).toHaveBeenCalledOnce());
    expect(service.ready()).toBe(false);expect(service.busy()).toBe(true);
    expect(service.prepare()).toBe(prepared);
    complete(new Response('shell',{status:200}));await prepared;
    expect(service.ready()).toBe(true);expect(service.busy()).toBe(false);
    expect(download.mock.calls[0]).toEqual([expect.any(URL),expect.objectContaining({cache:'no-cache'})]);
  });
  it('reports an incomplete install on 504 and allows an online retry',async()=>{
    const download=vi.fn().mockResolvedValueOnce(new Response('',{status:504})).mockResolvedValue(new Response('shell',{status:200}));
    vi.stubGlobal('fetch',download);
    const service=TestBed.inject(OfflineAppService);
    await expect(service.prepare()).rejects.toThrow('Préparation hors connexion incomplète');
    expect(service.ready()).toBe(false);expect(service.busy()).toBe(false);
    await service.prepare();expect(service.ready()).toBe(true);expect(service.error()).toBeNull();
  });
  it('waits for the page to be controlled before testing the cached application shell',async()=>{
    const worker=Object.assign(new EventTarget(),{ready:Promise.resolve({}),controller:null as unknown});
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:worker});
    const download=vi.fn().mockResolvedValue(new Response('shell',{status:200}));vi.stubGlobal('fetch',download);
    const service=TestBed.inject(OfflineAppService),prepared=service.prepare();
    await Promise.resolve();await Promise.resolve();
    expect(download).not.toHaveBeenCalled();
    worker.controller={};worker.dispatchEvent(new Event('controllerchange'));
    await prepared;expect(service.ready()).toBe(true);
  });
  it('does not confuse a degraded worker network fallback with a complete installation',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('shell',{status:200})));
    vi.stubGlobal('caches',{keys:async()=>[]});
    const service=TestBed.inject(OfflineAppService);
    await expect(service.prepare()).rejects.toThrow('Préparation hors connexion incomplète');
    expect(service.ready()).toBe(false);
  });
  it('waits for the entry script as well as the HTML shell',async()=>{
    const html='<script src="main-123.js"></script>';
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(html,{status:200})));
    vi.stubGlobal('caches',{keys:async()=>['application'],open:async()=>({
      match:async(url:URL|string)=>String(url).endsWith('index.csr.html')?new Response(html,{status:200}):undefined,
    })});
    const service=TestBed.inject(OfflineAppService);
    await expect(service.prepare()).rejects.toThrow('Préparation hors connexion incomplète');
    expect(service.ready()).toBe(false);
  });
});
