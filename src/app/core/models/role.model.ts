export type Role = 'admin' | 'proprietaire' | 'enseignant' | 'etudiant' | 'parent';

export const ROLE_HOME_ROUTE: Record<Role, string> = {
  admin: '/admin',
  proprietaire: '/proprietaire',
  enseignant: '/enseignant',
  etudiant: '/etudiant',
  parent: '/parent',
};

/** Noms de rôles exacts renvoyés par le backend (LoginResponse.roles). */
export type BackendRole = 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'STAFF' | 'TEACHER' | 'PARENT' | 'STUDENT';

export const BACKEND_ROLE_TO_ROLE: Record<BackendRole, Role> = {
  SUPER_ADMIN: 'admin',
  SCHOOL_ADMIN: 'proprietaire',
  // Personnel administratif : même espace que le propriétaire, limité aux modules délégués.
  STAFF: 'proprietaire',
  TEACHER: 'enseignant',
  STUDENT: 'etudiant',
  PARENT: 'parent',
};

/**
 * Convertit les rôles backend en rôle applicatif. Si l'utilisateur possède
 * plusieurs rôles, le plus "élevé" (premier trouvé dans BACKEND_ROLE_PRIORITY) est utilisé.
 */
const BACKEND_ROLE_PRIORITY: BackendRole[] = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF', 'TEACHER', 'PARENT', 'STUDENT'];

export function resolveRole(backendRoles: string[]): Role | null {
  for (const candidate of BACKEND_ROLE_PRIORITY) {
    if (backendRoles.includes(candidate)) {
      return BACKEND_ROLE_TO_ROLE[candidate];
    }
  }
  return null;
}
