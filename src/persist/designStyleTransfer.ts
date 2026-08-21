import type { DesignStyle } from '../editor/types';

const FORMAT = 'openchatcut.design-style';
const VERSION = 1;
const MAX_TEXT_LENGTH = 20_000;
const MAX_ENTRIES = 100;

export interface DesignStyleRecipe {
  format: typeof FORMAT;
  version: typeof VERSION;
  name: string;
  style: DesignStyle;
  scenarios?: string[];
  thumbnailUrl?: string;
}

export function buildDesignStyleRecipe(
  name: string,
  style: DesignStyle,
  metadata: { scenarios?: string[]; thumbnailUrl?: string } = {},
): DesignStyleRecipe {
  return normalizeRecipe({ format: FORMAT, version: VERSION, ...metadata, name, style });
}

export function parseDesignStyleRecipe(text: string): DesignStyleRecipe {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Recipe file is not valid JSON');
  }
  return normalizeRecipe(value);
}

function normalizeRecipe(value: unknown): DesignStyleRecipe {
  if (!value || typeof value !== 'object') throw new Error('Recipe file structure is invalid');
  const recipe = value as Partial<DesignStyleRecipe>;
  if (recipe.format !== FORMAT || recipe.version !== VERSION) throw new Error('Recipe file version is not supported');
  const name = normalizedText(recipe.name, 'recipe name');
  const style = normalizeStyle(recipe.style);
  const scenarios = normalizeScenarios(recipe.scenarios);
  const thumbnailUrl = optionalText(recipe.thumbnailUrl, 'thumbnail URL');
  return {
    format: FORMAT,
    version: VERSION,
    name,
    style,
    ...(scenarios ? { scenarios } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

function normalizeStyle(value: unknown): DesignStyle {
  if (!value || typeof value !== 'object') throw new Error('Recipe is missing its style');
  const style = value as Partial<DesignStyle>;
  if (!Array.isArray(style.colors) || !Array.isArray(style.fonts)) throw new Error('Recipe style structure is invalid');
  if (style.colors.length > MAX_ENTRIES || style.fonts.length > MAX_ENTRIES) throw new Error('Recipe contains too many entries');
  const colors = style.colors.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Recipe color structure is invalid');
    return {
      role: normalizedText((entry as { role?: unknown }).role, 'color role'),
      value: normalizedText((entry as { value?: unknown }).value, 'color value'),
    };
  });
  const fonts = style.fonts.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Recipe font structure is invalid');
    return {
      role: normalizedText((entry as { role?: unknown }).role, 'font role'),
      family: normalizedText((entry as { family?: unknown }).family, 'font family'),
    };
  });
  const styleGuide = optionalText(style.styleGuide, 'project creative guide');
  return { colors, fonts, ...(styleGuide ? { styleGuide } : {}) };
}

function normalizeScenarios(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_ENTRIES) throw new Error('Recipe scenarios are invalid');
  const scenarios = [...new Set(value.map((entry) => normalizedText(entry, 'use case')))];
  return scenarios.length > 0 ? scenarios : undefined;
}

function normalizedText(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`invalid ${label}`);
  const result = value.trim();
  if (!result || result.length > MAX_TEXT_LENGTH) throw new Error(`invalid ${label}`);
  return result;
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined || value === '') return undefined;
  return normalizedText(value, label);
}
