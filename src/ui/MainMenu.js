export class MainMenu {
	constructor({ onStart, onResume, onRestart, onOptions }) {
		this.onStart = onStart;
		this.onResume = onResume;
		this.onRestart = onRestart;
		this.onOptions = onOptions;
		this.root = document.createElement('section');
		this.root.className = 'menu-screen';
		this.root.setAttribute('aria-live', 'polite');
		document.body.append(this.root);
		this.setMode('title');
	}

	setMode(mode) {
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
				secondary: '<button class="menu-secondary" data-action="options">Options</button><p class="menu-note">WASD move <span>·</span> Mouse look <span>·</span> Shift sprint <span>·</span> Ctrl crouch <span>·</span> E interact</p>',
			},
			pause: {
				eyebrow: 'THE HALL IS QUIET',
				title: 'Paused',
				copy: 'Your last room is still waiting.',
				action: 'Return to the hall',
				callback: this.onResume,
				secondary: '<button class="menu-secondary" data-action="restart">Restart run</button>',
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
		this.root.innerHTML = `<div class="menu-panel"><div class="menu-mark" aria-hidden="true"><span></span><span></span><span></span></div><p class="menu-eyebrow">${screen.eyebrow}</p><h1>${screen.title}</h1><p class="menu-copy">${screen.copy}</p><button class="menu-primary" data-action="primary">${screen.action}<span aria-hidden="true">↗</span></button><div class="menu-secondary-wrap">${screen.secondary}</div><p class="menu-version">UNKNOWN HOTEL <span>·</span> SINGLE PLAYER</p></div><div class="menu-edge">NO VACANCY <span>—</span> SINCE 1978</div>`;
		this.root.querySelector('[data-action="primary"]').addEventListener('click', screen.callback);
		this.root.querySelector('[data-action="restart"]')?.addEventListener('click', this.onRestart);
		this.root.querySelector('[data-action="options"]')?.addEventListener('click', this.onOptions);
	}
}
