export interface SuggestedLevel {
  name: string;
  cycle: string;
  orderIndex: number;
}

export const LEVEL_CATALOG: { cycle: string; label: string; schoolTypes: string[]; levels: string[]; startOrder: number }[] = [
  { cycle: 'PRESCOLAIRE', label: 'Préscolaire', schoolTypes: ['PRESCOLAIRE', 'MIXTE'], levels: ['PS', 'MS', 'GS'], startOrder: 1 },
  { cycle: 'PRIMAIRE', label: 'Primaire', schoolTypes: ['PRIMAIRE', 'MIXTE'], levels: ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'], startOrder: 4 },
  { cycle: 'COLLEGE', label: 'Post-primaire (collège)', schoolTypes: ['SECONDAIRE', 'MIXTE'], levels: ['6e', '5e', '4e', '3e'], startOrder: 10 },
  { cycle: 'LYCEE', label: 'Secondaire (lycée)', schoolTypes: ['SECONDAIRE', 'MIXTE'], levels: ['2nde', '1ère', 'Terminale'], startOrder: 14 },
  { cycle: 'LICENCE', label: 'Licence (LMD)', schoolTypes: ['UNIVERSITE'], levels: ['Licence 1', 'Licence 2', 'Licence 3'], startOrder: 1 },
  { cycle: 'MASTER', label: 'Master (LMD)', schoolTypes: ['UNIVERSITE'], levels: ['Master 1', 'Master 2'], startOrder: 4 },
  { cycle: 'DOCTORAT', label: 'Doctorat (LMD)', schoolTypes: ['UNIVERSITE'], levels: ['Doctorat'], startOrder: 6 },
  { cycle: 'TECHNIQUE_PROFESSIONNEL', label: 'Technique et professionnel', schoolTypes: ['FORMATION'], levels: ['CAP', 'BEP', 'BT', 'BTS'], startOrder: 1 },
];
