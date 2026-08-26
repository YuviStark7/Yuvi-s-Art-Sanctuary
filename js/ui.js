/**
 * Everything outside the 3D canvas: the entrance, the wardrobe, the prompts
 * under your gaze, the coin panel, the wish box, the pause menu and the
 * reading panel for a work.
 */
import { WARDROBE, FIGURE, WARDROBE_COPY } from './wardrobe.js';
import { WISHING_COPY } from './payments.config.js';

const $ = (id) => document.getElementById(id);

/** The racks, in the order a person would actually get dressed. */
const RACKS = [
  { key: 'tone', label: 'Skin', list: null, tone: true },
  { key: 'top', label: 'Top', list: 'tops' },
  { key: 'bottom', label: 'Bottom', list: 'bottoms' },
  { key: 'shoe', label: 'Shoes', list: 'shoes' },
  { key: 'hat', label: 'Head', list: 'hats' },
  { key: 'hand', label: 'In hand', list: 'hands' }
];

export class UI {
  constructor(handlers) {
    this.h = handlers || {};
    this.viewerOpen = false;
    this.menuOpen = false;
    this.gateOpen = true;
    this.wardrobeOpen = false;
    this.coinOpen = false;
    this.wishOpen = false;

    this.el = {
      loading: $('loading'), bar: $('bar-fill'), loadNote: $('load-note'),
      gate: $('gate'), gateSub: $('gate-sub'), gateStatement: $('gate-statement'),
      enter: $('enter'), watch: $('watch'),

      wardrobe: $('wardrobe'), wardrobeTitle: $('wardrobe-title'),
      wardrobeIntro: $('wardrobe-intro'), racks: $('wardrobe-racks'),
      wardrobeEnter: $('wardrobe-enter'),

      hud: $('hud'), reticle: $('reticle'), prompts: $('prompts'),
      cornerTitle: $('corner-title'), cornerSub: $('corner-sub'),
      touchHint: $('touch-hint'), touchActions: $('touch-actions'),
      tapUse: $('tap-use'), tapAct: $('tap-act'),

      coin: $('coin'), coinTitle: $('coin-title'), coinIntro: $('coin-intro'),
      coinDemo: $('coin-demo'), coinAmounts: $('coin-amounts'),
      coinStatus: $('coin-status'), coinCancel: $('coin-cancel'),

      wish: $('wish'), wishTitle: $('wish-title'), wishIntro: $('wish-intro'),
      wishText: $('wish-text'), wishCount: $('wish-count'),
      wishSend: $('wish-send'), wishSkip: $('wish-skip'),

      viewer: $('viewer'), viewerImg: $('viewer-img'), viewerTitle: $('viewer-title'),
      viewerMeta: $('viewer-meta'), viewerNote: $('viewer-note'), viewerClose: $('viewer-close'),
      menu: $('menu'), resume: $('resume'), menuTour: $('menu-tour'), menuReset: $('menu-reset'),
      quality: $('opt-quality'), volume: $('opt-volume'), sens: $('opt-sens'),
      fov: $('opt-fov'), invert: $('opt-invert'),
      scene: $('scene')
    };

    this._promptKey = '';
    this._wire();
  }

  /** CSS entrance animations only play once unless restarted by hand. */
  _replay(el) {
    if (!el) return;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
  }

  get anyPanelOpen() {
    return this.gateOpen || this.wardrobeOpen || this.menuOpen ||
           this.viewerOpen || this.coinOpen || this.wishOpen;
  }

