const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// --- DATABASE SETUP ---
let db;
(async () => {
    // Open (or create) the database file
    db = await open({
        filename: './game.db',
        driver: sqlite3.Database
    });

 await db.exec('PRAGMA foreign_keys=ON;');

    // Create Tables if they don't exist
    await db.exec(`
        CREATE TABLE IF NOT EXISTS rooms (
            roomId TEXT PRIMARY KEY,
            status TEXT DEFAULT 'WAITING',
            rolesAssigned BOOLEAN DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY,
            roomId TEXT,
            name TEXT,
            role TEXT,
            score INTEGER DEFAULT 0,
            FOREIGN KEY(roomId) REFERENCES rooms(roomId)
        );
    `);
    console.log("Connected to SQLite database.");
})();

// Points Config
const POINTS = { Raja: 1000, Mantri: 800, Sipahi: 500, Chor: 0 };

// --- HELPER FUNCTION: Shuffle ---
const generateRoles = () => {
    const roles = ['Raja', 'Mantri', 'Sipahi', 'Chor'];
    for (let i = roles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    return roles;
};

// --- API ENDPOINTS ---

// 1. CREATE ROOM
app.post('/room/create', async (req, res) => {
    const { playerName } = req.body;
    if (!playerName) return res.status(400).json({ error: "Name required" });

    const roomId = uuidv4().slice(0, 6);
    const playerId = uuidv4();

    try {
        // Insert Room
        await db.run(
            'INSERT INTO rooms (roomId, status, rolesAssigned) VALUES (?, ?, ?)', 
            [roomId, 'WAITING', 0]
        );
        // Insert Player
        await db.run(
            'INSERT INTO players (id, roomId, name, score) VALUES (?, ?, ?, ?)', 
            [playerId, roomId, playerName, 0]
        );

        res.json({ message: "Room created", roomId, playerId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. JOIN ROOM 
app.post('/room/join', async (req, res) => {
    const { roomId, playerName } = req.body;

    try {
        const room = await db.get('SELECT * FROM rooms WHERE roomId = ?', [roomId]);
        if (!room) return res.status(404).json({ error: "Room not found" });

        const playerCount = await db.get('SELECT COUNT(*) as count FROM players WHERE roomId = ?', [roomId]);
        if (playerCount.count >= 4) return res.status(400).json({ error: "Room is full" });

        const playerId = uuidv4();
        await db.run(
            'INSERT INTO players (id, roomId, name, score) VALUES (?, ?, ?, ?)',
            [playerId, roomId, playerName, 0]
        );

        res.json({ message: "Joined successfully", roomId, playerId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 3. GET ALL PLAYERS
app.get('/room/players/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const players = await db.all('SELECT name FROM players WHERE roomId = ?', [roomId]);
    res.json({ players: players.map(p => p.name), count: players.length });
});

// 4. ASSIGN ROLES
app.post('/room/assign/:roomId', async (req, res) => {
    const { roomId } = req.params;

    try {
        const players = await db.all('SELECT * FROM players WHERE roomId = ?', [roomId]);
        
        if (players.length < 4) return res.status(400).json({ error: "Need 4 players" });
        
        const roles = generateRoles();

        // Update each player with a role
        for (let i = 0; i < players.length; i++) {
            await db.run('UPDATE players SET role = ? WHERE id = ?', [roles[i], players[i].id]);
        }

        // Update Room Status
        await db.run('UPDATE rooms SET status = ?, rolesAssigned = ? WHERE roomId = ?', ['PLAYING', 1, roomId]);

        res.json({ message: "Roles assigned. Game started!" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 5. SEE MY ROLE
app.get('/role/me/:roomId/:playerId', async (req, res) => {
    const { roomId, playerId } = req.params;
    const player = await db.get('SELECT * FROM players WHERE id = ? AND roomId = ?', [playerId, roomId]);
    const room = await db.get('SELECT rolesAssigned FROM rooms WHERE roomId = ?', [roomId]);

    if (!room || !room.rolesAssigned) return res.status(400).json({ error: "Wait for game start" });
    if (!player) return res.status(403).json({ error: "Player not found" });

    res.json({ 
        name: player.name, 
        role: player.role,
        instruction: player.role === 'Mantri' ? "Guess the Chor!" : "Wait for Mantri..."
    });
});

// 6. MANTRI GUESS
app.post('/room/guess/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const { mantriPlayerId, suspectedPlayerName } = req.body;

    try {
        // Fetch necessary data
        const mantri = await db.get('SELECT * FROM players WHERE id = ?', [mantriPlayerId]);
        const suspect = await db.get('SELECT * FROM players WHERE name = ? AND roomId = ?', [suspectedPlayerName, roomId]);

        if (!mantri || mantri.role !== 'Mantri') return res.status(403).json({ error: "Not Mantri" });
        if (!suspect) return res.status(404).json({ error: "Suspect not found" });

        let message = "";
        const allPlayers = await db.all('SELECT * FROM players WHERE roomId = ?', [roomId]);

        // Calculate Score Updates
        const updates = [];
        const isCorrect = suspect.role === 'Chor';

        if (isCorrect) {
            message = "Correct! Mantri caught the Chor.";
            // Logic: Raja+1000, Mantri+800, Sipahi+500, Chor+0
            updates.push({ role: 'Raja', points: 1000 });
            updates.push({ role: 'Mantri', points: 800 });
            updates.push({ role: 'Sipahi', points: 500 });
            updates.push({ role: 'Chor', points: 0 });
        } else {
            message = "Wrong! Chor steals points.";
            // Logic: Raja+1000, Mantri+0, Sipahi+500, Chor+800
            updates.push({ role: 'Raja', points: 1000 });
            updates.push({ role: 'Mantri', points: 0 });
            updates.push({ role: 'Sipahi', points: 500 });
            updates.push({ role: 'Chor', points: 800 });
        }

        // Apply updates to Database
        for (let u of updates) {
            await db.run(
                'UPDATE players SET score = score + ? WHERE roomId = ? AND role = ?', 
                [u.points, roomId, u.role]
            );
        }

        await db.run("UPDATE rooms SET status = 'COMPLETED' WHERE roomId = ?", [roomId]);

        res.json({ result: message, suspectRole: suspect.role });

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 7. GET RESULT
app.get('/result/:roomId', async (req, res) => {
    const { roomId } = req.params;
    const room = await db.get('SELECT status FROM rooms WHERE roomId = ?', [roomId]);
    
    if (room.status !== 'COMPLETED') return res.status(400).json({ error: "Game running" });

    const players = await db.all('SELECT name, role, score FROM players WHERE roomId = ?', [roomId]);
    res.json({ players });
});

// Start Server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
