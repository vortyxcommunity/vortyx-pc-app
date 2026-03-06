const playSound = (freq: number, type: OscillatorType, duration: number, volume: number = 0.1) => {
    try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);

        setTimeout(() => ctx.close(), duration * 1000 + 500);
    } catch (e) {
        console.warn("Sound play failed", e);
    }
};

export const voiceSounds = {
    join: () => {
        playSound(440, 'sine', 0.2); // A4
        setTimeout(() => playSound(554.37, 'sine', 0.2), 100); // C#5
    },
    leave: () => {
        playSound(554.37, 'sine', 0.2);
        setTimeout(() => playSound(440, 'sine', 0.2), 100);
    },
    mute: () => {
        playSound(330, 'triangle', 0.1, 0.05); // E4
    },
    unmute: () => {
        playSound(493.88, 'triangle', 0.1, 0.05); // B4
    },
    notification: () => {
        playSound(880, 'sine', 0.1, 0.05); // A5
        setTimeout(() => playSound(1046.50, 'sine', 0.1, 0.05), 50); // C6
    },
    error: () => {
        playSound(150, 'sawtooth', 0.3, 0.05);
    }
};
