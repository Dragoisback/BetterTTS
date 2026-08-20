import type { EpubMappingChapter } from './epub-mapping.ts'

/**
 * EPUB chapter-browser helpers.
 *
 * The mapping module owns chapter *content* edits (rename/split/merge/voice).
 * This module owns everything the reader sees while browsing a loaded book:
 * search + filter + sort, per-chapter size and duration estimates, and the
 * remembered per-book selection (ticked chapters, the open chapter, and which
 * chapters have already been generated).
 */

export const EPUB_BOOK_STORAGE_PREFIX = 'bettertts-epub-book-v1:'
export const MAX_EPUB_BOOK_PROGRESS_IDS = 2_000
export const MAX_EPUB_BOOK_ID_CHARS = 120
export const MAX_EPUB_CHAPTER_ID_CHARS = 120
/** Local engines average ~155 spoken words per minute at 1.0× speed. */
export const DEFAULT_SPEECH_WORDS_PER_MINUTE = 155

export const EPUB_CHAPTER_FILTERS = ['all', 'included', 'excluded', 'unread', 'done'] as const
export const EPUB_CHAPTER_SORTS = ['reading-order', 'longest', 'shortest', 'title'] as const

export type EpubChapterFilter = typeof EPUB_CHAPTER_FILTERS[number]
export type EpubChapterSort = typeof EPUB_CHAPTER_SORTS[number]

export type EpubBookProgress = {
  /** Only exclusions are stored: a chapter added by a later split stays ticked. */
  excludedIds: string[]
  completedIds: string[]
  selectedChapterId: string | null
  updatedAt: number
}

export type EpubChapterRow = {
  chapter: EpubMappingChapter
  /** Position in the book's reading order, independent of the active sort. */
  index: number
  words: number
  seconds: number
  completed: boolean
}

export type EpubBookSummary = {
  chapters: number
  included: number
  completed: number
  includedChars: number
  includedWords: number
  includedSeconds: number
  totalChars: number
  percentComplete: number
}

export const EMPTY_EPUB_BOOK_PROGRESS: EpubBookProgress = {
  excludedIds: [],
  completedIds: [],
  selectedChapterId: null,
  updatedAt: 0,
}

export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{M}\p{N}]+(?:['’_-][\p{L}\p{M}\p{N}]+)*/gu)
  return matches ? matches.length : 0
}

/** Rough wall-clock estimate for a chapter, used only for UI planning. */
export function estimateSpeechSeconds(
  text: string,
  speed = 1,
  wordsPerMinute = DEFAULT_SPEECH_WORDS_PER_MINUTE,
): number {
  const words = countWords(text)
  if (words === 0) return 0
  const rate = Number.isFinite(speed) && speed > 0 ? Math.min(4, Math.max(0.25, speed)) : 1
  return Math.max(1, Math.round((words / wordsPerMinute) * 60 / rate))
}

export function formatEstimatedDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s'
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const rest = total % 60
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  if (minutes > 0) return rest > 0 && minutes < 10 ? `${minutes}m ${rest}s` : `${minutes}m`
  return `${rest}s`
}

/**
 * A stable identity for a book so ticked chapters survive a reload or a
 * re-import of the same file. Chapter text never leaves memory — only its
 * length feeds the fingerprint.
 */
export function epubBookKey(input: {
  title: string
  fileName: string
  chapters: readonly { title: string; text: string }[]
}): string {
  const fingerprint = [
    input.title.trim().toLowerCase(),
    input.fileName.trim().toLowerCase(),
    String(input.chapters.length),
    String(input.chapters.reduce((total, chapter) => total + chapter.text.length, 0)),
    input.chapters.slice(0, 24).map((chapter) => `${chapter.title.trim().toLowerCase()}:${chapter.text.length}`).join('|'),
  ].join('\u0000')
  let hash = 0x811c9dc5
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash ^= fingerprint.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `epub-${hash.toString(36)}-${input.chapters.length.toString(36)}`.slice(0, MAX_EPUB_BOOK_ID_CHARS)
}

