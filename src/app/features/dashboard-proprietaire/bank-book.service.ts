import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CashEntry, CashMovement } from './cash-book.service';
export interface BankOverview {
  book: { openedOn: string; openingBalance: number } | null;
  month: string; openingBalance: number; receipts: number; payments: number; closingBalance: number; rows: CashMovement[];
}
@Injectable({ providedIn: 'root' })
export class BankBookService {
  private readonly http=inject(HttpClient);
  private url(id:number){return `${environment.apiUrl}/owner/bank-book/schools/${id}`;}
  overview(id:number,month:string){return this.http.get<BankOverview>(this.url(id),{params:{month}});}
  open(id:number,date:string,openingBalance:number){return this.http.post<void>(this.url(id)+'/open',{date,openingBalance});}
  add(id:number,entry:CashEntry){return this.http.post<void>(this.url(id)+'/entries',entry);}
  delete(id:number,entryId:number){return this.http.delete<void>(this.url(id)+'/entries/'+entryId);}
}