  _wire() {
    const e = this.el, h = this.h;

    e.enter.addEventListener('click', () => { this.hideGate(); if (h.onGetReady) h.onGetReady(); });
    e.watch.addEventListener('click', () => { this.hideGate(); if (h.onWatch) h.onWatch(); });
    e.wardrobeEnter.addEventListener('click', () => {
      this.hideWardrobe();
      if (h.onEnter) h.onEnter();
    });

    e.viewerClose.addEventListener('click', () => this.closeViewer());
    e.viewer.addEventListener('click', (ev) => { if (ev.target === e.viewer) this.closeViewer(); });

    e.resume.addEventListener('click', () => this.closeMenu());
    e.menuTour.addEventListener('click', () => { this.closeMenu(true); if (h.onTour) h.onTour(); });
    e.menuReset.addEventListener('click', () => { this.closeMenu(); if (h.onReset) h.onReset(); });

    e.quality.addEventListener('change', () => { if (h.onQuality) h.onQuality(e.quality.value); });
    e.volume.addEventListener('input', () => { if (h.onVolume) h.onVolume(e.volume.value / 100); });
    e.sens.addEventListener('input', () => { if (h.onSensitivity) h.onSensitivity(e.sens.value / 100); });
    e.fov.addEventListener('input', () => { if (h.onFov) h.onFov(Number(e.fov.value)); });
    e.invert.addEventListener('change', () => { if (h.onInvert) h.onInvert(e.invert.checked); });

    /* ---- coin ---- */
    e.coinCancel.addEventListener('click', () => { this.closeCoin(); if (h.onCoinCancel) h.onCoinCancel(); });
    e.coin.addEventListener('click', (ev) => {
      if (ev.target === e.coin) { this.closeCoin(); if (h.onCoinCancel) h.onCoinCancel(); }
    });

    /* ---- wish ---- */
    e.wishText.addEventListener('input', () => {
      e.wishCount.textContent = String(e.wishText.value.length);
      e.wishSend.disabled = e.wishText.value.trim().length === 0;
    });
    e.wishSend.addEventListener('click', () => {
      const text = e.wishText.value.trim();
      this.closeWish();
      if (h.onWishSend) h.onWishSend(text);
    });
    e.wishSkip.addEventListener('click', () => {
      this.closeWish();
      if (h.onWishSkip) h.onWishSkip();
    });

    /* ---- touch action buttons ---- */
    e.tapUse.addEventListener('click', () => { if (h.onUse) h.onUse(); });
    e.tapAct.addEventListener('click', () => { if (h.onAction) h.onAction(); });

    window.addEventListener('keydown', (ev) => {
      if (ev.code !== 'Escape') return;
      if (this.wishOpen) { this.closeWish(); if (h.onWishSkip) h.onWishSkip(); ev.preventDefault(); }
      else if (this.coinOpen) { this.closeCoin(); if (h.onCoinCancel) h.onCoinCancel(); ev.preventDefault(); }
      else if (this.viewerOpen) { this.closeViewer(); ev.preventDefault(); }
    });
  }

  /* ------------------------------------------------------------ loading */

  progress(frac, note) {
    this.el.bar.style.width = Math.round(frac * 100) + '%';
    if (note) this.el.loadNote.textContent = note;
  }

  finishLoading() { this.el.loading.classList.add('hidden'); }

  /* --------------------------------------------------------------- gate */

  setExhibition(info) {
    if (info.subtitle) this.el.gateSub.textContent = info.subtitle;
    let text = info.statement || '';
    if (info.artist) text = info.artist + ' — ' + text;
    this.el.gateStatement.textContent = text;
    this.el.cornerTitle.textContent = info.name || 'STARK MUSEO';
    this.el.cornerSub.textContent = info.credit || '';
    if (info.name) document.title = info.name + ' — ' + (info.subtitle || '');
  }

  showGate() {
    this.gateOpen = true;
    this.el.gate.classList.remove('hidden');
    this._replay(this.el.gate.querySelector('.plate'));
    this.el.hud.classList.add('hidden');
  }

  hideGate() {
    this.gateOpen = false;
    this.el.gate.classList.add('hidden');
  }

  /* ----------------------------------------------------------- wardrobe */

