import React, { useEffect, useRef } from 'react';

declare const JitsiMeetExternalAPI: any;

interface JitsiMeetProps {
  roomName: string;
  onMeetingEnd: () => void;
}

const JitsiMeet: React.FC<JitsiMeetProps> = ({ roomName, onMeetingEnd }) => {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);
  const wakeLockRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);

  useEffect(() => {
    const domain = '8x8.vc';
    const options = {
      roomName: `vpaas-magic-cookie-4df56d1e908e485b860a9aa6c5e9b359/${roomName}`,
      parentNode: jitsiContainerRef.current,
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: true,
        disableDeepLinking: true,
        enableClosePage: false,
        enableWelcomePage: false,
        prejoinPageEnabled: false,
        disableInitialGUM: false,
        enableAudioLevels: true,
        enableNoAudioDetection: true,
        enableNoisyMicDetection: true,
        enableP2P: true,
        p2p: {
          enabled: true,
          preferH264: true,
          disableH264: false,
          useStunTurn: true
        },
        // Add background audio settings
        enableBackgroundAudio: true,
        enableAudioProcessing: true,
        enableAudioMixer: true
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
          'shortcuts', 'tileview', 'select-background', 'download', 'help',
          'mute-everyone', 'security'
        ],
        SHOW_BRAND_WATERMARK: false,
        DEFAULT_REMOTE_DISPLAY_NAME: 'Participant',
        DEFAULT_LOCAL_DISPLAY_NAME: 'You',
        TOOLBAR_ALWAYS_VISIBLE: true
      }
    };

    apiRef.current = new JitsiMeetExternalAPI(domain, options);

    // Initialize audio context and worklet
    const initAudioContext = async () => {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;

        // Create a constant source to keep audio active
        const constantSource = audioContext.createConstantSource();
        constantSource.connect(audioContext.destination);
        constantSource.start();

        // Create a gain node to control volume
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.001; // Very low volume
        constantSource.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Resume audio context
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
      } catch (err) {
        console.error('Error initializing audio context:', err);
      }
    };

    // Request wake lock to prevent device from sleeping
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        }
      } catch (err) {
        console.log('Wake Lock request failed:', err);
      }
    };

    // Handle visibility change
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // When app goes to background, ensure audio continues
        apiRef.current?.executeCommand('setAudioMuted', false);
        
        // Resume audio context if it was suspended
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        // Request wake lock again if it was released
        if (!wakeLockRef.current) {
          await requestWakeLock();
        }
      }
    };

    // Handle beforeunload
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (apiRef.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    // Handle back button
    const handlePopState = (e: PopStateEvent) => {
      if (apiRef.current) {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
      }
    };

    // Initialize audio and wake lock
    initAudioContext();
    requestWakeLock();

    // Add event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.href);

    apiRef.current.addEventListener('videoConferenceLeft', () => {
      onMeetingEnd();
      apiRef.current?.dispose();
    });

    // Cleanup
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      apiRef.current?.dispose();
    };
  }, [roomName, onMeetingEnd]);

  return (
    <div
      ref={jitsiContainerRef}
      style={{ 
        height: '100vh', 
        width: '100vw', 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        zIndex: 1000,
        backgroundColor: 'white'
      }}
    />
  );
};

export default JitsiMeet;