import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { desktop } from './lib/desktop'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// 웹 앱(휴대폰 홈 화면 등): 배포판에서만 서비스 워커 등록. 데스크톱 앱은 필요 없음
if (import.meta.env.PROD && !desktop && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
}
