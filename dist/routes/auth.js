"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
// Note: In production, store this in your .env
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-sehatlab';
// Register Route
router.post('/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const existingUser = yield prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const user = yield prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name,
            },
        });
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Login Route
router.post('/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        let user = yield prisma.user.findUnique({ where: { email } });
        // Self-healing: if admin@sehatlab.com doesn't exist, automatically seed it with hashed 'admin123'
        if (!user && email === 'admin@sehatlab.com' && password === 'admin123') {
            const hashedPassword = yield bcryptjs_1.default.hash('admin123', 10);
            user = yield prisma.user.create({
                data: {
                    email: 'admin@sehatlab.com',
                    password: hashedPassword,
                    name: 'SehatLab Administrator',
                    cnic: '00000-0000000-0'
                }
            });
            console.log('Self-healed: Provisioned default admin@sehatlab.com account successfully.');
        }
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const isMatch = yield bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Secure External Registration for Admin Provisioning
router.post('/register-external', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const secret = req.headers['x-sehatdesk-secret'];
        const expectedSecret = process.env.SHARED_ADMIN_SECRET || 'sehatlab-sehatdesk-handshake-secret-2026';
        if (!secret || secret !== expectedSecret) {
            return res.status(401).json({ error: 'Unauthorized: Invalid handshake secret key' });
        }
        const { email, password, name, cnic } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const existingUser = yield prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(400).json({ error: 'Lab account already exists' });
        }
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        const user = yield prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name, // Clinic Name
                cnic,
            },
        });
        res.status(201).json({
            success: true,
            message: 'Lab account registered successfully',
            user: { id: user.id, email: user.email, name: user.name, cnic: user.cnic }
        });
    }
    catch (error) {
        console.error('External registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Secure External Fetch for Admin Directory Listings
router.get('/users', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const secret = req.headers['x-sehatdesk-secret'];
        const expectedSecret = process.env.SHARED_ADMIN_SECRET || 'sehatlab-sehatdesk-handshake-secret-2026';
        if (!secret || secret !== expectedSecret) {
            return res.status(401).json({ error: 'Unauthorized: Invalid handshake secret key' });
        }
        const users = yield prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                cnic: true,
            },
            orderBy: { id: 'desc' }
        });
        res.json(users);
    }
    catch (error) {
        console.error('External users fetch error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Get Settings
router.get('/settings', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield prisma.user.findUnique({
            where: { id: req.userId },
            select: { settings: true }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ settings: user.settings });
    }
    catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
}));
// Update Settings
router.post('/settings', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { settings } = req.body;
        const user = yield prisma.user.update({
            where: { id: req.userId },
            data: { settings },
            select: { settings: true }
        });
        res.json({ success: true, settings: user.settings });
    }
    catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
}));
// Upload Logo Route
router.post('/upload-logo', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { logo } = req.body;
        if (!logo) {
            return res.status(400).json({ error: 'Logo payload is required' });
        }
        if (!logo.startsWith('data:image/')) {
            return res.status(400).json({ error: 'Invalid image format' });
        }
        // Parse base64
        const matches = logo.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: 'Invalid base64 payload' });
        }
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');
        // Get file extension from mime type
        let ext = 'png';
        if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
            ext = 'jpg';
        }
        else if (mimeType === 'image/gif') {
            ext = 'gif';
        }
        else if (mimeType === 'image/svg+xml') {
            ext = 'svg';
        }
        const uploadsDir = path_1.default.join(__dirname, '../../public/uploads');
        if (!fs_1.default.existsSync(uploadsDir)) {
            fs_1.default.mkdirSync(uploadsDir, { recursive: true });
        }
        const fileName = `logo-${req.userId}.${ext}`;
        const filePath = path_1.default.join(uploadsDir, fileName);
        fs_1.default.writeFileSync(filePath, buffer);
        const host = req.get('host');
        const protocol = req.protocol;
        const publicUrl = `${protocol}://${host}/uploads/${fileName}?t=${Date.now()}`;
        res.json({ success: true, logoUrl: publicUrl });
    }
    catch (error) {
        console.error('Error uploading logo:', error);
        res.status(500).json({ error: 'Failed to upload logo' });
    }
}));
// SehatDoc Clinic Lookup Proxy
router.get('/sehatdoc-lookup', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        // Query SehatDoc backend
        const sehatdocBaseUrl = process.env.SEHATDOC_API_URL || 'http://localhost:5001';
        const lookupRes = yield fetch(`${sehatdocBaseUrl}/api/public/clinic-by-email?email=${encodeURIComponent(email)}`);
        if (!lookupRes.ok) {
            const errData = yield lookupRes.json();
            return res.status(lookupRes.status).json({ error: errData.error || 'Failed to verify SehatDoc account' });
        }
        const data = yield lookupRes.json();
        res.json(data);
    }
    catch (error) {
        console.error('Error during SehatDoc lookup proxy:', error);
        res.status(500).json({ error: 'Failed to connect to SehatDoc server' });
    }
}));
exports.default = router;