export function epubBookStorageKey(bookKey: string): string {
  return `${EPUB_BOOK_STORAGE_PREFIX}${bookKey}`
}

function boundedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const ids: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (!trimmed || trimmed.length > MAX_EPUB_CHAPTER_ID_CHARS || ids.includes(trimmed)) continue
    ids.push(trimmed)
    if (ids.length >= MAX_EPUB_BOOK_PROGRESS_IDS) break
  }
  return ids
}

export function loadEpubBookProgress(
  bookKey: string,
  storage: Pick<Storage, 'getItem'> | null | undefined,
): EpubBookProgress {
  if (!storage || !bookKey.trim()) return { ...EMPTY_EPUB_BOOK_PROGRESS }
  try {
    const raw = storage.getItem(epubBookStorageKey(bookKey))
    if (!raw) return { ...EMPTY_EPUB_BOOK_PROGRESS }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...EMPTY_EPUB_BOOK_PROGRESS }
    const record = parsed as Record<string, unknown>
    const selected = typeof record.selectedChapterId === 'string' && record.selectedChapterId.trim().length <= MAX_EPUB_CHAPTER_ID_CHARS
      ? record.selectedChapterId.trim() || null
      : null
    return {
      excludedIds: boundedIds(record.excludedIds),
      completedIds: boundedIds(record.completedIds),
      selectedChapterId: selected,
      updatedAt: typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt) ? Math.max(0, record.updatedAt) : 0,
    }
  } catch {
    return { ...EMPTY_EPUB_BOOK_PROGRESS }
  }
}

export function serializeEpubBookProgress(progress: Omit<EpubBookProgress, 'updatedAt'> & { updatedAt?: number }): string {
  return JSON.stringify({
    excludedIds: boundedIds(progress.excludedIds),
    completedIds: boundedIds(progress.completedIds),
    selectedChapterId: typeof progress.selectedChapterId === 'string' && progress.selectedChapterId.trim()
      ? progress.selectedChapterId.trim().slice(0, MAX_EPUB_CHAPTER_ID_CHARS)
      : null,
    updatedAt: progress.updatedAt ?? Date.now(),
  } satisfies EpubBookProgress)
}

/** Re-apply remembered ticks to a freshly parsed chapter list. */
export function applyEpubBookProgress(
  chapters: readonly EpubMappingChapter[],
  progress: EpubBookProgress,
): EpubMappingChapter[] {
  if (progress.excludedIds.length === 0) return chapters.map((chapter) => ({ ...chapter }))
  const excluded = new Set(progress.excludedIds)
  return chapters.map((chapter) => ({ ...chapter, included: !excluded.has(chapter.id) }))
}

export function excludedEpubChapterIds(chapters: readonly EpubMappingChapter[]): string[] {
  return chapters.filter((chapter) => !chapter.included).map((chapter) => chapter.id)
}

export function summarizeEpubBook(
  chapters: readonly EpubMappingChapter[],
  options: { completedIds?: readonly string[]; speed?: number } = {},
): EpubBookSummary {
  const completed = new Set(options.completedIds ?? [])
  let included = 0
  let includedChars = 0
  let includedWords = 0
  let includedSeconds = 0
  let totalChars = 0
  let completedIncluded = 0
  for (const chapter of chapters) {
    totalChars += chapter.text.length
    if (!chapter.included) continue
    included += 1
    includedChars += chapter.text.length
    includedWords += countWords(chapter.text)
    includedSeconds += estimateSpeechSeconds(chapter.text, options.speed)
    if (completed.has(chapter.id)) completedIncluded += 1
  }
  return {
    chapters: chapters.length,
    included,
    completed: completedIncluded,
    includedChars,
    includedWords,
    includedSeconds,
    totalChars,
    percentComplete: included > 0 ? Math.round((completedIncluded / included) * 100) : 0,
  }
}

export function chapterPreview(text: string, maxChars = 180): string {
  const flattened = text.replace(/\s+/gu, ' ').trim()
  if (flattened.length <= maxChars) return flattened
  const cut = flattened.slice(0, maxChars)
  const boundary = cut.lastIndexOf(' ')
  return `${(boundary > maxChars * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`
}

