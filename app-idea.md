✅ Feature Breakdown & Implementation Guide
1. 🟢 Real-Time Messaging
Tech: WebSockets (Socket.IO is easiest with Node.js)

Backend: Node.js + Express + Socket.IO

Frontend: React (or plain HTML/JS) + Socket.IO-client

DB: MongoDB (Free tier on MongoDB Atlas)

2. ❌ Delete Chats
Add a soft-delete field like isDeleted: true

Optionally allow full delete (remove from DB)

3. 🔕 Mute Notifications
Store a mutedUsers array or setting per user

On receiving a new message, skip notification logic if sender is muted

4. 📞 Audio Call
Tech: WebRTC (peer-to-peer)

Signaling: Reuse your WebSocket (Socket.IO) server

Use Simple-Peer or PeerJS

5. 📁 Send Files
Store files temporarily in cloud (free tier options):

Firebase Storage (free)

Cloudinary (free tier)

Upload files from frontend, send file URL via Socket.IO

6. ✅ Message Read Receipts
On frontend, send "message seen" event

Backend marks messages as read with a readAt timestamp

7. ⏱️ Auto Delete Messages (5 mins after read)
Use readAt timestamp

Set a cron job (e.g., every 1 minute) to:

Query messages where readAt is older than 5 minutes

Delete them

🧰 Suggested Free Stack
Component	Stack
Frontend	React + Socket.IO-client
Backend	Node.js + Express + Socket.IO
Realtime	Socket.IO (self-hosted)
DB	MongoDB Atlas (free tier)
File Uploads	Firebase Storage / Cloudinary
Audio Calls	WebRTC + Socket.IO signaling
Hosting (Free)	Vercel