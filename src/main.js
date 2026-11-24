// Entry point for the page in index.html. The catalog stays lightweight; the
// Three.js runtime is loaded only after a player opens a game view.
const isPlayView = new URLSearchParams(location.search).get('play') === '1';
const requestedGame = new URLSearchParams(location.search).get('game') || 'unknown-halls';
document.body.classList.toggle('platform-view', !isPlayView);
document.body.classList.toggle('creator-view', isPlayView && requestedGame !== 'unknown-halls');

if (isPlayView) {
  if (requestedGame === 'unknown-halls') {
    import('./legacyGame.js');
  } else {
    import('./ui/CreatorGameView.js').then(({ default: CreatorGameView }) => {
      new CreatorGameView(document.getElementById('platform-shell'), requestedGame);
    });
  }
} else {
  import('./ui/PlatformShell.js').then(({ default: PlatformShell }) => {
    new PlatformShell(document.getElementById('platform-shell'));
  });
}
