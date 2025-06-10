import React, { useEffect, useRef } from 'react';

declare const JitsiMeetExternalAPI: any;

interface JitsiMeetProps {
  roomName: string;
  onMeetingEnd: () => void;
}

const JitsiMeet: React.FC<JitsiMeetProps> = ({ roomName, onMeetingEnd }) => {
  const jitsiContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const domain = '8x8.vc';
    const options = {
      roomName: `vpaas-magic-cookie-4df56d1e908e485b860a9aa6c5e9b359/${roomName}`,
      parentNode: jitsiContainerRef.current,
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
      },
    };

    const api = new JitsiMeetExternalAPI(domain, options);

    api.addEventListener('videoConferenceLeft', () => {
      onMeetingEnd();
      api.dispose();
    });

    return () => {
      api.dispose();
    };
  }, [roomName, onMeetingEnd]);

  return (
    <div
      ref={jitsiContainerRef}
      style={{ height: '100vh', width: '100vw', position: 'fixed', top: 0, left: 0, zIndex: 1000 }}
    />
  );
};

export default JitsiMeet;