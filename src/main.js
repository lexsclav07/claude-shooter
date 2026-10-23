import './style.css';
import { loadSettings } from './settings.js';
import { Game } from './game.js';
import { Menu } from './ui/menu.js';

const settings = loadSettings();
const params = new URLSearchParams(location.search);
// ?test runs without pointer lock (used for automated testing)
const TEST = params.has('test');

const loading = document.getElementById('loading');
const clickToPlay = document.getElementById('click-to-play');

function boot() {
  const game = new Game(document.getElementById('app'), settings);
  const menu = new Menu(game);
  window.__game = game;
  window.__menu = menu;
  loading.style.display = 'none';

  const requestLock = () => {
    game.input.enabled = true;
    if (TEST) {
      game.state = game.match && !game.match.over ? 'playing' : game.state;
      return;
    }
    game.input.lock().then((ok) => {
      if (!ok) clickToPlay.style.display = 'flex';
    });
  };

  const pause = () => {
    if (game.state !== 'playing') return;
    game.state = 'paused';
    game.input.enabled = false;
    menu.showRoot('pause');
  };

  game.input.onLockChange = (locked) => {
    if (locked) {
      clickToPlay.style.display = 'none';
      game.input.enabled = true;
      if (game.state === 'paused') game.state = 'playing';
      if (menu.screen) menu.show(null);
      game.last = performance.now();
    } else if (game.state === 'playing' && !game.hud.loadoutOpen && !TEST) {
      pause();
    }
  };

  clickToPlay.addEventListener('click', () => {
    clickToPlay.style.display = 'none';
    requestLock();
  });

  game.on('start', async (ms) => {
    game.startMatch(ms);
    if (settings.fullscreen && !document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen();
        if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock();
      } catch {
        // fullscreen refused - play windowed
      }
    }
    requestLock();
  });

  game.on('resume', () => {
    game.hud.loadoutOpen = false;
    menu.show(null);
    if (game.state === 'paused' && TEST) game.state = 'playing';
    requestLock();
  });

  game.on('quit', () => {
    game.clearMatch();
    game.state = 'menu';
    game.hud.visible(false);
    game.input.enabled = false;
    game.input.unlock();
    menu.showRoot('main');
  });

  game.on('matchEnd', () => {
    game.input.enabled = false;
    menu.showRoot('end');
  });

  game.on('openLoadout', () => {
    game.hud.loadoutOpen = true;
    game.input.enabled = false;
    game.input.unlock();
    menu.openIngame('loadout');
  });

  game.on('loadoutChanged', (lo) => {
    if (!game.player) return;
    game.pendingLoadout = lo;
    const p = game.player;
    // still standing in spawn? swap guns right away, CS buy-zone style
    if (p.alive && p.spawnProtect > 0) {
      p.loadout = { ...lo };
      game.pendingLoadout = null;
      p.giveLoadout();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || game.input.onKeyCapture) return;
    if (game.hud.loadoutOpen) menu.closeIngame();
    else if (game.state === 'paused' && menu.screen === 'pause') game.emit('resume');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
}

// let the loading screen paint before the (synchronous) world build
requestAnimationFrame(() => setTimeout(boot, 30));
