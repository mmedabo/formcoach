// Minimal inline line-icons for the "why it matters" cards. Stroke inherits currentColor via CSS.
export const ICONS = {
  shield: `<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  bolt:   `<svg viewBox="0 0 24 24"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>`,
  agility:`<svg viewBox="0 0 24 24"><path d="M4 8h10l-3-3M20 16H10l3 3"/></svg>`,
  jump:   `<svg viewBox="0 0 24 24"><circle cx="12" cy="4.5" r="2"/><path d="M12 8v6M12 8l4 3M12 8l-4 3M12 14l-3 6M12 14l3 6"/></svg>`,
  heart:  `<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.6-7-10a4 4 0 017-2 4 4 0 017 2c0 5.4-7 10-7 10z"/></svg>`,
  power:  `<svg viewBox="0 0 24 24"><path d="M12 3v8M7 6a7 7 0 1010 0"/></svg>`,
};
export const icon = k => ICONS[k] || ICONS.bolt;
