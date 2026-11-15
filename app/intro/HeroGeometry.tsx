"use client";

import { useEffect, useRef } from "react";
import { sampleHero, tileAppearance } from "./hero-motion";

const initial = sampleHero(0);
const slots = Array.from({ length: 27 }, (_, i) => i);

export default function HeroGeometry() {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const element = svg.current;
    if (!element) return;
    const base = [...element.querySelectorAll<SVGGElement>('[data-layer="base"] [data-piece]')];
    const front = [...element.querySelectorAll<SVGGElement>('[data-layer="foreground"] [data-piece]')];
    const frame = element.querySelector<SVGRectElement>("[data-frame]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let raf = 0;
    let elapsed = 0;
    let previous = 0;

    const render = (time: number) => {
      raf = 0;
      const dt = previous ? Math.min(time - previous, 64) : 0;
      previous = time;
      if (!visible || document.hidden) return;
      if (!reduced.matches) elapsed += dt;
      const state = sampleHero(reduced.matches ? 0 : elapsed);
      [...base, ...front].forEach(group => group.setAttribute("visibility", "hidden"));
      state.tiles.forEach((tile, index) => {
        const group = (tile.foreground ? front : base)[index];
        group.setAttribute("visibility", "visible");
        group.setAttribute("transform", `translate(${tile.x} ${tile.y})`);
        group.dataset.row = String(tile.y / 90);
        group.dataset.id = String(tile.id);
        group.dataset.role = tile.role;
        const identity = String(tile.id);
        if (group.dataset.identity !== identity) {
          group.dataset.identity = identity;
          const appearance = tileAppearance(tile.id);
          [...group.children].forEach((path, part) => {
            path.setAttribute("d", appearance.paths[part] ?? "");
            path.setAttribute("fill", appearance.colors[part]);
          });
        }
      });
      frame?.setAttribute("x", String(state.frameX));
      frame?.setAttribute("width", String(state.frameWidth));
      element.dataset.pose = state.stage;
      if (!reduced.matches) raf = requestAnimationFrame(render);
    };
    const resume = () => { previous = 0; if (!raf) raf = requestAnimationFrame(render); };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) resume(); else { cancelAnimationFrame(raf); raf = 0; }
    });
    observer.observe(element);
    document.addEventListener("visibilitychange", resume);
    reduced.addEventListener("change", resume);
    resume();
    return () => { cancelAnimationFrame(raf); observer.disconnect(); document.removeEventListener("visibilitychange", resume); reduced.removeEventListener("change", resume); };
  }, []);

  return <svg ref={svg} className="ti-mosaic" viewBox="-360 -100 1440 470" aria-hidden="true" data-pose="assembled">
    <rect data-frame x="-10" y="-10" width="740" height="290" rx="12" fill="#e7e9ed" stroke="#aab3bf" strokeWidth="1"/>
    <g data-layer="base">{slots.map(i => {
      const tile = initial.tiles[i];
      const appearance = tile ? tileAppearance(tile.id) : null;
      return <g key={i} data-piece visibility={tile ? "visible" : "hidden"} transform={tile ? `translate(${tile.x} ${tile.y})` : undefined}>
        <path d={appearance?.paths[0]} fill={appearance?.colors[0]}/><path d={appearance?.paths[1]} fill={appearance?.colors[1]}/>
      </g>;
    })}</g>
    {/* Exchange traffic is painted last, above all resident shapes. */}
    <g data-layer="foreground">{slots.map(i => <g key={i} data-piece visibility="hidden"><path/><path/></g>)}</g>
  </svg>;
}
