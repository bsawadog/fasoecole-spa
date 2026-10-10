export interface SelectableAcademicYear {
  id: number;
  isCurrent: boolean;
  startDate: string;
  endDate: string;
  closed?: boolean;
}

export function academicToday(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function selectAcademicYear<T extends SelectableAcademicYear>(
  years: T[], savedId: number | null, explicit: boolean, today = academicToday(),
): T | undefined {
  const saved = years.find(year => year.id === savedId);
  if (explicit && saved) return saved;
  const dated = years.filter(year => !year.closed && year.startDate <= today && today <= year.endDate)
    .sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.startDate.localeCompare(a.startDate) || a.id - b.id)[0];
  // Pendant les vacances ou avant la création de la prochaine année, conserver le choix existant.
  return dated ?? years.find(year => year.isCurrent && !year.closed) ?? saved;
}
