import type { Manifest } from './types';
import type { EntitySummary } from './types';

export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${path}`.replace(/([^:]\/)\/+/g, '$1');
}

export async function loadManifest(): Promise<Manifest> {
  return loadJsonAsset<Manifest>('generated/manifest.json');
}

export async function loadBuildWarnings(): Promise<unknown[]> {
  return loadJsonAsset<unknown[]>('generated/build-warnings.json');
}

export async function loadEntitySummaries(): Promise<EntitySummary[]> {
  return loadJsonAsset<EntitySummary[]>('generated/entity-summaries.json');
}

export async function loadJsonAsset<T>(path: string): Promise<T> {
  const response = await fetch(assetUrl(path));
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function loadTextAsset(path: string): Promise<string> {
  const response = await fetch(assetUrl(path));
  if (!response.ok) {
    throw new Error(`Could not load ${path}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
