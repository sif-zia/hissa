import { render } from "preact";
import { App } from "./App";
import "./styles/fonts.css";
import "./styles/journal.css";

render(<App />, document.getElementById("app") as HTMLElement);

// Registered here rather than injected into every page, so the static landing
// pages stay entirely script-free.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}
