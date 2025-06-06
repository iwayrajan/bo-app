# Real-Time Chat Application

A modern real-time chat application built with React, Firebase, and Socket.IO.

## Features

- Real-time messaging with Socket.IO
- Message persistence using Firebase Firestore
- User presence notifications (join/leave)
- Modern UI with Tailwind CSS
- Responsive design
- Message timestamps
- System notifications for user events

## Tech Stack

- Frontend: React with TypeScript
- Backend: Node.js with Express
- Real-time Communication: Socket.IO
- Database: Firebase Firestore
- Styling: Tailwind CSS
- Icons: Heroicons

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Firebase account
- Git

## Setup

1. Clone the repository:
```bash
git clone https://github.com/iwayrajan/chatapp.git
cd chatapp
```

2. Install dependencies:
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

3. Create a Firebase project and enable Firestore:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project
   - Enable Firestore Database
   - Get your Firebase configuration

4. Create environment files:
   - Create `.env.local` in the client directory with your Firebase config
   - Create `.env` in the server directory with your port configuration

5. Start the development servers:
```bash
# Start the backend server (from server directory)
npm run dev

# Start the frontend (from client directory)
npm run dev
```

## Project Structure

```
chatapp/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── contexts/      # React contexts
│   │   ├── config/        # Configuration files
│   │   └── types/         # TypeScript types
│   └── public/            # Static files
└── server/                # Node.js backend
    ├── src/              # Source files
    └── package.json      # Dependencies
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

- **Rajan Kumar** - [iwayrajan](https://github.com/iwayrajan)
- Email: rajankumarit@gmail.com 