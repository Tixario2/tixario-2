// components/CalendarPicker.tsx
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'

interface CalendarPickerProps {
  availableDates: Set<string> // ISO strings like "2027-10-01"
  dateFrom: string | null
  dateTo: string | null
  onChange: (from: string | null, to: string | null) => void
  locale: string
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function MonthGrid({
  year,
  month,
  availableDates,
  rangeStart,
  rangeEnd,
  onClickDate,
  locale,
}: {
  year: number
  month: number
  availableDates: Set<string>
  rangeStart: string | null
  rangeEnd: string | null
  onClickDate: (iso: string) => void
  locale: string
}) {
  const loc = locale === 'en' ? 'en-GB' : 'fr-FR'
  const monthLabel = new Date(year, month, 1).toLocaleDateString(loc, { month: 'long', year: 'numeric' })
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, i + 1) // Mon=1 Jan 2024
    return d.toLocaleDateString(loc, { weekday: 'narrow' })
  })

  const firstDay = new Date(year, month, 1).getDay()
  const offset = firstDay === 0 ? 6 : firstDay - 1 // Monday-start
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells: (number | null)[] = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const lo = rangeStart && rangeEnd ? (rangeStart <= rangeEnd ? rangeStart : rangeEnd) : null
  const hi = rangeStart && rangeEnd ? (rangeStart <= rangeEnd ? rangeEnd : rangeStart) : null

  return (
    <div className="w-[280px] select-none">
      <p className="text-center text-sm font-semibold text-[#111111] mb-3 capitalize" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
        {monthLabel}
      </p>
      <div className="grid grid-cols-7 gap-0 mb-1">
        {weekdays.map((wd, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-[#9ca3af] uppercase" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            {wd}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0">
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} className="h-9" />

          const iso = toIso(year, month, day)
          const hasEvent = availableDates.has(iso)
          const isStart = rangeStart === iso
          const isEnd = rangeEnd === iso
          const isSingle = rangeStart === iso && !rangeEnd
          const isSelected = isStart || isEnd || isSingle
          const isInRange = lo && hi && iso > lo && iso < hi

          let cls = 'h-9 w-full flex items-center justify-center text-sm relative '
          cls += "font-['Inter',system-ui,sans-serif] "

          if (isSelected) {
            cls += 'bg-[#1a3a2a] text-white font-semibold rounded-lg cursor-pointer z-10 '
          } else if (isInRange && hasEvent) {
            cls += 'bg-[#e8f0ec] text-[#1a3a2a] font-medium cursor-pointer '
          } else if (isInRange) {
            cls += 'bg-[#e8f0ec] text-[#9ca3af] '
          } else if (hasEvent) {
            cls += 'text-[#111111] font-medium cursor-pointer hover:bg-[#e8f0ec] rounded-lg '
          } else {
            cls += 'text-[#d1d5db] '
          }

          return (
            <button
              key={iso}
              type="button"
              className={cls}
              disabled={!hasEvent && !isInRange}
              onClick={() => hasEvent && onClickDate(iso)}
            >
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function CalendarPicker({ availableDates, dateFrom, dateTo, onChange, locale }: CalendarPickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Internal draft state while panel is open
  const [draftStart, setDraftStart] = useState<string | null>(dateFrom)
  const [draftEnd, setDraftEnd] = useState<string | null>(dateTo)
  const [clickCount, setClickCount] = useState(dateFrom ? (dateTo ? 2 : 1) : 0)

  // Determine initial calendar view from earliest available date
  const sortedDates = useMemo(() => Array.from(availableDates).sort(), [availableDates])
  const initialDate = useMemo(() => {
    if (dateFrom) return new Date(dateFrom)
    if (sortedDates.length > 0) return new Date(sortedDates[0])
    return new Date()
  }, [dateFrom, sortedDates])

  const [viewYear, setViewYear] = useState(initialDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth())

  // Sync draft with props when opening
  useEffect(() => {
    if (open) {
      setDraftStart(dateFrom)
      setDraftEnd(dateTo)
      setClickCount(dateFrom ? (dateTo ? 2 : 1) : 0)
      const d = dateFrom ? new Date(dateFrom) : (sortedDates.length > 0 ? new Date(sortedDates[0]) : new Date())
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const onClickDate = useCallback((iso: string) => {
    if (clickCount === 0 || clickCount === 2) {
      // First click: set start, clear end
      setDraftStart(iso)
      setDraftEnd(null)
      setClickCount(1)
    } else {
      // Second click: set end (or swap if before start)
      setDraftEnd(iso)
      setClickCount(2)
    }
  }, [clickCount])

  const handleApply = () => {
    if (draftStart && draftEnd) {
      const lo = draftStart <= draftEnd ? draftStart : draftEnd
      const hi = draftStart <= draftEnd ? draftEnd : draftStart
      onChange(lo, hi)
    } else if (draftStart) {
      onChange(draftStart, draftStart)
    } else {
      onChange(null, null)
    }
    setOpen(false)
  }

  const handleClear = () => {
    setDraftStart(null)
    setDraftEnd(null)
    setClickCount(0)
    onChange(null, null)
    setOpen(false)
  }

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const nextM = viewMonth === 11 ? 0 : viewMonth + 1
  const nextY = viewMonth === 11 ? viewYear + 1 : viewYear

  // Button label
  const loc = locale === 'en' ? 'en-GB' : 'fr-FR'
  const fmtShort = (iso: string) =>
    new Date(iso).toLocaleDateString(loc, { day: 'numeric', month: 'short' })

  let buttonLabel = 'All dates'
  if (dateFrom && dateTo && dateFrom !== dateTo) {
    buttonLabel = `${fmtShort(dateFrom)} — ${fmtShort(dateTo)}`
  } else if (dateFrom) {
    buttonLabel = fmtShort(dateFrom)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="rounded-lg border border-[#E5E5E0] bg-white px-3 py-[0.625rem] text-sm text-[#111111] outline-none transition-colors hover:border-[#1a3a2a] focus:border-[#1a3a2a] focus:shadow-[0_0_0_3px_rgba(26,58,42,0.08)]"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
      >
        {buttonLabel}
        <svg className="ml-2 inline-block" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-[calc(100%+6px)] z-50 rounded-xl border border-[#E5E5E0] bg-white p-5 shadow-lg" style={{ width: 'max-content' }}>
          {/* Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={prevMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FAFAF8] text-[#6b7280] transition-colors hover:bg-[#E5E5E0]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={nextMonth}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FAFAF8] text-[#6b7280] transition-colors hover:bg-[#E5E5E0]"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          {/* Two month grids */}
          <div className="flex gap-6">
            <MonthGrid
              year={viewYear}
              month={viewMonth}
              availableDates={availableDates}
              rangeStart={draftStart}
              rangeEnd={draftEnd}
              onClickDate={onClickDate}
              locale={locale}
            />
            <MonthGrid
              year={nextY}
              month={nextM}
              availableDates={availableDates}
              rangeStart={draftStart}
              rangeEnd={draftEnd}
              onClickDate={onClickDate}
              locale={locale}
            />
          </div>

          {/* Footer */}
          <div className="mt-4 flex items-center justify-between border-t border-[#E5E5E0] pt-3">
            <button
              type="button"
              onClick={handleClear}
              className="text-sm font-medium text-[#6b7280] transition-colors hover:text-[#111111]"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-[#1a3a2a] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
