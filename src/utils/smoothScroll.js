/**
 * requestAnimationFrame-basierter Smooth-Scroll für ein ScrollView-Ref -
 * scrollTo({animated: true}) läuft plattformabhängig (kein garantierter
 * Wert für Dauer/Kurve), deshalb hier eine eigene, feste Ease-Out-Animation
 * mit genau kontrollierter Dauer. Ruft `onUpdate(y)` bei jedem Frame auf,
 * damit ein extern gehaltener scrollY-Ref (z.B. für einen parallel
 * laufenden Autoscroll-Intervall) währenddessen synchron bleibt.
 */
export function animateScrollTo(scrollRef, fromY, toY, durationMs, onUpdate) {
  const delta = toY - fromY;
  if (delta === 0) return;

  const startTime = Date.now();

  function tick() {
    const elapsed = Date.now() - startTime;
    const t = Math.min(1, elapsed / durationMs);
    const eased = 1 - Math.pow(1 - t, 3); // Ease-Out-Cubic - schnell los, sanft ausklingend
    const y = fromY + delta * eased;

    scrollRef.current?.scrollTo({ y, animated: false });
    if (onUpdate) onUpdate(y);

    if (t < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

// Gleitbewegung statt eines abrupten Sprungs - Dauer bewusst auf halbe
// Geschwindigkeit verlängert (600ms statt ursprünglich 300ms), damit das
// Auge dem Sprung noch gemütlicher folgen kann.
export const QUARTER_PAGE_SCROLL_DURATION_MS = 600;
export const QUARTER_PAGE_FRACTION = 0.25;
