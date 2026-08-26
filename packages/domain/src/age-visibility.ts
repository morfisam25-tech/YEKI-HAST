import type { AgeVisibility } from '@yeki-hast/types';

export function ageVisibilityOptions(verifiedAge: number): AgeVisibility[] {
  if (!Number.isInteger(verifiedAge) || verifiedAge < 18 || verifiedAge > 100) {
    throw new Error('verifiedAge must be an integer between 18 and 100');
  }

  const decadeMin = Math.floor(verifiedAge / 10) * 10;
  const decadeMax = decadeMin + 9;

  return [
    { mode: 'hidden' },
    { mode: 'exact', age: verifiedAge },
    { mode: 'decade', min: decadeMin, max: decadeMax },
    { mode: 'plus', min: decadeMin },
  ];
}
