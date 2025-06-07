import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { JitsiMeeting } from '@jitsi/react-sdk';

interface AudioCallProps {
  username: string;
}

const AudioCall: React.FC<AudioCallProps> = ({ username }) => {
  const { socket } = useSocket();
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteUser, setRemoteUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ from: string; roomName: string } | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: { from: string; roomName: string }) => {
      console.log('Incoming call received:', {
        from: data.from,
        roomName: data.roomName,
        currentUser: username
      });
      
      if (isCallActive) {
        console.log('Already in a call, rejecting incoming call');
        socket.emit('call-failed', { 
          to: data.from,
          message: 'User is busy' 
        });
        return;
      }

      // Validate roomName
      if (!data.roomName) {
        console.error('Invalid call: missing roomName');
        socket.emit('call-failed', {
          to: data.from,
          message: 'Invalid call: missing room information'
        });
        return;
      }

      setIncomingCall({
        from: data.from,
        roomName: data.roomName
      });
    };

    const handleCallEnded = () => {
      console.log('Call ended by remote user');
      endCall();
    };

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-ended', handleCallEnded);

    return () => {
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-ended', handleCallEnded);
    };
  }, [socket, username, isCallActive]);

  const startCall = async (targetUser: string) => {
    try {
      // Generate a unique room name
      const newRoomName = `${username}-${targetUser}-${Date.now()}`;
      setRoomName(newRoomName);
      
      // Notify the target user
      socket?.emit('call-user', {
        from: username,
        to: targetUser,
        roomName: newRoomName
      });

      setRemoteUser(targetUser);
      setIsCallActive(true);
      setIsMuted(false);
    } catch (error) {
      console.error('Error starting call:', error);
      setError('Failed to start call');
    }
  };

  const endCall = () => {
    if (remoteUser) {
      socket?.emit('end-call', { to: remoteUser });
    }
    setIsCallActive(false);
    setRemoteUser(null);
    setRoomName(null);
    setIncomingCall(null);
  };

  const acceptCall = () => {
    if (!incomingCall) return;
    
    setRoomName(incomingCall.roomName);
    setRemoteUser(incomingCall.from);
    setIsCallActive(true);
    setIsMuted(false);
    setIncomingCall(null);
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    socket?.emit('call-failed', { 
      to: incomingCall.from, 
      message: 'Call rejected by user' 
    });
    setIncomingCall(null);
    setError(null);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Incoming Call Notification */}
      {incomingCall && (
        <div className="bg-white rounded-lg shadow-lg p-4 mb-4">
          <div className="text-lg font-semibold mb-2">Incoming Call</div>
          <div className="text-gray-600 mb-4">From: {incomingCall.from}</div>
          <div className="flex space-x-2">
            <button
              onClick={acceptCall}
              className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Accept
            </button>
            <button
              onClick={rejectCall}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Reject
            </button>
          </div>
        </div>
      )}

      {/* Active Call UI */}
      {isCallActive && roomName && (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <div className="text-lg font-semibold mb-2">Call with {remoteUser}</div>
          <div className="w-[400px] h-[300px]">
            <JitsiMeeting
              domain="meet.jit.si"
              roomName={roomName}
              configOverwrite={{
                startWithAudioMuted: isMuted,
                disableDeepLinking: true,
                prejoinPageEnabled: false
              }}
              interfaceConfigOverwrite={{
                TOOLBAR_BUTTONS: [
                  'microphone',
                  'camera',
                  'closedcaptions',
                  'desktop',
                  'fullscreen',
                  'fodeviceselection',
                  'hangup',
                  'profile',
                  'chat',
                  'recording',
                  'shortcuts',
                  'tileview',
                  'select-background',
                  'download',
                  'help',
                  'mute-everyone',
                  'security'
                ],
                SHOW_JITSI_WATERMARK: false,
                SHOW_WATERMARK_FOR_GUESTS: false,
                DEFAULT_REMOTE_DISPLAY_NAME: remoteUser || 'Remote User',
                DEFAULT_LOCAL_DISPLAY_NAME: username
              }}
              userInfo={{
                displayName: username
              }}
              getIFrameRef={(iframeRef: HTMLIFrameElement) => {
                iframeRef.style.height = '100%';
                iframeRef.style.width = '100%';
              }}
            />
          </div>
          <div className="flex space-x-2 mt-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`px-4 py-2 rounded ${
                isMuted ? 'bg-red-500' : 'bg-blue-500'
              } text-white hover:opacity-90`}
            >
              {isMuted ? 'Unmute' : 'Mute'}
            </button>
            <button
              onClick={endCall}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              End Call
            </button>
          </div>
        </div>
      )}

      {/* Start Call Button */}
      {!isCallActive && !incomingCall && (
        <button
          onClick={() => {
            const targetUser = prompt('Enter username to call:');
            if (targetUser) {
              startCall(targetUser);
            }
          }}
          className="bg-green-500 text-white p-3 rounded-full hover:bg-green-600"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
            />
          </svg>
        </button>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          <span className="block sm:inline">{error}</span>
          <button
            onClick={() => setError(null)}
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
          >
            <svg
              className="fill-current h-6 w-6 text-red-500"
              role="button"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
            >
              <title>Close</title>
              <path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default AudioCall; 