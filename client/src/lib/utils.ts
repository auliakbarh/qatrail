import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import i18n from "../i18n";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Locale-aware formatting tied to the active language toggle (P14).
const locale = () => (i18n.language === "id" ? "id-ID" : "en-US");

export const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(locale()) : "—";
export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(locale()) : "—";
export const fmtNum = (n: number) => n.toLocaleString(locale());
