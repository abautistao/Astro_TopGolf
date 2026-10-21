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
import SplitText from 'gsap/SplitText';

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Anything this module knows how to resolve into a list of elements.
 *
 * `null` is part of the type on purpose: `element.querySelector(...)` returns
 * `Element | null`, and every caller of these helpers has a query result to
 * hand over. Accepting `null` here removes a narrowing dance from every call
 * site, and the resolution below already treats it as "no targets".
 */
export type MotionTarget = Element | Element[] | NodeListOf<Element> | string | null;

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
    /**
     * Skip any target that CONTAINS a focusable control.
     *
     * WHY this exists: a `gsap.from()` reveal writes `opacity: 0` on its target
     * at load. If the target holds an input, that input is faded out until the
     * trigger fires — and opacity does not remove it from the tab order, so the
     * keyboard can reach a control the user cannot see. The helper's focus
     * rescue makes that case self-healing, but it cannot heal it before the
     * user has actually tabbed to it.
     *
     * A target that IS itself focusable (a link, a button) is ALWAYS excluded,
     * with no option needed. This flag is for the harder case: a wrapper whose
     * descendants are focusable.
     */
    skipFocusable?: boolean;
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
    /**
     * `null` for primitives that own no ScrollTrigger (a repeating float, a
     * bubble field). They still need teardown, so the record exists with a
     * `restore` callback instead of a trigger.
     */
    trigger: ReturnType<typeof ScrollTrigger.create> | null;
    targets: Element[];
    /**
     * Optional teardown for state this module created outside the DOM.
     *
     * WHY: `clearProps` can only strip inline styles. Some primitives write
     * things it cannot reach — `SplitText` replaces the element's inner HTML,
     * `countUp` replaces `textContent`. Those need an explicit undo, or the
     * teardown would leave a page half-split and half-counted.
     */
    restore?: () => void;
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

/**
 * Decision 1: one `gsap.matchMedia()` context for the whole module.
 *
 * Desktop-only primitives (pointer tilt, horizontal scroll) live in a media
 * context so their listeners and inline styles disappear the moment the
 * viewport stops qualifying. The context is created lazily because
 * `gsap.matchMedia()` touches the window, and this module is imported from
 * server-rendered paths too.
 */
let mediaContext: ReturnType<typeof gsap.matchMedia> | null = null;

/** Decision 1/3: every one of the seven component scripts calls `initMotion()`. */
let initialized = false;

/** Distinguishes the first `astro:page-load` (initial load) from navigations. */
let pageLoadObserved = false;

let reducedMotionWatchBound = false;

/** Whether the focus-rescue listener is already bound. */
let focusRescueBound = false;

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
        // Decision 1: registration happens exactly once, here. `SplitText`
        // became part of the free GSAP distribution in 3.13, so it needs no
        // separate licence or import path.
        gsap.registerPlugin(ScrollTrigger, SplitText);
        pluginRegistered = true;
    }

    bindReducedMotionWatch();
    bindFocusRescue();

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
 * S13 safety net: a control must never be invisible and still tabbable.
 *
 * A `gsap.from()` reveal writes `opacity: 0` on its target at load. If the
 * target is a CONTAINER that holds links, buttons or inputs, then until the
 * trigger fires those controls are transparent — and the keyboard can still
 * reach them, because opacity does not remove an element from the tab order.
 *
 * The fix is not to forbid the pattern (it is the natural way to animate a
 * whole column of links) but to make the failure self-healing: the moment
 * something inside a hidden container receives focus, that container's hidden
 * start state is cleared, so the focused control is visible exactly when the
 * user needs to see it.
 *
 * Only an inline `opacity: 0` is cleared — that is precisely the state GSAP
 * writes for a reveal's start, so an in-flight stagger is never disturbed.
 */
