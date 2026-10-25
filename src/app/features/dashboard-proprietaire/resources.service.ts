import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const ASSET_CATEGORIES = { LAND: 'Terrain', BUILDING: 'Bâtiment', ROOM: 'Salle / local', DESK_BENCH: 'Table-banc', TABLE: 'Table / bureau', CHAIR: 'Chaise / banc', CABINET: 'Armoire / rangement', COMPUTER: 'Matériel informatique', EQUIPMENT: 'Autre équipement', OTHER: 'Autre bien' };
export const OWNERSHIP = { OWNED: 'Propriété de l’établissement', RENTED: 'En location', BORROWED: 'Mis à disposition / prêté' };
export const CONDITIONS = { GOOD: 'Bon état', FAIR: 'État moyen', DAMAGED: 'À réparer', UNUSABLE: 'Inutilisable' };
export const ASSET_STATUS = { IN_USE: 'En service', STORED: 'En réserve', MAINTENANCE: 'En maintenance', RETIRED: 'Sorti du patrimoine' };
export const STOCK_CATEGORIES = { CLEANING: 'Produits d’entretien', TEACHING: 'Fournitures pédagogiques', OFFICE: 'Fournitures de bureau', SMALL_EQUIPMENT: 'Petit matériel en réserve', OTHER: 'Autres fournitures' };
export const MOVEMENT_KINDS = { IN: 'Entrée / réception', OUT: 'Sortie / consommation', COUNT: 'Inventaire physique' };
export type AssetCategory = keyof typeof ASSET_CATEGORIES;
export interface AssetInput {
  code: string; name: string; category: AssetCategory; location: string; custodian: string;
  ownership: keyof typeof OWNERSHIP; condition: keyof typeof CONDITIONS; status: keyof typeof ASSET_STATUS;
  quantity: number; unitValue: number | null; acquiredOn: string | null; maintenanceOn: string | null;
  notes: string; version: number | null; changeReason: string;
}
export interface Asset extends Omit<AssetInput, 'changeReason'> { id: number; version: number; }
export interface StockInput {
  code: string; name: string; category: keyof typeof STOCK_CATEGORIES; unit: string; location: string;
  minimumQuantity: number; unitCost: number | null; active: boolean; notes: string; version: number | null;
}
export interface StockItem extends StockInput { id: number; quantity: number; version: number; }
export interface MovementInput {
  requestId: string; kind: keyof typeof MOVEMENT_KINDS; date: string; quantity: number | null;
  reason: string; recipient: string; reference: string;
}
export interface StockMovement {
  id: number; kind: keyof typeof MOVEMENT_KINDS; date: string; requestedQuantity: number;
  quantityChange: number; balanceAfter: number; reason: string; recipient: string; reference: string; actor: string; createdAt: string;
}
export interface AssetEvent { id: number; type: string; reason: string; snapshot: string; actor: string; createdAt: string; }

@Injectable({ providedIn: 'root' })
export class SchoolResourcesService {
  private readonly http = inject(HttpClient);
  private url(school: number) { return `${environment.apiUrl}/owner/resources/schools/${school}`; }
  assets(school: number) { return this.http.get<{assets: Asset[]}>(`${this.url(school)}/assets`); }
  stock(school: number) { return this.http.get<{items: StockItem[]}>(`${this.url(school)}/stock`); }
  saveAsset(school: number, value: AssetInput, id: number | null) {
    return id === null ? this.http.post<Asset>(`${this.url(school)}/assets`, value) : this.http.put<Asset>(`${this.url(school)}/assets/${id}`, value);
  }
  saveStock(school: number, value: StockInput, id: number | null) {
    return id === null ? this.http.post<StockItem>(`${this.url(school)}/stock`, value) : this.http.put<StockItem>(`${this.url(school)}/stock/${id}`, value);
  }
  assetHistory(school: number, id: number) { return this.http.get<AssetEvent[]>(`${this.url(school)}/assets/${id}/history`); }
  movements(school: number, id: number) { return this.http.get<StockMovement[]>(`${this.url(school)}/stock/${id}/movements`); }
  move(school: number, id: number, value: MovementInput) { return this.http.post<StockItem>(`${this.url(school)}/stock/${id}/movements`, value); }
}
