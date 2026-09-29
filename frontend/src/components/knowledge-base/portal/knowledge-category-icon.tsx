import {
  BookOpen,
  Cloud,
  Database,
  FileText,
  HelpCircle,
  KeyRound,
  Laptop,
  Mail,
  Monitor,
  Phone,
  Printer,
  Settings,
  Shield,
  Users,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Paket 2.9 (K1): the fixed icon list of portal categories (backend validates the same names). */
const icons: Readonly<Record<string, LucideIcon>> = {
  "book-open": BookOpen,
  "key-round": KeyRound,
  laptop: Laptop,
  monitor: Monitor,
  printer: Printer,
  wifi: Wifi,
  mail: Mail,
  phone: Phone,
  shield: Shield,
  users: Users,
  "file-text": FileText,
  wrench: Wrench,
  database: Database,
  cloud: Cloud,
  settings: Settings,
  "help-circle": HelpCircle,
};

export function KnowledgeCategoryIcon({ name, size = 18 }: { readonly name: string; readonly size?: number }) {
  const Icon = icons[name] ?? BookOpen;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}
