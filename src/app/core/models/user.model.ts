import { Role } from './role.model';

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
  approved: boolean;
  /** Faux tant que l'adresse courriel n'a pas été confirmée par lien. */
  emailVerified?: boolean;
  passwordSet?: boolean;
  mustChangePassword?: boolean;
  invitationDeliveryStatus?: string | null;
  onboardingSteps?: string[];
  schoolIdentifier?: string | null;
  identifierReview?: string | null;
  childRegistrationNumbers?: string[];
  childReview?: string[];
  requestedSchoolId: number | null;
  requestedSchoolName: string | null;
  requestedSchoolType: string | null;
  requestedRole: string | null;
  /** Rôles bruts renvoyés par le backend (utile pour du débogage ou multi-rôles futurs). */
  rawRoles: string[];
}
