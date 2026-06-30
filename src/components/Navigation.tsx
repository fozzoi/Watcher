"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Compass, Search, Bookmark, History, Sparkles, Settings, Film, Menu, X } from 'lucide-react';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<any>;
}

export default function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const navItems: NavItem[] = [
    { name: 'Explore', href: '/', icon: Compass },
    { name: 'Search', href: '/search', icon: Search },
    { name: 'Watchlist', href: '/watchlist', icon: Bookmark },
    { name: 'History', href: '/history', icon: History },
    { name: 'AI Recommendations', href: '/ai-search', icon: Sparkles },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const isActive = (path: string) => {
    if (path === '/' && pathname === '/') return true;
    if (path !== '/' && pathname?.startsWith(path)) return true;
    return false;
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="desktop-sidebar glass-premium">
        <div className="logo-container">
          <Film className="logo-icon" />
          <span className="logo-text">WATCHER</span>
        </div>
        <nav className="nav-menu">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link key={item.name} href={item.href} className={`nav-link ${active ? 'active' : ''}`}>
                <Icon size={20} className="nav-icon" />
                <span className="nav-text">{item.name}</span>
                {active && <div className="active-indicator" />}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Header / Navigation */}
      <header className="mobile-header glass">
        <div className="logo-container">
          <Film className="logo-icon" size={24} />
          <span className="logo-text">WATCHER</span>
        </div>
        <button className="menu-btn" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </header>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setIsOpen(false)}>
          <div className="mobile-drawer glass-premium" onClick={(e) => e.stopPropagation()}>
            <nav className="mobile-nav-menu">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`mobile-nav-link ${active ? 'active' : ''}`}
                    onClick={() => setIsOpen(false)}
                  >
                    <Icon size={20} className="nav-icon" />
                    <span className="nav-text">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Alternative for quick tab switching) */}
      <nav className="mobile-bottom-tabs glass">
        {navItems.slice(0, 3).map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link key={item.name} href={item.href} className={`tab-link ${active ? 'active' : ''}`}>
              <Icon size={22} />
              <span className="tab-text">{item.name}</span>
            </Link>
          );
        })}
        {/* Settings button in bottom tabs */}
        <Link href="/settings" className={`tab-link ${isActive('/settings') ? 'active' : ''}`}>
          <Settings size={22} />
          <span className="tab-text">Settings</span>
        </Link>
      </nav>

      <style jsx global>{`
        /* Sidebar styling */
        .desktop-sidebar {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: var(--sidebar-width);
          display: flex;
          flex-direction: column;
          padding: 30px 20px;
          z-index: 100;
          border-right: 1px solid var(--card-border);
        }

        .logo-container {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 45px;
          padding-left: 10px;
        }

        .logo-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 8px var(--primary-glow));
        }

        .logo-text {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 2px;
          background: linear-gradient(135deg, #fff 0%, #aaa 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .nav-menu {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 18px;
          border-radius: var(--border-radius-md);
          color: var(--foreground-muted);
          font-weight: 600;
          font-size: 15px;
          transition: var(--transition-smooth);
          position: relative;
        }

        .nav-link:hover {
          color: #fff;
          background: rgba(255, 255, 255, 0.04);
          transform: translateX(4px);
        }

        .nav-link.active {
          color: #fff;
          background: rgba(229, 9, 20, 0.12);
        }

        .nav-link.active .nav-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 6px var(--primary-glow));
        }

        .active-indicator {
          position: absolute;
          right: 0;
          top: 15%;
          height: 70%;
          width: 4px;
          background: var(--primary);
          border-radius: 4px 0 0 4px;
          box-shadow: -2px 0 8px var(--primary);
        }

        /* Mobile elements defaults */
        .mobile-header,
        .mobile-drawer-overlay,
        .mobile-bottom-tabs {
          display: none;
        }

        /* Responsive Breakpoint */
        @media (max-width: 900px) {
          .desktop-sidebar {
            display: none;
          }

          .mobile-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 70px;
            padding: 0 24px;
            z-index: 100;
            border-bottom: 1px solid var(--card-border);
          }

          .menu-btn {
            background: transparent;
            border: none;
            color: #fff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .mobile-drawer-overlay {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.6);
            z-index: 101;
          }

          .mobile-drawer {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            width: 280px;
            padding: 80px 24px 40px 24px;
            animation: slideIn 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          }

          .mobile-nav-menu {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .mobile-nav-link {
            display: flex;
            align-items: center;
            gap: 16px;
            padding: 16px 20px;
            border-radius: var(--border-radius-md);
            color: var(--foreground-muted);
            font-weight: 600;
            transition: var(--transition-smooth);
          }

          .mobile-nav-link:hover,
          .mobile-nav-link.active {
            color: #fff;
            background: rgba(255, 255, 255, 0.05);
          }

          .mobile-nav-link.active .nav-icon {
            color: var(--primary);
          }

          .mobile-bottom-tabs {
            display: flex;
            justify-content: space-around;
            align-items: center;
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            height: 64px;
            border-radius: 32px;
            z-index: 100;
            border: 1px solid var(--card-border);
            padding: 0 10px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          }

          .tab-link {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--foreground-muted);
            font-size: 11px;
            font-weight: 500;
            gap: 4px;
            flex: 1;
            transition: var(--transition-smooth);
          }

          .tab-link.active {
            color: var(--primary);
            filter: drop-shadow(0 0 4px var(--primary-glow));
          }

          .tab-text {
            font-size: 10px;
          }
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