function matchesQuery(chapter: EpubMappingChapter, query: string): boolean {
  if (!query) return true
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return chapter.title.toLowerCase().includes(needle) || chapter.text.toLowerCase().includes(needle)
}

function matchesFilter(chapter: EpubMappingChapter, filter: EpubChapterFilter, completed: boolean): boolean {
  switch (filter) {
    case 'included': return chapter.included
    case 'excluded': return !chapter.included
    case 'unread': return !completed
    case 'done': return completed
    case 'all':
    default: return true
  }
}

export function buildEpubChapterRows(
  chapters: readonly EpubMappingChapter[],
  options: {
    query?: string
    filter?: EpubChapterFilter
    sort?: EpubChapterSort
    completedIds?: readonly string[]
    speed?: number
  } = {},
): EpubChapterRow[] {
  const completed = new Set(options.completedIds ?? [])
  const filter = options.filter ?? 'all'
  const query = options.query ?? ''
  const rows = chapters
    .map((chapter, index): EpubChapterRow => ({
      chapter,
      index,
      words: countWords(chapter.text),
      seconds: estimateSpeechSeconds(chapter.text, options.speed),
      completed: completed.has(chapter.id),
    }))
    .filter((row) => matchesQuery(row.chapter, query) && matchesFilter(row.chapter, filter, row.completed))

  switch (options.sort ?? 'reading-order') {
    case 'longest':
      return rows.sort((left, right) => right.chapter.text.length - left.chapter.text.length || left.index - right.index)
    case 'shortest':
      return rows.sort((left, right) => left.chapter.text.length - right.chapter.text.length || left.index - right.index)
    case 'title':
      return rows.sort((left, right) => left.chapter.title.localeCompare(right.chapter.title) || left.index - right.index)
    case 'reading-order':
    default:
      return rows
  }
}

/** Walk the reading order from `currentId`, honouring ticks and done markers. */
export function stepEpubChapterId(
  chapters: readonly EpubMappingChapter[],
  currentId: string | null,
  delta: 1 | -1,
  options: { includedOnly?: boolean; skipCompleted?: boolean; completedIds?: readonly string[] } = {},
): string | null {
  if (chapters.length === 0) return null
  const completed = new Set(options.completedIds ?? [])
  const eligible = (chapter: EpubMappingChapter) => (
    (!options.includedOnly || chapter.included)
    && (!options.skipCompleted || !completed.has(chapter.id))
  )
  const currentIndex = currentId ? chapters.findIndex((chapter) => chapter.id === currentId) : -1
  if (currentIndex < 0) {
    const first = delta === 1 ? chapters.find(eligible) : [...chapters].reverse().find(eligible)
    return first?.id ?? null
  }
  for (let index = currentIndex + delta; index >= 0 && index < chapters.length; index += delta) {
    if (eligible(chapters[index])) return chapters[index].id
  }
  return null
}

export function setEpubChaptersIncluded(
  chapters: readonly EpubMappingChapter[],
  included: boolean,
  chapterIds?: readonly string[],
): EpubMappingChapter[] {
  const scope = chapterIds ? new Set(chapterIds) : null
  return chapters.map((chapter) => (
    !scope || scope.has(chapter.id) ? { ...chapter, included } : { ...chapter }
  ))
}

export function invertEpubChapterInclusion(
  chapters: readonly EpubMappingChapter[],
  chapterIds?: readonly string[],
): EpubMappingChapter[] {
  const scope = chapterIds ? new Set(chapterIds) : null
  return chapters.map((chapter) => (
    !scope || scope.has(chapter.id) ? { ...chapter, included: !chapter.included } : { ...chapter }
  ))
}

export function toggleCompletedChapter(
  completedIds: readonly string[],
  chapterId: string,
  completed: boolean,
): string[] {
  const next = completedIds.filter((id) => id !== chapterId)
  if (!completed) return next
  next.push(chapterId)
  return next.slice(-MAX_EPUB_BOOK_PROGRESS_IDS)
}
