import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// cn() — merge class Tailwind dengan konflik-resolution (3-DESIGN.md Bagian 8)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
