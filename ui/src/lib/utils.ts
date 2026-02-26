import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(num: number | null | undefined): string {
  if (num == null) return '0'
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

export function formatDuration(ms: number): string {
  if (ms == null || isNaN(ms)) return '-'
  if (ms < 1000) {
    return Math.round(ms) + 'ms'
  }
  return (ms / 1000).toFixed(1) + 's'
}
