import { useNavigate } from "react-router-dom";
import { useShortcut, useShortcutsRegistry } from "@/lib/shortcuts/shortcuts-context";

interface GlobalShortcutsProperties {
  readonly onTogglePalette: () => void;
  readonly onOpenPalette: () => void;
}

/** Paket 2.8 §4.1: shortcuts valid on every screen of the shell. */
export function GlobalShortcuts({ onTogglePalette, onOpenPalette }: GlobalShortcutsProperties) {
  const navigate = useNavigate();
  const registry = useShortcutsRegistry();
  useShortcut("palette", onTogglePalette);
  useShortcut("paletteSlash", onOpenPalette);
  useShortcut("newTicket", () => navigate("/tickets/new"));
  useShortcut("help", () => registry?.openHelp());
  useShortcut("goTickets", () => navigate("/tickets"));
  useShortcut("goDashboard", () => navigate("/"));
  useShortcut("goKnowledge", () => navigate("/knowledge-base"));
  useShortcut("goStatus", () => navigate("/status"));
  useShortcut("goProblems", () => navigate("/problems"));
  useShortcut("goChanges", () => navigate("/changes"));
  return null;
}
