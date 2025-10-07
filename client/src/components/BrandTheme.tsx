import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { authFetch } from '@/lib/authFetch'

interface BrandThemeProps {
  projectId?: string | null
}

interface BrandingSettings {
  theme_color?: string
  customer_name?: string
  vendor_name?: string
  header_text?: string
  source?: 'org' | 'project'
  customer_logo_bucket?: string
  customer_logo_path?: string
  vendor_logo_bucket?: string
  vendor_logo_path?: string
}

/**
 * BrandTheme Component
 * 
 * Dynamically applies CSS custom properties based on branding settings.
 * Supports both org-level and project-level theme colors with proper fallbacks.
 * 
 * Usage:
 * - <BrandTheme /> - Uses org-level branding
 * - <BrandTheme projectId="uuid" /> - Uses project-level branding with org fallback
 */
export function BrandTheme({ projectId }: BrandThemeProps) {
  // Fetch branding settings (org or project-aware)
  const { data: branding } = useQuery<BrandingSettings>({
    queryKey: ['/api/branding/settings', projectId],
    queryFn: async () => {
      try {
        const url = projectId ? `/api/branding/settings?project_id=${projectId}` : '/api/branding/settings';
        const response = await authFetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load branding settings: ${response.status}`);
        }
        return response.json() as Promise<BrandingSettings>;
      } catch (error) {
        console.error('BrandTheme settings query error:', error);
        throw error;
      }
    },
    enabled: !!projectId, // Only run query when projectId is available
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false
  })

  useEffect(() => {
    // Apply theme colors to CSS custom properties
    const themeColor = branding?.theme_color || '#111111'
    
    // Parse hex color to HSL for CSS variables
    const hex = themeColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    
    // Convert RGB to HSL
    const rNorm = r / 255
    const gNorm = g / 255
    const bNorm = b / 255
    
    const max = Math.max(rNorm, gNorm, bNorm)
    const min = Math.min(rNorm, gNorm, bNorm)
    
    let h: number, s: number, l: number
    l = (max + min) / 2
    
    if (max === min) {
      h = s = 0 // Achromatic
    } else {
      const d = max - min
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
      
      switch (max) {
        case rNorm: h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0); break
        case gNorm: h = (bNorm - rNorm) / d + 2; break
        case bNorm: h = (rNorm - gNorm) / d + 4; break
        default: h = 0
      }
      h /= 6
    }
    
    // Convert to degrees and percentages
    const hDeg = Math.round(h * 360)
    const sPerc = Math.round(s * 100)
    const lPerc = Math.round(l * 100)
    
    // Update CSS custom properties on document root
    const root = document.documentElement
    
    // Primary brand color
    root.style.setProperty('--brand-primary', `hsl(${hDeg}, ${sPerc}%, ${lPerc}%)`)
    root.style.setProperty('--brand-primary-h', hDeg.toString())
    root.style.setProperty('--brand-primary-s', `${sPerc}%`)
    root.style.setProperty('--brand-primary-l', `${lPerc}%`)
    
    // Generate complementary shades
    root.style.setProperty('--brand-primary-50', `hsl(${hDeg}, ${sPerc}%, ${Math.min(95, lPerc + 45)}%)`)
    root.style.setProperty('--brand-primary-100', `hsl(${hDeg}, ${sPerc}%, ${Math.min(90, lPerc + 35)}%)`)
    root.style.setProperty('--brand-primary-200', `hsl(${hDeg}, ${sPerc}%, ${Math.min(80, lPerc + 25)}%)`)
    root.style.setProperty('--brand-primary-300', `hsl(${hDeg}, ${sPerc}%, ${Math.min(70, lPerc + 15)}%)`)
    root.style.setProperty('--brand-primary-400', `hsl(${hDeg}, ${sPerc}%, ${Math.min(60, lPerc + 5)}%)`)
    root.style.setProperty('--brand-primary-500', `hsl(${hDeg}, ${sPerc}%, ${lPerc}%)`)
    root.style.setProperty('--brand-primary-600', `hsl(${hDeg}, ${sPerc}%, ${Math.max(10, lPerc - 10)}%)`)
    root.style.setProperty('--brand-primary-700', `hsl(${hDeg}, ${sPerc}%, ${Math.max(5, lPerc - 20)}%)`)
    root.style.setProperty('--brand-primary-800', `hsl(${hDeg}, ${sPerc}%, ${Math.max(3, lPerc - 30)}%)`)
    root.style.setProperty('--brand-primary-900', `hsl(${hDeg}, ${sPerc}%, ${Math.max(1, lPerc - 40)}%)`)
    
    // Update shadcn/ui primary colors to match brand
    root.style.setProperty('--primary', `${hDeg} ${sPerc}% ${lPerc}%`)
    root.style.setProperty('--primary-foreground', `${hDeg} ${sPerc}% ${lPerc > 50 ? 10 : 90}%`)
    
    if (import.meta.env.DEV) {
      console.log(`🎨 Applied theme color: ${themeColor} -> HSL(${hDeg}, ${sPerc}%, ${lPerc}%)`, {
        source: branding?.source || 'org',
        projectId
      })
    }
  }, [branding?.theme_color, branding?.source, projectId])

  // This component doesn't render anything visible
  return null
}

/**
 * useBrandingSettings Hook
 * 
 * Provides access to current branding settings with proper project awareness.
 */
export function useBrandingSettings(projectId?: string | null) {
  return useQuery<BrandingSettings>({
    queryKey: ['/api/branding/settings', projectId],
    queryFn: async () => {
      try {
        const url = projectId ? `/api/branding/settings?project_id=${projectId}` : '/api/branding/settings';
        const response = await authFetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load branding settings: ${response.status}`);
        }
        return response.json() as Promise<BrandingSettings>;
      } catch (error) {
        console.error('useBrandingSettings query error:', error);
        throw error;
      }
    },
    enabled: !!projectId, // Only run query when projectId is available
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false
  })
}