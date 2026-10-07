import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { platformName } from './native'
import { startShell } from './shell'
import './styles.css'

// Оформление выбирается до первого кадра: шрифт, значки и вид элементов зависят от системы.
document.documentElement.dataset.platform = platformName

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

void startShell()
