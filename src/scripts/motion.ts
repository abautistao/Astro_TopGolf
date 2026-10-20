/**
 * motion.ts — the single shared motion helper for the "visitas escolares"
 * landing blocks (componentes 32-38, acuario theme).
 *
 * Decision 1: one helper, not seven copies. Every block imports this module, and
 * `gsap.registerPlugin(ScrollTrigger)` happens exactly once, here. Seven inlined
 * observers would be seven places to fix later.
 *
 * Decision 6: motion never runs through Partytown. Scroll listeners stay on the
 * main thread; Partytown exists for third-party scripts off the critical path.
 *
 * Decision 9: this module owns no colour and no CSS. It injects no style rules.
 * Travel distances, durations and easings come from the caller's options, and
 * the only styles it writes are the inline transforms GSAP needs.
 *
 * Decision 8: transform and opacity only. The option surfaces below deliberately
 * expose no `width` / `height` / `top` / `left` / `margin` / `padding`, because
 * animating those re-runs layout on every scroll frame.
 */

import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Anything this module knows how to resolve into a list of elements. */
export type MotionTarget = Element | Element[] | NodeListOf<Element> | string;

/** Starting element of a stagger, mirroring GSAP's distribute vocabulary. */
export type MotionStaggerFrom = 'start' | 'center' | 'end' | 'edges' | 'random' | number;

/** Stagger timing, in seconds between neighbouring elements. */
export interface MotionStaggerOptions {
    /** Seconds between each element's tween start. Default `0.08`. */
    each?: number;
    /** Which element moves first. Omit for GSAP's default (`'start'`). */
    from?: MotionStaggerFrom;
}

/**
 * Options for {@link revealSection}.
 *
 * Decision 4 (LCP safety): an `opacity: 0` start on a hero `<h1>` directly
 * regresses Largest Contentful Paint, because the element is painted late. Two
 * opt-in mechanisms keep LCP-critical nodes untouched; prefer `lcpSafe`, which
 * names the elements explicitly.
 */
export interface RevealOptions {
    /**
     * Explicit opt-in list of LCP-critical elements (decision 4). Anything named
     * here is dropped from the animated set and left exactly where the
     * stylesheet puts it: visible, untransformed, no opacity ramp.
     */
    lcpSafe?: MotionTarget;
    /**
     * Shorthand for "the resolved targets themselves are LCP-critical". They are
     * left visible immediately and only their non-critical siblings animate.
     * Combine with {@link RevealOptions.lcpSafe} when some of those siblings are
     * LCP-critical too.
     */
    protectLcp?: boolean;

    /** Vertical travel in pixels. Default `24`. */
    y?: number;
    /** Horizontal travel in pixels. Default `0`. */
    x?: number;
    /** Scale the element up from this value. Default `1` (no scaling). */
    scale?: number;
    /** Starting opacity. Default `0`. */
    opacityFrom?: number;

    /** Seconds. Default `0.7`. */
    duration?: number;
    /** GSAP ease string. Default `'power2.out'`. */
    ease?: string;
    /** Seconds to wait once the trigger fires. Default `0`. */
    delay?: number;
    /** ScrollTrigger start string. Default `'top 85%'`. */
    start?: string;
}

/**
 * Options for {@link revealStagger}: everything {@link RevealOptions} accepts,
 * plus how the children are sequenced.
 */
export interface StaggerOptions extends RevealOptions {
    /** Seconds between neighbouring children. Default `0.08`. */
    stagger?: number;
    /** Which child leads the sequence. */
    staggerFrom?: MotionStaggerFrom;
    /**
     * Selector used to pick the children of each target, relative to it.
     * Omit to use every direct child. For `container > .row > .card` chains a
     * nested selector such as `'.card'` is usually what you want.
     */
    selector?: string;
}

/**
 * Options for {@link parallaxLayer}.
 *
 * Decision 5: this is the only function that may use `scrub`, and therefore the
 * only one that can move an element while the user is interacting with it.
 */
export interface ParallaxOptions {
    /**
     * Travel as a percentage of the layer's own height, applied symmetrically as
     * `yPercent` inside an `overflow: hidden` container (decision 8). Default `12`.
     */
    distance?: number;
    /** Seconds the layer takes to cross its travel. Default `1`. */
    duration?: number;
    /**
     * GSAP ease string. Default `'none'`, because a scrubbed parallax with an
     * eased playhead stutters against the scroll position.
     */
    ease?: string;
    /** ScrollTrigger start string. Default `'top bottom'`. */
    start?: string;
    /** ScrollTrigger end string. Default `'bottom top'`. */
    end?: string;
    /** Scrub smoothing in seconds. Default `true` (locked to scroll). */
    scrub?: number | boolean;
    /**
     * Element whose scroll position drives the layer. Defaults to the layer's
     * parent element.
     */
    trigger?: MotionTarget;
    /**
     * Required to animate a layer that contains focusable controls.
     *
     * WHY: decision 5. A scrubbed transform on an ancestor of a focused input
     * moves the input out from under the pointer mid-gesture and desyncs what
     * the user sees from what the control is actually doing — sliders and live
     * arithmetic (`componente-37`) become unusable. The default is therefore to
     * refuse, and to make the caller state explicitly that the layer really is
     * inert decoration.
     */
    allowInteractive?: boolean;
}

