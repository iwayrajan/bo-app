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

    const userEmail = currentUser.email;
    const extractedUsername = userEmail.split('@')[0];
    console.log('Extracted username from email:', extractedUsername);
    setUsername(extractedUsername);
  }, [currentUser]);

  useEffect(() => {
    if (!username) {
      console.log('No username provided, skipping socket initialization');
      return;
    }

    console.log('Initializing socket connection for user:', username);
    
    // Create socket connection
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      auth: {
        username
      }
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('Socket connected successfully');
      console.log('Socket ID:', newSocket.id);
      setIsConnected(true);
      
      // Set username after connection
      console.log('Setting username:', username);
      newSocket.emit('set-username', username);
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected. Reason:', reason);
      setIsConnected(false);
    });

    newSocket.on('username-set', (data) => {
      console.log('Username set confirmed:', data.username);
    });

    // Set socket instance
    setSocket(newSocket);

    // Cleanup function
    return () => {
      console.log('Cleaning up socket connection');
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [username]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, username }}>
      {children}
    </SocketContext.Provider>
  );
}; 