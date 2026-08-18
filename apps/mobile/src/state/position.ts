/**
 * De positie van de speler verandert elke frame. Zou die in React-state
 * staan, dan zou de hele UI 60 keer per seconde opnieuw renderen. Daarom
 * leeft hij hier, buiten React, en leest zowel de 3D-scene als de netwerklaag
 * dit object rechtstreeks.
 */
export const playerPosition = { x: 0, z: 0 };

/** Kijkrichting van de camera in radialen; bepaalt ook de looprichting. */
export const cameraState = { yaw: Math.PI * 0.25, distance: 15, height: 9 };

/** Actuele stand van de joystick, -1..1 per as. */
export const moveInput = { x: 0, y: 0, active: false };

/** Afstand die nog niet naar de server is gemeld. */
export const travelBuffer = { meters: 0 };

export function setPlayerPosition(x: number, z: number): void {
  playerPosition.x = x;
  playerPosition.z = z;
}
