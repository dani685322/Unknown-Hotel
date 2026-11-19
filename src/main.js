import * as THREE from 'three'

const app = document.getElementById('app')
const hud = document.getElementById('hud')

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x050505)
scene.fog = new THREE.Fog(0x050505, 2, 22)

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200)
camera.position.set(0, 1.6, 4)

// --- placeholder corridor: Room 001 ---
const wallMat = new THREE.MeshStandardMaterial({ color: 0x6b6257 })
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2e2a26 })

const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 30), floorMat)
floor.rotation.x = -Math.PI / 2
scene.add(floor)
const ceiling = floor.clone()
ceiling.position.y = 3
ceiling.rotation.x = Math.PI / 2
scene.add(ceiling)

for (const x of [-3, 3]) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 30), wallMat)
  wall.position.set(x, 1.5, 0)
  scene.add(wall)
}

scene.add(new THREE.AmbientLight(0xffffff, 0.25))
const lamp = new THREE.PointLight(0xffe6b0, 2.2, 18, 2)
lamp.position.set(0, 2.8, 0)
scene.add(lamp)

// --- pointer-lock mouselook ---
let yaw = 0, pitch = 0
const SENS = 0.0022, CLAMP = 1.4

renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock())
document.addEventListener('pointerlockchange', () => {
  hud.textContent = document.pointerLockElement ? 'ESC to release' : 'Click to lock mouse'
})
document.addEventListener('mousemove', e => {
  if (!document.pointerLockElement) return
  yaw -= e.movementX * SENS
  pitch -= e.movementY * SENS
  pitch = Math.max(-CLAMP, Math.min(CLAMP, pitch))
})

const keys = new Set()
addEventListener('keydown', e => keys.add(e.code))
addEventListener('keyup', e => keys.delete(e.code))

const SPEED = { walk: 3.2, sprint: 6.5, crouch: 1.6 }
const clock = new THREE.Clock()

function tick() {
  const dt = Math.min(clock.getDelta(), 0.1)
  camera.rotation.set(pitch, yaw, 0, 'YXZ')

  let speed = SPEED.walk
  if (keys.has('ShiftLeft')) speed = SPEED.sprint
  if (keys.has('ControlLeft')) speed = SPEED.crouch

  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw))
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  const move = new THREE.Vector3()
  if (keys.has('KeyW')) move.add(fwd)
  if (keys.has('KeyS')) move.sub(fwd)
  if (keys.has('KeyD')) move.add(right)
  if (keys.has('KeyA')) move.sub(right)

  if (move.lengthSq() > 0) {
    move.normalize().multiplyScalar(speed * dt)
    camera.position.add(move)
    camera.position.x = Math.max(-2.5, Math.min(2.5, camera.position.x))
    camera.position.z = Math.max(-14, Math.min(14, camera.position.z))
  }

  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}
tick()

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
