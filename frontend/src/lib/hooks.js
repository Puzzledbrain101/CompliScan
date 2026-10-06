import { useEffect, useState } from 'react';

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function useReducedMotion() {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

// Recharts draws SVG attributes, so read the theme's CSS variables as values
// and re-read them when the colour scheme changes
const CHART_TOKENS = ['--accent', '--bad', '--grid', '--text-3', '--surface'];

export function useChartColors() {
  const dark = useMediaQuery('(prefers-color-scheme: dark)');
  const [colors, setColors] = useState({});
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    setColors(Object.fromEntries(
      CHART_TOKENS.map(token => [token.slice(2), style.getPropertyValue(token).trim()])
    ));
  }, [dark]);
  return colors;
}