/**
 * A tween plus the elements it writes to. Kept per trigger so teardown can strip
 * the inline styles GSAP added and leave the section visible.
 */
interface OwnedTrigger {
    trigger: ReturnType<typeof ScrollTrigger.create>;
    targets: Element[];
}

/* -------------------------------------------------------------------------- */
/* Module state                                                               */
/* -------------------------------------------------------------------------- */

const READY_ATTRIBUTE = 'data-motion';
const READY_VALUE = 'ready';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Everything that can receive keyboard focus or carry a form control's value. */
const FOCUSABLE_SELECTOR =
    'a[href], button, input, select, textarea, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';

/** Decision 1: `registerPlugin` runs once per module instance, never per call. */
let pluginRegistered = false;

/** Decision 1/3: every one of the seven component scripts calls `initMotion()`. */
let initialized = false;

/** Distinguishes the first `astro:page-load` (initial load) from navigations. */
let pageLoadObserved = false;

let reducedMotionWatchBound = false;

const ownedTriggers: OwnedTrigger[] = [];

/** Structural alias so the helpers below never need `any`. */
type RevealTween = ReturnType<typeof gsap.from>;

/* -------------------------------------------------------------------------- */
/* Decision 2 — reduced motion is a hard off-switch                           */
/* -------------------------------------------------------------------------- */

/**
 * True when the user has asked the operating system to reduce motion.
 *
 * Returns `false` during SSR and on browsers without `matchMedia`, so importing
 * this module from a server-rendered path is harmless.
 */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false;
    }

    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * True when this module must not touch the DOM: reduced motion is on, or
 * {@link initMotion} has not run yet.
 *
 * Every trigger function checks this first and returns immediately, so a caller
 * that forgets `initMotion()` gets fully visible content rather than a section
 * stuck at `opacity: 0` forever.
 */
function motionDisabled(): boolean {
    return prefersReducedMotion() || !initialized;
}

/**
 * Turn motion on for the current document. Safe to call any number of times and
 * from any number of component scripts.
 *
 * Decision 3: the `data-motion="ready"` attribute is written *only* here, and
 * *only* when motion will genuinely run. Components scope their hidden initial
 * states under `[data-motion="ready"]`, so a page where this module never loads
 * — or a browser with JS disabled — simply renders the content, visible. That is
 * the latent defect in the older IntersectionObserver reveal pattern, and it is
 * the reason the attribute is the contract rather than a class on each section.
 */
export function initMotion(): void {
    // Decision 2: no attribute, no plugin, no triggers. Content stays final.
    if (prefersReducedMotion()) {
        return;
    }

    if (!pluginRegistered) {
        gsap.registerPlugin(ScrollTrigger);
        pluginRegistered = true;
    }

    bindReducedMotionWatch();

    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute(READY_ATTRIBUTE, READY_VALUE);
    }

    initialized = true;
}

/**
 * Flip the hard off-switch if the user changes their OS setting mid-session.
 *
 * Only the "reduce" direction is handled. Re-enabling motion would require
 * re-running every caller's setup, which this module cannot reach; a reload is
 * the honest answer there.
 */
function bindReducedMotionWatch(): void {
    if (reducedMotionWatchBound || typeof window === 'undefined') {
        return;
    }

    reducedMotionWatchBound = true;

    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    if (typeof query.addEventListener !== 'function') {
        return;
    }

    query.addEventListener('change', (event) => {
        if (!event.matches) {
            return;
        }

        // Decision 3: strip every inline style this module wrote and drop the
        // readiness attribute, so the stylesheet's visible default takes over
        // again. Without this a mid-session toggle would freeze whatever the
        // scroll position happened to be at.
        killOwnedTriggers();
        initialized = false;

        if (typeof document !== 'undefined') {
            document.documentElement.removeAttribute(READY_ATTRIBUTE);
        }
    });
}

/* -------------------------------------------------------------------------- */
/* Decision 7 — cleanup                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Strip the inline styles GSAP wrote and drop the triggers, leaving every
 * affected element in its final, visible state.
 *
 * `clearProps` runs *before* `kill()` deliberately: killing with `revert` would
 * restore the pre-tween inline values, which for a reveal tween is the hidden
 * start state — exactly the thing decision 3 forbids leaving behind.
 */
