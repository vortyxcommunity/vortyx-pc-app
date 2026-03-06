import { useCallback } from 'react';

export const useDesktopNotification = () => {
    const isElectron = window.navigator.userAgent.toLowerCase().includes('electron');

    const showNotification = useCallback((title: string, body: string) => {
        if (isElectron && (window as any).electron) {
            (window as any).electron.sendNotification({ title, body });
        } else if (Notification.permission === 'granted') {
            new Notification(title, { body });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification(title, { body });
                }
            });
        }
    }, [isElectron]);

    return { showNotification };
};
