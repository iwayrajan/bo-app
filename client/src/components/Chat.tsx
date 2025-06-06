import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, Firestore, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Message } from '../types/message';
import AudioCall from './AudioCall';

interface ChatProps {
  username: string;
}

const Chat: React.FC<ChatProps> = ({ username }) => {
  const { socket, isConnected } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());

  // Load initial messages from Firebase
  useEffect(() => {
    console.log('Setting up Firebase listener');
    const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added' && !processedMessageIds.current.has(change.doc.id)) {
          const messageData = change.doc.data();
          const message: Message = {
            id: change.doc.id,
            user: messageData.user,
            text: messageData.text,
            timestamp: messageData.timestamp?.toDate?.() || new Date()
          };
          setMessages(prev => {
            // Check if message already exists
            const exists = prev.some(m => m.id === message.id);
            if (exists) {
              console.log('Message already exists, skipping:', message);
              return prev;
            }
            
            // Add new message and sort by timestamp
            const newMessages = [...prev, message].sort((a, b) => 
              a.timestamp.getTime() - b.timestamp.getTime()
            );
            return newMessages;
          });
          
          processedMessageIds.current.add(change.doc.id);
        }
      });
    }, (error) => {
      console.error('Error loading messages from Firebase:', error);
      setError('Failed to load messages. Please try again later.');
    });

    return () => {
      console.log('Cleaning up Firebase listener');
      unsubscribe();
    };
  }, [processedMessageIds]);

  // Handle real-time messages
  useEffect(() => {
    if (!socket || !isConnected) {
      console.log('Socket not available or not connected, skipping message handler setup');
      return;
    }

    console.log('Setting up message handlers for socket:', socket.id);

    const handleUserJoined = (data: { username: string }) => {
      console.log('User joined event received:', data.username);
      setMessages(prev => [...prev, {
        user: 'System',
        text: `${data.username} joined the chat`,
        timestamp: new Date()
      }]);
    };

    const handleUserLeft = (data: { username: string }) => {
      console.log('User left event received:', data.username);
      setMessages(prev => [...prev, {
        user: 'System',
        text: `${data.username} left the chat`,
        timestamp: new Date()
      }]);
    };

    const handleMessage = (message: Message) => {
      console.log('Message received:', message);
      if (!processedMessageIds.current.has(message.id!)) {
        setMessages(prev => {
          // Check if message already exists
          const exists = prev.some(m => m.id === message.id);
          if (exists) {
            console.log('Message already exists, skipping:', message);
            return prev;
          }
          
          console.log('Adding new message:', message);
          // Convert timestamp to Date object if it's a string
          const messageWithDate = {
            ...message,
            timestamp: typeof message.timestamp === 'string' 
              ? new Date(message.timestamp)
              : message.timestamp
          };
          
          // Add new message and sort by timestamp
          const newMessages = [...prev, messageWithDate].sort((a, b) => 
            a.timestamp.getTime() - b.timestamp.getTime()
          );
          return newMessages;
        });
        
        if (message.id) {
          processedMessageIds.current.add(message.id);
        }
      }
    };

    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('message', handleMessage);

    return () => {
      console.log('Cleaning up Socket.IO event listeners');
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
      socket.off('message', handleMessage);
    };
  }, [socket, isConnected, processedMessageIds]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !newMessage.trim()) {
      console.log('Cannot send message: socket not available or message empty');
      return;
    }

    if (!socket.connected) {
      console.error('Socket not connected, cannot send message');
      return;
    }

    try {
      console.log('Sending message:', newMessage);
      // First save to Firebase to get the document ID
      const docRef = await addDoc(collection(db, 'messages'), {
        user: username,
        text: newMessage,
        timestamp: serverTimestamp()
      });

      // Then emit the message through Socket.IO with the document ID
      const messageData = {
        id: docRef.id,
        user: username,
        text: newMessage,
        timestamp: new Date().toISOString() // Convert to ISO string for consistent format
      };
      console.log('Emitting message through Socket.IO:', messageData);
      socket.emit('message', messageData);
      setNewMessage('');
    } catch (error) {
      console.error('Error saving message to Firestore:', error);
      // If Firebase fails, still send through Socket.IO without ID
      const messageData = {
        user: username,
        text: newMessage,
        timestamp: new Date().toISOString() // Convert to ISO string for consistent format
      };
      console.log('Emitting message through Socket.IO (without Firebase):', messageData);
      socket.emit('message', messageData);
      setNewMessage('');
    }
  };

  const clearChat = async () => {
    if (!window.confirm('Are you sure you want to clear all messages? This action cannot be undone.')) {
      return;
    }

    try {
      const messagesRef = collection(db, 'messages');
      const snapshot = await getDocs(messagesRef);
      
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      setMessages([]);
      processedMessageIds.current.clear();
    } catch (error) {
      console.error('Error clearing messages:', error);
      setError('Failed to clear messages. Please try again.');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100">
      {/* Connection Status */}
      <div className={`p-2 text-center text-sm ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={message.id || index}
            className={`flex ${
              message.user === username ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                message.user === username
                  ? 'bg-blue-500 text-white'
                  : message.user === 'System'
                  ? 'bg-gray-200 text-gray-800'
                  : 'bg-white text-gray-800'
              }`}
            >
              <div>{message.text}</div>
              <div className="text-xs mt-1 opacity-75">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <form onSubmit={sendMessage} className="p-4 bg-white border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!isConnected}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mx-4 mb-4">
          {error}
          <button
            className="absolute top-0 bottom-0 right-0 px-4 py-3"
            onClick={() => setError(null)}
          >
            <span className="sr-only">Dismiss</span>
            <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="border-t p-4">
        <div className="flex justify-between items-center mb-4">
          <button
            onClick={clearChat}
            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Clear Chat
          </button>
        </div>
      </div>

      {/* Audio Call Component */}
      <AudioCall username={username} />
    </div>
  );
};

export default Chat; 