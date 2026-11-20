export const ADMIN_USERNAMES = new Set(['hunao', 'des', 'hanako', 'zyro', 'tetoidk']);

export function isAdminUsername(username) {
	return typeof username === 'string' && ADMIN_USERNAMES.has(username.trim().toLowerCase());
}

export const CHAT_ROLES = [
	'Owner GF',
	'Owner Brother',
	'Co-Owner',
	'Princess',
	'Server Maintenance',
	'Server Booster',
	'Admin',
	'Super Admin',
];
