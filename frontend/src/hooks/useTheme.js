import { useContext } from "react";
import { ThemeContext } from "../context/ThemeContext";

export function useTheme() {
  const context = useContext(ThemeContext);

  // Same guard pattern as useAuth: if a component calls useTheme() without
  // a ThemeProvider above it, fail loudly with a useful message instead of
  // crashing later on a destructure of `null`.
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}
