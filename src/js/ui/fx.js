export class Effects {
  constructor({ layer, frame, mapView, store }) {
    this.layer = layer;
    this.frame = frame;
    this.mapView = mapView;
    this.store = store;
    this.audioContext = null;
  }

  positionFor(tile) {
    const element = this.mapView.elementFor(tile);
    if (!element) return null;
    const tileRect = element.getBoundingClientRect();
    const frameRect = this.frame.getBoundingClientRect();
    return {
      x: tileRect.left - frameRect.left + tileRect.width / 2,
      y: tileRect.top - frameRect.top + tileRect.height / 2,
    };
  }

  text(tile, text, kind = "") {
    if (this.reducedMotion()) return;
    const position = this.positionFor(tile);
    if (!position) return;
    const element = document.createElement("span");
    element.className = `fx-text ${kind}`.trim();
    element.textContent = text;
    element.style.left = `${position.x}px`;
    element.style.top = `${position.y}px`;
    this.layer.appendChild(element);
    setTimeout(() => element.remove(), 900);
  }

  burst(tile, kind = "spark", count = 7) {
    if (this.reducedMotion()) return;
    const position = this.positionFor(tile);
    if (!position) return;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement("i");
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.5;
      const distance = 14 + Math.random() * 20;
      particle.className = `fx-particle ${kind}`;
      particle.style.left = `${position.x}px`;
      particle.style.top = `${position.y}px`;
      particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
      this.layer.appendChild(particle);
      setTimeout(() => particle.remove(), 650);
    }
  }

  cargo(from, to, item) {
    if (this.reducedMotion()) return;
    const start = this.positionFor(from);
    const finish = this.positionFor(to);
    if (!start || !finish) return;
    const cargo = document.createElement("i");
    cargo.className = "fx-cargo";
    cargo.dataset.item = item.type;
    cargo.style.left = `${start.x}px`;
    cargo.style.top = `${start.y}px`;
    cargo.style.setProperty("--dx", `${finish.x - start.x}px`);
    cargo.style.setProperty("--dy", `${finish.y - start.y}px`);
    this.layer.appendChild(cargo);
    setTimeout(() => cargo.remove(), 360);
  }

  pulse(tile, kind = "active") {
    if (this.reducedMotion()) return;
    const element = this.mapView.elementFor(tile);
    if (!element) return;
    element.classList.remove(`pulse-${kind}`);
    void element.offsetWidth;
    element.classList.add(`pulse-${kind}`);
    setTimeout(() => element.classList.remove(`pulse-${kind}`), 650);
  }

  sound(kind) {
    if (!this.store.state.settings.sound) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    if (!this.audioContext && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    this.audioContext ||= new Audio();
    const context = this.audioContext;
    if (context.state === "suspended") context.resume().catch(() => {});
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const settings = {
      mine: [150, 0.035, "square"],
      place: [310, 0.04, "triangle"],
      sell: [640, 0.055, "sine"],
      smelt: [220, 0.06, "sawtooth"],
      unlock: [520, 0.08, "sine"],
      error: [110, 0.08, "square"],
      click: [260, 0.025, "triangle"],
    }[kind] || [240, 0.03, "sine"];
    oscillator.type = settings[2];
    oscillator.frequency.setValueAtTime(settings[0], context.currentTime);
    if (kind === "sell" || kind === "unlock") {
      oscillator.frequency.exponentialRampToValueAtTime(settings[0] * 1.5, context.currentTime + settings[1]);
    }
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + settings[1]);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + settings[1]);
  }

  reducedMotion() {
    return this.store.state.settings.reducedMotion ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
}
