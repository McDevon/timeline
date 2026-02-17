export function showConfirmDialog(message: string, onConfirm: () => void): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'confirm-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';

  const msg = document.createElement('div');
  msg.className = 'confirm-message';
  msg.textContent = message;

  const buttons = document.createElement('div');
  buttons.className = 'confirm-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'confirm-btn';
  cancelBtn.textContent = 'Cancel';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'confirm-btn destructive';
  confirmBtn.textContent = 'Confirm';

  buttons.appendChild(cancelBtn);
  buttons.appendChild(confirmBtn);
  dialog.appendChild(msg);
  dialog.appendChild(buttons);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  // Trigger fade-in
  requestAnimationFrame(() => backdrop.classList.add('visible'));

  function close() {
    backdrop.classList.remove('visible');
    backdrop.addEventListener('transitionend', () => backdrop.remove());
  }

  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', () => { close(); onConfirm(); });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKeyDown);
    }
  }
  window.addEventListener('keydown', onKeyDown);
}
