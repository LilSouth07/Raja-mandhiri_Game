#Raja Mandhiri Chor Sipahi Guesser Game -Backend API :)

This the Backend server for classical Multiplayer guesser game ,It handles room management,Player roles ,Logic of the Game and scoring using node.js and for database sqlite is used.

FEATURES:
* **Room Management:** Create and join private game rooms (max 4 players).
* **Role Assignment:** Randomly shuffles roles (Raja, Mantri, Sipahi, Chor).
* **Game Logic:** Handles the core mechanic where the Mantri must guess the Chor.
* **Scoring System:** Automatically updates scores based on correct/wrong guesses.
* **Database:** Uses SQLite for lightweight, persistent data storage.

  TECH STACK:
* **Runtime:** Node.js
* **Framework:** Express.js
* **Database:** SQLite3
* **ID Generation:** UUID

GAME RULES(SCORING):
* **Raja (King):** +1000 points.
* **Sipahi (Soldier):** +500 points.
* **Mantri (Minister):** * If they guess the Chor correctly: +800 points (Chor gets 0).
*  * If they guess wrong: 0 points (Chor gets 800).

(NOTE: This game not solely Made by me , 30% of credit goes to my friend . 
He doesnt want to Mention his Name);
