"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const auth_1 = __importDefault(require("./routes/auth"));
const patients_1 = __importDefault(require("./routes/patients"));
const testTemplates_1 = __importDefault(require("./routes/testTemplates"));
const labOrders_1 = __importDefault(require("./routes/labOrders"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = Number(process.env.PORT) || 6010;
const prisma = new client_1.PrismaClient();
const allowedOrigins = [
    'http://168.144.26.176:8000',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'https://labs.sehatdoc.com',
    'http://localhost:4010',
    'https://sehatlabvercel.vercel.app',
];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
}));
app.use(express_1.default.json({ limit: '10mb' })); // Increase json payload limit for base64 uploads
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../public/uploads')));
app.use('/sehatlab/api/auth', auth_1.default);
app.use('/sehatlab/api/patients', patients_1.default);
app.use('/sehatlab/api/test-templates', testTemplates_1.default);
app.use('/sehatlab/api/lab-orders', labOrders_1.default);
app.get('/sehatlab/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'sehatlab-backend' });
});
app.listen(PORT, "0.0.0.0", () => {
    console.log(`SehatLab backend listening on port ${PORT}`);
});
