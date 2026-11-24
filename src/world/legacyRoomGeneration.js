// Seeded room planning for the legacy first-person hotel in index.html.
// Geometry remains owned by DoorsHotelGame; this module owns which room to build.

export function createSeededRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRoomPlan(roomNum, sessionSeed) {
  const rng = createSeededRng(sessionSeed + roomNum * 7919);
  let roomType = 'standard';
  let subtitle = 'Hotel Corridor';
  let width = 10.5;
  let length = 22;
  const height = 4.8;
  let variation = 'straight';

  if (roomNum === 0) {
    roomType = 'reception';
    subtitle = 'The Reception Lobby';
    width = 14.5;
    length = 19;
  } else if (roomNum === 35) {
    roomType = 'seek';
    subtitle = 'Seek Grand Corridor';
    width = 9.5;
    length = 36;
  } else if (roomNum === 50) {
    roomType = 'library';
    subtitle = 'The Library (Stay Silent!)';
    width = 18.5;
    length = 27;
  } else if (roomNum === 90) {
    roomType = 'courtyard';
    subtitle = 'The Rainy Courtyard';
    width = 15;
    length = 25;
  } else if (roomNum >= 100) {
    roomType = 'finale';
    subtitle = 'Electrical Room (Exit)';
    width = 14;
    length = 20;
  } else {
    const roll = rng();
    if (roll < 0.18) {
      roomType = 'dark';
      subtitle = 'Dark Room (Watch for Screech)';
    } else if (roll < 0.36) {
      roomType = 'locked';
      subtitle = 'Locked Room (Find Key or Lockpick)';
    } else if (roll < 0.52 && roomNum > 3) {
      roomType = 'dupe';
      subtitle = 'Corridor (Watch for Dupe Doors)';
    }
    if (roomType === 'standard') {
      const shapeRoll = rng();
      if (shapeRoll < 0.22) {
        variation = 'alcove';
        width = 12.5;
        length = 25;
        subtitle = 'Hotel Hall (Check the Alcoves)';
      } else if (shapeRoll < 0.42) {
        variation = 'gallery';
        width = 11.5;
        length = 24;
        subtitle = 'Gallery Hall (Listen for Footsteps)';
      }
    }
  }

  return { roomNum, roomType, subtitle, width, length, height, variation, rng };
}

export function chooseEntityEncounter({ roomType, roomNum, sessionSeed, lastEntityRoom }) {
  const roomRoll = createSeededRng(sessionSeed + roomNum * 7919 + 0x5f3759df);
  const roll = roomRoll();
  if (roomType === 'dark' && roomRoll() < 0.65) return 'screech';

  if (roomNum < 4 || roomNum - lastEntityRoom < 3) return null;
  const danger = Math.min(0.25, 0.09 + roomNum * 0.0016);
  const ambushChance = roomNum >= 12 ? Math.min(0.075, 0.015 + roomNum * 0.0006) : 0;
  if (roll < ambushChance) return 'ambush';
  if (roll < ambushChance + danger) return 'rush';
  if (roll < ambushChance + danger + 0.12 && roomNum >= 5) return 'eyes';
  return null;
}
