const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://chatapp-client-fg8u.onrender.com', 'http://localhost:5173'] 
    : 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? 'https://chatapp-client-fg8u.onrender.com'
      : 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true
});

// Mediasoup workers
let mediasoupWorker;
const mediasoupRouter = new Map(); // roomId -> router
const producerTransports = new Map(); // transportId -> transport
const consumerTransports = new Map(); // transportId -> transport
const producers = new Map(); // producerId -> producer
const consumers = new Map(); // consumerId -> consumer

// Initialize mediasoup worker
async function initializeMediasoup() {
  mediasoupWorker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 10000,
    rtcMaxPort: 10100,
  });

  console.log('Mediasoup worker created');
}

// Create mediasoup router for a room
async function createRouter(roomId) {
  if (mediasoupRouter.has(roomId)) {
    return mediasoupRouter.get(roomId);
  }

  const router = await mediasoupWorker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
    ],
  });

  mediasoupRouter.set(roomId, router);
  return router;
}

// Store connected users and call timeouts
const connectedUsers = new Map();
const callTimeouts = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('set-username', (username) => {
    console.log(`User ${username} (${socket.id}) is setting their username`);
    connectedUsers.set(username, socket.id);
    console.log('Current connected users:', Object.fromEntries(connectedUsers));
    
    io.emit('user-joined', {
      username,
      message: `${username} has joined the chat`
    });

    socket.emit('username-set', { username });
  });

  // Mediasoup WebRTC transport creation
  socket.on('createWebRtcTransport', async ({ roomId }, callback) => {
    try {
      const router = await createRouter(roomId);
      const transport = await router.createWebRtcTransport({
        listenIps: [
          {
            ip: '0.0.0.0',
            announcedIp: process.env.NODE_ENV === 'production' 
              ? process.env.SERVER_IP 
              : '127.0.0.1'
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      transport.observer.on('close', () => {
        transport.close();
      });

      producerTransports.set(transport.id, transport);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });
    } catch (error) {
      console.error('Error creating WebRTC transport:', error);
      callback({ error: 'Failed to create transport' });
    }
  });

  // Connect transport
  socket.on('connectTransport', async ({ transportId, dtlsParameters }, callback) => {
    try {
      const transport = producerTransports.get(transportId);
      if (!transport) {
        throw new Error('Transport not found');
      }

      await transport.connect({ dtlsParameters });
      callback({ success: true });
    } catch (error) {
      console.error('Error connecting transport:', error);
      callback({ error: 'Failed to connect transport' });
    }
  });

  // Produce audio
  socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
    try {
      const transport = producerTransports.get(transportId);
      if (!transport) {
        throw new Error('Transport not found');
      }

      const producer = await transport.produce({ kind, rtpParameters });
      producers.set(producer.id, producer);

      producer.observer.on('close', () => {
        producers.delete(producer.id);
      });

      callback({ id: producer.id });
    } catch (error) {
      console.error('Error producing:', error);
      callback({ error: 'Failed to produce' });
    }
  });

  // Consume audio
  socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
    try {
      const transport = consumerTransports.get(transportId);
      if (!transport) {
        throw new Error('Transport not found');
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      consumers.set(consumer.id, consumer);

      consumer.observer.on('close', () => {
        consumers.delete(consumer.id);
      });

      callback({
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        producerId: producer.id,
      });
    } catch (error) {
      console.error('Error consuming:', error);
      callback({ error: 'Failed to consume' });
    }
  });

  // Handle incoming messages
  socket.on('send-message', (message) => {
    console.log('Received message:', message);
    socket.broadcast.emit('message', message);
  });

  // Handle reactions
  socket.on('add-reaction', (data) => {
    console.log('Received reaction:', data);
    socket.broadcast.emit('message-reaction', data);
  });

  socket.on('remove-reaction', (data) => {
    console.log('Received reaction removal:', data);
    socket.broadcast.emit('message-reaction-removed', data);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    // Find and remove the disconnected user
    let disconnectedUser = null;
    for (const [username, id] of connectedUsers.entries()) {
      if (id === socket.id) {
        disconnectedUser = username;
        break;
      }
    }
    
    if (disconnectedUser) {
      connectedUsers.delete(disconnectedUser);
      console.log(`User ${disconnectedUser} disconnected`);
      
      // Notify other users
      io.emit('user-left', {
        username: disconnectedUser,
        message: `${disconnectedUser} has left the chat`
      });
    }
  });
});

// Initialize mediasoup and start server
initializeMediasoup().then(() => {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}); 