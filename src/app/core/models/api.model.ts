/** DTOs correspondant exactement au contrat OpenAPI du backend FasoEcole. */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  userId: number;
  email: string;
  roles: string[];
}

export interface UserDto {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  active: boolean;
  approved: boolean;
  emailVerified?: boolean;
  requestedSchoolId: number | null;
  requestedSchoolName: string | null;
  requestedSchoolType: string | null;
  requestedRole: string | null;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}
