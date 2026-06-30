"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Settings as SettingsIcon, 
  HelpCircle, 
  Trash2, 
  Download, 
  Upload, 
  Lock, 
  Check, 
  ChevronRight, 
  Key,
  Shield,
  Eye,
  FileJson,
  FileText
} from 'lucide-react';
import { AsyncStorage } from '@/utils/storage';
import { setGlobalConfig } from '@/utils/tmdb';

export default function SettingsPage() {
  const [isHiRes, setIsHiRes] = useState(false);
  const [isNsfwFilter, setIsNsfwFilter] = useState(true);
  const [isAutoAi, setIsAutoAi] = useState(true);
  const [customApiKey, setCustomApiKey] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const savedHiRes = await AsyncStorage.getItem('settings_hires');
      const savedNsfw = await AsyncStorage.getItem('settings_nsfw');
      const savedAutoAi = await AsyncStorage.getItem('settings_auto_ai');
      const savedKey = await AsyncStorage.getItem('settings_custom_key');
      
      if (savedHiRes !== null) {
        const val = JSON.parse(savedHiRes);
        setIsHiRes(val);
        setGlobalConfig('hiRes', val);
      }
      if (savedNsfw !== null) {
        const val = JSON.parse(savedNsfw);
        setIsNsfwFilter(val);
        setGlobalConfig('nsfwFilterEnabled', val);
      }
      if (savedAutoAi !== null) {
        setIsAutoAi(JSON.parse(savedAutoAi));
      }
      if (savedKey !== null) {
        setCustomApiKey(savedKey);
        setGlobalConfig('customApiKey', savedKey);
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  const handleToggleHiRes = async (value: boolean) => {
    setIsHiRes(value);
    setGlobalConfig('hiRes', value);
    await AsyncStorage.setItem('settings_hires', JSON.stringify(value));
  };

  const handleToggleNsfw = async (value: boolean) => {
    setIsNsfwFilter(value);
    setGlobalConfig('nsfwFilterEnabled', value);
    await AsyncStorage.setItem('settings_nsfw', JSON.stringify(value));
  };

  const handleToggleAutoAi = async (value: boolean) => {
    setIsAutoAi(value);
    await AsyncStorage.setItem('settings_auto_ai', JSON.stringify(value));
  };

  const handleSaveApiKey = async () => {
    setGlobalConfig('customApiKey', customApiKey);
    await AsyncStorage.setItem('settings_custom_key', customApiKey);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const handleWipeLibrary = async () => {
    const confirm = window.confirm("Are you absolutely sure you want to WIPE all your Watchlist, History, and Search History? This cannot be undone.");
    if (!confirm) return;

    try {
      await AsyncStorage.removeItem('watchlist');
      await AsyncStorage.removeItem('favoriteArtists');
      await AsyncStorage.removeItem('history');
      await AsyncStorage.removeItem('searchHistory');
      await AsyncStorage.removeItem('@watch_progress');
      
      alert("All library data has been wiped successfully.");
      window.location.reload();
    } catch (e) {
      alert("Failed to clear library data.");
    }
  };

  const handleExportData = async (format: 'txt' | 'json') => {
    try {
      const mStr = await AsyncStorage.getItem('watchlist');
      const aStr = await AsyncStorage.getItem('favoriteArtists');
      const hStr = await AsyncStorage.getItem('history');

      const rawWatchlist = mStr ? JSON.parse(mStr) : [];
      const rawArtists = aStr ? JSON.parse(aStr) : [];
      const rawHistory = hStr ? JSON.parse(hStr) : [];

      let fileContent = "";
      const dateString = new Date().toISOString().split('T')[0];
      const fileName = format === 'json' ? `Watcher_Backup_${dateString}.json` : `Watcher_Backup_${dateString}.txt`;

      if (format === 'json') {
        fileContent = JSON.stringify({ 
          watchlist: rawWatchlist, 
          artists: rawArtists, 
          history: rawHistory 
        }, null, 2);
      } else {
        fileContent += "movies\n";
        rawWatchlist.forEach((i: any, index: number) => {
          const year = i.release_date || i.first_air_date ? String(i.release_date || i.first_air_date).substring(0, 4) : '';
          const yearText = year ? ` ${year}` : '';
          fileContent += `${index + 1} ${i.title || i.name}${yearText}\n`;
        });

        fileContent += "\nartists\n";
        rawArtists.forEach((i: any, index: number) => {
          fileContent += `${index + 1} ${i.name}\n`;
        });

        fileContent += "\nhistory\n";
        rawHistory.forEach((i: any, index: number) => {
          const year = i.release_date || i.first_air_date ? String(i.release_date || i.first_air_date).substring(0, 4) : '';
          const yearText = year ? ` ${year}` : '';
          fileContent += `${index + 1} ${i.title || i.name}${yearText}\n`;
        });
      }

      // Web download utility
      const blob = new Blob([fileContent], { type: format === 'json' ? 'application/json' : 'text/plain' });
      const downloadLink = document.createElement("a");
      downloadLink.href = URL.createObjectURL(blob);
      downloadLink.download = fileName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (e) {
      alert("Failed to export library data.");
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (backup.watchlist || backup.artists || backup.history) {
        if (backup.watchlist) await AsyncStorage.setItem('watchlist', JSON.stringify(backup.watchlist));
        if (backup.artists) await AsyncStorage.setItem('favoriteArtists', JSON.stringify(backup.artists));
        if (backup.history) await AsyncStorage.setItem('history', JSON.stringify(backup.history));
        
        alert("Backup imported successfully. Reloading library data...");
        window.location.reload();
      } else {
        alert("Invalid backup format. File must contain watchlist, artists, or history fields.");
      }
    } catch (err: any) {
      alert(`Import failed: ${err.message}`);
    }
  };

  return (
    <div className="settings-container">
      {/* Header section */}
      <div className="header-row animate-fade-in-up">
        <div className="title-section">
          <SettingsIcon className="header-icon" />
          <h1 className="header-title">Settings</h1>
        </div>
      </div>

      <div className="settings-sections animate-fade-in-up">
        {/* API key section */}
        <section className="settings-section glass">
          <div className="section-header">
            <Key className="sec-icon" size={18} />
            <h2>Gemini AI Integration</h2>
          </div>
          <div className="section-body">
            <p className="description">
              Watcher uses Google Gemini Flash model to analyze RSS Feeds, extracts movies list from screenshots, and suggests intelligent media recommendations. Input your custom API key below (entirely free).
            </p>
            <div className="api-input-row">
              <input
                type="password"
                placeholder="Paste your Gemini API Key here..."
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                className="modal-input"
              />
              <button 
                className="btn-primary" 
                onClick={handleSaveApiKey}
                style={{ height: '44px', borderRadius: '10px' }}
              >
                {apiKeySaved ? <Check size={16} /> : 'Save'}
              </button>
            </div>
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="helper-link"
            >
              <HelpCircle size={14} />
              <span>Get a free Gemini API Key from Google AI Studio</span>
            </a>
          </div>
        </section>

        {/* Global toggles section */}
        <section className="settings-section glass">
          <div className="section-header">
            <Shield className="sec-icon" size={18} />
            <h2>Preferences</h2>
          </div>
          <div className="section-body toggles-list">
            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">High Resolution backdrops</span>
                <span className="toggle-desc">Fetches high-quality originals instead of compressed backdrops. Slows load speeds.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={isHiRes} 
                  onChange={(e) => handleToggleHiRes(e.target.checked)} 
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">Safe Content Filter</span>
                <span className="toggle-desc">Filters out explicit / adult NSFW media categories and query results.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={isNsfwFilter} 
                  onChange={(e) => handleToggleNsfw(e.target.checked)} 
                />
                <span className="slider round"></span>
              </label>
            </div>

            <div className="toggle-item">
              <div className="toggle-label">
                <span className="toggle-title">Intelligent Recommendations</span>
                <span className="toggle-desc">Auto-triggers Gemini semantic analysis on detail screens.</span>
              </div>
              <label className="switch">
                <input 
                  type="checkbox" 
                  checked={isAutoAi} 
                  onChange={(e) => handleToggleAutoAi(e.target.checked)} 
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </section>

        {/* Backup and storage exports */}
        <section className="settings-section glass">
          <div className="section-header">
            <FileJson className="sec-icon" size={18} />
            <h2>Data Management</h2>
          </div>
          <div className="section-body actions-list">
            <div className="data-action-item">
              <div className="action-info">
                <span className="action-title">Export Watchlist & History</span>
                <span className="action-desc">Download a backup containing all your watchlist items, favorites, and history.</span>
              </div>
              <div className="action-btns">
                <button className="btn-secondary" onClick={() => handleExportData('json')}>
                  <FileJson size={14} />
                  <span>JSON</span>
                </button>
                <button className="btn-secondary" onClick={() => handleExportData('txt')}>
                  <FileText size={14} />
                  <span>TXT</span>
                </button>
              </div>
            </div>

            <div className="data-action-item">
              <div className="action-info">
                <span className="action-title">Restore Library Backup</span>
                <span className="action-desc">Upload a previously exported JSON backup file to restore your entire library.</span>
              </div>
              <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>
                <Upload size={14} />
                <span>Upload Backup</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".json" 
                onChange={handleImportJson} 
              />
            </div>

            <div className="data-action-item danger">
              <div className="action-info">
                <span className="action-title">Wipe Local Database</span>
                <span className="action-desc">Delete watchlist feed syncs, favorite artists, history, and search history caches completely.</span>
              </div>
              <button className="btn-danger-setting" onClick={handleWipeLibrary}>
                <Trash2 size={14} />
                <span>Format Data</span>
              </button>
            </div>
          </div>
        </section>
      </div>

      <style jsx>{`
        .settings-container {
          max-width: 800px;
          margin: 0 auto;
        }

        .header-row {
          display: flex;
          align-items: center;
          margin-bottom: 28px;
        }

        .title-section {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-icon {
          color: var(--primary);
          filter: drop-shadow(0 0 8px var(--primary-glow));
        }

        .header-title {
          font-size: 24px;
          font-weight: 800;
          color: #fff;
          letter-spacing: 0.5px;
        }

        .settings-sections {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .settings-section {
          border-radius: var(--border-radius-md);
          border: 1px solid var(--card-border);
          padding: 24px;
          background: rgba(20, 20, 25, 0.4);
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          padding-bottom: 10px;
        }

        .sec-icon {
          color: var(--primary);
        }

        .section-header h2 {
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          letter-spacing: 0.5px;
        }

        .section-body {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .description {
          font-size: 13.5px;
          color: var(--foreground-muted);
          line-height: 1.5;
        }

        .api-input-row {
          display: flex;
          gap: 12px;
          width: 100%;
        }

        .modal-input {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          color: #fff;
          padding: 12px 16px;
          font-size: 14px;
          flex: 1;
          outline: none;
        }

        .modal-input:focus {
          border-color: var(--primary);
          background: rgba(255, 255, 255, 0.08);
        }

        .helper-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--primary);
          transition: var(--transition-smooth);
          align-self: flex-start;
        }

        .helper-link:hover {
          filter: brightness(1.2);
          text-decoration: underline;
        }

        /* Switch list */
        .toggles-list {
          gap: 20px;
        }

        .toggle-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
        }

        .toggle-label {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .toggle-title {
          font-size: 14.5px;
          font-weight: 700;
          color: #fff;
        }

        .toggle-desc {
          font-size: 12px;
          color: var(--foreground-muted);
          line-height: 1.4;
        }

        /* HTML5 Switch CSS */
        .switch {
          position: relative;
          display: inline-block;
          width: 48px;
          height: 26px;
          flex-shrink: 0;
        }

        .switch input { 
          opacity: 0;
          width: 0;
          height: 0;
        }

        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(255, 255, 255, 0.1);
          transition: .3s;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        }

        input:checked + .slider {
          background-color: var(--primary);
        }

        input:focus + .slider {
          box-shadow: 0 0 1px var(--primary);
        }

        input:checked + .slider:before {
          transform: translateX(22px);
        }

        .slider.round {
          border-radius: 34px;
        }

        .slider.round:before {
          border-radius: 50%;
        }

        /* Actions list */
        .actions-list {
          gap: 16px;
        }

        .data-action-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 16px;
          border-bottom: 1px dashed rgba(255,255,255,0.04);
          gap: 24px;
        }

        .data-action-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .action-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .action-title {
          font-size: 14.5px;
          font-weight: 700;
          color: #fff;
        }

        .action-desc {
          font-size: 12px;
          color: var(--foreground-muted);
          line-height: 1.4;
        }

        .action-btns {
          display: flex;
          gap: 8px;
        }

        .btn-danger-setting {
          background: rgba(239, 68, 68, 0.15);
          color: #fca5a5;
          border: 1px solid rgba(239, 68, 68, 0.25);
          padding: 8px 16px;
          border-radius: 20px;
          font-weight: 600;
          font-size: 13.5px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          transition: var(--transition-smooth);
        }

        .btn-danger-setting:hover {
          background: rgba(239, 68, 68, 0.3);
          border-color: rgba(239, 68, 68, 0.5);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}
