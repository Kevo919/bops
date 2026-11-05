"use client";

import { createContext } from "react";

/**
 * Open Settings (bops-app.tsx), at its Domains or Services when `at` says so (Services at one service's row, `service`:
 * a "not set up yet" note's link); null where there's no window.
 */
export const OpenSettings = createContext<((at?: "domains" | "services", more?: { service?: "phone" | "mail" | "memory" | "apps" | "composio-account" | "zapier" }) => void) | null>(null);
