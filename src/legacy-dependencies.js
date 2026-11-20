// The legacy game entry in index.html uses these libraries as browser globals.
// Import them through Vite so both dev and production builds serve the same versions.
import * as THREE from 'three';
import Peer from 'peerjs';

window.THREE = THREE;
window.Peer = Peer;
