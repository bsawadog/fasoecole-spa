import { Injectable,inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PayableRow,PayablePayment,PayablePay } from './payables.service';

export const TAX_CODES={TVA:'TVA',IUTS:'IUTS',TPA:'TPA',PATENTE:'Patente',INCOME:'Impôt sur le revenu',PROPERTY:'Impôt / taxe foncière',OTHER:'Autre impôt ou taxe'};
export type TaxCode=keyof typeof TAX_CODES;
export interface TaxRow {id:number;code:TaxCode;periodStart:string;periodEnd:string;origin:'MANUAL'|'PAYROLL'|'EXPENSE';declarationReference:string|null;version:number;carryover:boolean;obligation:PayableRow;}
export interface SupplierVat {key:string;date:string;estimatedDate:boolean;label:string;supplier:string|null;invoiceNumber:string|null;supplierIfu:string|null;amount:number;}
export interface TaxOverview {supplierVat?:SupplierVat[];year:number;rows:TaxRow[];due:number;paid:number;remaining:number;overdue:number;}
export interface TaxEvent {id:number;action:string;amount:number;dueDate:string;reason:string;author:string;createdAt:string;}
export interface TaxDetail {tax:TaxRow;payments:PayablePayment[];events:TaxEvent[];}
export interface TaxInput {requestId:string;code:TaxCode;label:string;periodStart:string;periodEnd:string;amount:number;dueDate:string;creditor:string;declarationReference:string|null;notes:string|null;}
export interface TaxEdit {version:number;amount:number;dueDate:string;creditor:string;declarationReference:string|null;notes:string|null;reason:string;}
export interface TaxPayrollPreview {month:string;iuts:number;tpa:number;remunerations:number;vacationWithholding?:number;}
export interface TaxPayrollInput {month:string;dueDate:string;creditor:string;declarationReference:string|null;reason:string;}
@Injectable({providedIn:'root'})
export class SchoolTaxesService {
  private readonly http=inject(HttpClient);
  private url(school:number){return `${environment.apiUrl}/owner/taxes/schools/${school}`;}
  overview(school:number,year:number){return this.http.get<TaxOverview>(this.url(school),{params:{year}});}
  synchronizePayroll(school:number,year:number){return this.http.post<TaxOverview>(this.url(school)+'/synchronize-payroll',null,{params:{year}});}
  detail(school:number,id:number){return this.http.get<TaxDetail>(`${this.url(school)}/${id}`);}
  create(school:number,value:TaxInput){return this.http.post<TaxRow>(this.url(school),value);}
  edit(school:number,id:number,value:TaxEdit){return this.http.put<TaxRow>(`${this.url(school)}/${id}`,value);}
  cancel(school:number,id:number,version:number,reason:string){return this.http.post<void>(`${this.url(school)}/${id}/cancel`,{version,reason});}
  pay(school:number,id:number,value:PayablePay){return this.http.post(`${this.url(school)}/${id}/payments`,value);}
  preview(school:number,month:string){return this.http.get<TaxPayrollPreview>(`${this.url(school)}/payroll-preview`,{params:{month}});}
  importPayroll(school:number,value:TaxPayrollInput){return this.http.post<void>(`${this.url(school)}/payroll-import`,value);}
}
