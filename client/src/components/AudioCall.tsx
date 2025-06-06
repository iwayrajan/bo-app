import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';

interface AudioCallProps {
  username: string;
}

const AudioCall: React.FC<AudioCallProps> = ({ username }) => {
  const { socket, isConnected } = useSocket();
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteUser, setRemoteUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ from: string; offer: RTCSessionDescriptionInit } | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    // Request microphone access when component mounts
    const requestMicrophoneAccess = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log('Microphone access granted');
        // Stop the stream immediately since we don't need it yet
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.error('Error requesting microphone access:', error);
        setError('Please allow microphone access to use audio calls');
      }
    };

    requestMicrophoneAccess();
  }, []); // Empty dependency array means this runs once when component mounts

  useEffect(() => {
    if (!socket) {
      console.log('Socket not available, skipping call handler setup');
      return;
    }

    if (!socket.connected) {
      console.log('Socket not connected, waiting for connection...');
      const handleConnect = () => {
        console.log('Socket connected, setting up call handlers');
        setupCallHandlers();
      };
      socket.on('connect', handleConnect);
      return () => {
        socket.off('connect', handleConnect);
      };
    }

    setupCallHandlers();
  }, [socket, username]);

  const setupCallHandlers = () => {
    if (!socket) return;

    console.log('Setting up call handlers for user:', username);
    console.log('Current socket ID:', socket.id);
    console.log('Current call state:', { isCallActive, remoteUser });

    const handleIncomingCall = async (data: { from: string; signal: any }) => {
      console.log('Incoming call received:', {
        from: data.from,
        signalType: data.signal?.type,
        currentUser: username,
        socketId: socket.id
      });
      console.log('Current call state:', { isCallActive, remoteUser });
      
      if (isCallActive) {
        console.log('Already in a call, rejecting incoming call');
        socket.emit('call-failed', { 
          to: data.from,
          message: 'User is busy' 
        });
        return;
      }

      // Set the incoming call state
      setIncomingCall({
        from: data.from,
        offer: data.signal
      });
    };

    const handleCallAccepted = async (data: { from: string; signal: any }) => {
      console.log('Call accepted:', {
        from: data.from,
        signalType: data.signal?.type,
        currentUser: username,
        socketId: socket.id
      });
      
      if (!peerConnectionRef.current) {
        console.error('No peer connection available');
        setError('Call connection lost');
        endCall();
      }

      try {
        const remoteDesc = new RTCSessionDescription(data.signal);
        console.log('Setting remote description:', remoteDesc);
        await peerConnectionRef.current.setRemoteDescription(remoteDesc);
        console.log('Remote description set successfully');
      } catch (error) {
        console.error('Error handling call acceptance:', error);
        setError('Failed to establish call connection');
        endCall();
      }
    };

    const handleCallFailed = (data: { message: string }) => {
      console.error('Call failed:', {
        message: data.message,
        currentUser: username,
        socketId: socket.id
      });
      setError(data.message);
      setIncomingCall(null); // Clear incoming call state
      endCall();
    };

    const handleIceCandidate = async (data: { from: string; candidate: RTCIceCandidate }) => {
      console.log('Received ICE candidate:', {
        from: data.from,
        candidate: data.candidate ? 'present' : 'null',
        currentUser: username,
        socketId: socket.id
      });
      if (!peerConnectionRef.current) {
        console.error('No peer connection available for ICE candidate');
        return;
      }

      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log('ICE candidate added successfully');
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    };

    const handleCallEnded = () => {
      console.log('Call ended by remote user:', {
        currentUser: username,
        socketId: socket.id
      });
      endCall();
    };

    // Set up event listeners
    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-accepted', handleCallAccepted);
    socket.on('call-failed', handleCallFailed);
    socket.on('ice-candidate', handleIceCandidate);
    socket.on('call-ended', handleCallEnded);

    return () => {
      console.log('Cleaning up call handlers for user:', username);
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-accepted', handleCallAccepted);
      socket.off('call-failed', handleCallFailed);
      socket.off('ice-candidate', handleIceCandidate);
      socket.off('call-ended', handleCallEnded);
    };
  };

  const startCall = async (targetUser: string) => {
    console.log('Starting call to:', targetUser);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Got local media stream');
      localStreamRef.current = stream;
      
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302',
              'stun:stun3.l.google.com:19302',
              'stun:stun4.l.google.com:19302'
            ]
          },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all'
      });
      peerConnectionRef.current = peerConnection;

      // Add local stream
      stream.getTracks().forEach(track => {
        console.log('Adding local track to peer connection:', track.kind);
        peerConnection.addTrack(track, stream);
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate:', event.candidate);
          socket?.emit('ice-candidate', {
            from: username,
            to: targetUser,
            candidate: event.candidate
          });
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state changed:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed' || 
            peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'closed') {
          console.error('Connection state error:', peerConnection.connectionState);
          setError(`Call connection ${peerConnection.connectionState}`);
          endCall();
        }
      };

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed' || 
            peerConnection.iceConnectionState === 'disconnected' || 
            peerConnection.iceConnectionState === 'closed') {
          console.error('ICE connection state error:', peerConnection.iceConnectionState);
          setError(`ICE connection ${peerConnection.iceConnectionState}`);
          endCall();
        }
      };

      // Handle ICE gathering state changes
      peerConnection.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', peerConnection.iceGatheringState);
      };

      // Handle signaling state changes
      peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', peerConnection.signalingState);
      };

      // Handle negotiation needed
      peerConnection.onnegotiationneeded = async () => {
        console.log('Negotiation needed');
        try {
          const offer = await peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
          });
          await peerConnection.setLocalDescription(offer);
          socket?.emit('call-user', {
            from: username,
            to: targetUser,
            signal: offer
          });
        } catch (error) {
          console.error('Error during negotiation:', error);
        }
      };

      // Handle incoming tracks
      peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        const audioElement = document.getElementById('remoteAudio') as HTMLAudioElement;
        if (audioElement && event.streams[0]) {
          audioElement.srcObject = event.streams[0];
          audioElement.play().catch(error => {
            console.error('Error playing audio:', error);
            setError('Failed to play audio');
          });
        }
      };

      // Create and send offer with specific constraints
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await peerConnection.setLocalDescription(offer);

      console.log('Sending call offer to:', targetUser);
      socket?.emit('call-user', {
        from: username,
        to: targetUser,
        signal: offer
      });

      setRemoteUser(targetUser);
      setIsCallActive(true);
      setIsMuted(false); // Reset mute state when starting a new call
    } catch (error) {
      console.error('Error starting call:', error);
      setError('Failed to start call');
    }
  };

  const endCall = () => {
    console.log('Ending call');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (remoteUser) {
      socket?.emit('end-call', { to: remoteUser });
    }
    setIsCallActive(false);
    setRemoteUser(null);
    localStreamRef.current = null;
    peerConnectionRef.current = null;
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Got local media stream for incoming call');
      localStreamRef.current = stream;
      
      const peerConnection = new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302',
              'stun:stun2.l.google.com:19302',
              'stun:stun3.l.google.com:19302',
              'stun:stun4.l.google.com:19302'
            ]
          },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        iceCandidatePoolSize: 10,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
        iceTransportPolicy: 'all',
        sdpSemantics: 'unified-plan'
      });
      peerConnectionRef.current = peerConnection;

      // Add local stream
      stream.getTracks().forEach(track => {
        console.log('Adding local track to peer connection:', track.kind);
        peerConnection.addTrack(track, stream);
      });

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate for incoming call');
          socket?.emit('ice-candidate', {
            from: username,
            to: incomingCall.from,
            candidate: event.candidate
          });
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state changed:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'failed' || 
            peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'closed') {
          setError(`Call connection ${peerConnection.connectionState}`);
          endCall();
        }
      };

      // Handle ICE connection state changes
      peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
        if (peerConnection.iceConnectionState === 'failed' || 
            peerConnection.iceConnectionState === 'disconnected' || 
            peerConnection.iceConnectionState === 'closed') {
          setError(`ICE connection ${peerConnection.iceConnectionState}`);
          endCall();
        }
      };

      // Handle ICE gathering state changes
      peerConnection.onicegatheringstatechange = () => {
        console.log('ICE gathering state:', peerConnection.iceGatheringState);
      };

      // Handle signaling state changes
      peerConnection.onsignalingstatechange = () => {
        console.log('Signaling state:', peerConnection.signalingState);
      };

      // Handle incoming tracks
      peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        const audioElement = document.getElementById('remoteAudio') as HTMLAudioElement;
        if (audioElement && event.streams[0]) {
          audioElement.srcObject = event.streams[0];
          audioElement.play().catch(error => {
            console.error('Error playing audio:', error);
            setError('Failed to play audio');
          });
        }
      };

      // Set remote description and create answer
      console.log('Setting remote description for incoming call');
      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      console.log('Creating answer for incoming call');
      const answer = await peerConnection.createAnswer();
      console.log('Setting local description for incoming call');
      await peerConnection.setLocalDescription(answer);

      console.log('Sending call answer to:', incomingCall.from);
      socket?.emit('call-answer', {
        from: username,
        to: incomingCall.from,
        signal: answer
      });

      setRemoteUser(incomingCall.from);
      setIsCallActive(true);
      setIsMuted(false); // Reset mute state when accepting a call
      setIncomingCall(null);
    } catch (error) {
      console.error('Error handling incoming call:', error);
      setError('Failed to handle incoming call');
      socket?.emit('call-failed', { 
        to: incomingCall.from, 
        message: 'Failed to handle incoming call' 
      });
      setIncomingCall(null);
    }
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    console.log('Rejecting call from:', incomingCall.from);
    socket?.emit('call-failed', { 
      to: incomingCall.from, 
      message: 'Call rejected by user' 
    });
    setIncomingCall(null);
    setError(null); // Clear any existing errors
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
      {isCallActive && (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <div className="text-lg font-semibold mb-2">Call with {remoteUser}</div>
          <div className="flex space-x-2">
            <button
              onClick={toggleMute}
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
          <audio id="remoteAudio" autoPlay />
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