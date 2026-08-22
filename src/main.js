import "./style.css";
import gsap from "gsap";

/* ------------------------------------------------------------------ */
/*  Curved infinite gallery                                            */
/*  - slides loop on a wrapped horizontal track                        */
/*  - the whole strip is cut by a clip-path: path("...") whose Bézier  */
/*    curves are rebuilt every frame from viewport size + velocity     */
/* ------------------------------------------------------------------ */

/* ---------------- configuration ---------------- */
/*  Tune the whole component from here.                              */

const CONFIG = {
  curve: {
    edgeHeight: 0.56, // strip height at the viewport edges (fraction of viewport height)
    bend: 0.19, // 0 = flat strip, 1 = fully pinched center (applied equally top + bottom)
  },
  slide: {
    width: 0.155, // slide width as fraction of viewport width
    widthMobile: 0.6, // slide width fraction below the mobile breakpoint
    mobileBreakpoint: 768, // px — below this, mobile sizing kicks in
    minWidth: 190, // px clamp
    maxWidth: 400, // px clamp
    gap: 6, // px gap between slides
    imageHeight: 0.56, // image height (fraction of slide height)
    imageOverflow: 1.75, // image width relative to slide (>1 leaves room for parallax)
    parallax: 60, // horizontal image drift in % across the screen
  },
  motion: {
    ease: 0.04, // scroll lerp — lower = smoother/laggier
    autoDrift: 2.3, // idle px/frame drift
    dragSpeed: 3, // drag distance multiplier
    wheelSpeed: 2.2, // wheel delta multiplier
    flingDuration: 2.4, // inertia decay after releasing a drag (seconds)
  },
  // overrides applied below slide.mobileBreakpoint
  mobile: {
    bend: 0.11, // softer curve on small screens
    autoDrift: 1.1, // slower idle drift
    dragSpeed: 1.8, // gentler drag
  },
};

const isMobile = () => window.innerWidth < CONFIG.slide.mobileBreakpoint;

// bottle / skincare product shots (Unsplash)
const UNSPLASH_IDS = [
  "1556228720-195a672e8a03",
  "1620916566398-39f1143ab7be",
  "1608248543803-ba4f8c70ae0b",
  "1571781926291-c477ebfd024b",
  "1598440947619-2c35fc9aa908",
  "1612817288484-6f916006741a",
  "1631729371254-42c2892f0e6e",
  "1526947425960-945c6e72858f",
  "1556228453-efd6c1ff04f6",
  "1571875257727-256c39da42af",
  "1594035910387-fea47794261f",
  "1617897903246-719242758050",
];

const IMAGES = UNSPLASH_IDS.map(
  (id) => `https://images.unsplash.com/photo-${id}?w=700&h=1000&fit=crop&q=80`,
);

const gallery = document.querySelector(".gallery");
const clipLayer = document.querySelector(".gallery__clip");
const track = document.querySelector(".gallery__track");

/* ---------------- build slides ---------------- */

const slides = IMAGES.map((src, i) => {
  const el = document.createElement("div");
  el.className = "slide";
  const img = document.createElement("img");
  img.className = "slide__img";
  img.src = src;
  img.alt = `Gallery image ${i + 1}`;
  img.draggable = false;
  el.appendChild(img);
  track.appendChild(el);
  gsap.set(img, { xPercent: -50, yPercent: -50 });
  return { el, img };
});

/* ---------------- layout state ---------------- */

let vw = 0;
let vh = 0;
let slideW = 0; // slide width incl. gap
let totalW = 0; // full loop length

function applyImageStyles() {
  slides.forEach(({ img }) => {
    img.style.height = `${CONFIG.slide.imageHeight * 100}%`;
    img.style.width = `${CONFIG.slide.imageOverflow * 100}%`;
  });
}

function measure() {
  vw = window.innerWidth;
  vh = window.innerHeight;
  const mobile = vw < CONFIG.slide.mobileBreakpoint;
  // on phones the desktop fraction collapses to the min clamp — use a
  // larger fraction with no min so slides scale with the screen instead
  slideW = mobile
    ? Math.min(CONFIG.slide.maxWidth, vw * CONFIG.slide.widthMobile)
    : gsap.utils.clamp(CONFIG.slide.minWidth, CONFIG.slide.maxWidth, vw * CONFIG.slide.width);
  totalW = slideW * slides.length;
  const gap = CONFIG.slide.gap;
  slides.forEach(({ el }) => {
    el.style.width = `${slideW - gap}px`;
  });
}

/* ---------------- scroll state ---------------- */