  /** Builds the racks once, from whatever is in wardrobe.js. */
  buildWardrobe(outfit) {
    const e = this.el;
    e.wardrobeTitle.textContent = WARDROBE_COPY.title;
    e.wardrobeIntro.textContent = WARDROBE_COPY.intro;
    e.wardrobeEnter.textContent = WARDROBE_COPY.enter;
    e.racks.textContent = '';

    for (const rack of RACKS) {
      const items = rack.tone ? FIGURE.tones : WARDROBE[rack.list];
      if (!items || !items.length) continue;

      const wrap = document.createElement('div');
      wrap.className = 'rack' + (rack.tone ? ' tones' : '');
      const label = document.createElement('span');
      label.className = 'rack-label';
      label.textContent = rack.label;
      wrap.appendChild(label);

      const row = document.createElement('div');
      row.className = 'rack-items';

      for (const item of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.cat = rack.key;
        b.dataset.id = item.id;
        b.setAttribute('aria-pressed', String(outfit[rack.key] === item.id));

        if (rack.tone) {
          b.className = 'chip tone';
          b.style.setProperty('--a', '#' + item.color.toString(16).padStart(6, '0'));
          b.setAttribute('aria-label', 'Skin tone');
        } else {
          b.className = 'chip';
          const sw = document.createElement('i');
          const a = item.color === undefined ? 0x8b8781 : item.color;
          const bcol = item.trim === undefined ? a : item.trim;
          sw.style.setProperty('--a', '#' + a.toString(16).padStart(6, '0'));
          sw.style.setProperty('--b', '#' + bcol.toString(16).padStart(6, '0'));
          const txt = document.createElement('span');
          if (item.brand) {
            const br = document.createElement('b');
            br.textContent = item.brand;
            txt.appendChild(br);
          }
          const nm = document.createElement('s');
          nm.textContent = item.name;
          txt.appendChild(nm);
          if (item.note) {
            const nt = document.createElement('em');
            nt.textContent = item.note;
            txt.appendChild(nt);
          }
          b.append(sw, txt);
        }

        b.addEventListener('click', () => {
          for (const other of row.querySelectorAll('.chip')) {
            other.setAttribute('aria-pressed', String(other === b));
          }
          if (this.h.onWardrobeChange) this.h.onWardrobeChange(rack.key, item.id);
        });
        row.appendChild(b);
      }

      wrap.appendChild(row);
      e.racks.appendChild(wrap);
    }
  }

  showWardrobe() {
    this.wardrobeOpen = true;
    this.el.wardrobe.classList.remove('hidden');
    this._replay(this.el.wardrobe.querySelector('.wardrobe-panel'));
    this.el.hud.classList.add('hidden');
  }

  hideWardrobe() {
    this.wardrobeOpen = false;
    this.el.wardrobe.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    if (matchMedia('(pointer: coarse)').matches) {
      this.el.touchActions.classList.remove('hidden');
      this.el.touchHint.classList.remove('hidden');
      setTimeout(() => this.el.touchHint.classList.add('hidden'), 6500);
    }
  }

  /* ---------------------------------------------------------------- hud */

  /**
   * Shows what is available right now, e.g.
   *   [{ key: 'E', label: 'look closely' }, { key: 'F', label: 'toss a coin' }]
   */
  setPrompts(list) {
    const key = list.map((p) => p.key + p.label + (p.kind || '')).join('|');
    if (key === this._promptKey) return;
    this._promptKey = key;

    const box = this.el.prompts;
    box.textContent = '';
    for (const p of list) {
      const row = document.createElement('div');
      row.className = 'prompt' + (p.kind ? ' ' + p.kind : '');
      const k = document.createElement('kbd');
      k.textContent = p.key;
      const s = document.createElement('span');
      s.textContent = p.label;
      row.append(k, s);
      box.appendChild(row);
    }
    this.el.reticle.classList.toggle('hot', list.some((p) => p.key === 'E'));

    // the two round buttons a thumb can reach
    const use = list.find((p) => p.key === 'G');
    const act = list.find((p) => p.key === 'F' || p.key === 'E');
    this.el.tapUse.classList.toggle('hidden', !use);
    if (use) this.el.tapUse.textContent = use.label;
    this.el.tapAct.classList.toggle('hidden', !act);
    if (act) {
      this.el.tapAct.textContent = act.label;
      this.el.tapAct.dataset.key = act.key;
    }
  }

  setLocked(on) { this.el.scene.classList.toggle('locked', !!on); }
  setSubtitle(text) { this.el.cornerSub.textContent = text || ''; }

  /* --------------------------------------------------------------- coin */

