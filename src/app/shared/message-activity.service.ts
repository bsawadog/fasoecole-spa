import { Injectable } from '@angular/core';
import { fromEvent, merge, Subject, timer } from 'rxjs';
/** Refresh indicators after reading/sending, on window focus and while the page stays open. */
@Injectable({providedIn:'root'})
export class MessageActivityService {
  private readonly updates = new Subject<void>();
  readonly refresh = merge(timer(0,20_000),this.updates,fromEvent(window,'focus'));
  changed():void { this.updates.next(); }
}
