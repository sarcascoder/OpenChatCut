import type { CSSProperties } from 'react';
import type { InstalledPack } from '../plugins/store';
import { theme } from '../theme';

export type CenterTab = 'Discover' | 'Installed';
export type Category = 'All' | 'MG' | 'Transitions' | 'Effects' | 'LUT' | 'Zoom';

export interface RegistryEntry {
  id: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  url: string;
  pageUrl?: string;
  sha256?: string;
  categories: Category[];
}

export const CENTER_TABS: CenterTab[] = ['Discover', 'Installed'];
export const EXTENSION_CATEGORIES: Category[] = ['All', 'MG', 'Transitions', 'Effects', 'LUT', 'Zoom'];
export const EXTENSION_TYPE_LABEL: Record<string, string> = {
  'mg-template': 'MG',
  transition: 'Transitions',
  fx: 'Effects',
  lut: 'LUT',
  zoom: 'Zoom',
};
// Keys are the raw `categories` strings the community registry publishes, which include
// both English slugs and the original Chinese labels. Both must keep resolving, or packs
// tagged in Chinese silently drop out of Discover.
const REGISTRY_CATEGORY_LABEL: Record<string, Exclude<Category, 'All'>> = {
  mg: 'MG',
  MG: 'MG',
  transition: 'Transitions',
  '\u8f6c\u573a': 'Transitions', // "transition" — Chinese registry category label
  fx: 'Effects',
  '\u7279\u6548': 'Effects', // "effects" — Chinese registry category label
  lut: 'LUT',
  LUT: 'LUT',
  zoom: 'Zoom',
  '\u7f29\u653e': 'Zoom', // "zoom" — Chinese registry category label
};

export function parseRegistry(value: unknown): RegistryEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || typeof item.url !== 'string') return [];
    if (!item.url.startsWith('/') && !/^https?:\/\//.test(item.url)) return [];
    const categories = Array.isArray(item.categories)
      ? item.categories.flatMap((entry) => (
        typeof entry === 'string' && REGISTRY_CATEGORY_LABEL[entry]
          ? [REGISTRY_CATEGORY_LABEL[entry]]
          : []
      ))
      : [];
    return [{
      id: item.id,
      name: item.name.slice(0, 60),
      url: item.url,
      categories,
      ...(typeof item.description === 'string' ? { description: item.description.slice(0, 240) } : {}),
      ...(typeof item.author === 'string' ? { author: item.author.slice(0, 80) } : {}),
      ...(typeof item.version === 'string' ? { version: item.version.slice(0, 80) } : {}),
      ...(typeof item.pageUrl === 'string' && /^https?:\/\//.test(item.pageUrl)
        ? { pageUrl: item.pageUrl }
        : {}),
      ...(typeof item.sha256 === 'string' && /^[0-9a-fA-F]{64}$/.test(item.sha256)
        ? { sha256: item.sha256.toLowerCase() }
        : {}),
    }];
  });
}

export function packCounts(pack: InstalledPack): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const item of pack.items) {
    const label = EXTENSION_TYPE_LABEL[item.type] ?? item.type;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()];
}

export function hasExtensionUpdate(installedVersion: string, registryVersion?: string): boolean {
  if (!registryVersion) return false;
  const installed = installedVersion.split('.').map(Number);
  const registry = registryVersion.split('.').map(Number);
  if (installed.length !== 3 || registry.length !== 3) return false;
  for (let index = 0; index < 3; index += 1) {
    if (registry[index] !== installed[index]) return registry[index] > installed[index];
  }
  return false;
}

export function secondaryButton(disabled = false): CSSProperties {
  return {
    border: `0.5px solid ${theme.border}`,
    borderRadius: 4,
    background: 'transparent',
    color: theme.text,
    minHeight: 28,
    padding: '4px 8px',
    fontSize: 10.5,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
  };
}
