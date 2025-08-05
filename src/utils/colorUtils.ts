// Utility to get resolved CSS custom property values for canvas operations
export function getResolvedCSSColor(cssVariable: string): string {
  if (typeof window === 'undefined') return '#8b5cf6'; // Fallback for SSR
  
  // Handle 'var()' wrapped variables
  const variableName = cssVariable.includes('var(') 
    ? cssVariable.replace(/var\(([^)]+)\)/, '$1')
    : cssVariable;
  
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);
  
  // Get the HSL values from CSS
  const hslValues = computedStyle.getPropertyValue(variableName).trim();
  
  if (hslValues) {
    return `hsl(${hslValues})`;
  }
  
  // Fallback colors based on common variable names
  const fallbacks: Record<string, string> = {
    '--primary': '#a855f7',
    '--primary-glow': '#c084fc', 
    '--accent': '#e879f9',
    '--foreground': '#f3e8ff',
  };
  
  return fallbacks[variableName] || '#a855f7';
}

// Create color with alpha for canvas operations  
export function createColorWithAlpha(baseColor: string, alpha: number): string {
  // Convert to hex if it's HSL
  if (baseColor.startsWith('hsl(')) {
    // For now, return a simple rgba fallback
    return `rgba(168, 85, 247, ${alpha})`; // Purple color
  }
  
  // If it's a hex color
  if (baseColor.startsWith('#')) {
    const hex = baseColor.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  
  // Default purple with alpha
  return `rgba(168, 85, 247, ${alpha})`;
}