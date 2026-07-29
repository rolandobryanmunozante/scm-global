import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import "./pages.css";
import "./i18n";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { initializeTheme } from "./theme";

initializeTheme();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
