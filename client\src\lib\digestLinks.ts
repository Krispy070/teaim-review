/**
 * Digest Preview Helper Utilities (v2.12.9)
 * 
 * Provides consistent deep-link composition for digest emails and previews,
 * ensuring users can navigate directly to relevant application sections with
 * appropriate filters and scroll positioning applied.
 */

interface DigestLinkOptions {
  projectId: string;
  page?: 'dashboard' | 'documents' | 'stages' | 'timeline' | 'meetings' | 'actions' | 'admin/audit-timeline';
  artifactId?: string;
  stageId?: string;
  focus?: string;
  filters?: {
    area?: string;
    status?: string;
    owner?: string;
    tags?: string[];
    date_from?: string;
    date_to?: string;
  };
  scrollTo?: string;
}

// Mapping of page names to actual route paths
const PAGE_ROUTES: Record<string, string> = {
  'dashboard': 'dashboard',
  'documents': 'documents',
  'library': 'documents', // Alias for documents
  'stages': 'stages/manage',
  'timeline': 'admin/audit-timeline',
  'meetings': 'meetings', 
  'actions': 'actions/kanban',
  'admin/audit-timeline': 'admin/audit-timeline'
};

/**
 * Opens a digest link with consistent filter application and scrolling
 * 
 * @param options Configuration for the link generation
 * @returns Generated URL with proper query parameters and fragments
 */
export function openDigestLink(options: DigestLinkOptions): string {
  const { 
    projectId, 
    page = 'dashboard', 
    artifactId, 
    stageId, 
    focus,
    filters = {},
    scrollTo 
  } = options;

  // Get the actual route path
  const routePath = PAGE_ROUTES[page] || page;
  
  // Construct full path using correct /projects/:projectId structure  
  const basePath = `/projects/${projectId}/${routePath}`;

  // Query parameters for filters
  const queryParams = new URLSearchParams();

  // Standard filter parameters
  if (filters.area) queryParams.set('area', filters.area);
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.owner) queryParams.set('owner', filters.owner);
  if (filters.tags && filters.tags.length) queryParams.set('tags', filters.tags.join(','));
  if (filters.date_from) queryParams.set('date_from', filters.date_from);
  if (filters.date_to) queryParams.set('date_to', filters.date_to);

  // Page-specific parameters
  if (focus) queryParams.set('focus', focus);
  if (stageId && page === 'stages') queryParams.set('stage', stageId);

  // Construct query string
  const queryString = queryParams.toString();
  const fullPath = basePath + (queryString ? `?${queryString}` : '');

  // Fragment for direct navigation
  let fragment = '';
  if (artifactId && (page === 'documents' || PAGE_ROUTES[page] === 'documents')) {
    fragment = `#artifact=${encodeURIComponent(artifactId)}`;
  } else if (scrollTo) {
    fragment = `#${scrollTo}`;
  }

  return fullPath + fragment;
}

/**
 * Helper function to generate artifact library deep links
 * Commonly used in digest emails to link directly to specific documents
 */
export function openArtifactLink(projectId: string, artifactId: string, filters?: DigestLinkOptions['filters']): string {
  return openDigestLink({
    projectId,
    page: 'documents',
    artifactId,
    filters
  });
}

/**
 * Helper function to generate stage focus links
 * Used in digest emails to link directly to specific stages
 */
export function openStageLink(projectId: string, stageId: string, filters?: DigestLinkOptions['filters']): string {
  return openDigestLink({
    projectId,
    page: 'stages',
    focus: stageId,
    stageId,
    filters
  });
}

/**
 * Helper function to generate timeline links with date filtering
 * Useful for digest emails showing recent activity
 */
export function openTimelineLink(projectId: string, dateFrom?: string, dateTo?: string): string {
  return openDigestLink({
    projectId,
    page: 'admin/audit-timeline',
    filters: {
      date_from: dateFrom,
      date_to: dateTo
    }
  });
}

/**
 * Helper function to generate filtered dashboard links
 * Used in digest previews to show specific area or status views
 */
export function openDashboardLink(projectId: string, area?: string, status?: string): string {
  return openDigestLink({
    projectId,
    page: 'dashboard',
    filters: {
      area,
      status
    }
  });
}

/**
 * Enhanced functions for digest email integration (v2.12.10)
 */

/**
 * Generate activity deep links for digest emails with appropriate filters
 * Used by digest email generation to create clickable activity chips
 */
