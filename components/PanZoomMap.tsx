// components/PanZoomMap.tsx
import { useLayoutEffect, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import SeatingMap from './SeatingMap'

type Props = {
  pngSrc: string
  svgSrc: string
  stockPerZone: Record<string, number>
  onSelect?: (zoneId: string) => void
  onHover?: (zoneId: string | null) => void
}

export default function PanZoomMap({
  pngSrc,
  svgSrc,
  stockPerZone,
  onSelect,
  onHover,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [last, setLast] = useState({ x: 0, y: 0 })

  // Center the content before painting
  useLayoutEffect(() => {
    const w = wrapperRef.current
    if (!w) return
    const { width, height } = w.getBoundingClientRect()
    const x = Math.round((width - width * scale) / 2)
    const y = Math.round((height - height * scale) / 2)
    setTranslate({ x, y })
  }, [scale])

  // Handle panning
  useEffect(() => {
    const w = wrapperRef.current
    if (!w) return
    const onMouseMove = (e: MouseEvent) => {
      if (!isPanning) return
      const dx = e.clientX - last.x
      const dy = e.clientY - last.y
      setTranslate(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      setLast({ x: e.clientX, y: e.clientY })
    }
    const onMouseUp = () => setIsPanning(false)
    w.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      w.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [isPanning, last])

  const startPan = (e: React.MouseEvent) => {
    setIsPanning(true)
    setLast({ x: e.clientX, y: e.clientY })
  }

  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
  const zoom = (factor: number) => {
    const w = wrapperRef.current
    if (!w) return
    const { width, height } = w.getBoundingClientRect()
    const newScale = clamp(scale * factor, 0.5, 4)
    const x = Math.round((width - width * newScale) / 2)
    const y = Math.round((height - height * newScale) / 2)
    setScale(newScale)
    setTranslate({ x, y })
  }
  const reset = () => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }

  return (
    <div
      ref={wrapperRef}
      className="map-wrapper relative w-full h-full bg-transparent"
      onMouseDown={startPan}
    >
      {/* Zoom controls */}
      <div className="absolute top-2 right-2 flex flex-col space-y-1 p-1 bg-white rounded-lg shadow z-10">
        <button
          onClick={() => zoom(1.2)}
          className="w-8 h-8 flex items-center justify-center text-black rounded hover:bg-gray-100 border"
        >
          +
        </button>
        <button
          onClick={() => zoom(1 / 1.2)}
          className="w-8 h-8 flex items-center justify-center text-black rounded hover:bg-gray-100 border"
        >
          –
        </button>
        <button
          onClick={reset}
          className="w-8 h-8 flex items-center justify-center text-black rounded hover:bg-gray-100 border"
        >
          ⟳
        </button>
      </div>

      {/* Content container: image + SVG overlay */}
      <div
        ref={contentRef}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transformOrigin: 'top left',
          width: '100%',
          height: '100%',
        }}
      >
        {/* Static PNG background */}
        <div className="relative w-full h-full">
          <Image
            src={pngSrc}
            alt="Plan statique"
            layout="fill"
            objectFit="contain"
            objectPosition="center"
            className="select-none"
          />
        </div>
        {/* SVG overlay with interactive zones */}
        <div className="absolute inset-0">
          <SeatingMap
            key={svgSrc ?? 'no-svg'}
            svgSrc={svgSrc}
            stockPerZone={stockPerZone}
            onSelect={onSelect}
            onHover={onHover}
          />
        </div>
      </div>
    </div>
  )
}

