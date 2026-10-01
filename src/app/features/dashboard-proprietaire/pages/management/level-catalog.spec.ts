import { LEVEL_CATALOG } from './level-catalog';

describe('Level catalog', () => {
  const cyclesFor = (type: string) => LEVEL_CATALOG
    .filter(group => group.schoolTypes.includes(type))
    .map(group => group.cycle);

  it('preserves the general education suggestions for each school type', () => {
    expect(LEVEL_CATALOG.slice(0, 4).map(group => group.levels.length)).toEqual([3, 6, 4, 3]);
    expect(cyclesFor('MIXTE')).toEqual(['PRESCOLAIRE', 'PRIMAIRE', 'COLLEGE', 'LYCEE']);
    expect(cyclesFor('SECONDAIRE')).toEqual(['COLLEGE', 'LYCEE']);
    expect(cyclesFor('PRESCOLAIRE')).toEqual(['PRESCOLAIRE']);
    expect(cyclesFor('PRIMAIRE')).toEqual(['PRIMAIRE']);
  });

  it('proposes LMD levels to universities in cycle order', () => {
    expect(cyclesFor('UNIVERSITE')).toEqual(['LICENCE', 'MASTER', 'DOCTORAT']);
    expect(LEVEL_CATALOG.filter(group => group.schoolTypes.includes('UNIVERSITE')).flatMap(group => group.levels))
      .toEqual(['Licence 1', 'Licence 2', 'Licence 3', 'Master 1', 'Master 2', 'Doctorat']);
  });

  it('proposes technical and vocational qualifications to training centres', () => {
    expect(cyclesFor('FORMATION')).toEqual(['TECHNIQUE_PROFESSIONNEL']);
    expect(LEVEL_CATALOG.find(group => group.cycle === 'TECHNIQUE_PROFESSIONNEL')?.levels)
      .toEqual(['CAP', 'BEP', 'BT', 'BTS']);
  });

  it('assigns distinct orders within each school type', () => {
    for (const type of ['PRESCOLAIRE', 'PRIMAIRE', 'SECONDAIRE', 'MIXTE', 'UNIVERSITE', 'FORMATION']) {
      const orders = LEVEL_CATALOG.filter(group => group.schoolTypes.includes(type))
        .flatMap(group => group.levels.map((_, index) => group.startOrder + index));
      expect(new Set(orders).size).toBe(orders.length);
    }
  });
});
