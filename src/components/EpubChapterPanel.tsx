import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  FileText,
  ListChecks,
  Play,
  Search,
  SlidersHorizontal,
  Square,
  X,
} from 'lucide-react'
import type { EpubMappingChapter } from '../lib/epub-mapping.ts'
import {
  buildEpubChapterRows,
  chapterPreview,
  formatEstimatedDuration,
  summarizeEpubBook,
  type EpubChapterFilter,
  type EpubChapterSort,
} from '../lib/epub-library.ts'
import type { EpubLoadMode } from '../lib/ui-preferences.ts'
import './EpubChapterPanel.css'

/** Chapter lists stay responsive on 2,000-chapter books by paging the DOM. */
const CHAPTER_PAGE_SIZE = 120

function escapeSelector(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS?.escape === 'function') return CSS.escape(value)
  return value.replace(/[^a-zA-Z0-9_-]/gu, '\\$&')
}

const FILTER_OPTIONS: ReadonlyArray<{ value: EpubChapterFilter; label: string }> = [
  { value: 'all', label: 'All chapters' },
  { value: 'included', label: 'Ticked only' },
  { value: 'excluded', label: 'Unticked only' },
  { value: 'unread', label: 'Not generated' },
  { value: 'done', label: 'Generated' },
]

const SORT_OPTIONS: ReadonlyArray<{ value: EpubChapterSort; label: string }> = [
  { value: 'reading-order', label: 'Reading order' },
  { value: 'longest', label: 'Longest first' },
  { value: 'shortest', label: 'Shortest first' },
  { value: 'title', label: 'Title A–Z' },
]

export type EpubChapterPanelProps = {
  title: string
  fileName: string
  chapters: readonly EpubMappingChapter[]
  completedIds: readonly string[]
  selectedChapterId: string | null
  speed: number
  busy: boolean
  filter: EpubChapterFilter
  sort: EpubChapterSort
  loadMode: EpubLoadMode
  autoAdvance: boolean
  showPreview: boolean
  onFilterChange: (filter: EpubChapterFilter) => void
  onSortChange: (sort: EpubChapterSort) => void
  onLoadModeChange: (mode: EpubLoadMode) => void
  onAutoAdvanceChange: (enabled: boolean) => void
  onShowPreviewChange: (enabled: boolean) => void
  onLoadChapter: (chapterId: string, mode: EpubLoadMode) => void
  onToggleInclude: (chapterId: string, included: boolean) => void
  onToggleCompleted: (chapterId: string, completed: boolean) => void
  onBulkInclude: (included: boolean, chapterIds?: readonly string[]) => void
  onInvertInclude: (chapterIds?: readonly string[]) => void
  onStepChapter: (delta: 1 | -1) => void
  onQueueSelection: () => void
  onOpenMapping: () => void
  onClose: () => void
  onCloseBook: () => void
}

