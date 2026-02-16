const FADE_IN_MS = 200;
const DISPLAY_MS = 4000;

export class InfoLog {
  private container: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'info-log';
    document.body.appendChild(this.container);
  }

  show(message: string): void {
    const el = document.createElement('div');
    el.className = 'info-log-message';
    el.textContent = message;
    this.container.appendChild(el);

    // Trigger fade-in on next frame
    requestAnimationFrame(() => el.classList.add('visible'));

    // Fade out after display duration
    setTimeout(() => {
      el.classList.add('fading');
      el.addEventListener('transitionend', () => el.remove());
    }, FADE_IN_MS + DISPLAY_MS);
  }
}
