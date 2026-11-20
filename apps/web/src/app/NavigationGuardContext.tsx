import { createContext } from "react";

export type NavigationGuard = () => boolean;
export const NavigationGuardContext = createContext<
  ((guard: NavigationGuard | null) => void) | null
>(null);
