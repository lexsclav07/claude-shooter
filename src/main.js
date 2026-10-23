import './style.css';
import { loadSettings } from './settings.js';
import { Game } from './game.js';
import { Menu } from './ui/menu.js';
import { CLASSES } from './classes.js';

const settings = loadSettings();
const params = new URLSearchParams(location.search);
// ?test runs without pointer lock (used for automated testing)
const TEST = params.has('test');

const loading = document.getElementById('loading');
const clickToPlay = document.getElementById('click-to-play');

function boot() {
  const game = new Game(document.getElementById('app'), settings);
  const menu = new Menu(game);
  game.menu = menu;
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

  const openDeploy = () => {
    game.hud.loadoutOpen = true;
    game.input.enabled = false;
    game.input.unlock();
    menu.openIngame('deploy');
  };
  const needsDeploy = () => game.player && !game.player.alive && !game.player.bot && !game.deployRequested && game.match && !game.match.over;

  game.on('resume', () => {
    if (game.state === 'paused') game.state = 'playing';
    if (needsDeploy()) {
      openDeploy();
      return;
    }
    game.hud.loadoutOpen = false;
    menu.show(null);
    requestLock();
  });

  game.on('deployScreen', () => {
    if (game.state !== 'playing' || menu.screen === 'pause') return;
    openDeploy();
  });

  game.on('pauseFromDeploy', () => {
    game.hud.loadoutOpen = false;
    game.state = 'paused';
    menu.showRoot('pause');
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
    if (needsDeploy()) {
      openDeploy();
      return;
    }
    game.hud.loadoutOpen = true;
    game.input.enabled = false;
    game.input.unlock();
    menu.openIngame('loadout');
  });

  game.on('loadoutChanged', (lo) => {
    if (!game.player) return;
    game.pendingLoadout = lo;
    const p = game.player;
    // still standing in spawn as infantry? swap kit right away, CS buy-zone style
    const c = CLASSES[lo.cls];
    if (p.alive && p.spawnProtect > 0 && !p.vehicle && c && !c.vehicle) {
      p.loadout = { ...lo };
      game.pendingLoadout = null;
      p.giveLoadout(lo.cls);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || game.input.onKeyCapture) return;
    if (menu.screen === 'deploy') game.emit('pauseFromDeploy');
    else if (game.hud.loadoutOpen) menu.closeIngame();
    else if (game.state === 'paused' && menu.screen === 'pause') game.emit('resume');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
}

// let the loading screen paint before the (synchronous) world build
requestAnimationFrame(() => setTimeout(boot, 30));
