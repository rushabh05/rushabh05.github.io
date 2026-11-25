# rushabh05.github.io

Personal site of Rushabh Yeole, backend and systems engineer in Mumbai. Live at **https://rushabh05.github.io**.

A single static page with no build step: Three.js, GSAP + ScrollTrigger and Lenis load from jsDelivr at pinned versions.

## What's on it

- **Hero:** a WebGL dotted globe with pinging hubs and packets on great-circle arcs (custom shaders). Drag to spin it. The name's letters thin out under the cursor.
- **Selected work:** a horizontal pinned gallery. Each project has a live canvas visual: FinOps cost stream, TESSERA telemetry fusion, AI Trading Desk pipeline, SpaceSaver scan, Flare request filter.
- **Lab:** an interactive demo of [maglev-xdp](https://github.com/rushabh05/maglev-xdp), my eBPF/XDP load balancer. It runs the same Maglev table-population algorithm as the Go control plane: fail a backend and only about 1/N of the slots move.
- **Day job:** a scroll-scrubbed "100 pods → 8" scene plus three animated cards.
- **Contact:** the globe re-assembles. A `ping` button measures the real round-trip time to this host.

`prefers-reduced-motion` turns off the loader, smooth scroll and autoplaying motion.

## Run locally

ES modules don't load from `file://`, so serve the folder:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Files

```
index.html          content and structure
css/style.css       design tokens, layout, responsive rules
js/main.js          loader, smooth scroll, scroll scenes, cursor, HUD, contact
js/globe.js         the WebGL globe
js/viz.js           project visuals, the Maglev demo, day-job cards
js/utils.js         text splitting, scramble, odometer, magnetic, visibility-gated loops
assets/             screenshots and résumé
```