export function openDigestActivityLink(projectId: string, activityType: 'actions' | 'risks' | 'decisions', days = 7): string {
  const now = new Date();
  const dateFrom = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
  const dateTo = now.toISOString().split('T')[0];

  switch (activityType) {
    case 'actions':
      return openDigestLink({
        projectId,
        page: 'actions',
        filters: {
          date_from: dateFrom,
          date_to: dateTo,
          status: 'pending' // Show pending actions by default
        }
      });
    
    case 'risks':
      return openDigestLink({
        projectId,
        page: 'admin/audit-timeline',
        filters: {
          date_from: dateFrom,
          date_to: dateTo
        },
        scrollTo: 'risks-section'
      });
      
    case 'decisions':
      return openDigestLink({
        projectId,
        page: 'admin/audit-timeline', 
        filters: {
          date_from: dateFrom,
          date_to: dateTo
        },
        scrollTo: 'decisions-section'
      });
      
    default:
      return openDigestLink({ projectId, page: 'dashboard' });
  }
}

/**
 * Generate overdue sign-off links for digest emails
 * Links directly to stages requiring attention
 */
export function openDigestSignoffLink(projectId: string, stageId?: string): string {
  return openDigestLink({
    projectId,
    page: 'stages',
    stageId,
    filters: {
      status: 'in_review' // Focus on stages needing sign-off
    },
    focus: stageId,
    scrollTo: stageId ? `stage-${stageId}` : 'overdue-signoffs'
  });
}

/**
 * Generate digest links for specific content areas
 * Useful for area-specific digest sections
 */
export function openDigestAreaLink(projectId: string, area: string, activityType?: 'actions' | 'risks' | 'decisions'): string {
  const basePage = activityType === 'actions' ? 'actions' : 'admin/audit-timeline';
  
  return openDigestLink({
    projectId,
    page: basePage,
    filters: {
      area,
      status: activityType === 'actions' ? 'pending' : undefined
    },
    scrollTo: activityType ? `${activityType}-area-${area.toLowerCase().replace(/\s+/g, '-')}` : undefined
  });
}

/**
 * Generate comprehensive digest summary link
 * Links to dashboard with digest-appropriate filters
 */
export function openDigestSummaryLink(projectId: string, days = 7): string {
  const now = new Date();
  const dateFrom = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
  
  return openDigestLink({
    projectId,
    page: 'dashboard',
    filters: {
      date_from: dateFrom
    },
    focus: 'recent-activity'
  });
}

/**
 * Generate server-side digest links for email templates
 * Returns the path portion only (for use with APP_BASE_URL)
 */
export function getDigestEmailPath(projectId: string, activityType: 'actions' | 'risks' | 'decisions', days = 7): string {
  const fullUrl = openDigestActivityLink(projectId, activityType, days);
  // Extract path from full URL (remove any potential protocol/domain if present)
  return fullUrl.startsWith('/') ? fullUrl.substring(1) : fullUrl.split('/').slice(3).join('/');
}

/**
 * Utility to extract digest link parameters from current URL
 * Useful for maintaining context when navigating from digest links
 */
export function parseDigestLinkParams(): DigestLinkOptions | null {
  const url = new URL(window.location.href);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const params = url.searchParams;
  const hash = url.hash;

  // Parse /projects/:projectId/... structure
  if (pathParts.length < 2 || pathParts[0] !== 'projects') {
    return null; // Not a project route
  }

  const [, projectId, ...pageParts] = pathParts;
  const page = pageParts.join('/') || 'dashboard';

  // Extract filters from query params
  const filters: DigestLinkOptions['filters'] = {};
  if (params.get('area')) filters.area = params.get('area')!;
  if (params.get('status')) filters.status = params.get('status')!;
  if (params.get('owner')) filters.owner = params.get('owner')!;
  if (params.get('tags')) filters.tags = params.get('tags')!.split(',');
  if (params.get('date_from')) filters.date_from = params.get('date_from')!;
  if (params.get('date_to')) filters.date_to = params.get('date_to')!;

  // Extract artifact ID from hash
  let artifactId;
  if (hash.startsWith('#artifact=')) {
    artifactId = decodeURIComponent(hash.substring(10));
  }

  return {
    projectId: projectId!,
    page: page as DigestLinkOptions['page'],
    artifactId,
    stageId: params.get('stage') || undefined,
    focus: params.get('focus') || undefined,
    filters,
    scrollTo: hash.startsWith('#') && !hash.startsWith('#artifact=') ? hash.substring(1) : undefined
  };
}