let target = 0; // where the user wants to be
let current = 0; // eased position

/* drag */
let dragging = false;
let dragStartX = 0;
let dragStartTarget = 0;
let lastDragX = 0;
let dragVelocity = 0;

gallery.addEventListener("pointerdown", (e) => {
  dragging = true;
  gallery.classList.add("is-dragging");
  gallery.setPointerCapture(e.pointerId);
  dragStartX = lastDragX = e.clientX;
  dragStartTarget = target;
  dragVelocity = 0;
});

gallery.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dragSpeed = isMobile() ? CONFIG.mobile.dragSpeed : CONFIG.motion.dragSpeed;
  target = dragStartTarget - (e.clientX - dragStartX) * dragSpeed;
  dragVelocity = (lastDragX - e.clientX) * dragSpeed;
  lastDragX = e.clientX;
});

function endDrag() {
  if (!dragging) return;
  dragging = false;
  gallery.classList.remove("is-dragging");
  // fling: hand the pointer velocity to an inertia tween on `target`
  gsap.to(
    { v: dragVelocity },
    {
      v: 0,
      duration: CONFIG.motion.flingDuration,
      ease: "power3.out",
      onUpdate() {
        target += this.targets()[0].v;
      },
    },
  );
}
gallery.addEventListener("pointerup", endDrag);
gallery.addEventListener("pointercancel", endDrag);

window.addEventListener(
  "wheel",
  (e) => {
    target += (e.deltaY + e.deltaX) * CONFIG.motion.wheelSpeed;
  },
  { passive: true },
);

/* ---------------- dynamic clip-path ---------------- */
/*
 * Shape: a horizontal band, mirrored about the vertical center.
 * Its top and bottom edges are quadratic Béziers — tall at the viewport
 * edges, pinched in the middle — producing the concave "film strip".
 *
 * For a quadratic curve, the point at t = 0.5 is (P0 + 2C + P2) / 4,
 * so to make the curve pass exactly through the desired center height
 * we solve for the control point:  C = 2 * mid - edge.
 */
function buildClipPath() {
  const edgeH = vh * CONFIG.curve.edgeHeight; // band height at the viewport edges
  const bend = isMobile() ? CONFIG.mobile.bend : CONFIG.curve.bend;
  const centerH = edgeH * (1 - bend); // pinched height mid-screen (symmetric top/bottom)
  const cy = vh / 2;

  const topEdge = cy - edgeH / 2;
  const botEdge = cy + edgeH / 2;
  const topMid = cy - centerH / 2;
  const botMid = cy + centerH / 2;

  const topCtrl = 2 * topMid - topEdge;
  const botCtrl = 2 * botMid - botEdge;

  const cx = (vw / 2).toFixed(2);
  return `path("M 0 ${topEdge.toFixed(2)} Q ${cx} ${topCtrl.toFixed(2)} ${vw} ${topEdge.toFixed(
    2,
  )} L ${vw} ${botEdge.toFixed(2)} Q ${cx} ${botCtrl.toFixed(2)} 0 ${botEdge.toFixed(2)} Z")`;
}

/* ---------------- render loop ---------------- */

const wrap = gsap.utils.wrap;

gsap.ticker.add(() => {
  if (!dragging) {
    target += isMobile() ? CONFIG.mobile.autoDrift : CONFIG.motion.autoDrift;
  }

  current += (target - current) * CONFIG.motion.ease;

  // wrap each slide around the loop, centered on the viewport
  const half = totalW / 2;
  for (let i = 0; i < slides.length; i++) {
    const base = i * slideW;
    // offset 0 = slide centered on screen; wrapping recycles slides infinitely
    const x = vw / 2 - slideW / 2 + wrap(-half, half, base - current);
    // gsap.set is cheap here and keeps transforms on the GPU
    gsap.set(slides[i].el, { x });

    // subtle parallax: the image slides against its frame
    const centerOffset = (x + slideW / 2 - vw / 2) / vw; // -0.5 .. 0.5 on screen
    gsap.set(slides[i].img, {
      xPercent: -50 - centerOffset * CONFIG.slide.parallax,
      yPercent: -50,
    });
  }
});

/* ---------------- resize / boot ---------------- */

function applyClip() {
  clipLayer.style.clipPath = buildClipPath();
}

window.addEventListener("resize", () => {
  measure();
  applyClip();
});
measure();
applyClip();
applyImageStyles();

// gentle entrance: fade in only — the strip never changes size
gsap.from(clipLayer, { autoAlpha: 0, duration: 1, ease: "power2.out" });

document.body.classList.add("is-ready");
