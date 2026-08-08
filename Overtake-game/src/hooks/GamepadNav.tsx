import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "../utils/cn";

/**
 * Unified gamepad + keyboard navigation for menus, settings, pause and
 * results. Components register focusable items; the provider moves focus
 * with the d-pad / left stick / arrow keys, confirms with A / Enter and
 * goes back with B / Escape. Bumper buttons LB (4) and RB (5) or Q / E
 * cycle tabs in Settings and car/track items in Garage/Event.
 */

type NavRole = "button" | "slider" | "toggle";

interface NavItem {
  id: string;
  el: HTMLElement;
  role: NavRole;
}

interface NavApi {
  register: (id: string, el: HTMLElement, role: NavRole) => void;
  unregister: (id: string) => void;
  activeId: string | null;
  setActive: (id: string | null) => void;
  setEnabled: (b: boolean) => void;
  setBackHandler: (fn: (() => void) | null) => void;
  setBumperHandler: (fn: ((dir: "left" | "right") => void) | null) => void;
  isPad: boolean;
  hasFocus: boolean;
}

const Ctx = createContext<NavApi>({
  register: () => {},
  unregister: () => {},
  activeId: null,
  setActive: () => {},
  setEnabled: () => {},
  setBackHandler: () => {},
  setBumperHandler: () => {},
  isPad: false,
  hasFocus: false,
});

export function useNav(): NavApi {
  return useContext(Ctx);
}

/** Registers a focusable element and mirrors focus from the provider. */
export function useNavItem(id: string, role: NavRole) {
  const { register, unregister, activeId, setActive } = useNav();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!id || !ref.current) return;
    register(id, ref.current, role);
    return () => unregister(id);
  }, [id, role, register, unregister]);

  useEffect(() => {
    if (activeId === id && ref.current) ref.current.focus();
  }, [activeId, id]);

  return { ref, isActive: activeId === id, activate: () => setActive(id) };
}

