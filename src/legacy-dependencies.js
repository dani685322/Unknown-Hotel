// The legacy game entry in index.html uses these libraries as browser globals.
// Import them through Vite so both dev and production builds serve the same versions.
import * as THREE from 'three';
import Peer from 'peerjs';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

window.THREE = THREE;
window.Peer = Peer;
window.EffectComposer = EffectComposer;
window.RenderPass = RenderPass;
window.UnrealBloomPass = UnrealBloomPass;
