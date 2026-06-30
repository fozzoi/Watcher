"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { 
  Compass, Search, Bookmark, History, Sparkles, Settings, Film, 
  ChevronLeft, ChevronRight, Sun, Moon, Monitor 
} from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
}

export default function Navigation() {
  const pathname = usePathname();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const navItems: NavItem[] = [
    { name: 'Explore', href: '/', icon: Compass },
    { name: 'Search', href: '/search', icon: Search },
    { name: 'Watchlist', href: '/watchlist', icon: Bookmark },
    { name: 'History', href: '/history', icon: History },
    { name: 'AI Recs', href: '/ai-search', icon: Sparkles },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname?.startsWith(path)) return true;
    return false;
  };

  const cycleTheme = () => {
    if (theme === 'system') setTheme('dark');
    else if (theme === 'dark') setTheme('light');
    else setTheme('system');
  };

  const getThemeIcon = () => {
    if (!mounted) return <Monitor size={18} />;
    if (theme === 'system') return <Monitor size={18} />;
    if (theme === 'dark') return <Moon size={18} />;
    return <Sun size={18} />;
  };

  const getThemeLabel = () => {
    if (!mounted) return 'System';
    if (theme === 'system') return 'System';
    if (theme === 'dark') return 'Dark';
    return 'Light';
  };

  return (
    <>
      <aside className={`sidebar glass-premium ${collapsed ? 'collapsed' : ''}`}>
        {/* Logo area */}
        <div className="sidebar-logo">
          <Film className="logo-icon" size={collapsed ? 24 : 22} />
          {!collapsed && <span className="logo-text">WATCHER</span>}
        </div>

        {/* Nav links */}
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`sidebar-link ${active ? 'active' : ''}`}
                title={collapsed ? item.name : undefined}
              >
                <Icon size={20} className="sidebar-link-icon" />
                {!collapsed && <span className="sidebar-link-text">{item.name}</span>}
                {active && <div className="sidebar-active-indicator" />}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section: theme toggle + collapse */}
        <div className="sidebar-footer">
          <button className="sidebar-link theme-toggle" onClick={cycleTheme} title={`Theme: ${getThemeLabel()}`}>
            {getThemeIcon()}
            {!collapsed && <span className="sidebar-link-text">{getThemeLabel()}</span>}
          </button>

          <button
            className="sidebar-link collapse-toggle"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            {!collapsed && <span className="sidebar-link-text">Collapse</span>}
          </button>
        </div>
      </aside>

      <style jsx global>{`
        /* ===== Sidebar ===== */
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: var(--sidebar-width);
          display: flex;
          flex-direction: column;
          padding: 24px 12px;
          z-index: 100;
          border-right: 1px solid var(--card-border);
          transition: width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          overflow: hidden;
        }

        .sidebar.collapsed {
          width: var(--sidebar-collapsed-width);
        }

        /* Adjust main content when sidebar is collapsed */
        .sidebar.collapsed ~ .main-content {
          margin-left: var(--sidebar-collapsed-width);
          width: calc(100% - var(--sidebar-collapsed-width));
        }

        /* Logo */
        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          margin-bottom: 32px;
          white-space: nowrap;
          overflow: hidden;
        }

        .logo-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 8px var(--primary-glow));
          flex-shrink: 0;
        }

        .logo-text {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 2px;
          background: linear-gradient(135deg, var(--foreground) 0%, var(--foreground-muted) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          white-space: nowrap;
        }

        /* Nav */
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
        }

        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          border-radius: var(--border-radius-sm);
          color: var(--foreground-muted);
          font-weight: 600;
          font-size: 14px;
          transition: var(--transition-smooth);
          position: relative;
          cursor: pointer;
          border: none;
          background: transparent;
          white-space: nowrap;
          overflow: hidden;
          text-align: left;
          width: 100%;
        }

        .sidebar-link:hover {
          color: var(--foreground);
          background: var(--sidebar-hover);
        }

        .sidebar-link.active {
          color: var(--foreground);
          background: rgba(229, 9, 20, 0.1);
        }

        [data-theme="light"] .sidebar-link.active {
          background: rgba(229, 9, 20, 0.08);
        }

        .sidebar-link.active .sidebar-link-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 6px var(--primary-glow));
        }

        .sidebar-link-icon {
          flex-shrink: 0;
        }

        .sidebar-link-text {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sidebar-active-indicator {
          position: absolute;
          right: 0;
          top: 15%;
          height: 70%;
          width: 3px;
          background: var(--primary);
          border-radius: 3px 0 0 3px;
          box-shadow: -2px 0 8px var(--primary);
        }

        /* Footer */
        .sidebar-footer {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding-top: 12px;
          border-top: 1px solid var(--card-border);
        }

        .theme-toggle .sidebar-link-icon,
        .collapse-toggle .sidebar-link-icon {
          color: var(--foreground-muted);
        }

        /* ===== Responsive: auto-collapse on narrow windows ===== */
        @media (max-width: 900px) {
          .sidebar {
            width: var(--sidebar-collapsed-width);
          }

          .sidebar .sidebar-link-text,
          .sidebar .logo-text {
            display: none;
          }

          .main-content {
            margin-left: var(--sidebar-collapsed-width) !important;
            width: calc(100% - var(--sidebar-collapsed-width)) !important;
          }

          .collapse-toggle {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
