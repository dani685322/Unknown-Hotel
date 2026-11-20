import { escapeHtml } from '../core/escapeHtml.js';

export class MainMenu {
	constructor({ onStart, onResume, onRestart, onAbandon, onOptions, onMultiplayer }) {
		this.onStart = onStart;
		this.onResume = onResume;
		this.onRestart = onRestart;
		this.onAbandon = onAbandon;
		this.onOptions = onOptions;
		this.onMultiplayer = onMultiplayer;
		this.account = null;
		this.root = document.createElement('section');
		this.root.className = 'menu-screen';
		this.root.setAttribute('aria-live', 'polite');
		document.body.append(this.root);
		this.setMode('title');
	}

	setMode(mode) {
		this.mode = mode;
		if (mode === 'hidden') {
			this.root.hidden = true;
			return;
		}
		this.root.hidden = false;
		const screens = {
			title: {
				eyebrow: 'A HOTEL WITHOUT AN EXIT',
				title: 'Unknown<br>Hotel',
				copy: 'One hundred doors. No two rooms alike. Keep moving.',
				action: 'Enter the hotel',
				callback: this.onStart,
				secondary: '<button class="menu-secondary" data-action="options">Options</button><button class="menu-secondary" data-action="multiplayer">Multiplayer Beta</button><p class="menu-note">WASD move <span>·</span> Mouse look <span>·</span> Shift sprint <span>·</span> Ctrl crouch <span>·</span> E interact <span>·</span> / admin</p>',
			},
			pause: {
				eyebrow: 'THE HALL IS QUIET',
				title: 'Paused',
				copy: 'Your last room is still waiting.',
				action: 'Return to the hall',
				callback: this.onResume,
				secondary: '<button class="menu-secondary" data-action="restart">Restart run</button><button class="menu-secondary" data-action="abandon">Abandon run</button><p class="menu-note">Press 0 during a run to abandon.</p>',
			},
			win: {
				eyebrow: 'DOOR 100',
				title: 'You made<br>it out.',
				copy: 'The morning air feels unfamiliar.',
				action: 'Begin again',
				callback: this.onRestart,
				secondary: '',
			},
			death: {
				eyebrow: 'THE HOTEL KEEPS ITS GUESTS',
				title: 'Lost in<br>the halls.',
				copy: 'The corridor falls quiet again.',
				action: 'Try another run',
				callback: this.onRestart,
				secondary: '',
			},
		};
		const screen = screens[mode] ?? screens.title;
		const accountLabel = this.account
			? `<span>${escapeHtml(this.account)}</span><button type="button" data-action="account">Account</button>`
			: '<button type="button" data-action="account">Login / Sign Up</button>';
		this.root.innerHTML = `<div class="menu-account">${accountLabel}</div><div class="menu-panel"><div class="menu-mark" aria-hidden="true"><span></span><span></span><span></span></div><p class="menu-eyebrow">${screen.eyebrow}</p><h1>${screen.title}</h1><p class="menu-copy">${screen.copy}</p><button class="menu-primary" data-action="primary">${screen.action}<span aria-hidden="true">↗</span></button><div class="menu-secondary-wrap">${screen.secondary}</div><p class="menu-version">UNKNOWN HOTEL <span>·</span> <span>SINGLE PLAYER</span> <span>·</span> <span>LOCAL BETA</span></p></div><div class="menu-edge">NO VACANCY <span>—</span> SINCE 1978</div>`;
		this.root.querySelector('[data-action="primary"]').addEventListener('click', screen.callback);
		this.root.querySelector('[data-action="restart"]')?.addEventListener('click', this.onRestart);
		this.root.querySelector('[data-action="abandon"]')?.addEventListener('click', () => {
			if (typeof this.onAbandon === 'function') this.onAbandon();
		});
		this.root.querySelector('[data-action="options"]')?.addEventListener('click', this.onOptions);
		this.root.querySelector('[data-action="multiplayer"]')?.addEventListener('click', this.onMultiplayer);
		this.root.querySelector('[data-action="account"]')?.addEventListener('click', this.onMultiplayer);
	}

	setAccount(account) {
		this.account = account ? String(account).trim() : null;
		if (this.root.hidden) return;
		this.setMode(this.mode ?? 'title');
	}
}
