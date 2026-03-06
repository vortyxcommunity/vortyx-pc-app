import React from 'react';
import { Minus, Square, X } from 'lucide-react';

const DesktopTitleBar = () => {
    // Check if running in Electron
    const isElectron = window.navigator.userAgent.toLowerCase().includes('electron');

    if (!isElectron) return null;

    const handleAction = (action: string) => {
        // @ts-ignore - electron is injected via preload script
        if (window.electron) {
            // @ts-ignore
            window.electron.windowControl(action);
        }
    };

    return (
        <div className="h-8 w-full bg-[#0f0f0f] flex items-center justify-between select-none border-b border-white/5 shrink-0">
            <div className="flex-1 h-full flex items-center px-3" style={{ WebkitAppRegion: 'drag' } as any}>
                <img src="vortyx-logo.png" alt="Logo" className="w-4 h-4 mr-2" />
                <span className="text-xs font-medium text-white/50 tracking-wider">VORTYX</span>
            </div>

            <div className="flex items-center h-full no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <button
                    onClick={() => handleAction('minimize')}
                    className="h-full px-3 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                    <Minus className="w-4 h-4 text-white/70" />
                </button>
                <button
                    onClick={() => handleAction('maximize')}
                    className="h-full px-3 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                    <Square className="w-3 h-3 text-white/70" />
                </button>
                <button
                    onClick={() => handleAction('close')}
                    className="h-full px-3 flex items-center justify-center hover:bg-red-500/80 transition-colors group"
                >
                    <X className="w-4 h-4 text-white/70 group-hover:text-white" />
                </button>
            </div>
        </div>
    );
};

export default DesktopTitleBar;
