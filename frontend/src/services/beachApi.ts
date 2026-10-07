import type { Beach, BeachConditionsResponse } from '../types';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export async function getBeaches(): Promise<Beach[]> {
  const response = await fetch(`${apiUrl}/beaches`);
  if (!response.ok) throw new Error('Unable to load beaches');
  return response.json() as Promise<Beach[]>;
}

export async function getBeachConditions(beachId: string): Promise<BeachConditionsResponse> {
  const response = await fetch(`${apiUrl}/conditions/${beachId}`);
  if (!response.ok) {
    throw new Error('Unable to load beach conditions');
  }
  return response.json() as Promise<BeachConditionsResponse>;
}
