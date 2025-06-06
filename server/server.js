const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-app-name.onrender.com', 'http://localhost:5173'] 
    : 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173', // Vite's default port
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Allow both WebSocket and polling
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true // Allow Engine.IO version 3
});

// Store connected users and call timeouts
const connectedUsers = new Map();
const callTimeouts = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('set-username', (username) => {
    console.log(`User ${username} (${socket.id}) is setting their username`);
    connectedUsers.set(username, socket.id);
    console.log('Current connected users:', Object.fromEntries(connectedUsers));
    
    // Broadcast to all clients that a new user has joined
    io.emit('user-joined', {
      username,
      message: `${username} has joined the chat`
    });

    // Send confirmation to the user
    socket.emit('username-set', { username });
  });

  socket.on('message', (data) => {
    // Find the username for this socket
    let senderUsername = null;
    for (const [username, id] of connectedUsers.entries()) {
      if (id === socket.id) {
        senderUsername = username;
        break;
      }
    }

    if (!senderUsername) {
      console.log('Message received from unknown user:', socket.id);
      return;
    }

    const message = {
      id: data.id,
      user: senderUsername,
      text: data.text,
      timestamp: new Date()
    };
    
    console.log('Broadcasting message:', {
      from: senderUsername,
      text: data.text,
      socketId: socket.id
    });

    // Use broadcast.emit to send to all clients except sender
    socket.broadcast.emit('message', message);
    // Send back to sender
    socket.emit('message', message);
  });

  // WebRTC Signaling
  socket.on('call-user', (data) => {
    console.log('Call attempt:', {
      from: data.from,
      to: data.to,
      signal: data.signal ? 'signal present' : 'no signal'
    });
    console.log('Current connected users:', Object.fromEntries(connectedUsers));
    
    const targetSocketId = connectedUsers.get(data.to);
    console.log('Target socket ID for', data.to, ':', targetSocketId);
    
    if (targetSocketId) {
      console.log(`Sending call to ${data.to} (socket: ${targetSocketId})`);
      io.to(targetSocketId).emit('incoming-call', {
        from: data.from,
        signal: data.signal
      });

      // Clear any existing timeouts for this call pair
      const timeoutKey1 = `${data.from}-${data.to}`;
      const timeoutKey2 = `${data.to}-${data.from}`;
      const existingTimeout1 = callTimeouts.get(timeoutKey1);
      const existingTimeout2 = callTimeouts.get(timeoutKey2);
      
      if (existingTimeout1) {
        clearTimeout(existingTimeout1);
        callTimeouts.delete(timeoutKey1);
        console.log('Cleared existing timeout for:', timeoutKey1);
      }
      if (existingTimeout2) {
        clearTimeout(existingTimeout2);
        callTimeouts.delete(timeoutKey2);
        console.log('Cleared existing timeout for:', timeoutKey2);
      }

      // Set a new timeout
      const timeoutId = setTimeout(() => {
        const currentSocketId = connectedUsers.get(data.to);
        if (currentSocketId === targetSocketId) {
          console.log(`Call timeout for ${data.to}`);
          io.to(targetSocketId).emit('call-failed', {
            message: 'Call timed out'
          });
          socket.emit('call-failed', {
            message: 'Call timed out'
          });
        }
      }, 30000);

      // Store the new timeout
      callTimeouts.set(timeoutKey1, timeoutId);
      callTimeouts.set(timeoutKey2, timeoutId);
      console.log('Stored new timeout for keys:', timeoutKey1, timeoutKey2);
    } else {
      console.log(`User ${data.to} not found in connected users. Available users:`, Object.fromEntries(connectedUsers));
      socket.emit('call-failed', {
        message: 'User is not connected'
      });
    }
  });

  socket.on('call-answer', (data) => {
    console.log('Call answer received:', {
      from: data.from,
      to: data.to,
      signalType: data.signal.type
    });

    // Clear the timeout since the call was accepted
    const timeoutKey1 = `${data.from}-${data.to}`;
    const timeoutKey2 = `${data.to}-${data.from}`;
    const timeoutId1 = callTimeouts.get(timeoutKey1);
    const timeoutId2 = callTimeouts.get(timeoutKey2);

    if (timeoutId1) {
      clearTimeout(timeoutId1);
      callTimeouts.delete(timeoutKey1);
      console.log('Cleared call timeout for:', timeoutKey1);
    }
    if (timeoutId2) {
      clearTimeout(timeoutId2);
      callTimeouts.delete(timeoutKey2);
      console.log('Cleared call timeout for:', timeoutKey2);
    }

    const targetUser = connectedUsers.get(data.to);
    if (targetUser) {
      console.log('Sending call answer to:', data.to);
      io.to(targetUser).emit('call-accepted', {
        from: data.from,
        signal: data.signal
      });
    } else {
      console.log('Target user not found for call answer:', data.to);
    }
  });

  socket.on('ice-candidate', (data) => {
    console.log('ICE candidate received:', {
      from: data.from,
      to: data.to,
      candidate: data.candidate ? 'present' : 'null'
    });
    
    const targetSocketId = connectedUsers.get(data.to);
    if (targetSocketId) {
      console.log(`Sending ICE candidate to ${data.to} (socket: ${targetSocketId})`);
      io.to(targetSocketId).emit('ice-candidate', {
        from: data.from,
        candidate: data.candidate
      });
    } else {
      console.log(`Target user ${data.to} not found for ICE candidate`);
    }
  });

  socket.on('end-call', ({ to }) => {
    console.log(`Call ended from ${socket.username} to ${to}`);
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      console.log(`Sending call ended to ${to} (socket ID: ${targetSocketId})`);
      io.to(targetSocketId).emit('call-ended', {
        from: socket.username
      });
    }
  });

  socket.on('call-failed', (data) => {
    console.log('Call failed:', {
      from: data.from,
      to: data.to,
      message: data.message
    });

    // Clear the timeout since the call was rejected
    const timeoutKey1 = `${data.from}-${data.to}`;
    const timeoutKey2 = `${data.to}-${data.from}`;
    const timeoutId1 = callTimeouts.get(timeoutKey1);
    const timeoutId2 = callTimeouts.get(timeoutKey2);

    if (timeoutId1) {
      clearTimeout(timeoutId1);
      callTimeouts.delete(timeoutKey1);
      console.log('Cleared call timeout for:', timeoutKey1);
    }
    if (timeoutId2) {
      clearTimeout(timeoutId2);
      callTimeouts.delete(timeoutKey2);
      console.log('Cleared call timeout for:', timeoutKey2);
    }

    const targetUser = connectedUsers.get(data.to);
    if (targetUser) {
      console.log('Sending call failed message to:', data.to);
      io.to(targetUser).emit('call-failed', {
        message: data.message
      });
    } else {
      console.log('Target user not found for call failed message:', data.to);
    }
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
      console.log(`User ${disconnectedUser} disconnected`);
      connectedUsers.delete(disconnectedUser);
      console.log('Remaining connected users:', Object.fromEntries(connectedUsers));
      
      // Broadcast to all clients that the user has left
      io.emit('user-left', {
        username: disconnectedUser,
        message: `${disconnectedUser} has left the chat`
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 