function killOwnedTriggers(): void {
    while (ownedTriggers.length > 0) {
        const owned = ownedTriggers.pop();
        if (!owned) {
            break;
        }

        gsap.set(owned.targets, { clearProps: 'all' });
        owned.trigger.kill();
    }
}

/**
 * Decision 7: `Layout.astro` registers no `ViewTransitions` / `ClientRouter`
 * today, so navigation is a full page load and this listener never fires twice.
 * It is written anyway because two acuario components already defend for SPA
 * mode, and this module must not double-initialize if SPA mode is ever enabled.
 *
 * Listener order matters: this module is imported at the top of a component
 * script, so its listener is registered before the component's own
 * `astro:page-load` handler. Teardown therefore completes before callers
 * re-register their triggers.
 */
function handlePageLoad(): void {
    // On a normal page load `astro:page-load` arrives *after* the component
    // scripts already built their triggers. Treating that first event as a
    // navigation would kill live triggers that nobody would ever recreate.
    const isInitialLoad = !pageLoadObserved && document.readyState !== 'complete';
    pageLoadObserved = true;

    if (isInitialLoad) {
        return;
    }

    killOwnedTriggers();
    initialized = false;
    initMotion();
}

if (typeof document !== 'undefined') {
    document.addEventListener('astro:page-load', handlePageLoad);
}

/* -------------------------------------------------------------------------- */
/* Target resolution                                                          */
/* -------------------------------------------------------------------------- */

function isElement(value: unknown): value is Element {
    return typeof Element !== 'undefined' && value instanceof Element;
}

/** Normalise any {@link MotionTarget} into a plain array of elements. */
function resolveTargets(target: MotionTarget | null | undefined): Element[] {
    if (target === null || target === undefined) {
        return [];
    }

    if (typeof target === 'string') {
        if (typeof document === 'undefined') {
            return [];
        }
        return Array.from(document.querySelectorAll<Element>(target));
    }

    if (Array.isArray(target)) {
        return target.filter(isElement);
    }

    if (typeof NodeList !== 'undefined' && target instanceof NodeList) {
        return Array.from(target).filter(isElement);
    }

    return isElement(target) ? [target] : [];
}

/**
 * Children of each parent, optionally filtered by a descendant selector.
 * Descendant rather than direct-child on purpose: `.card` still matches when
 * the cards sit one level deeper under a `.row`.
 */
function childrenOf(parents: Element[], selector?: string): Element[] {
    const found: Element[] = [];

    for (const parent of parents) {
        const candidates = selector
            ? parent.querySelectorAll<Element>(selector)
            : parent.children;

        for (let index = 0; index < candidates.length; index += 1) {
            const candidate = candidates[index];
            if (candidate) {
                found.push(candidate);
            }
        }
    }

    return found;
}

/** Remove the LCP-protected elements (decision 4) from the animated set. */
function withoutProtected(targets: Element[], protectedTargets: Element[]): Element[] {
    if (protectedTargets.length === 0) {
        return targets;
    }

    return targets.filter((target) => !protectedTargets.includes(target));
}

/** True when the element holds something the user can focus or operate. */
function containsFocusable(element: Element): boolean {
    if (element.matches(FOCUSABLE_SELECTOR)) {
        return true;
    }

    return element.querySelector(FOCUSABLE_SELECTOR) !== null;
}

/** Element whose scroll position drives a parallax layer. */
function resolveScrollTarget(layer: Element, trigger?: MotionTarget): Element {
    if (trigger !== undefined) {
        const explicit = resolveTargets(trigger);
        return explicit[0] ?? layer;
    }

    return layer.parentElement ?? layer;
}

function buildStagger(opts: StaggerOptions): number | MotionStaggerOptions {
    const each = opts.stagger ?? 0.08;

    if (opts.staggerFrom === undefined) {
        return each;
    }

    return { each, from: opts.staggerFrom };
}

/** Record a trigger so re-init and the reduced-motion watcher can undo it. */
function trackTrigger(trigger: ReturnType<typeof ScrollTrigger.create>, targets: Element[]): void {
    ownedTriggers.push({ trigger, targets });
}

/**
 * Create the ScrollTrigger for a fire-once reveal (decision 5).
 *
 * `once: true` means ScrollTrigger fires exactly once and kills itself; combined
 * with no `scrub`, an interactive section is entered once and then left alone.
 */
function createRevealTrigger(
    tween: RevealTween,
    trigger: Element,
    start: string,
): ReturnType<typeof ScrollTrigger.create> {
    return ScrollTrigger.create({
        animation: tween,
        trigger,
        start,
        once: true,
    });
}

