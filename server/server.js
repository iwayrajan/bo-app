const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.set('trust proxy', 1); // Trust the Render proxy
const server = http.createServer(app);

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? /https:\/\/.*\.onrender\.com/
    : 'http://localhost:5173',
  methods: ['GET', 'POST'],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? /https:\/\/.*\.onrender\.com/
      : 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  behindProxy: true
});

// Store connected users
const connectedUsers = new Map();

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

  socket.on('call-user', ({ from, to, roomId }) => {
    const toSocketId = connectedUsers.get(to);
    console.log(`User ${from} is calling ${to} in room ${roomId}. Target socket ID: ${toSocketId}`);
    if (toSocketId) {
      io.to(toSocketId).emit('incoming-call', { from, roomId });
    } else {
      socket.emit('call-failed', { to, message: 'User is not online' });
    }
  });

  socket.on('end-call', ({ to }) => {
    const toSocketId = connectedUsers.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit('call-ended');
    }
  });

  socket.on('call-failed', ({ to, message }) => {
    const toSocketId = connectedUsers.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit('call-failed', { message });
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});