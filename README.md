# Exam Seat Planner (MERN)
Run MongoDB locally (or set MONGO_URI in server/.env), then:
    cd server && npm i && cp .env.example .env && npm run dev
    cd client && npm i && npm run dev     # http://localhost:5173
CSV format: `rollNo,name` per line (header optional).
API: GET/POST/DELETE /api/rooms, POST /api/students/import, GET /api/capacity, POST /api/allocate, GET/DELETE /api/allocations
