/**
 * Remembered studio preferences.
 *
 * Every control that a reader "selects or ticks" — engine, voice, delivery
 * toggles, output format, disclosure panels, and the EPUB chapter browser view
 * — is stored in one bounded, schema-validated JSON blob so a reload restores
 * the exact workspace. Unknown, malformed, or out-of-range values fall back to
 * the shipped default instead of throwing, because a corrupt preference must
 * never block synthesis.
 */

import {
  EPUB_CHAPTER_FILTERS,
  EPUB_CHAPTER_SORTS,
  type EpubChapterFilter,
  type EpubChapterSort,
} from './epub-library.ts'

export type { EpubChapterFilter, EpubChapterSort }

export const STUDIO_PREFERENCES_STORAGE_KEY = 'bettertts-studio-preferences-v1'
export const STUDIO_PREFERENCES_VERSION = 1
const MAX_PREFERENCE_PAYLOAD_CHARS = 8_000

export const EPUB_PANEL_MODES = ['chapters', 'mapping'] as const
export const EPUB_LOAD_MODES = ['replace', 'append'] as const
export const AUDIO_FORMAT_PREFERENCES = ['wav', 'mp3', 'opus', 'flac', 'm4b'] as const
export const ENGINE_PREFERENCES = ['kokoro', 'supertonic', 'kitten', 'chatterbox', 'piper', 'melo', 'qwen', 'browser'] as const
export const LOUDNESS_PREFERENCES = ['off', 'audiobook-mono', 'podcast-stereo'] as const

export type EpubPanelMode = typeof EPUB_PANEL_MODES[number]
export type EpubLoadMode = typeof EPUB_LOAD_MODES[number]

export type StudioPreferences = {
  /** Engine → Voice chain */
  engine: string
  voiceId: string
  speed: number
  /** Delivery toggles */
  separateLines: boolean
  streamPlay: boolean
  useWorker: boolean
  wordTimestamps: boolean
  dialogMode: boolean
  narratorMode: boolean
  audioCleanupEnabled: boolean
  /** Output */
  audioFormat: string
  mp3Bitrate: number
  loudnessPreset: string
  pauseDuration: number
  /** Disclosure panels */
  showAdvanced: boolean
  showSystemTools: boolean
  showPronunciations: boolean
  /** EPUB chapter browser */
  epubPanelMode: EpubPanelMode
  epubPanelOpen: boolean
  epubChapterFilter: EpubChapterFilter
  epubChapterSort: EpubChapterSort
  epubLoadMode: EpubLoadMode
  epubAutoAdvance: boolean
  epubShowPreview: boolean
}

type PreferenceSpec =
  | { kind: 'boolean'; fallback: boolean }
  | { kind: 'number'; fallback: number; min: number; max: number; integer?: boolean }
  | { kind: 'enum'; fallback: string; values: readonly string[] }
  | { kind: 'string'; fallback: string; maxChars: number }

export const STUDIO_PREFERENCE_SPECS: { readonly [K in keyof StudioPreferences]: PreferenceSpec } = {
  engine: { kind: 'enum', fallback: 'kokoro', values: ENGINE_PREFERENCES },
  voiceId: { kind: 'string', fallback: 'af_heart', maxChars: 120 },
  speed: { kind: 'number', fallback: 1, min: 0.25, max: 4 },
  separateLines: { kind: 'boolean', fallback: false },
  streamPlay: { kind: 'boolean', fallback: true },
  useWorker: { kind: 'boolean', fallback: true },
  wordTimestamps: { kind: 'boolean', fallback: false },
  dialogMode: { kind: 'boolean', fallback: false },
  narratorMode: { kind: 'boolean', fallback: false },
  audioCleanupEnabled: { kind: 'boolean', fallback: false },
  audioFormat: { kind: 'enum', fallback: 'wav', values: AUDIO_FORMAT_PREFERENCES },
  mp3Bitrate: { kind: 'number', fallback: 160, min: 32, max: 320, integer: true },
  loudnessPreset: { kind: 'enum', fallback: 'off', values: LOUDNESS_PREFERENCES },
  pauseDuration: { kind: 'number', fallback: 1, min: 0.1, max: 30 },
  showAdvanced: { kind: 'boolean', fallback: false },
  showSystemTools: { kind: 'boolean', fallback: false },
  showPronunciations: { kind: 'boolean', fallback: false },
  epubPanelMode: { kind: 'enum', fallback: 'chapters', values: EPUB_PANEL_MODES },
  epubPanelOpen: { kind: 'boolean', fallback: true },
  epubChapterFilter: { kind: 'enum', fallback: 'all', values: EPUB_CHAPTER_FILTERS },
  epubChapterSort: { kind: 'enum', fallback: 'reading-order', values: EPUB_CHAPTER_SORTS },
  epubLoadMode: { kind: 'enum', fallback: 'replace', values: EPUB_LOAD_MODES },
  epubAutoAdvance: { kind: 'boolean', fallback: false },
  epubShowPreview: { kind: 'boolean', fallback: true },
}

