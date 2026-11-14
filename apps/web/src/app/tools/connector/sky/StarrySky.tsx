"use client";

// The night sky behind every Connector page (see ../layout.tsx): a Milky Way,
// faint haze, hills on the horizon, twinkling stars and the odd shooting
// star. It's the same sky for everyone. As a student answers the questions
// (the scene's progress), a wave of stars fades with each answer and the
// whole sky darkens, while six "your" stars grow brighter and gold; at the
// end, lines link the student's star to their matches. People who prefer
// reduced motion get a still sky that changes without animating.

import { useEffect, useRef } from "react";
import { useSkySceneRef, type SkyScene } from "./SkyContext";
import styles from "./StarrySky.module.css";

const HORIZON = 0.86; // where the hills begin, as a share of the height
const TINTS: [number, number, number][] = [
  [200, 215, 255],
  [233, 238, 255],
  [255, 255, 255],
  [255, 240, 214],
  [255, 222, 180],
];
const GOLD: [number, number, number] = [255, 210, 122];
const BAND = { x: 0.55, y: 0.42, angle: -0.55 }; // the Milky Way's centre and tilt

interface Star {
  x: number;
  y: number;
  r: number;
  bright: boolean;
  tint: [number, number, number];
  base: number;
  phase: number;
  speed: number;
  /** When in the questions this star fades, 0 to 1 (special stars never do). */
  fadeAt: number;
  alpha: number;
  scale: number;
  warm: number;
  /** For "your" stars, their order: 0 is the student, 1 and up their matches. */
  rank: number | null;
}

/** A seeded random, so the sky is the same for everyone. */
function seeded(seed: number) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  return { rand, gauss };
}

