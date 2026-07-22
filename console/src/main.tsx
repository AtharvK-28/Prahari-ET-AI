import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// no StrictMode: boot() wires singleton WS + intervals; double-invoke would duplicate them
createRoot(document.getElementById('root')!).render(<App />)
