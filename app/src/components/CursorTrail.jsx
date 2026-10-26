import { useEffect, useRef } from 'react'
import './CursorTrail.css'

export default function CursorTrail() {
  const trailRef = useRef(null)
  const coords = useRef({ x: 0, y: 0 })
  const circles = useRef([])
  const animationFrameId = useRef(null)

  useEffect(() => {
    const colors = [
      'rgba(102, 126, 234, 0.3)',
      'rgba(118, 75, 162, 0.3)',
      'rgba(240, 147, 251, 0.3)',
    ]

    // Create fewer trail circles to reduce flickering
    for (let i = 0; i < 12; i++) {
      const circle = document.createElement('div')
      circle.className = 'cursor-trail-circle'
      circle.style.backgroundColor = colors[i % colors.length]
      circle.style.willChange = 'transform' // Optimize for animations
      trailRef.current.appendChild(circle)
      circles.current.push(circle)
    }

    const positions = circles.current.map(() => ({ x: 0, y: 0 }))

    const handleMouseMove = (e) => {
      coords.current.x = e.clientX
      coords.current.y = e.clientY
    }

    const animateCircles = () => {
      let x = coords.current.x
      let y = coords.current.y

      circles.current.forEach((circle, index) => {
        // Smooth interpolation
        positions[index].x += (x - positions[index].x) * 0.15
        positions[index].y += (y - positions[index].y) * 0.15

        // Use transform instead of left/top for better performance
        const scale = (circles.current.length - index) / circles.current.length
        circle.style.transform = `translate(${positions[index].x - 12}px, ${positions[index].y - 12}px) scale(${scale})`

        x = positions[index].x
        y = positions[index].y
      })

      animationFrameId.current = requestAnimationFrame(animateCircles)
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    animateCircles()

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current)
      }
    }
  }, [])

  return <div ref={trailRef} className="cursor-trail-container" />
}
