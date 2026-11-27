import React, { useState } from 'react';
import {
  Sparkles,
  BarChart2,
  LayoutGrid,
  Clock,
  Bookmark,
  BookOpen,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
  ArrowUpRight,
  ChevronRight,
  Database,
  ShieldCheck,
  Building2,
  Sun,
  Moon,
  Search,
  BookMarked,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SriaLogo } from '../brand/SriaLogo';
import { Badge } from '../ui/Badge';
import { Popover } from '../ui/Popover';
import { ApiClient } from '../../services/api-client';
import type { SystemHealthStatus } from '../../services/api-client';
import { DemoModeBanner } from './DemoModeBanner';
import type { ThemeMode } from '../../hooks/useTheme';

export type AppNavView = 'studio' | 'canvas' | 'dashboards';

export interface NavDashboardItem {
  id: string;
  title: string;
  isStale?: boolean;
}

interface AppShellProps {
  children: React.ReactNode;
  currentView: AppNavView;
  onNavigate: (view: AppNavView) => void;
  activeTitle?: string;
  savedDashboards?: NavDashboardItem[];
  recentDashboards?: NavDashboardItem[];
  activeDashboardId?: string | null;
  onOpenSavedDashboard?: (id: string) => void;
  onSelectRecentDashboard?: (id: string) => void;
  onOpenSystemSettings?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenMetricCatalog?: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  systemStatus?: SystemHealthStatus | null;
  dataSourceSummary?: {
    sourceType: 'mock' | 's4hana';
    sourceSystem: string;
    isSynthetic: boolean;
  };
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  currentView,
  onNavigate,
  activeTitle,
  savedDashboards = [],
  recentDashboards = [],
  activeDashboardId,
  onOpenSavedDashboard,
  onSelectRecentDashboard,
  onOpenSystemSettings,
  onOpenCommandPalette,
  onOpenMetricCatalog,
  theme,
  onToggleTheme,
  systemStatus,
  dataSourceSummary,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isMock = (dataSourceSummary?.isSynthetic ?? systemStatus?.isSynthetic) ?? true;
  const backendUp = systemStatus?.backendReachable ?? false;
  const demoMode = ApiClient.isDemoMode();
  const tier = systemStatus?.environmentTier ?? 'unknown';
  const tierTone =
    tier === 'production' ? 'positive' : tier === 'pilot' ? 'info' : tier === 'unknown' ? 'neutral' : 'warning';

  const handleNav = (view: AppNavView) => {
    onNavigate(view);
    setMobileOpen(false);
  };

