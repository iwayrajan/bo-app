import React, { useState, useEffect } from 'react';
import { useSocket } from '../contexts/SocketContext';
import JitsiMeet from './JitsiMeet';

interface AudioCallProps {
  username: string;
}

const AudioCall: React.FC<AudioCallProps> = ({ username }) => {
  const { socket } = useSocket();
  const [isCallActive, setIsCallActive] = useState(false);
  const [remoteUser, setRemoteUser] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ from: string; roomId: string } | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: { from: string; roomId: string }) => {
      if (isCallActive) {
        socket.emit('call-failed', { to: data.from, message: 'User is busy' });
        return;
      }
      setIncomingCall(data);
    };

    const handleCallEnded = () => {
      endCall();
    };

    const handleCallFailed = () => {
      endCall();
    };

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-ended', handleCallEnded);
    socket.on('call-failed', handleCallFailed);

    return () => {
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-ended', handleCallEnded);
      socket.off('call-failed', handleCallFailed);
    };
  }, [socket, isCallActive]);

  const startCall = (targetUser: string) => {
    const newRoomId = `${username}-${targetUser}-${Date.now()}`;
    if (socket) {
      socket.emit('call-user', { from: username, to: targetUser, roomId: newRoomId });
    }
    setRoomId(newRoomId);
    setRemoteUser(targetUser);
    setIsCallActive(true);
    setIsMinimized(false);
  };

  const acceptCall = () => {
    if (incomingCall) {
      setRoomId(incomingCall.roomId);
      setRemoteUser(incomingCall.from);
      setIsCallActive(true);
      setIsMinimized(false);
      setIncomingCall(null);
    }
  };

  const rejectCall = () => {
    if (incomingCall && socket) {
      socket.emit('call-failed', { to: incomingCall.from, message: 'Call rejected' });
    }
    setIncomingCall(null);
  };

  const endCall = () => {
    if (remoteUser && socket) {
      socket.emit('end-call', { to: remoteUser });
    }
    setIsCallActive(false);
    setRemoteUser(null);
    setRoomId(null);
    setIncomingCall(null);
    setIsMinimized(false);
  };

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isCallActive && roomId && (
        <div className={`bg-white rounded-lg shadow-lg ${isMinimized ? 'w-64' : 'w-full'}`}>
          <div className="flex justify-between items-center p-2 border-b">
            <div className="text-sm font-medium">
              Call with {remoteUser}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={toggleMinimize}
                className="text-gray-500 hover:text-gray-700"
              >
                {isMinimized ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <button
                onClick={endCall}
                className="text-red-500 hover:text-red-700"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm11 1H6v8l4-2 4 2V6z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
          {!isMinimized && (
            <div className="h-[calc(100vh-200px)]">
              <JitsiMeet roomName={roomId} onMeetingEnd={endCall} />
            </div>
          )}
        </div>
      )}

      {incomingCall && !isCallActive && (
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
    </div>
  );
};

export default AudioCall;