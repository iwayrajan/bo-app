import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  username: string | null;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

const SOCKET_URL = import.meta.env.PROD 
  ? 'https://your-app-name.onrender.com'
  : 'http://localhost:3000';

interface SocketProviderProps {
  children: React.ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser?.email) {
      console.log('No user logged in, skipping socket connection');
      return;
    }

    const username = currentUser.email.split('@')[0];
    console.log('Initializing socket connection for user:', username);
    
    // Create socket connection
    const newSocket = io(SOCKET_URL, {
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],
      withCredentials: true,
      autoConnect: true,
      forceNew: true
    });

    // Set socket immediately so components can access it
    setSocket(newSocket);

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('Socket connected successfully');
      console.log('Socket ID:', newSocket.id);
      setIsConnected(true);
      
      // Set username after connection is established
      console.log('Setting username:', username);
      newSocket.emit('set-username', username);
    });

    newSocket.on('username-set', (data) => {
      console.log('Username set confirmed:', data.username);
      setUsername(data.username);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected. Reason:', reason);
      setIsConnected(false);
      setUsername(null);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error.message);
      setIsConnected(false);
      setUsername(null);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Attempting to reconnect...', attemptNumber);
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      // Re-set username after reconnection
      newSocket.emit('set-username', username);
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
    });

    newSocket.on('reconnect_failed', () => {
      console.error('Failed to reconnect');
    });

    // Cleanup function
    return () => {
      console.log('Cleaning up socket connection');
      if (newSocket) {
        newSocket.disconnect();
      }
      setSocket(null);
      setIsConnected(false);
      setUsername(null);
    };
  }, [currentUser]); // Re-run if currentUser changes

  return (
    <SocketContext.Provider value={{ socket, isConnected, username }}>
      {children}
    </SocketContext.Provider>
  );
}; 