function bindFocusRescue(): void {
    if (focusRescueBound || typeof document === 'undefined') {
        return;
    }

    focusRescueBound = true;

    document.addEventListener('focusin', (event) => {
        const focused = event.target;

        if (!(focused instanceof Element)) {
            return;
        }

        let node = focused.parentElement;

        while (node) {
            const inlineOpacity = node.style.opacity;

            if (inlineOpacity !== '' && Number(inlineOpacity) === 0) {
                gsap.set(node, { clearProps: 'transform,opacity' });
            }

            node = node.parentElement;
        }
    });
}

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

        // Restore first: `SplitText.revert()` and the counter's original text
        // must be put back before the inline-style cleanup, so the cleanup
        // lands on the original element rather than on a part that no longer
        // exists in the DOM.
        owned.restore?.();

        // REPAIR (T1): `clearProps: 'all'` emptied `style.cssText`, which also
        // wiped styles the AUTHOR wrote — most importantly the CMS colour
        // overrides (`style="color: #..."`) that this codebase puts on every
        // heading. Clearing only the two properties this module animates keeps
        // the author's inline styles intact.
        gsap.set(owned.targets, { clearProps: 'transform,opacity' });
        owned.trigger?.kill();
    }

    // Reverting the media context removes every desktop-only listener and
    // restores the inline styles those primitives wrote (grid → flex, and so
    // on). Without this the mobile layout would keep the desktop treatment.
    mediaContext?.revert();
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

/** True when the element itself can receive keyboard focus. */
function isFocusable(element: Element): boolean {
    return element.matches(FOCUSABLE_SELECTOR);
}

/**
 * Remove the targets that must never carry a reveal's hidden start state.
 *
 * A focusable element is always removed: fading a link or a button out is
 * never what the caller meant, and it strands the control. `skipFocusable`
 * extends the same rule to a wrapper whose DESCENDANTS are focusable, which is
 * the case that actually bites in a form.
 */
