const DRAG_THRESHOLD = 4;

export interface PanelInfo {
  el: HTMLElement;
  header: HTMLElement;
  width: number;
}

export interface SwapHandle {
  setOrder(listIsLeft: boolean, animate?: boolean): void;
}

/**
 * Two-position panel swap: dragging one panel past the other triggers
 * an animated swap. On release the dragged panel snaps into the remaining slot.
 */
export function setupPanelSwap(
  listPanel: PanelInfo,
  menuPanel: PanelInfo,
  opts: { baseLeft: number; gap: number; onOrderChange: (listIsLeft: boolean) => void },
): SwapHandle {
  let listIsLeft = true;

  // Fixed right boundary: right edge of the two-panel area (just before + button)
  const totalWidth = listPanel.width + opts.gap + menuPanel.width;
  const rightBound = opts.baseLeft + totalWidth;

  // Fixed crossover point: center of the combined panel area.
  // Using a fixed point (instead of the other panel's center) ensures the swap
  // is reachable regardless of which panel is wider.
  const crossover = opts.baseLeft + totalWidth / 2;

  function positionPanels(animate: boolean) {
    const leftPanelWidth = listIsLeft ? listPanel.width : menuPanel.width;
    const leftPos = opts.baseLeft;
    const rightPos = opts.baseLeft + leftPanelWidth + opts.gap;

    if (!animate) {
      listPanel.el.style.transition = 'none';
      menuPanel.el.style.transition = 'none';
    }

    if (listIsLeft) {
      listPanel.el.style.left = `${leftPos}px`;
      menuPanel.el.style.left = `${rightPos}px`;
    } else {
      menuPanel.el.style.left = `${leftPos}px`;
      listPanel.el.style.left = `${rightPos}px`;
    }

    if (!animate) {
      // Force reflow so the transition:none takes effect before we re-enable
      listPanel.el.offsetHeight;
      listPanel.el.style.transition = '';
      menuPanel.el.style.transition = '';
    }
  }

  function setupDrag(draggedPanel: PanelInfo, otherPanel: PanelInfo, draggedIsList: boolean) {
    draggedPanel.header.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;

      const startX = e.clientX;
      const startLeft = draggedPanel.el.getBoundingClientRect().left;
      let dragging = false;

      const maxLeft = rightBound - draggedPanel.width;

      function onMove(ev: MouseEvent) {
        const dx = ev.clientX - startX;
        if (!dragging) {
          if (Math.abs(dx) < DRAG_THRESHOLD) return;
          dragging = true;
          draggedPanel.header.style.cursor = 'grabbing';
          draggedPanel.el.style.transition = 'none';
        }

        const newLeft = startLeft + dx;
        const clampedLeft = Math.max(0, Math.min(newLeft, maxLeft));
        draggedPanel.el.style.left = `${clampedLeft}px`;

        // Swap when dragged panel's center crosses the fixed midpoint
        const draggedInLeftSlot = draggedIsList ? listIsLeft : !listIsLeft;
        const draggedCenter = clampedLeft + draggedPanel.width / 2;

        const shouldSwap = draggedInLeftSlot
          ? draggedCenter > crossover
          : draggedCenter < crossover;

        if (shouldSwap) {
          listIsLeft = !listIsLeft;
          // Animate the stationary panel to its new slot
          const otherNowInLeft = draggedIsList ? !listIsLeft : listIsLeft;
          const newLeftPanelWidth = listIsLeft ? listPanel.width : menuPanel.width;
          const newOtherLeft = otherNowInLeft
            ? opts.baseLeft
            : opts.baseLeft + newLeftPanelWidth + opts.gap;
          otherPanel.el.style.left = `${newOtherLeft}px`;
          opts.onOrderChange(listIsLeft);
        }
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        draggedPanel.header.style.cursor = '';

        if (dragging) {
          // Suppress the click that follows mouseup so collapse/expand doesn't fire.
          // Clean up on next tick in case no click fires (mouse released outside
          // the header after a swap), preventing a stale listener eating the next click.
          const suppress = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
          draggedPanel.header.addEventListener('click', suppress, { capture: true, once: true });
          setTimeout(() => draggedPanel.header.removeEventListener('click', suppress, { capture: true }), 0);

          // Re-enable transition and snap to final slot
          draggedPanel.el.style.transition = '';
          const draggedInLeft = draggedIsList ? listIsLeft : !listIsLeft;
          const leftPanelWidth = listIsLeft ? listPanel.width : menuPanel.width;
          const finalPos = draggedInLeft
            ? opts.baseLeft
            : opts.baseLeft + leftPanelWidth + opts.gap;
          draggedPanel.el.style.left = `${finalPos}px`;
        }
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  setupDrag(listPanel, menuPanel, true);
  setupDrag(menuPanel, listPanel, false);

  return {
    setOrder(newListIsLeft: boolean, animate = false) {
      listIsLeft = newListIsLeft;
      positionPanels(animate);
    },
  };
}
