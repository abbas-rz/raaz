import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App.tsx"

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => {})
}

// No StrictMode: its double-run of effects would post and cancel the pairing
// invite in development.
createRoot(document.getElementById("root")!).render(<App />)
