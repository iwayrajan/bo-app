import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import * as mediasoupClient from 'mediasoup-client';

interface AudioCallProps {
  username: string;
}

interface RouterRtpCapabilitiesResponse {
  routerRtpCapabilities: mediasoupClient.types.RtpCapabilities;
}

interface WebRtcTransportResponse {
  id: string;
  iceParameters: mediasoupClient.types.IceParameters;
  iceCandidates: mediasoupClient.types.IceCandidate[];
  dtlsParameters: mediasoupClient.types.DtlsParameters;
}

interface ProduceResponse {
  id: string;
}

const AudioCall: React.FC<AudioCallProps> = ({ username }) => {
  const { socket } = useSocket();
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteUser, setRemoteUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ from: string; roomId: string } | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  // Mediasoup refs
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const producerTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const consumerTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const producerRef = useRef<mediasoupClient.types.Producer | null>(null);
  const consumerRef = useRef<mediasoupClient.types.Consumer | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: { from: string; roomId: string }) => {
      console.log('Incoming call received:', {
        from: data.from,
        roomId: data.roomId,
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

      setIncomingCall({
        from: data.from,
        roomId: data.roomId
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
      // Generate a unique room ID
      const newRoomId = `${username}-${targetUser}-${Date.now()}`;
      setRoomId(newRoomId);
      
      // Initialize mediasoup device
      deviceRef.current = new mediasoupClient.Device();

      // Get router RTP capabilities
      const { routerRtpCapabilities } = await new Promise<RouterRtpCapabilitiesResponse>((resolve, reject) => {
        if (!socket) {
          reject(new Error('Socket not connected'));
          return;
        }
        socket.emit('getRouterRtpCapabilities', { roomId: newRoomId }, (response: RouterRtpCapabilitiesResponse) => {
          if ('error' in response) {
            reject(response.error);
          } else {
            resolve(response);
          }
        });
      });

      // Load device with router RTP capabilities
      await deviceRef.current.load({ routerRtpCapabilities });

      // Get local audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        },
        video: false
      });
      audioStreamRef.current = stream;

      // Create producer transport
      const { id, iceParameters, iceCandidates, dtlsParameters } = await new Promise<WebRtcTransportResponse>((resolve, reject) => {
        if (!socket) {
          reject(new Error('Socket not connected'));
          return;
        }
        socket.emit('createWebRtcTransport', { roomId: newRoomId }, (response: WebRtcTransportResponse) => {
          if ('error' in response) {
            reject(response.error);
          } else {
            resolve(response);
          }
        });
      });

      producerTransportRef.current = deviceRef.current.createSendTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters
      });

      producerTransportRef.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          if (!socket) {
            throw new Error('Socket not connected');
          }
          await new Promise<void>((resolve, reject) => {
            socket.emit('connectTransport', {
              transportId: producerTransportRef.current?.id,
              dtlsParameters
            }, (response: { error?: string }) => {
              if (response.error) {
                reject(new Error(response.error));
              } else {
                resolve();
              }
            });
          });
          callback();
        } catch (error) {
          errback(error instanceof Error ? error : new Error(String(error)));
        }
      });

      producerTransportRef.current.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          if (!socket) {
            throw new Error('Socket not connected');
          }
          const { id } = await new Promise<ProduceResponse>((resolve, reject) => {
            socket.emit('produce', {
              transportId: producerTransportRef.current?.id,
              kind,
              rtpParameters
            }, (response: ProduceResponse) => {
              if ('error' in response) {
                reject(new Error(response.error as string));
              } else {
                resolve(response);
              }
            });
          });
          callback({ id });
        } catch (error) {
          errback(error instanceof Error ? error : new Error(String(error)));
        }
      });

      // Start producing
      const track = stream.getAudioTracks()[0];
      if (!track) {
        throw new Error('No audio track found in stream');
      }
      producerRef.current = await producerTransportRef.current.produce({ track });

      // Notify the target user
      socket.emit('call-user', {
        from: username,
        to: targetUser,
        roomId: newRoomId
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
    if (producerRef.current) {
      producerRef.current.close();
    }
    if (consumerRef.current) {
      consumerRef.current.close();
    }
    if (producerTransportRef.current) {
      producerTransportRef.current.close();
    }
    if (consumerTransportRef.current) {
      consumerTransportRef.current.close();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }

    if (remoteUser) {
      socket?.emit('end-call', { to: remoteUser });
    }
    setIsCallActive(false);
    setRemoteUser(null);
    setRoomId(null);
    setIncomingCall(null);
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    
    try {
      // Initialize mediasoup device
      deviceRef.current = new mediasoupClient.Device();

      // Get router RTP capabilities
      const { routerRtpCapabilities } = await new Promise<RouterRtpCapabilitiesResponse>((resolve, reject) => {
        if (!socket) {
          reject(new Error('Socket not connected'));
          return;
        }
        socket.emit('getRouterRtpCapabilities', { roomId: incomingCall.roomId }, (response: RouterRtpCapabilitiesResponse) => {
          if ('error' in response) {
            reject(response.error);
          } else {
            resolve(response);
          }
        });
      });

      // Load device with router RTP capabilities
      await deviceRef.current.load({ routerRtpCapabilities });

      // Get local audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        },
        video: false
      });
      audioStreamRef.current = stream;

      // Create producer transport
      const { id, iceParameters, iceCandidates, dtlsParameters } = await new Promise<WebRtcTransportResponse>((resolve, reject) => {
        if (!socket) {
          reject(new Error('Socket not connected'));
          return;
        }
        socket.emit('createWebRtcTransport', { roomId: incomingCall.roomId }, (response: WebRtcTransportResponse) => {
          if ('error' in response) {
            reject(response.error);
          } else {
            resolve(response);
          }
        });
      });

      producerTransportRef.current = deviceRef.current.createSendTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters
      });

      producerTransportRef.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          if (!socket) {
            throw new Error('Socket not connected');
          }
          await new Promise<void>((resolve, reject) => {
            socket.emit('connectTransport', {
              transportId: producerTransportRef.current?.id,
              dtlsParameters
            }, (response: { error?: string }) => {
              if (response.error) {
                reject(new Error(response.error));
              } else {
                resolve();
              }
            });
          });
          callback();
        } catch (error) {
          errback(error instanceof Error ? error : new Error(String(error)));
        }
      });

      producerTransportRef.current.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          if (!socket) {
            throw new Error('Socket not connected');
          }
          const { id } = await new Promise<ProduceResponse>((resolve, reject) => {
            socket.emit('produce', {
              transportId: producerTransportRef.current?.id,
              kind,
              rtpParameters
            }, (response: ProduceResponse) => {
              if ('error' in response) {
                reject(new Error(response.error as string));
              } else {
                resolve(response);
              }
            });
          });
          callback({ id });
        } catch (error) {
          errback(error instanceof Error ? error : new Error(String(error)));
        }
      });

      // Start producing
      const track = stream.getAudioTracks()[0];
      if (!track) {
        throw new Error('No audio track found in stream');
      }
      producerRef.current = await producerTransportRef.current.produce({ track });

      setRoomId(incomingCall.roomId);
      setRemoteUser(incomingCall.from);
      setIsCallActive(true);
      setIsMuted(false);
      setIncomingCall(null);
    } catch (error) {
      console.error('Error accepting call:', error);
      setError('Failed to accept call');
      socket?.emit('call-failed', {
        to: incomingCall.from,
        message: 'Failed to accept call'
      });
      setIncomingCall(null);
    }
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
      {isCallActive && (
        <div className="bg-white rounded-lg shadow-lg p-4">
          <div className="text-lg font-semibold mb-2">Call with {remoteUser}</div>
          <div className="flex space-x-2">
            <button
              onClick={() => {
                if (producerRef.current) {
                  const track = producerRef.current.track;
                  track.enabled = !track.enabled;
                  setIsMuted(!isMuted);
                }
              }}
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