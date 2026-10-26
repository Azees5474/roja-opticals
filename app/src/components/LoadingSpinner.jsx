import './LoadingSpinner.css'

export default function LoadingSpinner({ size = 'medium', text = '' }) {
  return (
    <div className={`loading-spinner-container ${size}`}>
      <div className="spinner-wrapper">
        <div className="spinner-ring ring-1"></div>
        <div className="spinner-ring ring-2"></div>
        <div className="spinner-ring ring-3"></div>
        <div className="spinner-core">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 4L14 8L18 9L15 12L16 16L12 14L8 16L9 12L6 9L10 8L12 4Z" 
                  fill="currentColor" />
          </svg>
        </div>
      </div>
      {text && <p className="spinner-text">{text}</p>}
    </div>
  )
}
