// components/SeatingMap.tsx
import { useEffect, useRef } from 'react'

type Props = {
  svgSrc?: string | null          // ← peut être nul maintenant
  stockPerZone: Record<string, number>
  onSelect?: (zoneId: string) => void
  onHover?: (zoneId: string | null) => void
}

export default function SeatingMap({ svgSrc, stockPerZone, onSelect, onHover }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!svgSrc) return                 // ⛔ sécurité (ne devrait plus arriver)
    fetch(svgSrc)
      .then(res => res.text())
      .then(svgText => {
        if (!ref.current) return
        ref.current.innerHTML = svgText

        const svgEl = ref.current.querySelector<SVGSVGElement>('svg')
        if (!svgEl) return

        // 1) render responsive
        svgEl.removeAttribute('width')
        svgEl.removeAttribute('height')
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        svgEl.style.width = '100%'
        svgEl.style.height = '100%'
        svgEl.style.display = 'block'

        // 2) crop off the top N pixels
        const offsetY = 11
        const [origX, origY, origW, origH] = svgEl
          .getAttribute('viewBox')!
          .split(' ')
          .map(Number)
        svgEl.setAttribute(
          'viewBox',
          `${origX} ${origY + offsetY} ${origW} ${origH - offsetY}`
        )

        // 3) hide everything
        svgEl.querySelectorAll<SVGElement>('*').forEach(el => {
          el.style.fill = 'transparent'
          el.style.pointerEvents = 'none'
        })

        // 4) color & hook up your zones
        Object.entries(stockPerZone).forEach(([id, qty]) => {
          const group = svgEl.querySelector<SVGElement>(`#${id}`)
          if (!group) return

          const fillColor = qty > 0 ? 'rgba(158,229,181,0.6)' : 'transparent'
          const hoverColor = 'rgba(110,207,141,0.8)'

          group.style.pointerEvents = qty > 0 ? 'auto' : 'none'
          group.style.fill = fillColor
          group.querySelectorAll<SVGElement>('*').forEach(child => {
            child.style.fill = fillColor
            child.style.pointerEvents = qty > 0 ? 'auto' : 'none'
          })

          if (qty > 0 && onSelect) {
            group.addEventListener('mouseenter', () => {
              group.style.fill = hoverColor
              group.querySelectorAll<SVGElement>('*').forEach(c => (c.style.fill = hoverColor))
              if (onHover) onHover(id)
            })
            group.addEventListener('mouseleave', () => {
              group.style.fill = fillColor
              group.querySelectorAll<SVGElement>('*').forEach(c => (c.style.fill = fillColor))
              if (onHover) onHover(null)
            })
            group.addEventListener('click', () => onSelect(id))
          }
        })
      })
  }, [svgSrc, stockPerZone, onSelect, onHover])

  return <div ref={ref} className="w-full h-full" />
}