export function NavProvider({ children }: { children: ReactNode }) {
  const itemsRef = useRef<Map<string, NavItem>>(new Map());
  const orderRef = useRef<string[]>([]);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const [enabled, setEnabledState] = useState(false);
  const enabledRef = useRef(false);
  const backRef = useRef<(() => void) | null>(null);
  const bumperRef = useRef<((dir: "left" | "right") => void) | null>(null);
  const [isPad, setIsPad] = useState(false);
  const padRef = useRef(false);
  const prevDir = useRef({
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    lb: false,
    rb: false,
  });
  const lastMove = useRef(0);

  const setActive = useCallback((id: string | null) => {
    activeIdRef.current = id;
    setActiveIdState(id);
  }, []);

  const setEnabled = useCallback((b: boolean) => {
    enabledRef.current = b;
    setEnabledState(b);
    if (!b) setActive(null);
  }, [setActive]);

  const setBackHandler = useCallback((fn: (() => void) | null) => {
    backRef.current = fn;
  }, []);

  const setBumperHandler = useCallback((fn: ((dir: "left" | "right") => void) | null) => {
    bumperRef.current = fn;
  }, []);

  const register = useCallback((id: string, el: HTMLElement, role: NavRole) => {
    if (!itemsRef.current.has(id)) orderRef.current.push(id);
    itemsRef.current.set(id, { id, el, role });
    el.dataset.navRole = role;
    el.dataset.nav = "true";
    el.setAttribute("aria-label", el.getAttribute("aria-label") ?? el.textContent ?? id);
  }, []);

  const unregister = useCallback((id: string) => {
    itemsRef.current.delete(id);
    orderRef.current = orderRef.current.filter((x) => x !== id);
    if (activeIdRef.current === id) setActive(null);
  }, [setActive]);

  /** Move to the nearest registered item in a direction (grid-aware). */
  const move = useCallback((dir: "up" | "down" | "left" | "right") => {
    const items = orderRef.current
      .map((id) => itemsRef.current.get(id))
      .filter((x): x is NavItem => !!x);
    if (!items.length) return;
    const from = activeIdRef.current ? itemsRef.current.get(activeIdRef.current)?.el : null;
    const activeEl = from ?? (document.activeElement as HTMLElement | null);
    const fr = activeEl?.getBoundingClientRect() ?? {
      left: innerWidth / 2, right: innerWidth / 2, top: innerHeight / 2, bottom: innerHeight / 2, width: 0, height: 0,
    };
    const cx = (fr.left + fr.right) / 2;
    const cy = (fr.top + fr.bottom) / 2;
    let best: NavItem | null = null;
    let bestScore = Infinity;
    for (const it of items) {
      if (activeEl && it.el === activeEl) continue;
      const r = it.el.getBoundingClientRect();
      const tx = (r.left + r.right) / 2;
      const ty = (r.top + r.bottom) / 2;
      const dx = tx - cx;
      const dy = ty - cy;
      let ok = false;
      switch (dir) {
        case "up": ok = dy < -4 && Math.abs(dx) < Math.max(70, (fr.width + r.width) / 2 + 50); break;
        case "down": ok = dy > 4 && Math.abs(dx) < Math.max(70, (fr.width + r.width) / 2 + 50); break;
        case "left": ok = dx < -4 && Math.abs(dy) < Math.max(60, (fr.height + r.height) / 2 + 40); break;
        case "right": ok = dx > 4 && Math.abs(dy) < Math.max(60, (fr.height + r.height) / 2 + 40); break;
      }
      if (!ok) continue;
      const score = dx * dx + dy * dy;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) {
      setActive(best.id);
      best.el.focus();
    }
  }, [setActive]);

  const activate = useCallback(() => {
    const id = activeIdRef.current;
    const it = id ? itemsRef.current.get(id) : null;
    if (it) it.el.click();
  }, []);

  const back = useCallback(() => {
    backRef.current?.();
  }, []);

  const triggerBumper = useCallback((dir: "left" | "right") => {
    bumperRef.current?.(dir);
  }, []);

  // gamepad poll loop (only acts while a nav layer is enabled)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!enabledRef.current) return;
      let pad: Gamepad | null = null;
      try {
        const gps = navigator.getGamepads?.();
        for (const g of gps ?? []) if (g && g.connected) { pad = g; break; }
      } catch { /* ignore */ }
      if (!!pad !== padRef.current) {
        padRef.current = !!pad;
        setIsPad(!!pad);
      }
      if (!pad) return;
      const b = (n: number) => n < pad.buttons.length && pad.buttons[n].pressed;
      const ax = (n: number) => {
        if (n >= pad.axes.length) return 0;
        const v = pad.axes[n];
        return Math.abs(v) < 0.5 ? 0 : v;
      };
      const up = b(12) || ax(1) < -0.5;
      const down = b(13) || ax(1) > 0.5;
      const left = b(14) || ax(0) < -0.5;
      const right = b(15) || ax(0) > 0.5;
      const a = b(0);
      const backBtn = b(1);
      const lb = b(4); // LB / L1
      const rb = b(5); // RB / R1
      const stick = Math.max(Math.abs(ax(0)), Math.abs(ax(1)));
      const now = performance.now();
      const repeat = stick > 0.5 ? now - lastMove.current > 240 : false;
      const edge = prevDir.current;

      const act = (d: "up" | "down" | "left" | "right") => {
        // sliders/toggles consume left/right natively
        const active = activeIdRef.current ? itemsRef.current.get(activeIdRef.current)?.el : null;
        const role = active?.dataset.navRole;
        if ((d === "left" || d === "right") && (role === "slider" || role === "toggle")) {
          active?.dispatchEvent(new KeyboardEvent("keydown", { key: d === "left" ? "ArrowLeft" : "ArrowRight", bubbles: true }));
          lastMove.current = now;
          return;
        }
        move(d);
        lastMove.current = now;
      };

      if (up && !edge.up) act("up");
      else if (up && edge.up && repeat) act("up");
      if (down && !edge.down) act("down");
      else if (down && edge.down && repeat) act("down");
      if (left && !edge.left) act("left");
      else if (left && edge.left && repeat) act("left");
      if (right && !edge.right) act("right");
      else if (right && edge.right && repeat) act("right");
      if (a && !edge.a) activate();
      if (backBtn && !edge.b) back();
      if (lb && !edge.lb) triggerBumper("left");
      if (rb && !edge.rb) triggerBumper("right");
      prevDir.current = { up, down, left, right, a, b: backBtn, lb, rb };
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [move, activate, back, triggerBumper]);

  // keyboard arrow / tab navigation while a nav layer is active
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!enabledRef.current) return;
      const active = document.activeElement as HTMLElement | null;
      const role = active?.dataset.navRole;
      const map: Record<string, "up" | "down" | "left" | "right"> = {
        ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      };
      const dir = map[e.key];
      if (dir) {
        if (role === "slider") return; // native range handling
        if ((dir === "left" || dir === "right") && role === "toggle") return;
        e.preventDefault();
        move(dir);
        return;
      }
      if (e.key === "PageUp" || (e.key === "q" && !active?.tagName.match(/INPUT|TEXTAREA/i))) {
        e.preventDefault();
        triggerBumper("left");
      }
      if (e.key === "PageDown" || (e.key === "e" && !active?.tagName.match(/INPUT|TEXTAREA/i))) {
        e.preventDefault();
        triggerBumper("right");
      }
      if ((e.key === "Enter" || e.key === " ") && active?.dataset.nav) {
        e.preventDefault();
        active.click();
      }
      if (e.key === "Escape") back();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [move, back, triggerBumper]);

  const value = useMemo<NavApi>(
    () => ({
      register, unregister, activeId, setActive, setEnabled, setBackHandler, setBumperHandler,
      isPad, hasFocus: enabled,
    }),
    [register, unregister, activeId, setActive, setEnabled, setBackHandler, setBumperHandler, isPad, enabled],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Wrapper that enables navigation and wires the B / Escape back action and LB/RB bumpers. */
export function NavSurface({
  onBack,
  onBumper,
  children,
}: {
  onBack?: () => void;
  onBumper?: (dir: "left" | "right") => void;
  children: ReactNode;
}) {
  const { setEnabled, setBackHandler, setBumperHandler } = useNav();
  useEffect(() => {
    setEnabled(true);
    setBackHandler(onBack ?? null);
    setBumperHandler(onBumper ?? null);
    return () => {
      setEnabled(false);
      setBackHandler(null);
      setBumperHandler(null);
    };
  }, [setEnabled, setBackHandler, setBumperHandler, onBack, onBumper]);
  return <>{children}</>;
}

/** A focusable button (d-pad / arrows move to it, A / Enter activates). */
export function NavButton({
  id,
  role = "button",
  className,
  activeClassName,
  onClick,
  children,
  ...rest
}: {
  id: string;
  role?: NavRole;
  className?: string;
  activeClassName?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "id" | "className" | "onClick">) {
  const { ref, isActive } = useNavItem(id, role);
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={cn(className, isActive && (activeClassName ?? "nav-active"))}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}
