import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export function useAuth() {
  const context = useContext(AuthContext);

  // This guard catches a common developer mistake: using useAuth()
  // in a component that isn't wrapped by AuthProvider. Instead of
  // failing silently with undefined values, it throws a clear error.
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
