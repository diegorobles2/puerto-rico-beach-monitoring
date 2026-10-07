import type { Beach, WaterQualityCondition } from '../types';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function getBeaches(): Promise<Beach[]> {
  const response = await fetch(`${apiUrl}/beaches`);
  if (!response.ok) throw new Error('Unable to load beaches');
  return response.json() as Promise<Beach[]>;
}

export async function getBeachConditions(beachId: number | string): Promise<WaterQualityCondition> {
  const response = await fetch(`${apiUrl}/conditions/${beachId}/water-quality`);
  if (!response.ok) {
    throw new Error('Unable to load water-quality conditions');
  }

  return response.json() as Promise<WaterQualityCondition>;
}