export function EpubChapterPanel({
  title,
  fileName,
  chapters,
  completedIds,
  selectedChapterId,
  speed,
  busy,
  filter,
  sort,
  loadMode,
  autoAdvance,
  showPreview,
  onFilterChange,
  onSortChange,
  onLoadModeChange,
  onAutoAdvanceChange,
  onShowPreviewChange,
  onLoadChapter,
  onToggleInclude,
  onToggleCompleted,
  onBulkInclude,
  onInvertInclude,
  onStepChapter,
  onQueueSelection,
  onOpenMapping,
  onClose,
  onCloseBook,
}: EpubChapterPanelProps) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(CHAPTER_PAGE_SIZE)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const summary = useMemo(() => summarizeEpubBook(chapters, { completedIds, speed }), [chapters, completedIds, speed])
  const rows = useMemo(
    () => buildEpubChapterRows(chapters, { query, filter, sort, completedIds, speed }),
    [chapters, query, filter, sort, completedIds, speed],
  )
  const visibleRows = rows.slice(0, visibleCount)
  const visibleIds = useMemo(() => rows.map((row) => row.chapter.id), [rows])
  const scoped = query.trim().length > 0 || filter !== 'all'

  useEffect(() => {
    setVisibleCount(CHAPTER_PAGE_SIZE)
  }, [query, filter, sort, chapters])

  // Keep the open chapter on screen when the reader steps with the keyboard.
  useEffect(() => {
    if (!selectedChapterId || !listRef.current) return
    const target = listRef.current.querySelector<HTMLElement>(`[data-chapter-id="${escapeSelector(selectedChapterId)}"]`)
    target?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedChapterId, visibleCount])

  return (
    <section className="epub-chapter-panel" aria-labelledby="epub-chapter-heading">
      <div className="epub-chapter-head">
        <div className="epub-chapter-identity">
          <span className="epub-chapter-badge" aria-hidden="true"><BookOpen size={19} /></span>
          <div>
            <h2 id="epub-chapter-heading">{title}</h2>
            <p className="section-kicker">
              {fileName || 'EPUB'} · {summary.chapters.toLocaleString()} chapters · {summary.included.toLocaleString()} ticked · ~{formatEstimatedDuration(summary.includedSeconds)} of audio
            </p>
          </div>
        </div>
        <div className="epub-chapter-head-actions">
          <button type="button" onClick={onOpenMapping} title="Rename, reorder, split, and assign per-chapter voices">
            <SlidersHorizontal size={16} aria-hidden="true" /> Chapter mapping
          </button>
          <button type="button" onClick={onClose} aria-label="Hide the chapter browser">
            <ChevronUp size={16} aria-hidden="true" /> Hide
          </button>
          <button type="button" onClick={onCloseBook} title="Close this book and keep the current script">
            <X size={16} aria-hidden="true" /> Close book
          </button>
        </div>
      </div>

      <div className="epub-chapter-progress" aria-label="Book generation progress">
        <div className="epub-chapter-progress-track">
          <div className="epub-chapter-progress-fill" style={{ width: `${summary.percentComplete}%` }} />
        </div>
        <span>{summary.completed.toLocaleString()} / {summary.included.toLocaleString()} generated ({summary.percentComplete}%)</span>
      </div>

      <div className="epub-chapter-toolbar">
        <label className="epub-chapter-search">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search chapters</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder="Search chapter titles and text…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.stopPropagation()
                setQuery('')
              }
            }}
          />
        </label>
        <label className="epub-chapter-select">
          <span className="sr-only">Filter chapters</span>
          <select value={filter} onChange={(event) => onFilterChange(event.target.value as EpubChapterFilter)} aria-label="Filter chapters">
            {FILTER_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="epub-chapter-select">
          <span className="sr-only">Sort chapters</span>
          <select value={sort} onChange={(event) => onSortChange(event.target.value as EpubChapterSort)} aria-label="Sort chapters">
            {SORT_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="epub-chapter-bulk" role="group" aria-label="Bulk chapter selection">
          <button type="button" onClick={() => onBulkInclude(true, scoped ? visibleIds : undefined)} title={scoped ? 'Tick every chapter in this view' : 'Tick every chapter'}>
            <CheckCheck size={15} aria-hidden="true" /> {scoped ? 'Tick shown' : 'Tick all'}
          </button>
          <button type="button" onClick={() => onBulkInclude(false, scoped ? visibleIds : undefined)} title={scoped ? 'Untick every chapter in this view' : 'Untick every chapter'}>
            <Square size={15} aria-hidden="true" /> {scoped ? 'Untick shown' : 'Untick all'}
          </button>
          <button type="button" onClick={() => onInvertInclude(scoped ? visibleIds : undefined)} title="Invert the ticks">
            <ListChecks size={15} aria-hidden="true" /> Invert
          </button>
        </div>
      </div>

      <div className="epub-chapter-options">
        <div className="epub-chapter-mode" role="group" aria-label="How a chapter enters the script">
          <button
            type="button"
            className={loadMode === 'replace' ? 'active' : undefined}
            aria-pressed={loadMode === 'replace'}
            onClick={() => onLoadModeChange('replace')}
          >
            Replace script
          </button>
          <button
            type="button"
            className={loadMode === 'append' ? 'active' : undefined}
            aria-pressed={loadMode === 'append'}
            onClick={() => onLoadModeChange('append')}
          >
            Append to script
          </button>
        </div>
        <label className="check-label">
          <input type="checkbox" checked={autoAdvance} onChange={(event) => onAutoAdvanceChange(event.target.checked)} />
          Auto-advance after generating
        </label>
        <label className="check-label">
          <input type="checkbox" checked={showPreview} onChange={(event) => onShowPreviewChange(event.target.checked)} />
          Show text preview
        </label>
        <span className="epub-chapter-hint">Alt + ↑ / ↓ steps chapters · Alt + Enter loads the next one</span>
      </div>

      <div className="epub-chapter-list" ref={listRef} role="list" aria-label={`Chapters in ${title}`}>
        {visibleRows.length === 0 ? (
          <p className="epub-chapter-empty" role="status">No chapter matches this search or filter.</p>
        ) : null}
        {visibleRows.map((row) => {
          const chapter = row.chapter
          const active = chapter.id === selectedChapterId
          const classes = ['epub-chapter-row']
          if (active) classes.push('active')
          if (!chapter.included) classes.push('excluded')
          if (row.completed) classes.push('completed')
          return (
            <article className={classes.join(' ')} data-chapter-id={chapter.id} key={chapter.id} role="listitem">
              <label className="epub-chapter-tick">
                <input
                  type="checkbox"
                  checked={chapter.included}
                  aria-label={`Include ${chapter.title} in the queue and exports`}
                  onChange={(event) => onToggleInclude(chapter.id, event.target.checked)}
                />
              </label>
              <button
                type="button"
                className="epub-chapter-open"
                onClick={(event) => onLoadChapter(chapter.id, event.altKey || event.shiftKey ? 'append' : loadMode)}
                disabled={busy}
                aria-current={active ? 'true' : undefined}
                title={busy ? 'Finish or cancel the current generation first' : `Load the full text of ${chapter.title} into the script box`}
              >
                <span className="epub-chapter-index" aria-hidden="true">{String(row.index + 1).padStart(2, '0')}</span>
                <span className="epub-chapter-copy">
                  <strong>{chapter.title}</strong>
                  <small>
                    {chapter.text.length.toLocaleString()} chars · {row.words.toLocaleString()} words · ~{formatEstimatedDuration(row.seconds)}
                    {chapter.voice ? ` · ${chapter.voice}` : ''}
                  </small>
                  {showPreview ? <span className="epub-chapter-preview">{chapterPreview(chapter.text)}</span> : null}
                </span>
                <span className="epub-chapter-cta" aria-hidden="true">
                  {active ? <Check size={16} /> : loadMode === 'append' ? <CornerDownRight size={16} /> : <Play size={16} />}
                </span>
              </button>
              <div className="epub-chapter-row-actions">
                <button
                  type="button"
                  className={row.completed ? 'done' : undefined}
                  aria-pressed={row.completed}
                  onClick={() => onToggleCompleted(chapter.id, !row.completed)}
                  title={row.completed ? 'Mark as not generated yet' : 'Mark this chapter as generated'}
                >
                  <Check size={14} aria-hidden="true" /> {row.completed ? 'Done' : 'Mark done'}
                </button>
              </div>
            </article>
          )
        })}
        {rows.length > visibleRows.length ? (
          <button type="button" className="epub-chapter-more" onClick={() => setVisibleCount((current) => current + CHAPTER_PAGE_SIZE)}>
            Show {Math.min(CHAPTER_PAGE_SIZE, rows.length - visibleRows.length)} more of {rows.length.toLocaleString()} matching chapters
          </button>
        ) : null}
      </div>

      <div className="epub-chapter-footer">
        <button type="button" onClick={() => onStepChapter(-1)} disabled={busy} title="Load the previous ticked chapter">
          <ChevronUp size={16} aria-hidden="true" /> Previous
        </button>
        <button type="button" onClick={() => onStepChapter(1)} disabled={busy} title="Load the next ticked chapter">
          <ChevronDown size={16} aria-hidden="true" /> Next chapter
        </button>
        <span className="epub-chapter-footer-spacer" />
        <span className="epub-chapter-total">
          <FileText size={14} aria-hidden="true" /> {summary.includedChars.toLocaleString()} ticked characters
        </span>
        <button type="button" className="primary-button" onClick={onQueueSelection} disabled={summary.included === 0}>
          Queue {summary.included.toLocaleString()} ticked chapter{summary.included === 1 ? '' : 's'}
        </button>
      </div>
    </section>
  )
}
