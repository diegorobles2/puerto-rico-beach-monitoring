import type { Beach } from '../types';
const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
export async function getBeaches(): Promise<Beach[]> {
  const response = await fetch(`${apiUrl}/beaches`);
  if (!response.ok) throw new Error('Unable to load beaches');
  return response.json() as Promise<Beach[]>;
}
