import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App.jsx"

function lockAppGestures() {
  let lastTouchEnd = 0

  document.documentElement.style.overscrollBehavior = "none"
  document.body.style.overscrollBehavior = "none"

  window.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) {
        event.preventDefault()
      }
    },
    { passive: false }
  )

  window.addEventListener(
    "gesturestart",
    (event) => {
      event.preventDefault()
    },
    { passive: false }
  )

  window.addEventListener(
    "touchmove",
    (event) => {
      if (event.touches.length > 1) {
        event.preventDefault()
      }
    },
    { passive: false }
  )

  window.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now()

      if (now - lastTouchEnd <= 300) {
        event.preventDefault()
      }

      lastTouchEnd = now
    },
    { passive: false }
  )
}

lockAppGestures()

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
)

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Service worker registration failed:", error)
    })
  })
}