  return (
    <div className="app-shell">
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Navigation Sidebar */}
      <aside
        className={clsx(
          'sidebar',
          collapsed && 'sidebar--collapsed',
          mobileOpen && 'sidebar--mobile-open'
        )}
        aria-label="Primary navigation"
      >
        <div className="sidebar__header">
          <SriaLogo collapsed={collapsed} variant="dark" />
          {!collapsed && (
            <button
              type="button"
              className="sidebar__collapse-btn"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={15} />
            </button>
          )}
          {mobileOpen && (
            <button
              type="button"
              className="sidebar__collapse-btn"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {collapsed && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
            <button
              type="button"
              className="sidebar__collapse-btn"
              onClick={() => setCollapsed(false)}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen size={15} />
            </button>
          </div>
        )}

        <nav className="sidebar__nav">
          <div>
            {!collapsed && <div className="sidebar__section-label">Workspace</div>}
            <button
              type="button"
              onClick={() => handleNav('studio')}
              className={clsx(
                'sidebar__item',
                currentView === 'studio' && 'sidebar__item--active'
              )}
              title="Create Dashboard"
            >
              <Sparkles size={16} className="sidebar__item-icon" />
              {!collapsed && <span className="sidebar__item-label">Create Dashboard</span>}
            </button>
            <button
              type="button"
              onClick={() => handleNav('canvas')}
              className={clsx(
                'sidebar__item',
                currentView === 'canvas' && 'sidebar__item--active'
              )}
              title="Active Dashboard"
            >
              <BarChart2 size={16} className="sidebar__item-icon" />
              {!collapsed && <span className="sidebar__item-label">Active Dashboard</span>}
            </button>
            <button
              type="button"
              onClick={() => handleNav('dashboards')}
              className={clsx(
                'sidebar__item',
                currentView === 'dashboards' && 'sidebar__item--active'
              )}
              title="My Dashboards"
            >
              <LayoutGrid size={16} className="sidebar__item-icon" />
              {!collapsed && (
                <>
                  <span className="sidebar__item-label">My Dashboards</span>
                  {savedDashboards.length > 0 && (
                    <span className="sidebar__badge">{savedDashboards.length}</span>
                  )}
                </>
              )}
            </button>
          </div>

          {!collapsed && recentDashboards.length > 0 && (
            <div>
              <div className="sidebar__section-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Clock size={11} />
                <span>Recent</span>
              </div>
              {recentDashboards.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectRecentDashboard?.(item.id);
                    setMobileOpen(false);
                  }}
                  className={clsx(
                    'sidebar__subitem',
                    activeDashboardId === item.id && currentView === 'canvas' && 'sidebar__subitem--active'
                  )}
                  title={item.title}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background:
                        activeDashboardId === item.id ? 'var(--sunflower)' : 'rgba(255,255,255,0.28)',
                      flexShrink: 0,
                    }}
                  />
                  <span className="sidebar__item-label">{item.title}</span>
                </button>
              ))}
            </div>
          )}

          {!collapsed && savedDashboards.length > 0 && (
            <div>
              <div className="sidebar__section-label" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Bookmark size={11} />
                <span>Saved</span>
              </div>
              {savedDashboards.slice(0, 4).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onOpenSavedDashboard?.(item.id);
                    setMobileOpen(false);
                  }}
                  className={clsx(
                    'sidebar__subitem',
                    activeDashboardId === item.id && currentView === 'canvas' && 'sidebar__subitem--active'
                  )}
                  title={item.title}
                >
                  <span className="sidebar__item-label">{item.title}</span>
                </button>
              ))}
            </div>
          )}

          <div>
            {!collapsed && <div className="sidebar__section-label">Platform</div>}
            <button
              type="button"
              onClick={() => {
                onOpenSystemSettings?.();
                setMobileOpen(false);
              }}
              className="sidebar__item"
              title="Metric Catalog & Settings"
            >
              <SlidersHorizontal size={16} className="sidebar__item-icon" />
              {!collapsed && <span className="sidebar__item-label">Catalog &amp; Settings</span>}
            </button>
            {onOpenMetricCatalog && (
              <button
                type="button"
                onClick={() => {
                  onOpenMetricCatalog();
                  setMobileOpen(false);
                }}
                className="sidebar__item"
                title="Metric catalog & glossary"
                aria-haspopup="dialog"
              >
                <BookMarked size={16} className="sidebar__item-icon" />
                {!collapsed && <span className="sidebar__item-label">Metric catalog</span>}
              </button>
            )}
            <a
              href="/ARCHITECTURE-AND-FLOW-GUIDE.html"
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar__item"
              title="Architecture Guide"
            >
              <BookOpen size={16} className="sidebar__item-icon" />
              {!collapsed && (
                <>
                  <span className="sidebar__item-label">Architecture Guide</span>
                  <ArrowUpRight size={13} style={{ opacity: 0.55, flexShrink: 0 }} />
                </>
              )}
            </a>
          </div>
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__profile">
            <div className="sidebar__avatar" title="finance_analyst">
              FA
            </div>
            {!collapsed && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#FAF5E8',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  finance_analyst
                </div>
                <div
                  style={{
                    fontSize: 10.5,
                    color: 'var(--nav-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  ORG_ACME_PILOT
                </div>
              </div>
            )}
          </div>

          {!collapsed && (
            <div className="sidebar__status-row">
              <span className={clsx('status-dot', backendUp ? 'status-dot--up' : 'status-dot--warn')} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {backendUp ? 'CAP Runtime Connected' : demoMode ? 'Demo Mode (local)' : 'Backend Unreachable'}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className={clsx('app-main', collapsed && 'app-main--collapsed')}>
        {demoMode && <DemoModeBanner />}
        <header className="topbar">
          <div className="topbar__left">
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={17} />
            </button>

            <div className="topbar__breadcrumb">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Building2 size={13} />
                <span>ACME Pilot</span>
              </span>
              <ChevronRight size={13} />
              <span className="topbar__crumb-current">
                {currentView === 'studio'
                  ? 'Create Dashboard Studio'
                  : currentView === 'dashboards'
                  ? 'My Dashboards'
                  : activeTitle || 'Active Dashboard'}
              </span>
            </div>
          </div>

          <div className="topbar__right">
            <span role="status" aria-label={`Environment tier: ${tier}`} data-testid="env-tier-badge">
              <Badge tone={tierTone} dot>
                Env: {tier}
              </Badge>
            </span>
            {onOpenCommandPalette && (
              <button
                type="button"
                className="cmd-trigger"
                onClick={onOpenCommandPalette}
                title="Open Quick Command Menu (Ctrl+K)"
              >
                <Search size={13} />
                <span>Quick Jump</span>
                <span className="kbd cmd-shortcut">Ctrl+K</span>
              </button>
            )}

            {onOpenMetricCatalog && (
              <button
                type="button"
                onClick={onOpenMetricCatalog}
                className="btn btn--subtle btn--xs"
                style={{ height: 30, padding: '0 10px' }}
                title="Metric catalog & glossary"
                aria-haspopup="dialog"
              >
                <BookMarked size={13} style={{ color: 'var(--accent)' }} />
                <span>Metric catalog</span>
              </button>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              className="btn btn--secondary btn--xs"
              style={{ height: 30, padding: '0 10px' }}
              title={theme === 'light' ? 'Switch to Dark Espresso & Sunflower' : 'Switch to Warm Cream & Sunflower'}
              aria-label="Toggle color theme"
            >
              {theme === 'light' ? (
                <>
                  <Moon size={13} style={{ color: 'var(--accent)' }} />
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <Sun size={13} style={{ color: 'var(--sunflower)' }} />
                  <span>Cream</span>
                </>
              )}
            </button>

            <Popover
              wide
              trigger={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="btn btn--subtle btn--xs"
                  style={{ height: 30, padding: '0 10px' }}
                >
                  <Database size={12} style={{ color: isMock ? 'var(--warning)' : 'var(--positive)' }} />
                  <span>{isMock ? 'Mock Fixtures' : 'Live S/4HANA'}</span>
                </button>
              )}
            >
              {() => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)' }}>
                      Data Source Context
                    </span>
                    <Badge tone={isMock ? 'warning' : 'positive'} dot>
                      {isMock ? 'Mock Dev Mode' : 'Live SAP'}
                    </Badge>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: '6px 12px',
                      fontSize: 11.5,
                      color: 'var(--text-secondary)',
                      padding: 10,
                      background: 'var(--surface-subtle)',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ color: 'var(--text-tertiary)' }}>Source</span>
                    <span className="font-mono" style={{ fontSize: 11 }}>
                      {dataSourceSummary?.sourceSystem || 'SAP_SYNTHETIC_OFFLINE_FIXTURE'}
                    </span>
                    <span style={{ color: 'var(--text-tertiary)' }}>SAP Entity</span>
                    <span className="font-mono" style={{ fontSize: 11 }}>
                      I_JournalEntryItemBasic
                    </span>
                    <span style={{ color: 'var(--text-tertiary)' }}>CAP Backend</span>
                    <span>{backendUp ? 'Connected (port 4004)' : demoMode ? 'Not connected (demo mode)' : 'Unreachable'}</span>
                    <span style={{ color: 'var(--text-tertiary)' }}>Engine</span>
                    <span>Deterministic TS v1.0.0</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    <ShieldCheck size={13} style={{ color: 'var(--positive)', flexShrink: 0 }} />
                    <span>Zero LLM arithmetic · Tenant isolated</span>
                  </div>
                </div>
              )}
            </Popover>
          </div>
        </header>

        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
};
