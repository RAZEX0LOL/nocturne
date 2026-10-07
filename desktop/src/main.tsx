import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { platformName } from './native'
import './styles.css'

// Оформление выбирается до первого кадра: шрифт, значки и вид элементов зависят от системы.
document.documentElement.dataset.platform = platformName

const root = createRoot(document.getElementById('root')!)

/**
 * Мини-плеер — то же приложение в маленьком окне, но без своего плеера: звук остаётся в главном
 * окне, поэтому стор с аудиодвижком здесь даже не загружается.
 */
if (new URLSearchParams(location.search).has('mini')) {
  document.documentElement.classList.add('mini')
  void Promise.all([import('./ui/MiniPlayer'), import('./ui/Icon').then((icon) => icon.loadSystemSymbols())]).then(([{ MiniPlayer }]) =>
    root.render(
      <StrictMode>
        <MiniPlayer />
      </StrictMode>,
    ),
  )
} else {
  // Значки Mac (SF Symbols) приходят из AppKit — ждём их до первого кадра, это доли секунды.
  void Promise.all([import('./App'), import('./shell'), import('./theme'), import('./ui/Icon').then((icon) => icon.loadSystemSymbols())]).then(([{ App }, { startShell }, { startTheme }]) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    startTheme()
    void startShell()
  })
}
