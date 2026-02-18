import { TimelineEvent } from "../types";
import { showConfirmDialog } from "./confirmDialog";
import { DateInput } from "./dateInput";
import { ApproxInput } from "./approxInput";

export interface ParentCandidate {
  event: TimelineEvent | null;
  name: string;
  depth: number;
}

export interface EventMenuCallbacks {
  onRename: (event: TimelineEvent, name: string) => void;
  onEditInfo: (event: TimelineEvent, info: string) => void;
  onChangeStart: (event: TimelineEvent, start: string) => void;
  onChangeEnd: (event: TimelineEvent, end: string | undefined) => void;
  onChangeStartApprox: (
    event: TimelineEvent,
    approx: [string, string] | undefined,
  ) => void;
  onChangeEndApprox: (
    event: TimelineEvent,
    approx: [string, string] | undefined,
  ) => void;
  onChangeParent: (
    event: TimelineEvent,
    newParent: TimelineEvent | null,
  ) => void;
  onTypeChange: (event: TimelineEvent) => void;
  onHoverEvent: (event: TimelineEvent | null) => void;
  onDelete: (event: TimelineEvent) => void;
  onExport: (event: TimelineEvent) => void;
  hasChildren: (event: TimelineEvent) => boolean;
  getParentCandidates: (event: TimelineEvent) => ParentCandidate[];
  getCurrentParent: (event: TimelineEvent) => TimelineEvent | null;
}

type EventType = "point" | "range" | "ongoing";

export class EventMenu {
  private el: HTMLDivElement;
  private titleSpan: HTMLSpanElement;
  private nameInput: HTMLInputElement;
  private infoInput: HTMLTextAreaElement;
  private currentEvent: TimelineEvent | null = null;

  // Type selector
  private typeBtns: Map<EventType, HTMLDivElement> = new Map();
  private currentType: EventType = "range";

  // Date sections
  private startDateInput: DateInput;
  private startApproxInput: ApproxInput;
  private endSection: HTMLDivElement;
  private endDateInput: DateInput;
  private endApproxInput: ApproxInput;
  private endOngoingLabel: HTMLDivElement;
  private endDateContainer: HTMLDivElement;

  // Stashed end date (for type switching round-trips)
  private stashedEnd: string | undefined;
  private stashedEndApprox: [string, string] | undefined;

  // Parent flyout
  private parentTriggerText: HTMLSpanElement;
  private parentFlyout: HTMLDivElement | null = null;
  private parentAnchor: HTMLDivElement | null = null;
  private parentHideTimer = 0;
  private parentSettling = false;
  private parentSettlingHandler: ((e: MouseEvent) => void) | null = null;

