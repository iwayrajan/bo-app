import React, { useEffect, useRef } from 'react';

declare const JitsiMeetExternalAPI: any;

interface JitsiMeetProps {
  roomName: string;
  onMeetingEnd: () => void;
}

const JitsiMeet: React.FC<JitsiMeetProps> = ({ roomName, onMeetingEnd }) => {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<any>(null);

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
        }
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
        SHOW_WATERMARK_FOR_GUESTS: false,
        DEFAULT_REMOTE_DISPLAY_NAME: 'Participant',
        DEFAULT_LOCAL_DISPLAY_NAME: 'You',
        TOOLBAR_ALWAYS_VISIBLE: true
      }
    };

    apiRef.current = new JitsiMeetExternalAPI(domain, options);

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // When app goes to background, ensure audio continues
        apiRef.current?.executeCommand('setAudioMuted', false);
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