/* -------------------------------------------------------------------------- */
/* Public triggers                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Reveal one element (or a set) as it enters the viewport.
 *
 * Decision 5: no `scrub`. The tween runs once and `once: true` disposes the
 * trigger afterwards, so nothing keeps transforming the section while the user
 * scrolls past it.
 *
 * Decision 4: pass `lcpSafe` with the elements that can become the LCP element,
 * or `protectLcp: true` when the resolved targets *are* those elements — in
 * which case they are left visible and only their siblings animate.
 *
 * Decision 8: only `x`, `y`, `scale` and `opacity` are ever written.
 */
export function revealSection(el: MotionTarget, opts: RevealOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const targets = resolveTargets(el);
    if (targets.length === 0) {
        return;
    }

    const first = targets[0];
    if (!first) {
        return;
    }

    const protectedTargets = resolveTargets(opts.lcpSafe);

    // Decision 4: with `protectLcp`, the section itself stays put and the motion
    // moves to its children — the hero text holds its final position while the
    // non-critical eyebrow, panel and badges settle in around it.
    const animated = opts.protectLcp === true
        ? withoutProtected(childrenOf(targets), protectedTargets)
        : withoutProtected(targets, protectedTargets);

    if (animated.length === 0) {
        return;
    }

    const tween = gsap.from(animated, {
        opacity: opts.opacityFrom ?? 0,
        y: opts.y ?? 24,
        x: opts.x ?? 0,
        scale: opts.scale ?? 1,
        duration: opts.duration ?? 0.7,
        ease: opts.ease ?? 'power2.out',
        delay: opts.delay ?? 0,
    });

    const trigger = createRevealTrigger(tween, first, opts.start ?? 'top 85%');
    trackTrigger(trigger, animated);
}

/**
 * Reveal the children of a container one after another.
 *
 * Decision 5: still a single fire-once pass, no `scrub`. Interactive blocks
 * (`componente-35` tabs, `componente-37` cotizador) call this on their section
 * wrapper and never on the controls inside it.
 *
 * Decision 4: `lcpSafe` filters children out of the sequence by identity, so a
 * hero's `titulo`, `descripcion` and `boton_principal` can keep their final
 * position while the siblings around them stagger in.
 */
export function revealStagger(el: MotionTarget, opts: StaggerOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const targets = resolveTargets(el);
    if (targets.length === 0) {
        return;
    }

    const first = targets[0];
    if (!first) {
        return;
    }

    const protectedTargets = resolveTargets(opts.lcpSafe);
    const animated = withoutProtected(childrenOf(targets, opts.selector), protectedTargets);

    if (animated.length === 0) {
        return;
    }

    const tween = gsap.from(animated, {
        opacity: opts.opacityFrom ?? 0,
        y: opts.y ?? 20,
        x: opts.x ?? 0,
        scale: opts.scale ?? 1,
        duration: opts.duration ?? 0.6,
        ease: opts.ease ?? 'power2.out',
        delay: opts.delay ?? 0,
        stagger: buildStagger(opts),
    });

    const trigger = createRevealTrigger(tween, first, opts.start ?? 'top 85%');
    trackTrigger(trigger, animated);
}

/**
 * Continuous vertical parallax for a decorative layer.
 *
 * Decision 4: the one function allowed to move an LCP-area element, and it never
 * touches `opacity` — the caller keeps full control of visibility, so a hero
 * background can drift while its title stays legible and painted immediately.
 *
 * Decision 5: the only function that uses `scrub`. It refuses to attach to a
 * layer containing focusable controls unless `allowInteractive: true` is passed
 * explicitly; see {@link ParallaxOptions.allowInteractive} for why.
 *
 * Decision 8: `yPercent` only, on the assumption the caller put the layer inside
 * an `overflow: hidden` container with room to travel.
 */
export function parallaxLayer(el: MotionTarget, opts: ParallaxOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const layers = resolveTargets(el);
    if (layers.length === 0) {
        return;
    }

    const allowInteractive = opts.allowInteractive === true;
    const distance = opts.distance ?? 12;

    for (const layer of layers) {
        if (!allowInteractive && containsFocusable(layer)) {
            // Decision 5: a scrubbed transform on an ancestor of a focused
            // control fights the user's own scrolling. Skipping is safe because
            // the layer keeps its stylesheet position and stays visible.
            continue;
        }

        const tween = gsap.fromTo(
            layer,
            { yPercent: -distance },
            {
                yPercent: distance,
                duration: opts.duration ?? 1,
                ease: opts.ease ?? 'none',
            },
        );

        const trigger = ScrollTrigger.create({
            animation: tween,
            trigger: resolveScrollTarget(layer, opts.trigger),
            start: opts.start ?? 'top bottom',
            end: opts.end ?? 'bottom top',
            scrub: opts.scrub ?? true,
        });

        trackTrigger(trigger, [layer]);
    }
}