  constructor(private callbacks: EventMenuCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "event-menu collapsed disabled";

    // Header
    const header = document.createElement("div");
    header.className = "event-menu-header";
    this.titleSpan = document.createElement("span");
    this.titleSpan.className = "event-menu-title";
    this.titleSpan.textContent = "Nothing selected";
    const chevron = document.createElement("span");
    chevron.className = "event-menu-chevron";
    chevron.textContent = "\u25BC";
    header.appendChild(this.titleSpan);
    header.appendChild(chevron);
    header.addEventListener("click", () => {
      const wasExpanded = !this.el.classList.contains("collapsed");
      this.el.classList.toggle("collapsed");
      if (wasExpanded) this.hideParentFlyout();
    });
    this.el.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "event-menu-body";

    // Name field
    const nameField = document.createElement("div");
    nameField.className = "event-menu-field";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Name";
    this.nameInput = document.createElement("input");
    this.nameInput.type = "text";
    this.nameInput.addEventListener("input", () => {
      if (!this.currentEvent) return;
      const val = this.nameInput.value.trim();
      if (val.length === 0) return;
      this.titleSpan.textContent = val;
      callbacks.onRename(this.currentEvent, val);
    });
    nameField.appendChild(nameLabel);
    nameField.appendChild(this.nameInput);
    body.appendChild(nameField);

    // Info field
    const infoField = document.createElement("div");
    infoField.className = "event-menu-field";
    const infoLabel = document.createElement("label");
    infoLabel.textContent = "Info";
    this.infoInput = document.createElement("textarea");
    this.infoInput.rows = 3;
    this.infoInput.addEventListener("input", () => {
      if (!this.currentEvent) return;
      callbacks.onEditInfo(this.currentEvent, this.infoInput.value);
    });
    infoField.appendChild(infoLabel);
    infoField.appendChild(this.infoInput);
    body.appendChild(infoField);

    // Start section
    const startHeader = document.createElement("div");
    startHeader.className = "event-menu-section";
    startHeader.textContent = "Start";
    body.appendChild(startHeader);

    this.startDateInput = new DateInput((iso) => {
      if (!this.currentEvent) return;
      callbacks.onChangeStart(this.currentEvent, iso);
    });
    body.appendChild(this.startDateInput.getElement());

    this.startApproxInput = new ApproxInput((approx) => {
      if (!this.currentEvent) return;
      callbacks.onChangeStartApprox(this.currentEvent, approx);
    });
    body.appendChild(this.startApproxInput.getElement());

    // End section
    this.endSection = document.createElement("div");

    const endHeader = document.createElement("div");
    endHeader.className = "event-menu-section";
    endHeader.textContent = "End";
    this.endSection.appendChild(endHeader);

    // Ongoing label (shown when type is ongoing)
    this.endOngoingLabel = document.createElement("div");
    this.endOngoingLabel.className = "event-menu-ongoing";
    this.endOngoingLabel.textContent = "ongoing (present day)";
    this.endSection.appendChild(this.endOngoingLabel);

    // Date inputs for end (shown when type is range)
    this.endDateContainer = document.createElement("div");

    this.endDateInput = new DateInput((iso) => {
      if (!this.currentEvent) return;
      callbacks.onChangeEnd(this.currentEvent, iso);
    });
    this.endDateContainer.appendChild(this.endDateInput.getElement());

    this.endApproxInput = new ApproxInput((approx) => {
      if (!this.currentEvent) return;
      callbacks.onChangeEndApprox(this.currentEvent, approx);
    });
    this.endDateContainer.appendChild(this.endApproxInput.getElement());

    this.endSection.appendChild(this.endDateContainer);
    body.appendChild(this.endSection);

    // Type selector
    const typeRow = document.createElement("div");
    typeRow.className = "event-menu-type";
    for (const type of ["point", "range", "ongoing"] as EventType[]) {
      const btn = document.createElement("div");
      btn.className = "event-menu-type-btn";
      btn.textContent = type.charAt(0).toUpperCase() + type.slice(1);
      btn.addEventListener("click", () => this.onTypeClick(type));
      typeRow.appendChild(btn);
      this.typeBtns.set(type, btn);
    }
    body.appendChild(typeRow);

    // Parent section — hover-triggered flyout
    const parentHeader = document.createElement("div");
    parentHeader.className = "event-menu-section";
    parentHeader.textContent = "Parent";
    body.appendChild(parentHeader);

    const parentRow = document.createElement("div");
    parentRow.className = "event-menu-btn";
    parentRow.style.display = "flex";
    parentRow.style.alignItems = "center";
    parentRow.style.gap = "4px";
    this.parentTriggerText = document.createElement("span");
    this.parentTriggerText.style.flex = "1";
    this.parentTriggerText.style.minWidth = "0";
    this.parentTriggerText.style.overflow = "hidden";
    this.parentTriggerText.style.textOverflow = "ellipsis";
    this.parentTriggerText.style.whiteSpace = "nowrap";
    const parentArrow = document.createElement("span");
    parentArrow.style.flexShrink = "0";
    parentArrow.textContent = "\u25B6";
    parentRow.appendChild(this.parentTriggerText);
    parentRow.appendChild(parentArrow);

    parentRow.addEventListener("mouseenter", () => {
      clearTimeout(this.parentHideTimer);
      this.showParentFlyout(parentRow);
    });
    parentRow.addEventListener("mouseleave", () => {
      this.scheduleParentHide();
    });

    body.appendChild(parentRow);

    // Export button
    const exportBtn = document.createElement("div");
    exportBtn.className = "event-menu-btn";
    exportBtn.textContent = "Export event";
    exportBtn.addEventListener("click", () => {
      if (!this.currentEvent) return;
      callbacks.onExport(this.currentEvent);
    });
    body.appendChild(exportBtn);

    // Delete button
    const deleteBtn = document.createElement("div");
    deleteBtn.className = "event-menu-btn destructive";
    deleteBtn.textContent = "Delete event";
    deleteBtn.addEventListener("click", () => {
      if (!this.currentEvent) return;
      const event = this.currentEvent;
      showConfirmDialog(`Delete "${event.name}"?`, () => {
        callbacks.onDelete(event);
      });
    });
    body.appendChild(deleteBtn);

    this.el.appendChild(body);
    document.body.appendChild(this.el);
  }

