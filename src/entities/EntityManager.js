import { Ambush } from './Ambush.js';
import { Chaser } from './Chaser.js';
import { Rush } from './Rush.js';

const ENTITY_TYPES = { chaser: Chaser, rush: Rush, ambush: Ambush };

export class EntityManager {
	constructor({ game, scene, player }) {
		this.game = game;
		this.scene = scene;
		this.player = player;
		this.entities = [];
		this.nextId = 1;
	}

	spawn(type, roomIndex = this.game.roomIndex) {
		const EntityType = ENTITY_TYPES[String(type).toLowerCase()];
		if (!EntityType || roomIndex !== this.game.roomIndex || !this.game.room) return null;
		const room = this.game.room;
		const isHazard = ['rush', 'ambush'].includes(String(type).toLowerCase());
		const z = isHazard
			? -room.length / 2 + 2
			: Math.max(-room.length / 2 + 2, this.player.position.z - Math.min(9, room.length / 3));
		const x = isHazard
			? Math.max(-room.width / 2 + 0.8, Math.min(room.width / 2 - 0.8, this.player.position.x))
			: Math.max(-room.width / 2 + 0.8, Math.min(room.width / 2 - 0.8, this.player.position.x));
		const entity = new EntityType({
			id: `entity-${this.nextId++}`,
			room,
			player: this.player,
			position: { x, z },
		});
		entity.type = String(type).toLowerCase();
		entity.spawn?.();
		this.entities.push(entity);
		if (entity.type === 'rush' || entity.type === 'ambush') {
			this.game.beginEntityHazard(entity.type);
		}
		return entity;
	}

	update(dt) {
		const context = {
			hidden: Boolean(this.player.hidden || this.player.crouching),
			lampOn: this.player.lampState === 'on',
			hazardGrace: Boolean(this.game.entityHazard?.remaining > 0),
		};
		for (const entity of this.entities) {
			if (!entity.enabled || entity.room !== this.game.room) continue;
			try {
				entity.update(dt, context);
			} catch (error) {
				entity.enabled = false;
				console.warn(`Disabled ${entity.type} ${entity.id} after update failure`, error);
			}
		}
	}
	retreat(type) {
		const matches = this.entities.filter((entity) => entity.type === String(type).toLowerCase());
		for (const entity of matches) entity.destroy();
		this.entities = this.entities.filter((entity) => !matches.includes(entity));
	}
	kill(idOrType) {
		const query = String(idOrType).toLowerCase();
		const matches = this.entities.filter((entity) =>
			entity.id.toLowerCase() === query || entity.type.toLowerCase() === query
		);
		if (!matches.length) return false;
		for (const entity of matches) entity.destroy();
		this.entities = this.entities.filter((entity) => !matches.includes(entity));
		return true;
	}

	clear() {
		for (const entity of this.entities) entity.destroy();
		this.entities.length = 0;
	}

	destroy() {
		this.clear();
	}
}

export default EntityManager;
