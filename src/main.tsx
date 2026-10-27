import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";

const rootElement = document.getElementById("root")!;
const bootFallback = document.getElementById("boot-fallback");
if (bootFallback) {
  const observer = new MutationObserver(() => {
    if (rootElement.childElementCount > 0) {
      bootFallback.remove();
      observer.disconnect();
    }
  });
  observer.observe(rootElement, { childList: true });
}

createRoot(rootElement).render(<App />);
