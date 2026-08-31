const FX_SOFT_CAP = 64;
const FX_PRUNE = ".fx-particle, .fx-ring, .fx-text";

export class Effects {
  constructor({ layer, frame, mapView, store }) {
    this.layer = layer;
    this.frame = frame;
    this.mapView = mapView;
    this.store = store;
    this.audioContext = null;
    this.lastSaleAt = 0;
    this.lastBumpAt = 0;
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

  prune() {
    const extras = this.layer.querySelectorAll(FX_PRUNE);
    const overflow = extras.length - FX_SOFT_CAP;
    if (overflow <= 0) return;
    for (let index = 0; index < overflow; index += 1) extras[index].remove();
  }

  spawn(element, duration) {
    this.prune();
    this.layer.appendChild(element);
    setTimeout(() => element.remove(), duration);
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
    this.spawn(element, 980);
  }

  burst(tile, kind = "spark", count = 8) {
    if (this.reducedMotion()) return;
    const position = this.positionFor(tile);
    if (!position) return;
    const n = Math.max(3, Math.min(14, count));
    for (let index = 0; index < n; index += 1) {
      const particle = document.createElement("i");
      const angle = (Math.PI * 2 * index) / n + Math.random() * 0.55;
      const distance = 16 + Math.random() * 26;
      particle.className = `fx-particle ${kind}`.trim();
      particle.style.left = `${position.x}px`;
      particle.style.top = `${position.y}px`;
      particle.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
      particle.style.setProperty("--size", `${3 + Math.random() * 5}px`);
      particle.style.setProperty("--life", `${520 + Math.random() * 280}ms`);
      particle.style.setProperty("--rot", `${Math.round(angle * 57.3)}deg`);
      this.spawn(particle, 820);
    }
  }

  shockwave(tile, kind = "install") {
    if (this.reducedMotion()) return;
    const position = this.positionFor(tile);
    if (!position) return;
    const ring = document.createElement("i");
    ring.className = `fx-ring ${kind}`.trim();
    ring.style.left = `${position.x}px`;
    ring.style.top = `${position.y}px`;
    this.spawn(ring, 560);
  }

  saleTick(tile, gained) {
    const now = performance.now();
    if (now - this.lastSaleAt < 400) return;
    this.lastSaleAt = now;
    this.text(tile, `+$${gained}`, "sale");
    this.sound("sell");
  }

  bump(element) {
    if (!element || this.reducedMotion()) return;
    const now = performance.now();
    if (now - this.lastBumpAt < 400) return;
    this.lastBumpAt = now;
    element.classList.remove("hud-bump");
    void element.offsetWidth;
    element.classList.add("hud-bump");
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
    setTimeout(() => cargo.remove(), 380);
  }

  pulse(tile, kind = "active") {
    if (this.reducedMotion()) return;
    const element = this.mapView.elementFor(tile);
    if (!element) return;
    element.classList.remove(`pulse-${kind}`);
    void element.offsetWidth;
    element.classList.add(`pulse-${kind}`);
    setTimeout(() => element.classList.remove(`pulse-${kind}`), 700);
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
