import './AnimatedBackground.css'

export default function AnimatedBackground() {
  return (
    <div className="animated-background">
      {/* Gradient Orbs */}
      <div className="gradient-orb orb-1"></div>
      <div className="gradient-orb orb-2"></div>
      <div className="gradient-orb orb-3"></div>
      
      {/* Floating Shapes */}
      <div className="floating-shape shape-1"></div>
      <div className="floating-shape shape-2"></div>
      <div className="floating-shape shape-3"></div>
      <div className="floating-shape shape-4"></div>
      <div className="floating-shape shape-5"></div>
      
      {/* Light Beams */}
      <div className="light-beam beam-1"></div>
      <div className="light-beam beam-2"></div>
    </div>
  )
}
