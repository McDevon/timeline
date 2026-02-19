const SHORTCUTS: [string, string][] = [
  [
    "Pan horizontally",
    "Drag on timeline, scroll horizontally, or Shift + scroll vertically",
  ],
  ["Pan vertically", "Scroll wheel"],
  ["Zoom in / out", "Ctrl/\u2318 + scroll, or pinch on trackpad"],
  ["Select a point in time", "Click on the time axis"],
  ["Select a time range", "Drag on the time axis"],
  [
    "Disable snapping",
    "Hold Ctrl/\u2318 while selecting a point on the time axis",
  ],
  ["Extend range selection", "Shift + click on the time axis"],
  ["Select an event", "Click on an event"],
  ["Extend range to event", "Shift + click on an event"],
  ["Zoom into event", "Double-click a range event"],
  ["Zoom back out", "Double-click the same event again"],
  ["Collapse / expand group", "Ctrl/\u2318 + click a group event"],
  ["Reorder events", "Drag an event vertically"],
  ["Undo", "Ctrl/\u2318 + Z"],
  ["Redo", "Ctrl + Y or \u2318 + Shift + Z"],
  ["Delete event", "Delete or backspace"],
];

export function showHelpDialog(): void {
  const backdrop = document.createElement("div");
  backdrop.className = "confirm-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "help-dialog";

  const title = document.createElement("div");
  title.className = "help-title";
  title.textContent = "Keyboard & Mouse Shortcuts";
  dialog.appendChild(title);

  const table = document.createElement("table");
  table.className = "help-table";

  for (const [action, how] of SHORTCUTS) {
    const tr = document.createElement("tr");
    const tdAction = document.createElement("td");
    tdAction.textContent = action;
    const tdHow = document.createElement("td");
    tdHow.textContent = how;
    tr.appendChild(tdAction);
    tr.appendChild(tdHow);
    table.appendChild(tr);
  }

  dialog.appendChild(table);

  const btnRow = document.createElement("div");
  btnRow.className = "help-close-row";
  const closeBtn = document.createElement("button");
  closeBtn.className = "confirm-btn";
  closeBtn.textContent = "Close";
  btnRow.appendChild(closeBtn);
  dialog.appendChild(btnRow);

  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  requestAnimationFrame(() => backdrop.classList.add("visible"));

  function close() {
    backdrop.classList.remove("visible");
    backdrop.addEventListener("transitionend", () => backdrop.remove());
    window.removeEventListener("keydown", onKeyDown);
  }

  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape" || e.key === "Enter") close();
  }
  window.addEventListener("keydown", onKeyDown);
}
