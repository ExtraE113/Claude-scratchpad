import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { preloadBaselineCache } from './lib/baselineCache'

// Start preloading the baseline cache early to minimize wait time
preloadBaselineCache()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
