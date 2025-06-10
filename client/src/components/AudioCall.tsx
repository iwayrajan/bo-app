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
  };

  const acceptCall = () => {
    if (incomingCall) {
      setRoomId(incomingCall.roomId);
      setRemoteUser(incomingCall.from);
      setIsCallActive(true);
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
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isCallActive && roomId && (
        <JitsiMeet roomName={roomId} onMeetingEnd={endCall} />
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