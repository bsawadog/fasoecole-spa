import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { PaymentMethod } from './finance.service';

export interface PayrollSchool {id:number;name:string;address:string|null;phone:string|null;email:string|null;}
export interface SalaryPayment {id:number;date:string;amount:number;method:PaymentMethod|null;reference:string|null;}
export interface SalaryContract {
  key:string;kind:'STAFF'|'TEACHER';jobTitle:string;employeeNumber:string|null;active:boolean;hireDate:string|null;
  rateType:string|null;rate:number|null;eligible:boolean;prepared:boolean;payableId:number|null;
  due:number;paid:number;remaining:number;workedHours:number;extraHours:number;payments:SalaryPayment[];
  iuts?:number|null;tpa?:number|null;net?:number|null;taxVersion?:number;
}
export interface PayrollEmployee {
  userId:number;firstName:string;lastName:string;email:string|null;phone:string|null;active:boolean;subjects:string[];
  contracts:SalaryContract[];due:number;paid:number;remaining:number;status:string;
}
export interface PayrollOverview {school:PayrollSchool;month:string;employees:PayrollEmployee[];due:number;paid:number;remaining:number;}
export interface SalaryHistory {month:string;due:number;paid:number;remaining:number;status:string;iuts?:number;net?:number;tpa?:number;}
export type PayrollDocumentKind='PAYSLIP'|'EMPLOYMENT_CERTIFICATE';
export interface PayrollDocumentInfo {id:number;reference:string;kind:PayrollDocumentKind;month:string|null;createdAt:string;}
export interface PayrollDocument extends PayrollDocumentInfo {snapshot:{school:PayrollSchool;month:string|null;employee:PayrollEmployee;issuedOn:string};}
export interface PayrollDetail {school:PayrollSchool;month:string;employee:PayrollEmployee;history:SalaryHistory[];documents:PayrollDocumentInfo[];}
export interface SalaryPaymentInput {requestId:string;date:string;amount:number;method:PaymentMethod;reference:string|null;}
export const SALARY_STATUS:Record<string,string>={UNCONFIGURED:'Salaire à définir',UNPREPARED:'À préparer',UNPAID:'À payer',PARTIAL:'Partiellement payé',PAID:'Payé',NOT_DUE:'Aucun montant dû',NOT_ELIGIBLE:'Emploi non commencé',OVERPAID:'Montants à vérifier'};
export const SALARY_RATES:Record<string,string>={FIXED_MONTHLY:'Mensuel fixe',MONTHLY:'Mensuel selon présence',HOURLY:'Horaire'};

@Injectable({providedIn:'root'})
export class PayrollService {
  importTeacherSalary(school: number, teacher: number, value: {
    month: string; salary: number; paid: number | null; paymentDate: string | null; paymentMethod: string | null;
  }) { return this.http.post<void>(`${this.url(school)}/teachers/${teacher}/import`, value); }
  private readonly http=inject(HttpClient);
  private url(school:number){return `${environment.apiUrl}/owner/payroll/schools/${school}`;}
  overview(school:number,month:string){return this.http.get<PayrollOverview>(this.url(school),{params:{month}});}
  prepare(school:number,month:string){return this.http.post<PayrollOverview>(`${this.url(school)}/prepare`,null,{params:{month}});}
  detail(school:number,user:number,month:string){return this.http.get<PayrollDetail>(`${this.url(school)}/employees/${user}`,{params:{month}});}
  pay(school:number,id:number,value:SalaryPaymentInput){return this.http.post(`${this.url(school)}/payments/${id}`,value);}
  taxes(school:number,id:number,value:{iuts:number;tpa:number;version:number;reason:string}){return this.http.put<void>(`${this.url(school)}/payments/${id}/taxes`,value);}
  issue(school:number,userId:number,kind:PayrollDocumentKind,month:string|null,requestId:string){return this.http.post<PayrollDocument>(`${this.url(school)}/documents`,{userId,kind,month,requestId});}
  document(school:number,id:number){return this.http.get<PayrollDocument>(`${this.url(school)}/documents/${id}`);}
}
