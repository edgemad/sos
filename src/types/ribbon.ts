// Shared ribbon type definitions (used by Ribbon.svelte and all modules).

export interface RibbonItem {
  id: string;
  kind: "button" | "menu" | "palette" | "input";
  icon: string;
  label: string;
  title?: string;
  options?: { value: string; label?: string; swatch?: string }[];
  value?: string;
  placeholder?: string;
  big?: boolean;
}

export interface RibbonGroup {
  id: string;
  label: string;
  items: RibbonItem[];
}

export interface RibbonTab {
  id: string;
  label: string;
  groups: RibbonGroup[];
}
