import * as THREE from 'three';

export function createSeekEyeTexture() {
                const c = document.createElement('canvas');
                c.width = 256; c.height = 128;
                const ctx = c.getContext('2d');
                ctx.clearRect(0, 0, 256, 128);
                ctx.fillStyle = '#050406';
                ctx.beginPath();
                ctx.moveTo(10, 64);
                ctx.quadraticCurveTo(128, 0, 246, 64);
                ctx.quadraticCurveTo(128, 128, 10, 64);
                ctx.fill();
                ctx.fillStyle = '#f2f2f2';
                ctx.beginPath();
                ctx.moveTo(32, 64);
                ctx.quadraticCurveTo(128, 18, 224, 64);
                ctx.quadraticCurveTo(128, 110, 32, 64);
                ctx.fill();
                ctx.fillStyle = '#020202';
                ctx.beginPath();
                ctx.arc(128, 64, 24, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(136, 56, 5, 0, Math.PI * 2);
                ctx.fill();

                const tex = new THREE.CanvasTexture(c);
                tex.encoding = THREE.sRGBEncoding;
                return tex;
            }

export function createEntitySprite(type) {
                const c = document.createElement('canvas');
                c.width = 512; c.height = 512;
                const ctx = c.getContext('2d');

                if (type === 'rush' || type === 'ambush') {
                    const isAmbush = type === 'ambush';
                    const grad = ctx.createRadialGradient(256, 256, 30, 256, 256, 245);
                    grad.addColorStop(0, isAmbush ? 'rgba(180, 255, 225, 0.98)' : 'rgba(18, 18, 24, 0.98)');
                    grad.addColorStop(0.55, isAmbush ? 'rgba(16, 185, 129, 0.85)' : 'rgba(10, 10, 14, 0.92)');
                    grad.addColorStop(0.8, isAmbush ? 'rgba(6, 78, 59, 0.45)' : 'rgba(30, 12, 18, 0.45)');
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, 512, 512);

                    ctx.fillStyle = isAmbush ? '#02120b' : '#020203';
                    ctx.beginPath();
                    ctx.ellipse(174, 198, 46, 56, -0.15, 0, Math.PI * 2);
                    ctx.ellipse(338, 198, 46, 56, 0.15, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = isAmbush ? '#d1fae5' : '#e5e7eb';
                    ctx.beginPath();
                    ctx.arc(178, 200, 14, 0, Math.PI * 2);
                    ctx.arc(334, 200, 14, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#030304';
                    ctx.beginPath();
                    ctx.ellipse(256, 344, 102, 86, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = isAmbush ? '#a7f3d0' : '#d4d4d8';
                    for (let x = 172; x <= 340; x += 22) {
                        ctx.beginPath();
                        ctx.moveTo(x, 272); ctx.lineTo(x + 14, 272); ctx.lineTo(x + 7, 306);
                        ctx.fill();
                        ctx.beginPath();
                        ctx.moveTo(x, 412); ctx.lineTo(x + 14, 412); ctx.lineTo(x + 7, 378);
                        ctx.fill();
                    }
                } else if (type === 'eyes') {
                    const grad = ctx.createRadialGradient(256, 256, 20, 256, 256, 240);
                    grad.addColorStop(0, 'rgba(192, 132, 252, 0.95)');
                    grad.addColorStop(0.5, 'rgba(107, 33, 168, 0.72)');
                    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, 512, 512);

                    const eyeCoords = [
                        [256, 256, 44], [164, 188, 28], [344, 180, 30],
                        [178, 332, 28], [336, 326, 32], [256, 148, 24],
                        [256, 366, 22], [128, 260, 20], [386, 258, 20]
                    ];
                    eyeCoords.forEach(([ex, ey, r]) => {
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(ex, ey, r, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = '#4c1d95';
                        ctx.beginPath();
                        ctx.arc(ex, ey, r * 0.52, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.fillStyle = '#090214';
                        ctx.beginPath();
                        ctx.arc(ex, ey, r * 0.25, 0, Math.PI * 2);
                        ctx.fill();
                    });
                } else if (type === 'screech') {
                    ctx.fillStyle = '#0d0912';
                    ctx.beginPath();
                    ctx.arc(256, 256, 132, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#09060c';
                    ctx.lineWidth = 22;
                    for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
                        ctx.beginPath();
                        ctx.moveTo(256, 256);
                        ctx.quadraticCurveTo(
                            256 + Math.cos(a + 0.3) * 160,
                            256 + Math.sin(a + 0.3) * 160,
                            256 + Math.cos(a) * 235,
                            256 + Math.sin(a) * 235
                        );
                        ctx.stroke();
                    }
                    ctx.fillStyle = '#fef08a';
                    ctx.beginPath();
                    ctx.arc(208, 224, 24, 0, Math.PI * 2);
                    ctx.arc(304, 224, 24, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#050505';
                    ctx.beginPath();
                    ctx.arc(208, 224, 9, 0, Math.PI * 2);
                    ctx.arc(304, 224, 9, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#fef08a';
                    ctx.lineWidth = 10;
                    ctx.beginPath();
                    ctx.arc(256, 276, 56, 0.1 * Math.PI, 0.9 * Math.PI);
                    ctx.stroke();
                }

                const tex = new THREE.CanvasTexture(c);
                tex.encoding = THREE.sRGBEncoding;
                return tex;
            }