  openCoin(opts) {
    const e = this.el;
    e.coinTitle.textContent = WISHING_COPY.title;
    e.coinIntro.textContent = WISHING_COPY.intro;
    e.coinDemo.textContent = WISHING_COPY.demoNotice;
    e.coinDemo.classList.toggle('hidden', !opts.demo);
    e.coinStatus.textContent = opts.note || '';
    e.coinStatus.classList.remove('bad');

    e.coinAmounts.textContent = '';
    for (const cents of opts.amounts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'coin-btn';
      const amt = document.createElement('strong');
      amt.textContent = opts.format(cents);
      const cap = document.createElement('span');
      cap.textContent = 'toss';
      b.append(amt, cap);
      b.addEventListener('click', () => {
        if (this.h.onCoinPick) this.h.onCoinPick(cents);
      });
      e.coinAmounts.appendChild(b);
    }

    this.coinOpen = true;
    e.coin.classList.remove('hidden');
    this._replay(e.coin.querySelector('.plate'));
    e.hud.classList.add('hidden');
    if (this.h.onPanelOpen) this.h.onPanelOpen();
  }

  setCoinStatus(text, bad) {
    this.el.coinStatus.textContent = text || '';
    this.el.coinStatus.classList.toggle('bad', !!bad);
  }

  setCoinBusy(busy) {
    for (const b of this.el.coinAmounts.querySelectorAll('button')) b.disabled = !!busy;
    this.el.coinCancel.disabled = !!busy;
  }

  closeCoin() {
    if (!this.coinOpen) return;
    this.coinOpen = false;
    this.el.coin.classList.add('hidden');
    this.setCoinBusy(false);
    if (!this.wishOpen) this.el.hud.classList.remove('hidden');
  }

  /* --------------------------------------------------------------- wish */

  openWish() {
    const e = this.el;
    e.wishTitle.textContent = WISHING_COPY.wishTitle;
    e.wishIntro.textContent = WISHING_COPY.wishIntro;
    e.wishText.placeholder = WISHING_COPY.wishPlaceholder;
    e.wishSend.textContent = WISHING_COPY.send;
    e.wishSkip.textContent = WISHING_COPY.skip;
    e.wishText.value = '';
    e.wishCount.textContent = '0';
    e.wishSend.disabled = true;

    this.wishOpen = true;
    e.wish.classList.remove('hidden');
    this._replay(e.wish.querySelector('.plate'));
    e.hud.classList.add('hidden');
    setTimeout(() => e.wishText.focus(), 420);
    if (this.h.onPanelOpen) this.h.onPanelOpen();
  }

  closeWish() {
    if (!this.wishOpen) return;
    this.wishOpen = false;
    this.el.wish.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }

  /* ------------------------------------------------------------- viewer */

  openViewer(art, texture) {
    const e = this.el;
    let src = '';
    const img = texture && texture.image;
    if (img) {
      if (img.tagName === 'IMG') src = img.src;
      else if (img.tagName === 'CANVAS' && img.toDataURL) src = img.toDataURL('image/png');
    }
    e.viewerImg.src = src;
    e.viewerImg.alt = art.title || 'Untitled';
    e.viewerTitle.textContent = art.title || 'Untitled';

    const bits = [art.year, art.medium, art.size].filter(Boolean);
    e.viewerMeta.textContent = bits.join('  ·  ');
    e.viewerNote.textContent = art.note || '';
    e.viewerNote.style.display = art.note ? '' : 'none';

    this.viewerOpen = true;
    e.viewer.classList.remove('hidden');
    this._replay(e.viewer.querySelector('.viewer-inner'));
    e.hud.classList.add('hidden');
    if (this.h.onViewerOpen) this.h.onViewerOpen();
  }

  closeViewer() {
    if (!this.viewerOpen) return;
    this.viewerOpen = false;
    this.el.viewer.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    if (this.h.onViewerClose) this.h.onViewerClose();
  }

  /* --------------------------------------------------------------- menu */

  openMenu() {
    if (this.anyPanelOpen) return;
    this.menuOpen = true;
    this.el.menu.classList.remove('hidden');
    this._replay(this.el.menu.querySelector('.plate'));
    this.el.hud.classList.add('hidden');
    if (this.h.onMenuOpen) this.h.onMenuOpen();
  }

  closeMenu(skipResume) {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.el.menu.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    if (!skipResume && this.h.onMenuClose) this.h.onMenuClose();
  }

  setQualityValue(name) { this.el.quality.value = name; }

  busy(on, note) {
    this.el.loading.classList.toggle('hidden', !on);
    if (on) this.progress(0.15, note || 'rebuilding the room');
  }
}
