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

// Store connected users
const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  console.log('Current connected users:', Array.from(connectedUsers.entries()));

  socket.on('set-username', (username) => {
    console.log(`Setting username ${username} for socket ${socket.id}`);
    socket.username = username;
    connectedUsers.set(username, socket.id);
    console.log(`User ${username} connected with socket ID: ${socket.id}`);
    console.log('Current connected users:', Array.from(connectedUsers.entries()));
    
    // Broadcast user joined message
    socket.broadcast.emit('message', {
      user: 'System',
      text: `${username} joined the chat`,
      timestamp: new Date()
    });
  });

  socket.on('message', (data) => {
    const message = {
      id: data.id,
      user: socket.username,
      text: data.text,
      timestamp: new Date()
    };
    // Use broadcast.emit to send to all clients except sender
    socket.broadcast.emit('message', message);
    // Send back to sender
    socket.emit('message', message);
  });

  // WebRTC Signaling
  socket.on('call-user', ({ to, offer }) => {
    console.log(`Call attempt from ${socket.username} to ${to}`);
    console.log('Connected users:', Array.from(connectedUsers.entries()));
    console.log('Socket IDs:', Array.from(connectedUsers.values()));
    
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      console.log(`Sending call to ${to} (socket ID: ${targetSocketId})`);
      io.to(targetSocketId).emit('incoming-call', {
        from: socket.username,
        offer
      });
    } else {
      console.log(`User ${to} not found. Available users:`, Array.from(connectedUsers.keys()));
      socket.emit('call-failed', { message: 'User not found' });
    }
  });

  socket.on('call-answer', ({ to, answer }) => {
    console.log(`Call answer from ${socket.username} to ${to}`);
    console.log('Current connected users:', Array.from(connectedUsers.entries()));
    
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      console.log(`Sending answer to ${to} (socket ID: ${targetSocketId})`);
      io.to(targetSocketId).emit('call-accepted', {
        from: socket.username,
        answer
      });
    } else {
      console.log(`Target user ${to} not found for call answer`);
      socket.emit('call-failed', { message: 'Target user not found' });
    }
  });

  socket.on('ice-candidate', ({ to, candidate }) => {
    console.log(`ICE candidate from ${socket.username} to ${to}`);
    console.log('Current connected users:', Array.from(connectedUsers.entries()));
    
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      console.log(`Sending ICE candidate to ${to} (socket ID: ${targetSocketId})`);
      io.to(targetSocketId).emit('ice-candidate', {
        from: socket.username,
        candidate
      });
    } else {
      console.log(`Target user ${to} not found for ICE candidate`);
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

  socket.on('disconnect', () => {
    if (socket.username) {
      console.log(`User ${socket.username} disconnected`);
      connectedUsers.delete(socket.username);
      console.log('Remaining users:', Array.from(connectedUsers.entries()));
      
      // Broadcast user left message
      socket.broadcast.emit('message', {
        user: 'System',
        text: `${socket.username} left the chat`,
        timestamp: new Date()
      });
    }
    console.log('Socket disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 