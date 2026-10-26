import { useEffect, useRef } from 'react'
import './FloatingParticles.css'

export default function FloatingParticles({ count = 20 }) {
  const containerRef = useRef(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Generate random particles
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div')
      particle.className = 'floating-particle'
      
      // Random properties
      const size = Math.random() * 4 + 2
      const left = Math.random() * 100
      const delay = Math.random() * 5
      const duration = Math.random() * 10 + 15
      const opacity = Math.random() * 0.3 + 0.1
      
      particle.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${left}%;
        opacity: ${opacity};
        animation-delay: ${delay}s;
        animation-duration: ${duration}s;
      `
      
      container.appendChild(particle)
    }

    // Cleanup
    return () => {
      while (container.firstChild) {
        container.removeChild(container.firstChild)
      }
    }
  }, [count])

  return <div ref={containerRef} className="particles-container" />
}
