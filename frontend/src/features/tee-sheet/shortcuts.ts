// Path: frontend/src/features/tee-sheet/shortcuts.ts — Phase 10 Slice 6.
// The tee-sheet keyboard-shortcut map exactly as Phase 8 documents it
// (phase8-shared.jsx ShortcutHelpModal "Tee sheet" group). Slice 6 renders
// these; Slice 10 wires them to action handlers.
import type { ShortcutMap } from "../../components/ui/ShortcutHelpModal";

export const TEE_SHEET_SHORTCUTS: ShortcutMap = [
  {
    title: "Navigation",
    entries: [
      { keys: ["t"], label: "Jump to today" },
      { keys: ["←", "→"], label: "Previous / next day" },
      { keys: ["j", "k"], label: "Move selection up / down a slot" },
      { keys: ["h", "l"], label: "Move selection between slot columns" },
      { keys: ["g", "g"], label: "Go to top of sheet" },
      { keys: ["⇧", "G"], label: "Go to bottom of sheet" },
      { keys: ["/"], label: "Find a member" },
    ],
  },
  {
    title: "Booking",
    entries: [
      { keys: ["n"], label: "New booking in selected slot" },
      { keys: ["w"], label: "Add to walk-in waitlist" },
      { keys: ["s"], label: "Squeeze-insert here" },
      { keys: ["c"], label: "Check in selected flight" },
      { keys: ["p"], label: "Mark pace status…" },
      { keys: ["x"], label: "Mark no-show" },
      { keys: ["⌘", "Z"], label: "Undo last action" },
    ],
  },
  {
    title: "Modes",
    entries: [
      { keys: ["⇧", "T"], label: "Tournament mode (shotgun)" },
      { keys: ["⇧", "M"], label: "Marshal view" },
      { keys: ["v"], label: "Cycle density (compact · default · comfortable)" },
      { keys: ["⌥", "P"], label: "Show price breakdown" },
      { keys: ["⌥", "A"], label: "Show audit history on selection" },
    ],
  },
  {
    title: "Help",
    entries: [
      { keys: ["?"], label: "Open this panel" },
      { keys: ["esc"], label: "Close panel · clear selection" },
    ],
  },
];
