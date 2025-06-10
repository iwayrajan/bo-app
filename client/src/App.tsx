import { useAuth } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import Chat from './components/Chat';
import Auth from './components/Auth';

function App() {
  const { currentUser, logout } = useAuth();

  if (!currentUser) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow h-[9.5vh]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold">Chat App</h1>
            </div>
            <div className="flex items-center">
              <span className="text-gray-700 mr-4">Welcome, {currentUser.username}</span>
              <button
                onClick={logout}
                className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <SocketProvider username={currentUser.username}>
        <Chat username={currentUser.username} />
      </SocketProvider>
    </div>
  );
}

export default App; 