export function StarrySky() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useSkySceneRef();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const backdrop = document.createElement("canvas");
    const bctx = backdrop.getContext("2d")!;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let stars: Star[] = [];
    let dim = 0;
    let linkProgress = 0;
    let shownMatches: number | null = null;
    let meteor: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    let nextMeteor = 4;
    let last = 0;
    let frame = 0;

    const toBand = (u: number, v: number): [number, number] => {
      const c = Math.cos(BAND.angle);
      const s = Math.sin(BAND.angle);
      return [BAND.x * width + u * c - v * s, BAND.y * height + u * s + v * c];
    };

    function paintBackdrop() {
      const { rand, gauss } = seeded(7);
      backdrop.width = canvas!.width;
      backdrop.height = canvas!.height;
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sky = bctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#03050f");
      sky.addColorStop(0.62, "#0b1330");
      sky.addColorStop(HORIZON, "#1b2450");
      sky.addColorStop(1, "#1b2450");
      bctx.fillStyle = sky;
      bctx.fillRect(0, 0, width, height);

      // Faint nebula haze in a few places.
      const haze: [number, number, number, string][] = [
        [0.22, 0.28, 0.32, "120, 70, 170"],
        [0.8, 0.22, 0.28, "40, 110, 150"],
        [0.62, 0.55, 0.3, "150, 60, 110"],
      ];
      for (const [x, y, r, c] of haze) {
        const rr = r * Math.max(width, height);
        const g = bctx.createRadialGradient(x * width, y * height, 0, x * width, y * height, rr);
        g.addColorStop(0, `rgba(${c}, 0.16)`);
        g.addColorStop(1, `rgba(${c}, 0)`);
        bctx.fillStyle = g;
        bctx.fillRect(0, 0, width, height);
      }

      // The Milky Way: a soft glowing band, packed with faint stars, crossed by darker dust.
      const span = Math.hypot(width, height);
      const thick = Math.max(70, Math.min(width, height) * 0.16);
      bctx.save();
      bctx.translate(BAND.x * width, BAND.y * height);
      bctx.rotate(BAND.angle);
      const band = bctx.createLinearGradient(0, -thick * 1.6, 0, thick * 1.6);
      band.addColorStop(0, "rgba(190, 200, 255, 0)");
      band.addColorStop(0.5, "rgba(190, 200, 255, 0.10)");
      band.addColorStop(1, "rgba(190, 200, 255, 0)");
      bctx.fillStyle = band;
      bctx.fillRect(-span, -thick * 1.6, span * 2, thick * 3.2);
      bctx.restore();
      const dust = Math.round((width * height) / 260);
      for (let i = 0; i < dust; i++) {
        const [x, y] = toBand((rand() - 0.5) * span * 1.4, gauss() * thick);
        if (y > HORIZON * height) continue;
        bctx.fillStyle = `rgba(225, 230, 255, ${0.08 + rand() * 0.28})`;
        const size = rand() < 0.85 ? 0.6 : 1.1;
        bctx.fillRect(x, y, size, size);
      }
      for (let i = 0; i < 26; i++) {
        const [x, y] = toBand((rand() - 0.5) * span * 1.2, gauss() * thick * 0.35);
        const r = thick * (0.25 + rand() * 0.45);
        const g = bctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(3, 5, 15, 0.38)");
        g.addColorStop(1, "rgba(3, 5, 15, 0)");
        bctx.fillStyle = g;
        bctx.fillRect(x - r, y - r, r * 2, r * 2);
      }

      // A faint glow above the horizon, then two ridges of hills.
      const glow = bctx.createLinearGradient(0, HORIZON * height - 90, 0, HORIZON * height);
      glow.addColorStop(0, "rgba(70, 90, 160, 0)");
      glow.addColorStop(1, "rgba(70, 90, 160, 0.22)");
      bctx.fillStyle = glow;
      bctx.fillRect(0, HORIZON * height - 90, width, 90);
      const ridge = (base: number, amp: number, color: string) => {
        bctx.fillStyle = color;
        bctx.beginPath();
        bctx.moveTo(0, height);
        for (let x = 0; x <= width + 8; x += 8) {
          const wave = Math.sin(x / 210 + base * 9) * 0.6 + Math.sin(x / 77 + base * 3) * 0.25 + 0.5;
          bctx.lineTo(x, base * height - amp * wave - (rand() < 0.35 ? rand() * 7 : 0));
        }
        bctx.lineTo(width, height);
        bctx.closePath();
        bctx.fill();
      };
      ridge(HORIZON + 0.015, 34, "#0a0f24");
      ridge(HORIZON + 0.06, 26, "#05081a");
    }

    function buildStars() {
      const { rand, gauss } = seeded(20261114);
      const count = Math.round(Math.min(560, Math.max(200, (width * height) / 2600)));
      stars = [];
      for (let i = 0; i < count; i++) {
        const bright = rand() < 0.07;
        // Stars cluster a little toward the Milky Way.
        let x = rand();
        let y = rand() * HORIZON;
        if (rand() < 0.35) {
          const [bx, by] = toBand((rand() - 0.5) * Math.hypot(width, height), gauss() * 90);
          x = bx / width;
          y = by / height;
        }
        const star: Star = {
          x,
          y,
          r: bright ? 1.3 + rand() * 0.9 : 0.4 + rand() * 0.8,
          bright,
          tint: TINTS[Math.floor(rand() * TINTS.length)]!,
          base: bright ? 0.85 : 0.35 + rand() * 0.55,
          phase: rand() * Math.PI * 2,
          speed: 0.4 + rand() * 1.4,
          fadeAt: rand(),
          alpha: 0,
          scale: 1,
          warm: 0,
          rank: null,
        };
        if (x > 0 && x < 1 && y > 0 && y < HORIZON - 0.02) stars.push(star);
      }
      // Six stars spread around the sky become "your" stars.
      const anchors: [number, number][] = [
        [0.5, 0.18],
        [0.22, 0.3],
        [0.8, 0.27],
        [0.14, 0.62],
        [0.86, 0.6],
        [0.5, 0.74],
      ];
      anchors.forEach(([x, y], rank) => {
        stars.unshift({
          x: x + (rand() - 0.5) * 0.05,
          y: y + (rand() - 0.5) * 0.04,
          r: 1.4,
          bright: true,
          tint: [255, 248, 230],
          base: 0.8,
          phase: rand() * 6,
          speed: 0.6,
          fadeAt: 2,
          alpha: 0,
          scale: 1,
          warm: 0,
          rank,
        });
      });
    }

    function targets(star: Star, scene: SkyScene) {
      const p = scene.progress;
      if (star.rank !== null) {
        const lit = scene.matches === null || star.rank <= scene.matches;
        return {
          alpha: lit ? Math.min(1, 0.6 + p * 0.5) : 0.06,
          scale: lit ? 1 + p * 2.6 : 0.6,
          warm: lit ? p : 0,
        };
      }
      // A wave of ordinary stars goes out with each answer; by the end almost all are gone.
      const gone = star.fadeAt < p * 0.97;
      return { alpha: gone ? 0.015 : star.base, scale: gone ? 0.5 : 1, warm: 0 };
    }

    function drawMeteor(dt: number) {
      nextMeteor -= dt;
      if (!meteor && nextMeteor <= 0) {
        meteor = {
          x: (0.15 + Math.random() * 0.7) * width,
          y: (0.05 + Math.random() * 0.3) * height,
          vx: -(260 + Math.random() * 160),
          vy: 140 + Math.random() * 80,
          life: 0,
        };
        nextMeteor = 6 + Math.random() * 6;
      }
      if (!meteor) return;
      meteor.life += dt;
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      const a = Math.max(0, 1 - meteor.life / 0.9) * (1 - dim * 0.5);
      const tail = 0.18;
      const g = ctx!.createLinearGradient(meteor.x, meteor.y, meteor.x - meteor.vx * tail, meteor.y - meteor.vy * tail);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.9 * a})`);
      g.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx!.strokeStyle = g;
      ctx!.lineWidth = 1.4;
      ctx!.beginPath();
      ctx!.moveTo(meteor.x, meteor.y);
      ctx!.lineTo(meteor.x - meteor.vx * tail, meteor.y - meteor.vy * tail);
      ctx!.stroke();
      if (meteor.life > 0.9) meteor = null;
    }

    function draw(time: number, instant: boolean) {
      const c = ctx!;
      const scene = sceneRef.current;
      const dt = Math.min(0.05, (time - last) / 1000 || 0);
      last = time;
      const ease = instant ? 1 : 0.06;

      c.drawImage(backdrop, 0, 0, width, height);
      // The whole sky darkens as the student answers, so their stars stand out.
      dim += (scene.progress * 0.7 - dim) * ease;
      c.fillStyle = `rgba(2, 3, 10, ${dim})`;
      c.fillRect(0, 0, width, HORIZON * height + 40);

      for (const star of stars) {
        const target = targets(star, scene);
        star.alpha += (target.alpha - star.alpha) * ease;
        star.scale += (target.scale - star.scale) * ease;
        star.warm += (target.warm - star.warm) * ease;
      }

      // Lines from the student's star to each of their matches.
      if (scene.matches !== shownMatches) {
        shownMatches = scene.matches;
        linkProgress = 0;
      }
      if (scene.matches !== null && scene.matches > 0) {
        linkProgress = instant ? 1 : Math.min(1, linkProgress + 0.008);
        const lit = stars
          .filter((s) => s.rank !== null && s.rank <= scene.matches!)
          .sort((a, b) => a.rank! - b.rank!);
        const you = lit[0]!;
        c.lineWidth = 1.2;
        lit.slice(1).forEach((s, i) => {
          const local = Math.max(0, Math.min(1, (linkProgress - i / lit.length) * lit.length));
          if (local <= 0) return;
          const x1 = you.x * width;
          const y1 = you.y * height;
          c.strokeStyle = `rgba(${GOLD.join(", ")}, ${0.6 * local})`;
          c.beginPath();
          c.moveTo(x1, y1);
          c.lineTo(x1 + (s.x * width - x1) * local, y1 + (s.y * height - y1) * local);
          c.stroke();
        });
      }

      const t = time / 1000;
      for (const star of stars) {
        const twinkle = reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(t * star.speed + star.phase);
        const a = Math.max(0, Math.min(1, star.alpha * twinkle));
        if (a < 0.01) continue;
        const x = star.x * width;
        const y = star.y * height;
        const r = star.r * star.scale;
        const [tr, tg, tb] = star.tint;
        const color = `${Math.round(tr + (GOLD[0] - tr) * star.warm)}, ${Math.round(tg + (GOLD[1] - tg) * star.warm)}, ${Math.round(
          tb + (GOLD[2] - tb) * star.warm,
        )}`;
        const special = star.rank !== null;
        if (star.bright) {
          const haloR = r * (special ? 8 : 4.5);
          const halo = c.createRadialGradient(x, y, 0, x, y, haloR);
          halo.addColorStop(0, `rgba(${color}, ${(special ? 0.5 : 0.22) * a})`);
          halo.addColorStop(1, `rgba(${color}, 0)`);
          c.fillStyle = halo;
          c.beginPath();
          c.arc(x, y, haloR, 0, Math.PI * 2);
          c.fill();
          // A faint four-point sparkle on the brightest stars.
          const spike = r * (special ? 5 + star.warm * 4 : 3.5);
          c.strokeStyle = `rgba(${color}, ${0.35 * a})`;
          c.lineWidth = 0.7;
          c.beginPath();
          c.moveTo(x - spike, y);
          c.lineTo(x + spike, y);
          c.moveTo(x, y - spike);
          c.lineTo(x, y + spike);
          c.stroke();
        }
        c.fillStyle = `rgba(${color}, ${a})`;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }

      if (!instant && !reduceMotion) drawMeteor(dt);
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas!.clientWidth;
      height = canvas!.clientHeight;
      if (width === 0 || height === 0) return;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintBackdrop();
      buildStars();
      draw(performance.now(), true);
    }

    function loop(time: number) {
      if (reduceMotion) {
        // No animation: jump straight to the current scene, a few times a second.
        draw(time, true);
        frame = window.setTimeout(() => requestAnimationFrame(loop), 250) as unknown as number;
        return;
      }
      draw(time, false);
      frame = requestAnimationFrame(loop);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    frame = requestAnimationFrame(loop);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.clearTimeout(frame);
    };
  }, [sceneRef]);

  return <canvas ref={canvasRef} className={styles.sky} aria-hidden="true" />;
}
