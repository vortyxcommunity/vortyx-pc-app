
const SOUNDS = {
    MESSAGE: 'https://joshwcomeau.com/sounds/pop-down.mp3',
    INCOMING_CALL: 'https://www.soundjay.com/phone/sounds/phone-calling-1.mp3',
    OUTGOING_CALL: 'https://www.soundjay.com/phone/sounds/telephone-ring-01a.mp3',
    NOTIFICATION: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3',
};

class AudioService {
    private sounds: Record<string, HTMLAudioElement> = {};
    private isInitialized = false;

    init() {
        if (this.isInitialized) return;
        console.log('AudioService: Initializing...');
        Object.keys(SOUNDS).forEach(key => {
            const audio = new Audio(SOUNDS[key as keyof typeof SOUNDS]);
            audio.crossOrigin = "anonymous";
            audio.load();
            this.sounds[key] = audio;
        });
        this.isInitialized = true;
    }

    play(soundKey: keyof typeof SOUNDS, loop = false) {
        if (!this.isInitialized) this.init();
        const audio = this.sounds[soundKey];
        if (audio) {
            audio.loop = loop;
            audio.currentTime = 0;
            audio.play().catch(e => console.warn('Audio play error:', e));
        }
    }

    stopAll() {
        Object.values(this.sounds).forEach(a => {
            a.pause();
            a.currentTime = 0;
        });
    }

    stop(soundKey: keyof typeof SOUNDS) {
        const audio = this.sounds[soundKey];
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }
}

export const audioService = new AudioService();