  show(event: TimelineEvent): void {
    this.currentEvent = event;
    this.titleSpan.textContent = event.name;
    this.nameInput.value = event.name;
    this.infoInput.value = event.info ?? "";

    // Clear stashed end date from previous event
    this.stashedEnd = undefined;
    this.stashedEndApprox = undefined;

    // Determine type
    if (event.end === undefined) {
      this.currentType = "point";
    } else if (event.end === "ongoing") {
      this.currentType = "ongoing";
    } else {
      this.currentType = "range";
    }

    // Update type buttons
    this.updateTypeButtons();

    // Populate start
    this.startDateInput.setValue(event.start);
    this.startApproxInput.setValue(event.startApprox, event.start);

    // Populate end
    this.updateEndSection();

    // Update parent trigger text
    const currentParent = this.callbacks.getCurrentParent(event);
    this.parentTriggerText.textContent = currentParent
      ? currentParent.name
      : "None (top level)";

    // Close any open flyout
    this.hideParentFlyout();

    this.el.classList.remove("disabled");
  }

  hide(): void {
    this.hideParentFlyout();
    this.el.classList.add("disabled", "collapsed");
    this.titleSpan.textContent = "Nothing selected";
    this.currentEvent = null;
  }

  isVisible(): boolean {
    return !this.el.classList.contains("disabled");
  }

  focusName(): void {
    this.el.classList.remove("collapsed");
    this.nameInput.focus();
    this.nameInput.select();
  }

  private updateTypeButtons(): void {
    const hasKids = this.currentEvent
      ? this.callbacks.hasChildren(this.currentEvent)
      : false;

    for (const [type, btn] of this.typeBtns) {
      btn.classList.toggle("active", type === this.currentType);
      // Block point if event has children
      const blocked =
        type === "point" && hasKids && this.currentType !== "point";
      btn.classList.toggle("disabled", blocked);
      if (blocked) {
        btn.title = "Point events cannot have children";
      } else {
        btn.title = "";
      }
    }
  }

  private updateEndSection(): void {
    if (this.currentType === "point") {
      this.endSection.style.display = "none";
    } else if (this.currentType === "ongoing") {
      this.endSection.style.display = "";
      this.endOngoingLabel.style.display = "";
      this.endDateContainer.style.display = "none";
    } else {
      this.endSection.style.display = "";
      this.endOngoingLabel.style.display = "none";
      this.endDateContainer.style.display = "";
      if (this.currentEvent?.end && this.currentEvent.end !== "ongoing") {
        this.endDateInput.setValue(this.currentEvent.end);
        this.endApproxInput.setValue(
          this.currentEvent.endApprox,
          this.currentEvent.end,
        );
      }
    }
  }

  private showParentFlyout(anchor: HTMLDivElement): void {
    if (this.parentFlyout) {
      this.parentFlyout.remove();
    }
    if (!this.currentEvent) return;

    const currentParent = this.callbacks.getCurrentParent(this.currentEvent);
    const candidates = this.callbacks.getParentCandidates(this.currentEvent);

    // Collect ancestor chain of current parent for auto-expanding
    const ancestorSet = new Set<TimelineEvent>();
    if (currentParent) {
      // Walk up from current parent to find its ancestors
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
      if (!this.currentEvent) return;
      this.callbacks.onChangeParent(this.currentEvent, null);
      this.parentTriggerText.textContent = "None (top level)";
      // Rebuild flyout to reflect new state
      this.showParentFlyout(anchor);
    });
    flyout.appendChild(noneRow);

