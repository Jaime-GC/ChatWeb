import express, { Application, Request, Response } from "npm:express@4.18.2";
import process from "node:process";
import http from "node:http";
import { Server, Socket } from "socket.io";
import logger from "morgan";
import { createClient } from "@libsql/client";
import { config } from "https://deno.land/x/dotenv/mod.ts";


const env = config();

const port: number = 3000;

const app: Application = express();


app.use(logger('dev'));
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(process.cwd() + "/index.html");
});

const httpserver: http.Server = http.createServer(app);
const io: Server = new Server(httpserver, {
  connectionStateRecovery: {}
});

const db = createClient({
  url: 'libsql://smart-galactus-jaime-gc.turso.io',
  authToken: env.DB_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    message TEXT,
    time TEXT
  )
`)

io.on('connection', async (socket: Socket) => {
  console.log('a user connected');

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('chat message', async ({ user, message }) => {
  
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let result;

  try {
    result = await db.execute({  
      sql: 'INSERT INTO messages (user, message, time) VALUES (:usuario, :mensaje, :tiempo)',
      args: {
        usuario:user, 
        mensaje:message, 
        tiempo:time
      },
    });

  } catch (error) {
    console.error('Error inserting message', error);
    return;
  }

  io.emit('chat message', { user, message, time }, result.lastInsertRowid?.toString());
    
  });

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: 'SELECT id, user, message, time FROM messages WHERE id > ?',
        args: [socket.handshake.auth.serverOffset ?? 0],
      });

      results.rows.forEach((row) => {
        if (row.id !== null) {
          socket.emit('chat message', 
          {
            user: row.user,
            message: row.message,
            time: row.time,
          }, 
          row.id.toString());
        }
      });

    } catch (error) {
      console.error('Error fetching messages', error);
      return;
    }
  }
});

httpserver.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
