export function showPromptDialog(
  message: string,
  placeholder: string,
  onConfirm: (value: string) => void,
): void {
  const backdrop = document.createElement('div');
  backdrop.className = 'confirm-backdrop';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog';

  const msg = document.createElement('div');
  msg.className = 'confirm-message';
  msg.textContent = message;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;

  const buttons = document.createElement('div');
  buttons.className = 'confirm-buttons';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'confirm-btn';
  cancelBtn.textContent = 'Cancel';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'confirm-btn destructive';
  confirmBtn.textContent = 'Confirm';
  confirmBtn.disabled = true;

  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value.trim().length === 0;
  });

  buttons.appendChild(cancelBtn);
  buttons.appendChild(confirmBtn);
  dialog.appendChild(msg);
  dialog.appendChild(input);
  dialog.appendChild(buttons);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
    input.focus();
  });

  function close() {
    backdrop.classList.remove('visible');
    backdrop.addEventListener('transitionend', () => backdrop.remove());
    window.removeEventListener('keydown', onKeyDown);
  }

  cancelBtn.addEventListener('click', close);
  confirmBtn.addEventListener('click', () => {
    const value = input.value.trim();
    if (value) { close(); onConfirm(value); }
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'Enter') {
      const value = input.value.trim();
      if (value) {
        e.preventDefault();
        close();
        onConfirm(value);
      }
    }
  }
  window.addEventListener('keydown', onKeyDown);
}
