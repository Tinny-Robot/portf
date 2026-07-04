(() => {
  'use strict';

  if (window.__robotArmCursor) return;
  if (window.matchMedia('(pointer: coarse)').matches) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SEGS = [55, 50, 40, 35, 28, 20];
  const N = SEGS.length;
  const TOTAL_LEN = SEGS.reduce((a, b) => a + b, 0);
  const BASE_X = 100;
  const BASE_Y_OFFSET = 60;
  const MAX_ITER = 15;
  const TOL = 0.8;

  const JOINT_CONSTRAINTS = [
    { type: 'absolute', minAngle: -Math.PI * 0.5 - (Math.PI * 85) / 180, maxAngle: -Math.PI * 0.5 + (Math.PI * 85) / 180 },
    { type: 'relative', range: (Math.PI * 110) / 180 },
    { type: 'relative', range: (Math.PI * 100) / 180 },
    { type: 'relative', range: (Math.PI * 70) / 180 },
    { type: 'relative', range: (Math.PI * 60) / 180 },
    { type: 'none' },
  ];

  const JOINT_COLORS = ['#378add', '#4ade80', '#378add', '#4ade80', '#378add', '#ffffff'];
  const SEG_WIDTHS = [18, 15, 12, 10, 8, 6];
  const JOINT_RADII = [10, 8, 7, 6, 5, 4.5, 4];

  const canvas = document.createElement('canvas');
  canvas.id = 'robot-arm-cursor';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;

  let joints = [];
  let origin = { x: 0, y: 0 };
  let target = { x: 0, y: 0 };
  let outOfRange = false;
  let gripClose = false;
  let gripAnim = 0;
  let hudRot = 0;
  let hudPulse = 0;
  let clickFlash = 0;
  let overClickable = false;

  const CLICKABLE =
    'a,button,.btn,.link-btn,label[for],input,textarea,select,summary,[role="button"],.project-card,.cv-drop,.theme-toggle,[href],[onclick]';
  const BLUE = '#378add';

  function hitClickable(x, y) {
    const hit = document.elementFromPoint(x, y);
    if (!hit || hit.id === 'robot-arm-cursor') return false;
    return Boolean(hit.closest(CLICKABLE));
  }

  function centerAccent(isRed, isGreenHud) {
    if (isRed) return '#ff4444';
    if (overClickable) return BLUE;
    if (isGreenHud) return '#4ade80';
    return '#ffffff';
  }

  function drawCenterMark(x, y, color) {
    const gap = 5;
    const arm = 11;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - arm, y);
    ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + arm, y);
    ctx.moveTo(x, y - arm);
    ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap);
    ctx.lineTo(x, y + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initArm();
  }

  function initArm() {
    origin = { x: BASE_X, y: height - BASE_Y_OFFSET };
    joints = [];
    let cx = origin.x;
    let cy = origin.y;
    joints.push({ x: cx, y: cy });
    for (let i = 0; i < N; i++) {
      cy -= SEGS[i];
      joints.push({ x: cx, y: cy });
    }
    target = { x: origin.x + 120, y: origin.y - 180 };
  }

  function clampAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  function fabrik() {
    const dx = target.x - origin.x;
    const dy = target.y - origin.y;
    const dist = Math.hypot(dx, dy);

    outOfRange = dist > TOTAL_LEN;

    if (outOfRange) {
      const angle = Math.atan2(dy, dx);
      let cx = origin.x;
      let cy = origin.y;
      joints[0] = { x: cx, y: cy };
      for (let i = 0; i < N; i++) {
        cx += Math.cos(angle) * SEGS[i];
        cy += Math.sin(angle) * SEGS[i];
        joints[i + 1] = { x: cx, y: cy };
      }
      return;
    }

    for (let iter = 0; iter < MAX_ITER; iter++) {
      joints[N].x = target.x;
      joints[N].y = target.y;

      for (let i = N - 1; i >= 0; i--) {
        const ddx = joints[i].x - joints[i + 1].x;
        const ddy = joints[i].y - joints[i + 1].y;
        const r = Math.hypot(ddx, ddy) || 0.001;
        joints[i].x = joints[i + 1].x + (ddx / r) * SEGS[i];
        joints[i].y = joints[i + 1].y + (ddy / r) * SEGS[i];
      }

      joints[0].x = origin.x;
      joints[0].y = origin.y;

      for (let i = 1; i <= N; i++) {
        const ddx = joints[i].x - joints[i - 1].x;
        const ddy = joints[i].y - joints[i - 1].y;
        const r = Math.hypot(ddx, ddy) || 0.001;
        const parentAngle = Math.atan2(ddy, ddx);
        const nx = joints[i - 1].x + (ddx / r) * SEGS[i - 1];
        const ny = joints[i - 1].y + (ddy / r) * SEGS[i - 1];

        if (i - 1 < N && JOINT_CONSTRAINTS[i - 1].type === 'relative') {
          let prevAngle = 0;
          if (i >= 2) {
            prevAngle = Math.atan2(joints[i - 1].y - joints[i - 2].y, joints[i - 1].x - joints[i - 2].x);
          } else {
            prevAngle = -Math.PI / 2;
          }
          const rel = clampAngle(parentAngle - prevAngle);
          const c = JOINT_CONSTRAINTS[i - 1];
          const clamped = Math.max(-c.range, Math.min(c.range, rel));
          const finalAngle = prevAngle + clamped;
          joints[i].x = joints[i - 1].x + Math.cos(finalAngle) * SEGS[i - 1];
          joints[i].y = joints[i - 1].y + Math.sin(finalAngle) * SEGS[i - 1];
        } else if (i - 1 < N && JOINT_CONSTRAINTS[i - 1].type === 'absolute') {
          const c = JOINT_CONSTRAINTS[i - 1];
          const clamped = Math.max(c.minAngle, Math.min(c.maxAngle, parentAngle));
          joints[i].x = joints[i - 1].x + Math.cos(clamped) * SEGS[i - 1];
          joints[i].y = joints[i - 1].y + Math.sin(clamped) * SEGS[i - 1];
        } else {
          joints[i].x = nx;
          joints[i].y = ny;
        }
      }

      const ex = joints[N].x - target.x;
      const ey = joints[N].y - target.y;
      if (Math.hypot(ex, ey) < TOL) break;
    }
  }

  function drawBeam(x1, y1, x2, y2, beamWidth) {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const len = Math.hypot(x2 - x1, y2 - y1);
    const hw = beamWidth / 2;
    const rad = hw * 0.8;

    ctx.save();
    ctx.translate(x1, y1);
    ctx.rotate(angle);

    const rx = 0;
    const ry = -hw;
    const rw = len;
    const rh = beamWidth;

    ctx.beginPath();
    ctx.moveTo(rx + rad, ry);
    ctx.lineTo(rx + rw - rad, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad);
    ctx.lineTo(rx + rw, ry + rh - rad);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh);
    ctx.lineTo(rx + rad, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad);
    ctx.lineTo(rx, ry + rad);
    ctx.quadraticCurveTo(rx, ry, rx + rad, ry);
    ctx.closePath();
    ctx.fillStyle = '#0d1520';
    ctx.fill();
    ctx.strokeStyle = 'rgba(55,138,221,0.18)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rx + 4, ry + hw * 0.5);
    ctx.lineTo(rx + rw - 4, ry + hw * 0.5);
    ctx.strokeStyle = 'rgba(74,222,128,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rx + 4, ry + 2);
    ctx.lineTo(rx + rw - 4, ry + 2);
    ctx.strokeStyle = 'rgba(200,220,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const slotW = Math.min(len * 0.3, 20);
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(rx + len / 2 - slotW / 2, ry + hw * 0.6, slotW, hw * 0.8, 2);
      ctx.strokeStyle = 'rgba(55,138,221,0.22)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawJoint(x, y, outerR, color) {
    ctx.beginPath();
    ctx.arc(x, y, outerR, 0, Math.PI * 2);
    ctx.fillStyle = '#080c14';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, outerR * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(200,220,255,0.12)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, outerR * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.fill();
    ctx.globalAlpha = 1;

    const cs = outerR * 0.4;
    ctx.beginPath();
    ctx.moveTo(x - cs, y);
    ctx.lineTo(x + cs, y);
    ctx.moveTo(x, y - cs);
    ctx.lineTo(x, y + cs);
    ctx.strokeStyle = 'rgba(200,220,255,0.15)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }

  function drawGripper(x, y, angle) {
    const gap = gripClose ? 2 : 10 - gripAnim * 8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const fw = 14;
    const fh = 5;
    [-(gap / 2 + fh / 2), gap / 2 + fh / 2].forEach((offset, i) => {
      ctx.save();
      ctx.translate(4, offset);
      ctx.fillStyle = '#0d1520';
      ctx.strokeStyle = i === 0 ? '#4ade80' : '#378add';
      ctx.lineWidth = 1;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(0, -fh / 2, fw, fh, 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(0, -fh / 2, fw, fh);
        ctx.strokeRect(0, -fh / 2, fw, fh);
      }
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1520';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  function drawBase() {
    const ox = origin.x;
    const oy = origin.y;

    ctx.beginPath();
    ctx.moveTo(ox - 28, oy + 10);
    ctx.lineTo(ox + 28, oy + 10);
    ctx.lineTo(ox + 20, oy - 2);
    ctx.lineTo(ox - 20, oy - 2);
    ctx.closePath();
    ctx.fillStyle = '#0d1a2a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(55,138,221,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = '#0a1420';
    ctx.fillRect(ox - 32, oy + 10, 64, 10);
    ctx.strokeStyle = 'rgba(55,138,221,0.2)';
    ctx.strokeRect(ox - 32, oy + 10, 64, 10);

    ctx.beginPath();
    ctx.arc(ox, oy - 2, 10, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2a40';
    ctx.fill();
    ctx.strokeStyle = 'rgba(55,138,221,0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox, oy - 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#378add';
    ctx.fill();
  }

  function drawReachCircle() {
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, TOTAL_LEN, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(55,138,221,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 10]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** HUD reticle — green when out of range, red on click */
  function drawHUD(x, y, mode) {
    const isRed = mode === 'red';
    const color = isRed ? '#ff4444' : '#4ade80';
    const soft = isRed ? 'rgba(255,68,68,' : 'rgba(74,222,128,';
    const label = isRed ? 'LOCKED' : 'OUT OF RANGE';

    hudRot += 0.008;
    hudPulse += 0.06;
    const pulse = 1 + Math.sin(hudPulse) * 0.12;
    const r = 32 * pulse;

    ctx.save();
    ctx.translate(x, y);

    if (isRed) ctx.globalAlpha = gripClose ? 0.95 : clickFlash > 0 ? clickFlash / 30 : 0.9;

    ctx.strokeStyle = `${soft}0.15)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
    ctx.stroke();

    ctx.save();
    ctx.rotate(hudRot);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 2);
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.2, 0.2, Math.PI / 2 - 0.2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.rotate(-hudRot * 0.5);
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate((i * Math.PI) / 3);
      const tick = r * 0.18;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.85);
      ctx.lineTo(0, -r * 0.85 - tick);
      ctx.strokeStyle = `${soft}0.5)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    const arm = r * 0.55;
    const gap = r * 0.25;
    ctx.strokeStyle = !isRed && overClickable ? 'rgba(55,138,221,0.85)' : `${soft}0.7)`;
    ctx.lineWidth = 1;
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(dx * gap, dy * gap);
      ctx.lineTo(dx * (gap + arm), dy * (gap + arm));
      ctx.stroke();
    });

    drawCenterMark(0, 0, centerAccent(isRed, !isRed));

    ctx.font = '400 9px JetBrains Mono, ui-monospace, monospace';
    ctx.fillStyle = `${soft}0.8)`;
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, r * 1.6 + 14);

    ctx.fillStyle = `${soft}0.4)`;
    ctx.font = '300 8px JetBrains Mono, ui-monospace, monospace';
    ctx.fillText(`${Math.round(x)}, ${Math.round(y)}`, 0, r * 1.6 + 26);

    ctx.restore();
  }

  function drawInRangeTarget(x, y) {
    drawCenterMark(x, y, overClickable ? BLUE : '#ffffff');
  }

  function drawArm() {
    for (let i = 0; i < N; i++) {
      drawBeam(joints[i].x, joints[i].y, joints[i + 1].x, joints[i + 1].y, SEG_WIDTHS[i]);
    }

    for (let i = 0; i <= N; i++) {
      drawJoint(joints[i].x, joints[i].y, JOINT_RADII[i], JOINT_COLORS[Math.min(i, N - 1)]);
    }

    const ee = joints[N];
    const prev = joints[N - 1];
    const angle = Math.atan2(ee.y - prev.y, ee.x - prev.x);
    drawGripper(ee.x, ee.y, angle);
  }

  function frame() {
    origin.y = height - BASE_Y_OFFSET;

    ctx.clearRect(0, 0, width, height);
    fabrik();
    drawReachCircle();
    drawBase();
    drawArm();

    if (clickFlash > 0 || gripClose) {
      drawHUD(target.x, target.y, 'red');
      if (clickFlash > 0) clickFlash--;
    } else if (outOfRange) {
      drawHUD(target.x, target.y, 'green');
    } else {
      drawInRangeTarget(target.x, target.y);
    }

    if (gripClose && gripAnim < 1) gripAnim = Math.min(1, gripAnim + 0.15);
    if (!gripClose && gripAnim > 0) gripAnim = Math.max(0, gripAnim - 0.15);

    requestAnimationFrame(frame);
  }

  window.addEventListener('mousemove', (e) => {
    target.x = e.clientX;
    target.y = e.clientY;
    overClickable = hitClickable(e.clientX, e.clientY);
  }, { passive: true });

  window.addEventListener('mousedown', () => {
    gripClose = true;
    clickFlash = 30;
  });

  window.addEventListener('mouseup', () => {
    gripClose = false;
  });

  window.addEventListener('resize', resize);

  document.documentElement.classList.add('robot-arm-cursor-active');
  resize();
  requestAnimationFrame(frame);
  window.__robotArmCursor = true;
})();