const PREFERENCE_KEYS = Object.keys(STUDIO_PREFERENCE_SPECS) as Array<keyof StudioPreferences>

export const DEFAULT_STUDIO_PREFERENCES: StudioPreferences = Object.fromEntries(
  PREFERENCE_KEYS.map((key) => [key, STUDIO_PREFERENCE_SPECS[key].fallback]),
) as StudioPreferences

function sanitizeValue(spec: PreferenceSpec, value: unknown): boolean | number | string {
  switch (spec.kind) {
    case 'boolean':
      return typeof value === 'boolean' ? value : spec.fallback
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return spec.fallback
      const bounded = Math.min(spec.max, Math.max(spec.min, value))
      return spec.integer ? Math.round(bounded) : Math.round(bounded * 1000) / 1000
    }
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value) ? value : spec.fallback
    case 'string': {
      if (typeof value !== 'string') return spec.fallback
      const trimmed = value.trim()
      return trimmed && trimmed.length <= spec.maxChars ? trimmed : spec.fallback
    }
  }
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/** Coerce any partial/untrusted shape into a complete, in-range preference set. */
export function sanitizeStudioPreferences(input: unknown): StudioPreferences {
  const source = plainRecord(input) ? input : {}
  return Object.fromEntries(
    PREFERENCE_KEYS.map((key) => [key, sanitizeValue(STUDIO_PREFERENCE_SPECS[key], source[key])]),
  ) as StudioPreferences
}

export function parseStudioPreferences(raw: string | null | undefined): StudioPreferences {
  if (!raw || raw.length > MAX_PREFERENCE_PAYLOAD_CHARS) return { ...DEFAULT_STUDIO_PREFERENCES }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!plainRecord(parsed)) return { ...DEFAULT_STUDIO_PREFERENCES }
    const payload = plainRecord(parsed.preferences) ? parsed.preferences : parsed
    return sanitizeStudioPreferences(payload)
  } catch {
    return { ...DEFAULT_STUDIO_PREFERENCES }
  }
}

export function serializeStudioPreferences(preferences: Partial<StudioPreferences>): string {
  return JSON.stringify({
    version: STUDIO_PREFERENCES_VERSION,
    preferences: sanitizeStudioPreferences(preferences),
  })
}

export function readStudioPreferences(storage: Pick<Storage, 'getItem'> | null | undefined): StudioPreferences {
  if (!storage) return { ...DEFAULT_STUDIO_PREFERENCES }
  try {
    return parseStudioPreferences(storage.getItem(STUDIO_PREFERENCES_STORAGE_KEY))
  } catch {
    return { ...DEFAULT_STUDIO_PREFERENCES }
  }
}

/**
 * Returns the stored value only when it is still offered by the running build —
 * an engine hidden behind a consent flag or a voice removed from a pack must
 * not resurrect itself from a previous session.
 */
export function preferredChoice<T extends string>(
  stored: string,
  available: readonly T[],
  fallback: T,
): T {
  return (available as readonly string[]).includes(stored) ? stored as T : fallback
}
