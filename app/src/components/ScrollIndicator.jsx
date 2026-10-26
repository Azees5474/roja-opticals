import { useEffect, useState } from 'react'
import './ScrollIndicator.css'

export default function ScrollIndicator() {
  const [scrollPercentage, setScrollPercentage] = useState(0)

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      
      const scrolled = (scrollTop / (documentHeight - windowHeight)) * 100
      setScrollPercentage(Math.min(100, Math.max(0, scrolled)))
    }

    window.addEventListener('scroll', handleScroll)
    handleScroll() // Initial call
    
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="scroll-indicator">
      <div 
        className="scroll-indicator-bar" 
        style={{ width: `${scrollPercentage}%` }}
      />
    </div>
  )
}
