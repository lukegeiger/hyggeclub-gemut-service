"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const ws_1 = require("ws");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use(express_1.default.json()); // Using Express's built-in body parser
// Test endpoint
app.get('/test', (req, res) => {
    res.json({ message: 'This is a test endpoint' });
});
app.use((err, req, res, next) => {
    console.error('Error middleware triggered:', err);
    res.status(500).send('An unexpected error occurred');
});
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
server.listen(port, () => {
    console.log(`Service listening at http://localhost:${port}`);
});
