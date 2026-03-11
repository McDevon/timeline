import { TimelineEvent } from "../types";
import { showConfirmDialog } from "./confirmDialog";
import { ParentCandidate } from "./eventMenu";

export interface ContextMenuCallbacks {
  onEdit: (event: TimelineEvent) => void;
  onChangeParent: (event: TimelineEvent, newParent: TimelineEvent | null) => void;
  onHoverEvent: (event: TimelineEvent | null) => void;
  onExport: (event: TimelineEvent) => void;
  onDelete: (event: TimelineEvent) => void;
  getParentCandidates: (event: TimelineEvent) => ParentCandidate[];
  getCurrentParent: (event: TimelineEvent) => TimelineEvent | null;
}

export class ContextMenu {
  private el: HTMLDivElement | null = null;
  private flyout: HTMLDivElement | null = null;
  private flyoutAnchor: HTMLDivElement | null = null;
  private onClickOutside: ((e: MouseEvent) => void) | null = null;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private editMode = true;

  constructor(private callbacks: ContextMenuCallbacks) {}

  setEditMode(enabled: boolean) {
    this.editMode = enabled;
  }

  show(event: TimelineEvent, x: number, y: number): void {
    this.hide();

    const menu = document.createElement("div");
    menu.className = "context-menu";

    // Edit / View
    const editRow = this.createRow(this.editMode ? "Edit" : "View");
    editRow.addEventListener("click", () => {
      this.hide();
      this.callbacks.onEdit(event);
    });
    menu.appendChild(editRow);

    // Move to... (edit-only)
    if (this.editMode) {
      const moveRow = this.createRow("Move to\u2026");
      const moveArrow = document.createElement("span");
      moveArrow.className = "context-menu-arrow";
      moveArrow.textContent = "\u25B6";
      moveRow.appendChild(moveArrow);
      moveRow.addEventListener("mouseenter", () => {
        this.showParentFlyout(event, moveRow);
      });
      moveRow.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showParentFlyout(event, moveRow);
      });
      menu.appendChild(moveRow);
    }

    // Export
    const exportRow = this.createRow("Export event");
    exportRow.addEventListener("click", () => {
      this.hide();
      this.callbacks.onExport(event);
    });
    menu.appendChild(exportRow);

    // Delete (edit-only)
    if (this.editMode) {
      const deleteRow = this.createRow("Delete event");
      deleteRow.classList.add("destructive");
      deleteRow.addEventListener("click", () => {
        this.hide();
        showConfirmDialog(`Delete "${event.name}"?`, () => {
          this.callbacks.onDelete(event);
        });
      });
      menu.appendChild(deleteRow);
    }

    document.body.appendChild(menu);
    this.el = menu;

    // Position: try placing at cursor, adjust if overflows
    const menuRect = menu.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + menuRect.width > window.innerWidth - 8) {
      left = window.innerWidth - 8 - menuRect.width;
    }
    if (top + menuRect.height > window.innerHeight - 8) {
      top = window.innerHeight - 8 - menuRect.height;
    }
    left = Math.max(8, left);
    top = Math.max(8, top);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    // Dismiss listeners
    this.onClickOutside = (e: MouseEvent) => {
      if (this.el?.contains(e.target as Node)) return;
      if (this.flyout?.contains(e.target as Node)) return;
      this.hide();
    };
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.hide();
      }
    };
    // Use setTimeout so the current contextmenu event doesn't immediately trigger dismiss
    setTimeout(() => {
      document.addEventListener("mousedown", this.onClickOutside!);
      document.addEventListener("contextmenu", this.onClickOutside!);
    }, 0);
    document.addEventListener("keydown", this.onKeyDown);
  }

  hide(): void {
    this.hideParentFlyout();
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
    if (this.onClickOutside) {
      document.removeEventListener("mousedown", this.onClickOutside);
      document.removeEventListener("contextmenu", this.onClickOutside);
      this.onClickOutside = null;
    }
    if (this.onKeyDown) {
      document.removeEventListener("keydown", this.onKeyDown);
      this.onKeyDown = null;
    }
    this.callbacks.onHoverEvent(null);
  }

  private createRow(text: string): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "context-menu-row";
    row.textContent = text;
    return row;
  }

  private showParentFlyout(event: TimelineEvent, anchor: HTMLDivElement): void {
    if (this.flyout) {
      this.flyout.remove();
      this.flyout = null;
    }

    const currentParent = this.callbacks.getCurrentParent(event);
    const candidates = this.callbacks.getParentCandidates(event);

    // Collect ancestor chain of current parent for auto-expanding
    const ancestorSet = new Set<TimelineEvent>();
    if (currentParent) {
      let p: TimelineEvent | null = currentParent;
      while (p) {
        ancestorSet.add(p);
        p = this.callbacks.getCurrentParent(p);
      }
    }

    const flyout = document.createElement("div");
    flyout.className = "parent-flyout";

    // "None (top level)" row
    const noneRow = document.createElement("div");
    noneRow.className =
      "parent-flyout-row" + (currentParent === null ? " active" : "");
    noneRow.textContent = "None (top level)";
    noneRow.addEventListener("mouseenter", () => {
      this.callbacks.onHoverEvent(null);
    });
    noneRow.addEventListener("click", () => {
      this.callbacks.onChangeParent(event, null);
      this.hide();
    });
    flyout.appendChild(noneRow);

    // Build event tree
    this.buildFlyoutTree(flyout, candidates, event, currentParent, ancestorSet);

    flyout.addEventListener("mouseenter", () => {
      // Keep flyout open while hovering it
    });
    flyout.addEventListener("mouseleave", () => {
      this.callbacks.onHoverEvent(null);
    });

    document.body.appendChild(flyout);
    this.flyout = flyout;
    this.flyoutAnchor = anchor;

    this.repositionFlyout();
  }

  private repositionFlyout(): void {
    if (!this.flyout || !this.el || !this.flyoutAnchor) return;

    const flyout = this.flyout;
    const anchorRect = this.flyoutAnchor.getBoundingClientRect();
    const menuRect = this.el.getBoundingClientRect();

    // Remove max-height to measure natural size
    flyout.style.maxHeight = "none";
    const naturalHeight = flyout.scrollHeight;

    // Horizontal: prefer right of context menu
    let left = menuRect.right + 2;
    flyout.style.left = `${left}px`;
    const flyoutWidth = flyout.getBoundingClientRect().width;
    if (left + flyoutWidth > window.innerWidth - 8) {
      left = menuRect.left - flyoutWidth - 2;
      flyout.style.left = `${left}px`;
    }

    // Vertical: align top with anchor row
    let top = anchorRect.top;
    if (top + naturalHeight > window.innerHeight - 8) {
      top = window.innerHeight - 8 - naturalHeight;
    }
    top = Math.max(8, top);
    flyout.style.top = `${top}px`;

    // Constrain max-height if needed
    const availableHeight = window.innerHeight - top - 8;
    if (naturalHeight > availableHeight) {
      flyout.style.maxHeight = `${availableHeight}px`;
    }
  }

  private buildFlyoutTree(
    container: HTMLElement,
    candidates: ParentCandidate[],
    targetEvent: TimelineEvent,
    currentParent: TimelineEvent | null,
    ancestorSet: Set<TimelineEvent>,
  ): void {
    let i = 0;
    while (i < candidates.length) {
      const c = candidates[i];
      const item = document.createElement("div");
      item.className = "parent-flyout-item";

      // Collect children (next candidates with depth > c.depth)
      const childStart = i + 1;
      let childEnd = childStart;
      while (
        childEnd < candidates.length &&
        candidates[childEnd].depth > c.depth
      ) {
        childEnd++;
      }
      const childCandidates = candidates.slice(childStart, childEnd);
      const hasChildren = childCandidates.length > 0;

      const row = document.createElement("div");
      row.className =
        "parent-flyout-row" + (c.event === currentParent ? " active" : "");
      row.style.paddingLeft = `${8 + c.depth * 16}px`;

      // Arrow for expand/collapse
      const arrow = document.createElement("span");
      arrow.className = "parent-flyout-arrow";
      if (hasChildren) {
        arrow.textContent = "\u25B6";
      }
      row.appendChild(arrow);

      // Event name
      const nameSpan = document.createElement("span");
      nameSpan.className = "parent-flyout-name";
      nameSpan.textContent = c.name;
      row.appendChild(nameSpan);

      // Hover → highlight on canvas
      row.addEventListener("mouseenter", () => {
        if (c.event) this.callbacks.onHoverEvent(c.event);
      });

      item.appendChild(row);

      if (hasChildren) {
        const childContainer = document.createElement("div");
        childContainer.className = "parent-flyout-children";

        // Auto-expand if ancestor of current parent
        const shouldExpand = c.event !== null && ancestorSet.has(c.event);
        if (shouldExpand) {
          arrow.classList.add("expanded");
          childContainer.style.maxHeight = "none";
        }

        this.buildFlyoutTree(
          childContainer,
          childCandidates,
          targetEvent,
          currentParent,
          ancestorSet,
        );
        item.appendChild(childContainer);

        // Arrow click → toggle expand/collapse
        arrow.addEventListener("click", (e) => {
          e.stopPropagation();
          const isExpanded = arrow.classList.contains("expanded");
          if (isExpanded) {
            arrow.classList.remove("expanded");
            childContainer.style.maxHeight = childContainer.scrollHeight + "px";
            void childContainer.offsetHeight;
            childContainer.style.maxHeight = "0";
            const onEnd = () => {
              childContainer.removeEventListener("transitionend", onEnd);
              this.repositionFlyout();
            };
            childContainer.addEventListener("transitionend", onEnd);
          } else {
            arrow.classList.add("expanded");
            childContainer.style.maxHeight = childContainer.scrollHeight + "px";
            const onEnd = () => {
              childContainer.removeEventListener("transitionend", onEnd);
              if (arrow.classList.contains("expanded")) {
                childContainer.style.maxHeight = "none";
              }
              this.repositionFlyout();
            };
            childContainer.addEventListener("transitionend", onEnd);
          }
        });
      }

      // Row click → reparent
      row.addEventListener("click", () => {
        if (!c.event) return;
        this.callbacks.onChangeParent(targetEvent, c.event);
        this.hide();
      });

      container.appendChild(item);
      i = childEnd;
    }
  }

  private hideParentFlyout(): void {
    if (this.flyout) {
      this.flyout.remove();
      this.flyout = null;
      this.flyoutAnchor = null;
    }
  }
}
