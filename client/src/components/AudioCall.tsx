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

// A dedicated component to handle playing a single audio stream.
const AudioPlayer: React.FC<{ stream: MediaStream }> = ({ stream }) => {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(error => {
        console.error("Error attempting to play audio:", error);
        // This error often indicates an autoplay policy restriction.
      });
    }
  }, [stream]);

  return <audio ref={audioRef} autoPlay playsInline />;
};

const AudioCall: React.FC<AudioCallProps> = ({ username }) => {
  const { socket } = useSocket();
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [remoteUser, setRemoteUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<{ from: string; roomId: string } | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);

  // Mediasoup refs
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const producerTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const consumerTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const producerRef = useRef<mediasoupClient.types.Producer | null>(null);
  const consumersRef = useRef<Map<string, mediasoupClient.types.Consumer>>(new Map());
  const audioStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!socket) return;

    const handleIncomingCall = (data: { from: string; roomId: string }) => {
      if (isCallActive) {
        socket.emit('call-failed', { to: data.from, message: 'User is busy' });
        return;
      }
      setIncomingCall({ from: data.from, roomId: data.roomId });
    };

    const handleCallAccepted = () => {
      console.log('Call accepted, starting producer...');
      startProducing();
    };

    const handleCallEnded = () => {
      console.log('Call ended by remote user');
      cleanupCall();
    };

    const handleNewProducer = ({ producerId }: { producerId: string }) => {
      console.log('New producer detected:', producerId);
      consumeRemoteAudio(producerId);
    };

    const handleProducerClosed = ({ producerId }: { producerId: string }) => {
      console.log('Producer closed:', producerId);
      const consumer = consumersRef.current.get(producerId);
      if (consumer) {
        const closedTrack = consumer.track;
        setRemoteStreams(prevStreams =>
          prevStreams.filter(stream => stream.getTracks()[0].id !== closedTrack.id)
        );
        consumer.close();
        consumersRef.current.delete(producerId);
      }
    };

    const handleCallFailed = (data: { message: string }) => {
      console.error('Call failed:', data.message);
      setError(data.message);
      cleanupCall();
    };

    socket.on('incoming-call', handleIncomingCall);
    socket.on('call-accepted', handleCallAccepted);
    socket.on('call-ended', handleCallEnded);
    socket.on('new-producer', handleNewProducer);
    socket.on('producer-closed', handleProducerClosed);
    socket.on('call-failed', handleCallFailed);

    return () => {
      socket.off('incoming-call', handleIncomingCall);
      socket.off('call-accepted', handleCallAccepted);
      socket.off('call-ended', handleCallEnded);
      socket.off('new-producer', handleNewProducer);
      socket.off('producer-closed', handleProducerClosed);
      socket.off('call-failed', handleCallFailed);
    };
  }, [socket, isCallActive]);

  // Effect for cleaning up the call when the component unmounts
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, []);

  const initializeDeviceAndTransports = async (currentRoomId: string) => {
    if (!socket) throw new Error('Socket not connected');

    deviceRef.current = new mediasoupClient.Device();

    const routerRtpCapabilities = await new Promise<mediasoupClient.types.RtpCapabilities>((resolve, reject) => {
      socket.emit('getRouterRtpCapabilities', { roomId: currentRoomId }, (response: { routerRtpCapabilities?: mediasoupClient.types.RtpCapabilities, error?: string }) => {
        if (response.error || !response.routerRtpCapabilities) {
          reject(new Error(response.error || 'Failed to get router capabilities'));
        } else {
          resolve(response.routerRtpCapabilities);
        }
      });
    });

    await deviceRef.current.load({ routerRtpCapabilities });

    // Create Send Transport
    const sendTransportParams = await new Promise<WebRtcTransportResponse>((resolve, reject) => {
      socket.emit('createWebRtcTransport', { roomId: currentRoomId }, (response: WebRtcTransportResponse) => {
        if ('error' in response) reject(response.error);
        else resolve(response);
      });
    });
    producerTransportRef.current = deviceRef.current.createSendTransport(sendTransportParams);

    producerTransportRef.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
      socket.emit('connectTransport', { transportId: producerTransportRef.current?.id, dtlsParameters }, (response: { error?: string }) => {
        if (response.error) errback(new Error(response.error));
        else callback();
      });
    });

    producerTransportRef.current.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
      socket.emit('produce', { transportId: producerTransportRef.current?.id, kind, rtpParameters, roomId: currentRoomId }, (response: ProduceResponse) => {
        if ('error' in response) errback(new Error(response.error as string));
        else callback({ id: response.id });
      });
    });

    // Create Recv Transport
    const recvTransportParams = await new Promise<WebRtcTransportResponse>((resolve, reject) => {
      socket.emit('createWebRtcTransport', { roomId: currentRoomId }, (response: WebRtcTransportResponse) => {
        if ('error' in response) reject(response.error);
        else resolve(response);
      });
    });
    consumerTransportRef.current = deviceRef.current.createRecvTransport(recvTransportParams);

    consumerTransportRef.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
      socket.emit('connectTransport', { transportId: consumerTransportRef.current?.id, dtlsParameters }, (response: { error?: string }) => {
        if (response.error) errback(new Error(response.error));
        else callback();
      });
    });
  };

  const startProducing = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (!producerTransportRef.current) {
        throw new Error('Producer transport not initialized');
      }
      producerRef.current = await producerTransportRef.current.produce({ track });
    } catch (error) {
      console.error('Error starting production:', error);
      setError('Failed to start audio production');
      cleanupCall();
    }
  };

  const startCall = async (targetUser: string) => {
    try {
      const newRoomId = `${username}-${targetUser}-${Date.now()}`;
      roomIdRef.current = newRoomId;
      
      if (socket) {
        socket.emit('join-room', newRoomId);
      }

      await initializeDeviceAndTransports(newRoomId);
      
      if (socket) {
        socket.emit('call-user', { from: username, to: targetUser, roomId: newRoomId });
      }

      setRemoteUser(targetUser);
      setIsCallActive(true);
      setIsMuted(false);
      // The caller will wait for 'call-accepted' to start producing
    } catch (error) {
      console.error('Error starting call:', error);
      setError('Failed to start call');
      cleanupCall();
    }
  };

  const cleanupCall = () => {
    console.log('Cleaning up call resources...');
    if (isCallActive && remoteUser && socket) {
      socket.emit('end-call', { to: remoteUser });
    }

    setIsCallActive(false);
    setRemoteUser(null);
    roomIdRef.current = null;
    setIncomingCall(null);
    setError(null);

    producerRef.current?.close();
    producerRef.current = null;

    consumersRef.current.forEach(consumer => consumer.close());
    consumersRef.current.clear();

    producerTransportRef.current?.close();
    producerTransportRef.current = null;

    consumerTransportRef.current?.close();
    consumerTransportRef.current = null;

    audioStreamRef.current?.getTracks().forEach(track => track.stop());
    audioStreamRef.current = null;

    setRemoteStreams([]);
  };

  const consumeRemoteAudio = async (producerId: string) => {
    try {
      if (!deviceRef.current || !socket || !roomIdRef.current || !consumerTransportRef.current) {
        throw new Error('Cannot consume audio, required objects are not available');
      }
      if (!deviceRef.current.loaded) {
        console.log('Device is not loaded, cannot consume');
        return;
      }

      const { rtpCapabilities } = deviceRef.current;
      const data = await new Promise<any>((resolve, reject) => {
        socket.emit('consume', { transportId: consumerTransportRef.current?.id, producerId, rtpCapabilities, roomId: roomIdRef.current }, (response: any) => {
          if (response.error) reject(new Error(response.error));
          else resolve(response);
        });
      });

      const { id, kind, rtpParameters } = data;
      const consumer = await consumerTransportRef.current.consume({ id, producerId, kind, rtpParameters });
      consumersRef.current.set(producerId, consumer);

      const stream = new MediaStream([consumer.track]);
      setRemoteStreams(prevStreams => [...prevStreams, stream]);

      socket.emit('resume-consumer', { consumerId: consumer.id }, (response: { error?: string }) => {
        if (response.error) console.error('Failed to resume consumer:', response.error);
        else console.log('Consumer resumed');
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error consuming remote audio:', errorMessage);
      setError(`Failed to receive remote audio: ${errorMessage}`);
    }
  };

  const acceptCall = async () => {
    if (!incomingCall || !socket) return;
    
    try {
      const { from, roomId: newRoomId } = incomingCall;
      roomIdRef.current = newRoomId;
      setRemoteUser(from);
      
      socket.emit('join-room', newRoomId);
      
      await initializeDeviceAndTransports(newRoomId);
      
      socket.emit('call-accepted', { to: from, roomId: newRoomId });
      
      await startProducing();

      setIsCallActive(true);
      setIsMuted(false);
      setIncomingCall(null);
    } catch (error) {
      console.error('Error accepting call:', error);
      setError('Failed to accept call');
      if (socket && incomingCall) {
        socket.emit('call-failed', { to: incomingCall.from, message: 'Failed to accept call' });
      }
      cleanupCall();
    }
  };

  const rejectCall = () => {
    if (!incomingCall) return;
    if (socket) {
      socket.emit('call-failed', {
        to: incomingCall.from,
        message: 'Call rejected by user'
      });
    }
    setIncomingCall(null);
  };

  const endCall = () => {
    cleanupCall();
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
          {/* Remote audio streams will be played here */}
          {remoteStreams.map(stream => (
            <AudioPlayer key={stream.id} stream={stream} />
          ))}
          <div className="flex space-x-2">
            <button
              onClick={() => {
                if (producerRef.current && producerRef.current.track) {
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