function withoutFocusable(targets: Element[], skipDescendants: boolean): Element[] {
    return targets.filter((target) => {
        if (isFocusable(target)) {
            return false;
        }

        if (skipDescendants && containsFocusable(target)) {
            return false;
        }

        return true;
    });
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
function trackTrigger(
    trigger: ReturnType<typeof ScrollTrigger.create> | null,
    targets: Element[],
    restore?: () => void,
): void {
    ownedTriggers.push({ trigger, targets, restore });
}

/** The module's single media context, created on first desktop-only use. */
function getMediaContext(): ReturnType<typeof gsap.matchMedia> {
    if (!mediaContext) {
        mediaContext = gsap.matchMedia();
    }

    return mediaContext;
}

/** Random float in `[min, max]`. Used only for decorative, non-deterministic motion. */
function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
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
    const animated = withoutFocusable(
        opts.protectLcp === true
            ? withoutProtected(childrenOf(targets), protectedTargets)
            : withoutProtected(targets, protectedTargets),
        opts.skipFocusable === true,
    );

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
    const animated = withoutFocusable(
        withoutProtected(childrenOf(targets, opts.selector), protectedTargets),
        opts.skipFocusable === true,
    );

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

/* -------------------------------------------------------------------------- */
/* Decision 10 — the wider vocabulary                                         */
/* -------------------------------------------------------------------------- */
/*                                                                            */
/* Everything above was built for seven blocks of one landing page. These     */
/* eight primitives are what the whole Acuario theme composes from. They      */
/* share the guarantees of the originals: no-ops under reduced motion,        */
/* no-ops before `initMotion()`, transform/opacity only (plus `textContent`   */
/* for the counter), and full teardown on re-init.                            */
/* -------------------------------------------------------------------------- */

/**
 * Options for {@link countUp}.
 */
export interface CountUpOptions {
    /** Target value. Falls back to the element's `data-count-to` attribute. */
    to?: number;
    /** Starting value. Default `0`. */
    from?: number;
    /** Seconds. Default `1.8`. */
    duration?: number;
    /** Decimal places. Default `0`. */
    decimals?: number;
    /** Text written before the number. Default `''`. */
    prefix?: string;
    /** Text written after the number. Default `''`. */
    suffix?: string;
    /**
     * Group the thousands with the locale's separator: `1234` becomes `1,234`.
     *
     * WHY: a price above a thousand renders as `1234` without it, which reads
     * as a typo next to the other prices on the page. Off by default so the
     * existing counters - step numbers, package figures - keep their exact
     * authored form.
     */
    group?: boolean;
    /** Locale used for the grouping. Default `'en-US'`. */
    locale?: string;
    /** GSAP ease string. Default `'power2.out'`. */
    ease?: string;
    /** ScrollTrigger start string. Default `'top 85%'`. */
    start?: string;
}

/**
 * Count a number up from `from` to `to` when the element scrolls into view.
 *
 * WHY the count does not start at load: a counter that resets to zero at page
 * load and only starts counting when it scrolls in is the standard pattern,
 * but the reset itself is the hazard. This implementation leaves the authored
 * text untouched until the trigger actually fires, so a number that never
 * becomes visible still shows its real value — and the same holds under
 * reduced motion and with JavaScript off.
 *
 * The authored markup MUST therefore contain the final value, not zero.
 */
export function countUp(el: MotionTarget, opts: CountUpOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const targets = resolveTargets(el);

    for (const target of targets) {
        const attributeValue = target.getAttribute('data-count-to');
        const to = opts.to ?? (attributeValue !== null ? Number(attributeValue) : Number.NaN);

        if (!Number.isFinite(to)) {
            continue;
        }

        const from = opts.from ?? 0;
        const decimals = opts.decimals ?? Number(target.getAttribute('data-count-decimals') ?? '0');
        const prefix = opts.prefix ?? target.getAttribute('data-count-prefix') ?? '';
        const suffix = opts.suffix ?? target.getAttribute('data-count-suffix') ?? '';
        const originalText = target.textContent ?? '';
        const state = { value: from };
        let tween: ReturnType<typeof gsap.to> | null = null;

        // The formatter is the same for the start value and every frame, so
        // the number never changes shape mid-count.
        const formatter = opts.group === true
            ? new Intl.NumberFormat(opts.locale ?? 'en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            })
            : null;
        const format = (value: number): string =>
            formatter === null
                ? value.toFixed(decimals)
                : formatter.format(value);

        const trigger = ScrollTrigger.create({
            trigger: target,
            start: opts.start ?? 'top 85%',
            once: true,
            onEnter: () => {
                // Write the start value BEFORE the tween begins, so the number
                // never flashes its final value for one frame.
                target.textContent = `${prefix}${format(from)}${suffix}`;

                tween = gsap.to(state, {
                    value: to,
                    duration: opts.duration ?? 1.8,
                    ease: opts.ease ?? 'power2.out',
                    onUpdate: () => {
                        target.textContent = `${prefix}${format(state.value)}${suffix}`;
                    },
                });
            },
        });

        trackTrigger(trigger, [target], () => {
            tween?.kill();
            tween = null;
            target.textContent = originalText;
        });
    }
}

/**
 * Options for {@link splitReveal}.
 */
export interface SplitRevealOptions {
    /** What to split into. Default `'words'`. */
    type?: 'words' | 'lines' | 'chars';
    /** Seconds per part. Default `0.8`. */
    duration?: number;
    /** Seconds between parts. Default `0.05`. */
    stagger?: number;
    /** Vertical travel in pixels. Default `30`. */
    y?: number;
    /** Starting rotation in degrees. Default `0`. */
    rotate?: number;
    /** GSAP ease string. Default `'power3.out'`. */
    ease?: string;
    /** ScrollTrigger start string. Default `'top 85%'`. */
    start?: string;
    /**
     * Wrap each part in an overflow-hidden box so it rises out of a mask.
     * Default `true`.
     */
    mask?: boolean;
    /**
     * Allow splitting an `h1`.
     *
     * Default `false`, and the default is deliberate: an `h1` is the prime
     * Largest Contentful Paint candidate, and `splitReveal` writes
     * `opacity: 0` on the heading's parts at load, which delays the paint of
     * the most important text on the page. Every caller that wanted a split
     * heading had to hand-roll this guard, and the hand-rolled version was
     * easy to get wrong.
     */
    allowH1?: boolean;
}

/** Split instances, so a re-registration never nests wrappers. */
const splitInstances = new WeakMap<Element, SplitText>();

/**
 * Split a heading into parts and assemble it as it enters the viewport.
 *
 * LCP WARNING: this writes `opacity: 0` on the heading's parts at load. Never
 * use it on an above-the-fold `h1` — that is exactly the regression decision 4
 * of the original helper exists to prevent. It is for section headings that
 * live below the fold.
 */
export function splitReveal(el: MotionTarget, opts: SplitRevealOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const targets = resolveTargets(el);

    for (const target of targets) {
        // Decision 4 / S8: an `h1` is left exactly as the stylesheet draws it.
        // Splitting it would write `opacity: 0` on its parts at load and delay
        // the paint of the Largest Contentful Paint element.
        if (target.tagName === 'H1' && opts.allowH1 !== true) {
            continue;
        }

        // Re-splitting an already-split element would nest wrappers and double
        // the travel, so the previous instance is undone first.
        splitInstances.get(target)?.revert();
        splitInstances.delete(target);

        const type = opts.type ?? 'words';
        // `mask` takes the same granularity as the split itself: a masked word
        // rises out of its own box, a masked line out of its line box.
        const mask = opts.mask === false ? undefined : type;
        const split = SplitText.create(target, mask ? { type, mask } : { type });
        const parts = type === 'lines' ? split.lines : type === 'chars' ? split.chars : split.words;

        if (!parts || parts.length === 0) {
            split.revert();
            continue;
        }

        splitInstances.set(target, split);

        const tween = gsap.from(parts, {
            opacity: 0,
            y: opts.y ?? 30,
            rotate: opts.rotate ?? 0,
            duration: opts.duration ?? 0.8,
            ease: opts.ease ?? 'power3.out',
            stagger: opts.stagger ?? 0.05,
        });

        const trigger = createRevealTrigger(tween, target, opts.start ?? 'top 85%');
        trackTrigger(trigger, [target], () => {
            split.revert();
            splitInstances.delete(target);
        });
    }
}

/**
 * Options for {@link zoomImage}.
 */
export interface ZoomImageOptions {
    /** Starting scale. Default `1.08`. */
    from?: number;
    /** Ending scale. Default `1`. */
    to?: number;
    /** Seconds the zoom takes to cross its travel. Default `1`. */
    duration?: number;
    /** GSAP ease string. Default `'none'` (a scrubbed zoom must track the scroll). */
    ease?: string;
    /** ScrollTrigger start string. Default `'top bottom'`. */
    start?: string;
    /** ScrollTrigger end string. Default `'bottom top'`. */
    end?: string;
    /** Scrub smoothing in seconds. Default `true` (locked to scroll). */
    scrub?: number | boolean;
    /** Element whose scroll position drives the zoom. Defaults to the image's parent. */
    trigger?: MotionTarget;
}

/**
 * A slow, scroll-driven zoom on an image.
 *
 * The image's parent must clip (`overflow: hidden`), otherwise the zoom simply
 * scales past the edge. GSAP owns the image's whole `transform` here: a
 * stylesheet `:hover` scale on the same element would be a second owner of one
 * transform, and the two would fight.
 */
export function zoomImage(el: MotionTarget, opts: ZoomImageOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const images = resolveTargets(el);

    for (const image of images) {
        const tween = gsap.fromTo(
            image,
            { scale: opts.from ?? 1.08 },
            {
                scale: opts.to ?? 1,
                duration: opts.duration ?? 1,
                ease: opts.ease ?? 'none',
            },
        );

        const trigger = ScrollTrigger.create({
            animation: tween,
            trigger: resolveScrollTarget(image, opts.trigger),
            start: opts.start ?? 'top bottom',
            end: opts.end ?? 'bottom top',
            scrub: opts.scrub ?? true,
        });

        trackTrigger(trigger, [image]);
    }
}

/**
 * Options for {@link hoverDepth}.
 */
export interface HoverDepthOptions {
    /** Maximum tilt in degrees on each axis. Default `8`. */
    maxTilt?: number;
    /** Lift in pixels while hovered. Default `-6`. */
    lift?: number;
    /**
     * Scale while hovered.
     *
     * OPTIONAL, and off by default. The scale channel is the one that cannot
     * coexist with another owner of the same transform: `parallaxLayer` and
     * `zoomImage` rely on a coverage scale (the `scale >= 1 + 2*(distance/100)`
     * rule) that lives in the CSS `scale` property, and GSAP folds it into the
     * matrix it caches. A `hoverDepth` that also writes `scale` overwrites that
     * coverage on hover and resets it to 1 on leave, which uncovers the frame
     * edge mid-scroll.
     *
     * Leaving it off makes `hoverDepth` a tilt-and-lift effect, which composes
     * with a parallax or a zoom on the same element. Pass a value only when
     * that element has no other scale owner.
     */
    scale?: number;
    /** Seconds the pointer follows. Default `0.4`. */
    duration?: number;
    /** GSAP ease string. Default `'power2.out'`. */
    ease?: string;
    /** Perspective in pixels applied to the card. Default `900`. */
    perspective?: number;
}

/**
 * Pointer-driven tilt and lift on a card.
 *
 * DESKTOP ONLY, and deliberately so: the effect needs a hover-capable pointer.
 * On touch it would fire on tap and leave the card tilted under the user's
 * finger, which reads as a bug. The media context removes the listeners and
 * restores the inline styles the moment the pointer stops qualifying, so the
 * mobile layout is untouched.
 *
 * `prefersReducedMotion()` is re-read at event time, not at setup, so a
 * mid-session change of the OS setting stops the effect immediately.
 */
export function hoverDepth(el: MotionTarget, opts: HoverDepthOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const cards = resolveTargets(el);

    if (cards.length === 0) {
        return;
    }

    const maxTilt = opts.maxTilt ?? 8;
    const lift = opts.lift ?? -6;
    const duration = opts.duration ?? 0.4;
    const ease = opts.ease ?? 'power2.out';
    const perspective = opts.perspective ?? 900;

    // The scale channel is opt-in (see `HoverDepthOptions.scale`). Without it
    // the effect is a tilt and a lift, which composes with a parallax or a
    // zoom on the same element.
    const wantsScale = opts.scale !== undefined && opts.scale !== 1;

    getMediaContext().add('(hover: hover) and (pointer: fine)', () => {
        for (const card of cards) {
            // `pointermove` lives on the global event handlers map, which is
            // only reachable through `HTMLElement`.
            const target = card as HTMLElement;

            gsap.set(target, { transformPerspective: perspective, transformOrigin: 'center' });

            const rotateX = gsap.quickTo(target, 'rotationX', { duration, ease });
            const rotateY = gsap.quickTo(target, 'rotationY', { duration, ease });
            const moveY = gsap.quickTo(target, 'y', { duration, ease });
            const moveScale = wantsScale
                ? gsap.quickTo(target, 'scale', { duration, ease })
                : null;

            const onMove = (event: PointerEvent): void => {
                if (prefersReducedMotion()) {
                    return;
                }

                const rect = card.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) {
                    return;
                }

                const offsetX = (event.clientX - rect.left) / rect.width - 0.5;
                const offsetY = (event.clientY - rect.top) / rect.height - 0.5;

                rotateY(offsetX * maxTilt * 2);
                rotateX(-offsetY * maxTilt * 2);
            };

            const onEnter = (): void => {
                if (prefersReducedMotion()) {
                    return;
                }
                moveY(lift);
                moveScale?.(opts.scale as number);
            };

            const onLeave = (): void => {
                rotateX(0);
                rotateY(0);
                moveY(0);
                moveScale?.(1);
            };

            target.addEventListener('pointermove', onMove);
            target.addEventListener('pointerenter', onEnter);
            target.addEventListener('pointerleave', onLeave);

            return (): void => {
                target.removeEventListener('pointermove', onMove);
                target.removeEventListener('pointerenter', onEnter);
                target.removeEventListener('pointerleave', onLeave);
            };
        }

        return undefined;
    });
}

/**
 * Options for {@link ambientBubbles}.
 */
export interface AmbientBubblesOptions {
    /** Bubbles on a wide viewport. Default `10`. */
    count?: number;
    /** Hard cap on a narrow viewport. Default `5`. */
    maxOnMobile?: number;
    /** Smallest bubble diameter in pixels. Default `6`. */
    minSize?: number;
    /** Largest bubble diameter in pixels. Default `26`. */
    maxSize?: number;
    /** Seconds a bubble takes to rise. Default `14`. */
    duration?: number;
    /** Travel, as a percentage of the container's height. Default `120`. */
    rise?: number;
    /** Horizontal wander in pixels. Default `18`. */
    drift?: number;
    /** Bubble fill. Defaults to a translucent theme tint. */
    color?: string;
    /** Peak opacity. Default `0.35`. */
    opacity?: number;
    /**
     * Stacking order of the bubble field.
     *
     * WHY this exists: Swiper gives `.swiper-wrapper` a `z-index` of 1, so
     * bubbles appended to a swiper root end up BEHIND the slides and are never
     * seen. Inside a swiper you need a `zIndex` below the slides' own stacking
     * context, and above the background.
     */
    zIndex?: number;
}

/**
 * Drifting decorative bubbles inside a container.
 *
 * The bubbles are created here, not by a stylesheet, so they disappear with
 * the rest of the motion layer when reduced motion is on — and so no global
 * stylesheet has to be shipped to every other theme.
 *
 * The host must clip (`overflow: hidden`) for the bubbles to stay inside it.
 * The bubbles are `pointer-events: none` and `aria-hidden`, so they can never
 * intercept a click or reach a screen reader.
 */
export function ambientBubbles(container: MotionTarget, opts: AmbientBubblesOptions = {}): void {
    if (motionDisabled() || typeof document === 'undefined') {
        return;
    }

    const hosts = resolveTargets(container);

    for (const host of hosts) {
        // Re-registration would otherwise stack a second field of bubbles on
        // top of the first one.
        if (host.getAttribute('data-bubbles') === 'ready') {
            continue;
        }
        host.setAttribute('data-bubbles', 'ready');

        // The bubbles are absolutely positioned, so the host must be a
        // containing block. Only set it when the author has not.
        if (getComputedStyle(host).position === 'static') {
            (host as HTMLElement).style.position = 'relative';
        }

        const requested = opts.count ?? 10;
        const count = window.innerWidth < 768
            ? Math.min(requested, opts.maxOnMobile ?? 5)
            : requested;

        const bubbles: HTMLElement[] = [];
        const tweens: Array<ReturnType<typeof gsap.to>> = [];

        for (let index = 0; index < count; index += 1) {
            const size = randomBetween(opts.minSize ?? 6, opts.maxSize ?? 26);
            const bubble = document.createElement('span');

            bubble.setAttribute('aria-hidden', 'true');
            bubble.dataset.bubble = 'true';
            bubble.style.position = 'absolute';
            bubble.style.left = `${randomBetween(2, 96)}%`;
            bubble.style.bottom = '-12%';
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.borderRadius = '50%';
            bubble.style.pointerEvents = 'none';
            bubble.style.opacity = String(opts.opacity ?? 0.35);
            if (opts.zIndex !== undefined) {
                bubble.style.zIndex = String(opts.zIndex);
            }
            bubble.style.backgroundColor = opts.color
                ?? 'color-mix(in srgb, var(--accent-highlight-tertiary) 22%, transparent)';
            bubble.style.border = '1px solid color-mix(in srgb, var(--neutral-text-inverted) 28%, transparent)';

            host.appendChild(bubble);
            bubbles.push(bubble);
        }

        const rise = opts.rise ?? 120;
        const drift = opts.drift ?? 18;
        const duration = opts.duration ?? 14;

        for (const bubble of bubbles) {
            // The rise is measured against the CONTAINER's height, not the
            // bubble's own: `yPercent` would move a 20px bubble by 20% of 20px.
            tweens.push(
                gsap.to(bubble, {
                    y: () => -(host.clientHeight * (rise / 100)),
                    duration: duration * randomBetween(0.7, 1.3),
                    repeat: -1,
                    ease: 'none',
                    delay: -randomBetween(0, duration),
                }),
            );

            // A second tween on a DIFFERENT property — `x` against the first
            // tween's `y` — so the two never fight over one transform channel.
            tweens.push(
                gsap.to(bubble, {
                    x: randomBetween(-drift, drift),
                    duration: duration * randomBetween(0.4, 0.8),
                    repeat: -1,
                    yoyo: true,
                    ease: 'sine.inOut',
                    delay: -randomBetween(0, duration),
                }),
            );
        }

        trackTrigger(null, [], () => {
            for (const tween of tweens) {
                tween.kill();
            }
            for (const bubble of bubbles) {
                bubble.remove();
            }
            host.removeAttribute('data-bubbles');
        });
    }
}

/**
 * Options for {@link horizontalScroll}.
 */
export interface HorizontalScrollOptions {
    /**
     * The row of items to translate. Defaults to the target's first element
     * child.
     */
    track?: MotionTarget;
    /**
     * Selector picking the items inside the track. Default `'*'`.
     */
    itemSelector?: string;
    /**
     * Item width in pixels on the horizontal layout. Required when the track
     * was a grid: grid children stretch, flex children do not.
     */
    itemWidth?: number;
    /** GSAP ease string. Default `'none'`. */
    ease?: string;
    /** Seconds the translate takes to cross its travel. Default `1`. */
    duration?: number;
    /** ScrollTrigger start string. Default `'top top'`. */
    start?: string;
    /** ScrollTrigger end string. Defaults to the track's own overflow. */
    end?: string;
    /** Scrub smoothing in seconds. Default `1`. */
    scrub?: number | boolean;
    /** Pin the section while the track travels. Default `true`. */
    pin?: boolean;
    /** Viewport width from which the horizontal layout applies. Default `1024`. */
    minWidth?: number;
}

/**
 * Pin a section and travel its row of items sideways.
 *
 * DESKTOP ONLY. Below `minWidth` the row keeps its original grid layout, so
 * the mobile page is exactly as it was — which is the right trade: a sideways
 * section on a phone is a scroll trap, not a feature.
 *
 * The media context restores the grid when the viewport stops qualifying, so
 * the two layouts cannot be mixed.
 */
export function horizontalScroll(el: MotionTarget, opts: HorizontalScrollOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const targets = resolveTargets(el);

    if (targets.length === 0) {
        return;
    }

    const minWidth = opts.minWidth ?? 1024;

    getMediaContext().add(`(min-width: ${minWidth}px)`, () => {
        for (const target of targets) {
            const track = resolveTargets(opts.track)[0]
                ?? (target.firstElementChild as Element | null);

            if (!track) {
                continue;
            }

            const items = track.querySelectorAll<Element>(opts.itemSelector ?? '*');
            const itemWidth = opts.itemWidth;

            // The track's position must be measured BEFORE the transform is
            // applied, and relative to the DOCUMENT rather than the viewport:
            // the helper travels the track until its RIGHT edge reaches the
            // viewport's right edge, and a track that starts 128px to the right
            // of the viewport has 128px less to travel than one that starts at
            // x=0. Measuring `scrollWidth - innerWidth` alone leaves the last
            // card clipped past the right edge.
            const trackLeft = track.getBoundingClientRect().left + window.scrollX;
            const originalStyle = track.getAttribute('style');

            // Grid → flex. The author still owns the spacing: a Tailwind
            // `gap-*` class works in flex exactly as it does in grid.
            gsap.set(track, { display: 'flex', flexWrap: 'nowrap' });

            if (itemWidth !== undefined) {
                gsap.set(items, { flex: '0 0 auto', width: itemWidth });
            }

            const distance = (): number =>
                Math.max(0, trackLeft + track.scrollWidth - window.innerWidth);

            // Nothing to travel means nothing to pin. A pinned section with a
            // zero-length scroll range misbehaves: the pin engages and the page
            // never moves.
            //
            // The layout is restored first: the track was already flipped to
            // flex to be measurable, and a grid of three cards that fits the
            // viewport must go back to being a grid rather than staying a row
            // of 380px items.
            if (distance() <= 0) {
                if (originalStyle === null) {
                    track.removeAttribute('style');
                } else {
                    track.setAttribute('style', originalStyle);
                }
                continue;
            }

            // The travelling track must be clipped, or its items spill out of
            // the section and widen the whole page. The clip belongs to the
            // helper rather than to the caller's markup: forgetting a utility
            // class on the section is the easiest way to ship a horizontal
            // scroll that breaks the page's width.
            //
            // GSAP's media context reverts this inline style when the viewport
            // stops qualifying, so the original overflow comes back untouched.
            gsap.set(target, { overflow: 'hidden' });

            const tween = gsap.to(track, {
                x: () => -distance(),
                duration: opts.duration ?? 1,
                ease: opts.ease ?? 'none',
            });

            const trigger = ScrollTrigger.create({
                animation: tween,
                trigger: target,
                start: opts.start ?? 'top top',
                end: opts.end ?? (() => `+=${distance()}`),
                scrub: opts.scrub ?? 1,
                pin: opts.pin ?? true,
                invalidateOnRefresh: true,
            });

            trackTrigger(trigger, [track]);
        }

        return undefined;
    });
}

/**
 * Options for {@link floatLoop}.
 */
export interface FloatLoopOptions {
    /** Vertical travel in pixels. Default `10`. */
    distance?: number;
    /** Horizontal travel in pixels. Default `0`. */
    x?: number;
    /** Seconds per cycle. Default `4`. */
    duration?: number;
    /** Seconds before the loop starts. Default `0`. */
    delay?: number;
    /** GSAP ease string. Default `'sine.inOut'`. */
    ease?: string;
    /** Return to the start on every cycle. Default `true`. */
    yoyo?: boolean;
}

/**
 * A decorative element that floats gently and forever.
 *
 * For ornaments only — an illustration, a badge, a floating icon. It must not
 * carry text the user needs to read, because it never stops moving.
 */
export function floatLoop(el: MotionTarget, opts: FloatLoopOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const targets = resolveTargets(el);

    for (const target of targets) {
        const tween = gsap.to(target, {
            y: opts.distance ?? 10,
            x: opts.x ?? 0,
            duration: opts.duration ?? 4,
            delay: opts.delay ?? 0,
            ease: opts.ease ?? 'sine.inOut',
            repeat: -1,
            yoyo: opts.yoyo ?? true,
        });

        trackTrigger(null, [target], () => {
            tween.kill();
            gsap.set(target, { clearProps: 'transform' });
        });
    }
}

/**
 * Options for {@link scrollProgress}.
 */
export interface ScrollProgressOptions {
    /** Element whose scroll position drives the bar. Defaults to the bar's parent. */
    trigger?: MotionTarget;
    /** ScrollTrigger start string. Default `'top top'`. */
    start?: string;
    /** ScrollTrigger end string. Default `'bottom bottom'`. */
    end?: string;
    /** Scrub smoothing in seconds. Default `true` (locked to scroll). */
    scrub?: number | boolean;
}

/**
 * A bar whose width tracks the scroll progress of a section.
 *
 * The bar is scaled, not resized: `scaleX` with a left origin is a transform,
 * so it costs nothing per frame. The bar must be visible in its resting state
 * under reduced motion — the scale starts at zero only when motion runs.
 */
export function scrollProgress(el: MotionTarget, opts: ScrollProgressOptions = {}): void {
    if (motionDisabled()) {
        return;
    }

    const bars = resolveTargets(el);

    for (const bar of bars) {
        const tween = gsap.fromTo(
            bar,
            { scaleX: 0 },
            {
                scaleX: 1,
                transformOrigin: 'left center',
                duration: 1,
                ease: 'none',
            },
        );

        const trigger = ScrollTrigger.create({
            animation: tween,
            trigger: resolveScrollTarget(bar, opts.trigger),
            start: opts.start ?? 'top top',
            end: opts.end ?? 'bottom bottom',
            scrub: opts.scrub ?? true,
        });

        trackTrigger(trigger, [bar]);
    }
}