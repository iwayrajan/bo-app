import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { PaperAirplaneIcon } from '@heroicons/react/24/solid';
import { ArrowUturnLeftIcon } from '@heroicons/react/24/solid';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, Firestore, deleteDoc, getDocs, doc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Message, Reaction } from '../types';
import AudioCall from './AudioCall';
import { ReactionPicker } from './ReactionPicker';

const Chat: React.FC = () => {
  const { currentUser } = useAuth();
  const { socket, username } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedMessageIds = useRef<Set<string>>(new Set());
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<null | { id: string; user: string; text: string }>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load initial messages from Firebase
  useEffect(() => {
    console.log('Setting up Firebase listener');
    const messagesRef = collection(db, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newMessages: Message[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        newMessages.push({
          id: doc.id,
          user: data.user,
          text: data.text,
          timestamp: data.timestamp.toDate().toISOString(),
          reactions: data.reactions || [],
          replyTo: data.replyTo || undefined
        });
      });
      // Sort messages by timestamp
      newMessages.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        return timeA - timeB;
      });
      setMessages(newMessages);
    }, (error) => {
      console.error('Error fetching messages:', error);
      setError('Failed to load messages');
    });

    return () => {
      console.log('Cleaning up Firebase listener');
      unsubscribe();
    };
  }, []); // Empty dependency array since we want this to run only once

  // Handle real-time messages
  useEffect(() => {
    if (!socket) {
      console.log('Socket not connected, skipping message handler setup');
      return;
    }

    console.log('Setting up message handlers for user:', username);
    console.log('Current socket ID:', socket.id);

    const handleMessage = (message: Message) => {
      console.log('Received message from socket:', message);
      // Only add message if it's not from the current user
      if (message.user !== username) {
        setMessages(prevMessages => {
          // Check if message already exists
          const exists = prevMessages.some(m => m.id === message.id);
          if (exists) {
            console.log('Message already exists, skipping:', message);
            return prevMessages;
          }
          
          // Add new message and sort
          const newMessages = [...prevMessages, message].sort((a, b) => {
            const timeA = new Date(a.timestamp).getTime();
            const timeB = new Date(b.timestamp).getTime();
            return timeA - timeB;
          });
          return newMessages;
        });
      }
    };

    const handleReaction = (data: { messageId: string; reaction: Reaction }) => {
      console.log('Received reaction:', data);
      setMessages(prevMessages => 
        prevMessages.map(msg => {
          if (msg.id === data.messageId) {
            const existingReaction = msg.reactions?.find(r => r.emoji === data.reaction.emoji);
            if (existingReaction) {
              return {
                ...msg,
                reactions: msg.reactions?.map(r => 
                  r.emoji === data.reaction.emoji ? data.reaction : r
                )
              };
            }
            return {
              ...msg,
              reactions: [...(msg.reactions || []), data.reaction]
            };
          }
          return msg;
        })
      );
    };

    const handleReactionRemoved = (data: { messageId: string; emoji: string; username: string }) => {
      console.log('Reaction removed:', data);
      setMessages(prevMessages => 
        prevMessages.map(msg => {
          if (msg.id === data.messageId) {
            return {
              ...msg,
              reactions: msg.reactions?.map(reaction => {
                if (reaction.emoji === data.emoji) {
                  return {
                    ...reaction,
                    users: reaction.users.filter(user => user !== data.username)
                  };
                }
                return reaction;
              }).filter(reaction => reaction.users.length > 0)
            };
          }
          return msg;
        })
      );
    };

    socket.on('message', handleMessage);
    socket.on('message-reaction', handleReaction);
    socket.on('message-reaction-removed', handleReactionRemoved);

    return () => {
      console.log('Cleaning up message handlers');
      socket.off('message', handleMessage);
      socket.off('message-reaction', handleReaction);
      socket.off('message-reaction-removed', handleReactionRemoved);
    };
  }, [socket, username]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || !username) return;

    try {
      // Save to Firebase first
      const docRef = await addDoc(collection(db, 'messages'), {
        user: username,
        text: newMessage,
        timestamp: new Date(),
        reactions: [],
        replyTo: replyTo ? { id: replyTo.id, user: replyTo.user, text: replyTo.text } : null
      });

      // Create message with Firebase ID
      const message: Message = {
        id: docRef.id,
        user: username,
        text: newMessage,
        timestamp: new Date().toISOString(),
        reactions: [],
        replyTo: replyTo ? { id: replyTo.id, user: replyTo.user, text: replyTo.text } : undefined
      };

      // Don't update local state here - let Firebase's onSnapshot handle it
      // Emit to socket for other users
      socket.emit('send-message', message);
      setNewMessage('');
      setReplyTo(null);
      // Restore focus to input
      if (inputRef.current) inputRef.current.focus();
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    }
  };

  const handleReaction = (messageId: string, emoji: string) => {
    if (!socket || !username) return;

    const message = messages.find(m => m.id === messageId);
    if (!message) return;

    const existingReaction = message.reactions?.find(r => r.emoji === emoji);
    if (existingReaction) {
      if (existingReaction.users.includes(username)) {
        // Remove reaction
        socket.emit('remove-reaction', {
          messageId,
          emoji,
          username
        });
      } else {
        // Add user to reaction
        socket.emit('add-reaction', {
          messageId,
          reaction: {
            emoji,
            users: [...existingReaction.users, username]
          }
        });
      }
    } else {
      // Add new reaction
      socket.emit('add-reaction', {
        messageId,
        reaction: {
          emoji,
          users: [username]
        }
      });
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

  // Function to toggle selection of a message
  const toggleSelectMessage = (id: string) => {
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Function to delete selected messages
  const deleteSelectedMessages = async () => {
    if (selectedMessages.size === 0) return;
    if (!window.confirm('Delete selected messages? This cannot be undone.')) return;
    try {
      const deletePromises = Array.from(selectedMessages).map(async (id) => {
        const docRef = collection(db, 'messages');
        // Firestore doc id is the message id
        return deleteDoc(doc(db, 'messages', id));
      });
      await Promise.all(deletePromises);
      setSelectedMessages(new Set());
    } catch (error) {
      console.error('Error deleting selected messages:', error);
      setError('Failed to delete selected messages. Please try again.');
    }
  };

  return (
    <div className="flex flex-col h-[90vh] bg-gray-100">
      {/* Connection Status */}
      <div className={`p-2 text-center text-sm ${socket ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        {socket ? 'Connected' : 'Disconnected'}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${
              message.user === username ? 'receiver justify-end' : 'sender justify-start'
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 relative ${
                message.user === username
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-800'
              }`}
            >
              {/* Selection Checkbox - always visible, inside bubble */}
              <input
                type="checkbox"
                checked={selectedMessages.has(message.id)}
                onChange={() => toggleSelectMessage(message.id)}
                className="absolute z-10"
                title="Select message"
              />
              {/* Reply Icon */}
              <button
                className="absolute replymsg text-gray-400 hover:text-blue-600"
                title="Reply"
                onClick={() => setReplyTo({ id: message.id, user: message.user, text: message.text })}
                style={{ zIndex: 11 }}
              >
                <ArrowUturnLeftIcon className="h-4 w-4" />
              </button>
              {/* Quoted message if this is a reply */}
              {message.replyTo && (
                <div className="mb-1 px-2 py-1 rounded bg-gray-300 text-gray-800 text-xs border-l-4 border-blue-400">
                  <span className="font-semibold">{message.replyTo.user}:</span> {message.replyTo.text}
                </div>
              )}
              <div className="text-sm">{message.text}</div>
              <div className="text-xs mt-1 opacity-75">
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
              {message.reactions && message.reactions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {message.reactions.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      onClick={() => handleReaction(message.id, reaction.emoji)}
                      className={`px-2 py-1 rounded-full text-xs ${
                        username && reaction.users.includes(username)
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {reaction.emoji} {reaction.users.length}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowReactionPicker(message.id)}
                className="absolute -bottom-2 right-0 text-gray-500 hover:text-gray-700 bg-white rounded-full p-1 shadow-sm"
              >
                😀
              </button>
              {showReactionPicker === message.id && (
                <div className="absolute bottom-full right-0 mb-2">
                  <ReactionPicker
                    onSelect={(emoji) => handleReaction(message.id, emoji)}
                    onClose={() => setShowReactionPicker(null)}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Delete Selected Button */}
      {selectedMessages.size > 0 && (
        <div className="p-4 bg-white border-t flex justify-end">
          <button
            onClick={deleteSelectedMessages}
            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
          >
            Delete Selected ({selectedMessages.size})
          </button>
        </div>
      )}

      {/* Reply Preview above input */}
      {replyTo && (
        <div className="flex items-center bg-blue-100 border-l-4 border-blue-500 px-3 py-2 mb-2">
          <div className="flex-1">
            <span className="font-semibold text-blue-700">Replying to {replyTo.user}:</span>
            <span className="ml-2 text-gray-700">{replyTo.text}</span>
          </div>
          <button
            className="ml-2 text-gray-500 hover:text-red-600"
            onClick={() => setReplyTo(null)}
            title="Cancel reply"
          >
            ✕
          </button>
        </div>
      )}

      {/* Message Input */}
      <form onSubmit={handleSendMessage} className="p-4 bg-white border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={replyTo ? `Replying to ${replyTo.user}...` : "Type a message..."}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:border-blue-500"
            ref={inputRef}
          />
          <button
            type="submit"
            disabled={!socket}
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
      {username && <AudioCall username={username} />}
    </div>
  );
};

export default Chat; 
