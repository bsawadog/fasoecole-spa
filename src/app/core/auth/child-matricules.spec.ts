import { parseChildMatricules, childMatriculesError } from './child-matricules';

describe('Child matricules', () => {
  it('preserves leading zeroes and accepts comma, semicolon and line separators', () => {
    expect(parseChildMatricules(' 001, MAT-02;001\n003\r\n')).toEqual(['001', 'MAT-02', '003']);
  });
  it('rejects missing, excessively long and too many matricules', () => {
    expect(childMatriculesError([])).toContain('matricule');
    expect(childMatriculesError(['x'.repeat(51)])).toContain('50');
    expect(childMatriculesError(Array.from({ length: 21 }, (_, i) => String(i)))).toContain('20');
  });
  it('accepts valid numbers as text', () => {
    expect(childMatriculesError(['001', 'MAT-02'])).toBeNull();
  });
});
