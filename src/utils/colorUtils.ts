// Utility to get resolved CSS custom property values for canvas operations
export function getResolvedCSSColor(cssVariable: string): string {
  if (typeof window === 'undefined') return '#8b5cf6'; // Fallback for SSR
  
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);
  
  // Extract the variable name (remove 'var(' and ')')
  const variableName = cssVariable.replace(/var\(([^)]+)\)/, '$1');
  
  // Get the HSL values from CSS
  const hslValues = computedStyle.getPropertyValue(variableName).trim();
  
  if (hslValues) {
    return `hsl(${hslValues})`;
  }
  
  // Fallback colors based on common variable names
  const fallbacks: Record<string, string> = {
    '--primary': 'hsl(280, 100%, 70%)',
    '--primary-glow': 'hsl(280, 100%, 80%)',
    '--accent': 'hsl(315, 100%, 65%)',
    '--foreground': 'hsl(280, 15%, 95%)',
  };
  
  return fallbacks[variableName] || '#8b5cf6';
}

// Create color with alpha for canvas operations
export function createColorWithAlpha(baseColor: string, alpha: number): string {
  // If it's already an HSL color
  if (baseColor.startsWith('hsl(')) {
    return baseColor.replace('hsl(', `hsla(`).replace(')', `, ${alpha})`);
  }
  
  // If it's a hex color
  if (baseColor.startsWith('#')) {
    const hex = baseColor.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  return baseColor;
}