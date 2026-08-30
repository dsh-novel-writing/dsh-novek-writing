/**
 * Official Web slot contract as it applies to a novel studio plugin.
 * Occupied single slots replace the shipped occupant; list slots add a cell.
 */
export const SLOT_PLAN = {
  conversation: {
    kind: "single",
    occupied: true,
    action: "do-not-register",
    reason: "Registering replaces ConversationRoot and deletes chat, composer, and every nested seat.",
  },
  sidebar: {
    kind: "single",
    occupied: true,
    action: "do-not-replace-by-default",
    reason: "Replacing SidebarRoot drops the session list unless the plugin re-declares workspaces/settings. DSH-Creator does this; a companion studio should not.",
  },
  "sidebar.footer.action": {
    kind: "list",
    occupied: false,
    action: "register",
    reason: "Additive footer button that opens the studio without taking the session column.",
  },
  "shell.overlay": {
    kind: "list",
    occupied: false,
    action: "register",
    reason: "Additive frame-wide layer. Dock a studio pane here and inset the conversation so chat stays native.",
  },
  details: {
    kind: "single",
    occupied: true,
    action: "do-not-register",
    reason: "Right column is the tool-details panel, max ~520px, session-scoped. Wrong place for a writing workbench.",
  },
  "settings.plugin.item": {
    kind: "list",
    occupied: false,
    action: "register",
    reason: "Settings card for library root, inject-prompt toggle, and prompt editor.",
  },
  "conversation.input.dock": {
    kind: "list",
    occupied: false,
    action: "register",
    reason: "Active-book chip and 续写 control above the composer, without replacing chat.",
  },
} as const;

export type SlotKey = keyof typeof SLOT_PLAN;

export function additiveSlots(): SlotKey[] {
  return (Object.keys(SLOT_PLAN) as SlotKey[]).filter((key) => SLOT_PLAN[key].occupied === false);
}

export function forbiddenSlots(): SlotKey[] {
  return (Object.keys(SLOT_PLAN) as SlotKey[]).filter((key) => SLOT_PLAN[key].action === "do-not-register");
}
