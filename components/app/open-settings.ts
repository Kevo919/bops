"use client";

import { createContext } from "react";

/**
 * Open Settings (bops-app.tsx), at its Domains or Services when `at` says so (Services at one service's row, `service`:
 * a "not set up yet" note's link), or at AI plans ("ai", or Profile in a build without them, where the AI
 * subscriptions card is: a chat error card's button, chat-error.tsx); null where there's no window.
 */
export const OpenSettings = createContext<((at?: "domains" | "services" | "ai" | "profile", more?: { service?: "phone" | "mail" | "memory" | "apps" | "composio-account" | "zapier" }) => void) | null>(null);
