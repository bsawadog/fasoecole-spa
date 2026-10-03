/** Preserve matricules as text (including leading zeroes); commas, semicolons or new lines separate children. */
export function parseChildMatricules(value: string): string[] {
  return [...new Set(value.split(/[,;\r\n]+/).map(number => number.trim()).filter(Boolean))];
}
export function childMatriculesError(numbers: string[]): string | null {
  if (!numbers.length) return 'Renseignez au moins un matricule de vos enfants.';
  if (numbers.length > 20 || numbers.some(number => number.length > 50 || /[\u0000-\u001f]/.test(number))) {
    return 'Au maximum 20 matricules, de 1 à 50 caractères chacun.';
  }
  return null;
}