    // Build event tree — sorted by date, filtered
    this.buildFlyoutTree(
      flyout,
      candidates,
      currentParent,
      ancestorSet,
      anchor,
    );

    flyout.addEventListener("mouseenter", () => {
      clearTimeout(this.parentHideTimer);
      this.stopSettling();
    });
    flyout.addEventListener("mouseleave", () => {
      this.callbacks.onHoverEvent(null);
      this.scheduleParentHide();
    });

    document.body.appendChild(flyout);
    this.parentFlyout = flyout;
    this.parentAnchor = anchor;

    this.repositionFlyout();
  }

  private repositionFlyout(): void {
    if (!this.parentFlyout || !this.parentAnchor) return;

    const flyout = this.parentFlyout;
    const anchorRect = this.parentAnchor.getBoundingClientRect();
    const menuRect = this.el.getBoundingClientRect();

    // Remove max-height to measure natural size
    flyout.style.maxHeight = "none";
    const naturalHeight = flyout.scrollHeight;

    // Horizontal
    let left = menuRect.right + 4;
    flyout.style.left = `${left}px`;
    const flyoutWidth = flyout.getBoundingClientRect().width;
    if (left + flyoutWidth > window.innerWidth - 8) {
      left = menuRect.left - flyoutWidth - 4;
      flyout.style.left = `${left}px`;
    }

    // Vertical: try to align top with anchor, push up if overflows bottom
    let top = anchorRect.top;
    if (top + naturalHeight > window.innerHeight - 8) {
      top = window.innerHeight - 8 - naturalHeight;
    }
    top = Math.max(8, top);
    flyout.style.top = `${top}px`;

    // Only constrain max-height if content exceeds available space
    const availableHeight = window.innerHeight - top - 8;
    if (naturalHeight > availableHeight) {
      flyout.style.maxHeight = `${availableHeight}px`;
    }
  }

  private buildFlyoutTree(
    container: HTMLElement,
    candidates: ParentCandidate[],
    currentParent: TimelineEvent | null,
    ancestorSet: Set<TimelineEvent>,
    anchor: HTMLDivElement,
  ): void {
    // Group candidates by depth to reconstruct tree structure
    // candidates is a flat pre-order list with depth info
    // We need to rebuild tree items from this flat list
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

        // Auto-expand if an ancestor of current parent
        const shouldExpand = c.event !== null && ancestorSet.has(c.event);
        if (shouldExpand) {
          arrow.classList.add("expanded");
          childContainer.style.maxHeight = "none";
        }

        this.buildFlyoutTree(
          childContainer,
          childCandidates,
          currentParent,
          ancestorSet,
          anchor,
        );
        item.appendChild(childContainer);

        // Arrow click → toggle expand/collapse
        arrow.addEventListener("click", (e) => {
          e.stopPropagation();
          this.parentSettling = true;
          const isExpanded = arrow.classList.contains("expanded");
          if (isExpanded) {
            arrow.classList.remove("expanded");
            childContainer.style.maxHeight = childContainer.scrollHeight + "px";
            void childContainer.offsetHeight;
            childContainer.style.maxHeight = "0";
            const onEnd = () => {
              childContainer.removeEventListener("transitionend", onEnd);
              this.repositionFlyout();
              this.startSettling();
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
              this.startSettling();
            };
            childContainer.addEventListener("transitionend", onEnd);
          }
        });
      }

      // Row click → reparent
      row.addEventListener("click", () => {
        if (!this.currentEvent || !c.event) return;
        this.callbacks.onChangeParent(this.currentEvent, c.event);
        this.parentTriggerText.textContent = c.name;
        // Rebuild flyout
        this.showParentFlyout(anchor);
      });

      container.appendChild(item);
      i = childEnd;
    }
  }

  private hideParentFlyout(): void {
    clearTimeout(this.parentHideTimer);
    this.stopSettling();
    if (this.parentFlyout) {
      this.parentFlyout.remove();
      this.parentFlyout = null;
    }
  }

  /** After a transition repositions the flyout, track the cursor ourselves. */
  private startSettling(): void {
    this.stopSettling();
    this.parentSettling = true;

    this.parentSettlingHandler = (e: MouseEvent) => {
      if (!this.parentFlyout) {
        this.stopSettling();
        return;
      }
      const rect = this.parentFlyout.getBoundingClientRect();

      // Cursor moved back over the flyout — resume normal mode
      if (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      ) {
        this.stopSettling();
        return;
      }

      // Cursor moved horizontally outside the flyout — dismiss
      if (e.clientX < rect.left - 8 || e.clientX > rect.right + 8) {
        this.stopSettling();
        this.hideParentFlyout();
      }
      // else: vertically outside but horizontally within — keep waiting
    };
    document.addEventListener("mousemove", this.parentSettlingHandler);
  }

  private stopSettling(): void {
    this.parentSettling = false;
    if (this.parentSettlingHandler) {
      document.removeEventListener("mousemove", this.parentSettlingHandler);
      this.parentSettlingHandler = null;
    }
  }

  private scheduleParentHide(): void {
    if (this.parentSettling) return;
    clearTimeout(this.parentHideTimer);
    this.parentHideTimer = window.setTimeout(() => {
      this.hideParentFlyout();
    }, 150);
  }

  private onTypeClick(newType: EventType): void {
    if (!this.currentEvent || newType === this.currentType) return;

    const hasKids = this.callbacks.hasChildren(this.currentEvent);
    if (newType === "point" && hasKids) return; // blocked

    const oldType = this.currentType;

    // Stash end date when leaving range
    if (
      oldType === "range" &&
      this.currentEvent.end &&
      this.currentEvent.end !== "ongoing"
    ) {
      this.stashedEnd = this.currentEvent.end;
      this.stashedEndApprox = this.currentEvent.endApprox;
    }

    this.currentType = newType;

    // Notify before compound mutations so undo captures pre-mutation state
    this.callbacks.onTypeChange(this.currentEvent);

    // Apply data changes
    if (newType === "point") {
      this.callbacks.onChangeEnd(this.currentEvent, undefined);
      this.callbacks.onChangeEndApprox(this.currentEvent, undefined);
    } else if (newType === "ongoing") {
      this.callbacks.onChangeEnd(this.currentEvent, "ongoing");
      this.callbacks.onChangeEndApprox(this.currentEvent, undefined);
    } else {
      // Switching to range — restore stash or use default
      if (this.stashedEnd) {
        this.callbacks.onChangeEnd(this.currentEvent, this.stashedEnd);
        if (this.stashedEndApprox) {
          this.callbacks.onChangeEndApprox(
            this.currentEvent,
            this.stashedEndApprox,
          );
        }
      } else {
        const defaultEnd = offsetStartYear(this.currentEvent.start, 1);
        this.callbacks.onChangeEnd(this.currentEvent, defaultEnd);
      }
    }

    this.updateTypeButtons();
    this.updateEndSection();
  }
}

/** Offset the year in an ISO date string by delta. */
function offsetStartYear(iso: string, delta: number): string {
  let bce = false;
  let s = iso;
  if (s.startsWith("-")) {
    bce = true;
    s = s.slice(1);
  }
  const parts = s.split("-");
  const year = parseInt(parts[0], 10) || 1;
  const signed = bce ? -year : year;
  const newSigned = signed + delta;
  const newBce = newSigned < 0;
  const newYear = Math.max(1, Math.abs(newSigned));
  const prefix = newBce ? "-" : "";
  let result = prefix + String(newYear);
  if (parts.length >= 2) result += "-" + parts[1];
  if (parts.length >= 3) result += "-" + parts[2];
  return result;
}
