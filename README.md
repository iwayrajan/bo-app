# Real-time Chat Application with Audio Calls

A full-stack chat application built with React, Node.js, Socket.IO, and WebRTC. Features include real-time messaging and audio calls.

## Features

- Real-time chat messaging
- Audio calls using WebRTC
- User authentication with Firebase
- Message persistence with Firestore
- Modern UI with Tailwind CSS

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Firebase account
- Google Cloud account (for service account)

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/iwayrajan/bo-app.git
cd bo-app
```

### 2. Server Setup

```bash
cd server
npm install
```

Create a `.env` file in the server directory:
```
PORT=3000
NODE_ENV=development
```

### 3. Client Setup

```bash
cd client
npm install
```

Create a `.env` file in the client directory:
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### 4. Firebase Setup

1. Create a new Firebase project
2. Enable Authentication (Email/Password)
3. Create a Firestore database
4. Download your service account key and save it as `server/serviceAccountKey.json`

### 5. Running the Application

Start the server:
```bash
cd server
npm run dev
```

Start the client:
```bash
cd client
npm run dev
```

## Deployment

### Server Deployment (Render)

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set the following:
   - Root Directory: `server`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Add environment variables:
   - `NODE_ENV`: `production`
   - `PORT`: `3000`

### Client Deployment (Render)

1. Create a new Static Site on Render
2. Connect your GitHub repository
3. Set the following:
   - Root Directory: `client`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `dist`
4. Add environment variables from your Firebase project

## Security Notes

- Never commit `serviceAccountKey.json` to the repository
- Use environment variables for sensitive information
- Keep your Firebase configuration secure

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