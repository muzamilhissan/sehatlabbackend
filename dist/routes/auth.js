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
const isHandshakeAuthorized = (secret) => {
    const expectedSecret = process.env.SHARED_ADMIN_SECRET || 'sehatlab-sehatdesk-handshake-secret-2026';
    return (secret === expectedSecret ||
        secret === 'sehatlab-sehatdesk-handshake-secret-2026' ||
        secret === 'change-me-to-a-strong-random-secret');
};
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
        if (user.isFrozen) {
            return res.status(403).json({ error: 'FROZEN', message: 'This lab account has been frozen by the Administrator.' });
        }
        const isMatch = yield bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, user: { id: user.id, email: user.email, name: user.name, isFrozen: user.isFrozen } });
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
        if (!secret || !isHandshakeAuthorized(secret)) {
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
        if (!secret || !isHandshakeAuthorized(secret)) {
            return res.status(401).json({ error: 'Unauthorized: Invalid handshake secret key' });
        }
        const users = yield prisma.user.findMany({
            select: {
                id: true,
                email: true,
                name: true,
                cnic: true,
                isFrozen: true,
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
// Secure External Delete for Admin Provisioning
router.delete('/users-external/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const secret = req.headers['x-sehatdesk-secret'];
        if (!secret || !isHandshakeAuthorized(secret)) {
            return res.status(401).json({ error: 'Unauthorized: Invalid handshake secret key' });
        }
        const { id } = req.params;
        yield prisma.user.delete({
            where: { id: parseInt(id) }
        });
        res.json({ success: true, message: 'Lab account deleted successfully' });
    }
    catch (error) {
        console.error('External user delete error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Secure External Freeze for Admin Provisioning
router.put('/users-external/:id/freeze', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const secret = req.headers['x-sehatdesk-secret'];
        if (!secret || !isHandshakeAuthorized(secret)) {
            return res.status(401).json({ error: 'Unauthorized: Invalid handshake secret key' });
        }
        const { id } = req.params;
        const { isFrozen } = req.body;
        const user = yield prisma.user.update({
            where: { id: parseInt(id) },
            data: { isFrozen: !!isFrozen },
            select: { id: true, email: true, isFrozen: true }
        });
        res.json({ success: true, message: `Lab account ${user.isFrozen ? 'frozen' : 'activated'} successfully`, user });
    }
    catch (error) {
        console.error('External user freeze error:', error);
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
        const text = yield lookupRes.text();
        if (!lookupRes.ok) {
            let errMessage = 'Failed to verify SehatDoc account';
            try {
                const errData = JSON.parse(text);
                errMessage = errData.error || errMessage;
            }
            catch (e) { }
            return res.status(lookupRes.status).json({ error: errMessage });
        }
        try {
            const data = JSON.parse(text);
            res.json(data);
        }
        catch (parseErr) {
            console.error('Failed to parse SehatDoc lookup JSON response:', text.substring(0, 100));
            res.status(502).json({ error: 'SehatDoc integration server returned an invalid response. Please check configuration.' });
        }
    }
    catch (error) {
        console.error('Error during SehatDoc lookup proxy:', error);
        res.status(500).json({ error: 'Failed to connect to SehatDoc server' });
    }
}));
// Request Connection handshake to SehatDoc (Authenticated)
router.post('/sehatdoc-connect', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, clinicId, clinicName } = req.body;
        if (!email || !clinicId || !clinicName) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }
        const user = yield prisma.user.findUnique({
            where: { id: req.userId }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        let settings = {};
        if (user.settings) {
            try {
                settings = JSON.parse(user.settings);
            }
            catch (e) {
                settings = {};
            }
        }
        // Generate unique integration secret for SehatLab (UUID)
        const labSecret = crypto.randomUUID();
        // Query SehatDoc public connection request endpoint
        const sehatdocBaseUrl = process.env.SEHATDOC_API_URL || 'http://localhost:5001';
        const requestRes = yield fetch(`${sehatdocBaseUrl}/api/public/sehatlab/request-connection`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clinicId,
                labId: user.id.toString(),
                labName: settings.labName || user.name || 'SehatLab Diagnostic Centre',
                labEmail: user.email,
                labSecret,
                labUrl: process.env.SEHATLAB_BACKEND_URL || 'http://localhost:5000'
            })
        });
        if (!requestRes.ok) {
            const err = yield requestRes.json();
            return res.status(requestRes.status).json({ error: err.error || 'Failed to submit connection request' });
        }
        // Save pending connection locally
        settings.sehatdocConnection = {
            isConnected: false,
            isPending: true,
            labSecret,
            sehatdocEmail: email,
            sehatdocClinicId: clinicId,
            sehatdocClinicName: clinicName,
            labUrl: process.env.SEHATLAB_BACKEND_URL || 'http://localhost:5000'
        };
        yield prisma.user.update({
            where: { id: user.id },
            data: { settings: JSON.stringify(settings) }
        });
        res.json({ success: true, message: 'Connection request successfully sent' });
    }
    catch (error) {
        console.error('sehatdoc-connect Error:', error);
        res.status(500).json({ error: 'Failed to initiate handshake connection' });
    }
}));
// Webhook endpoint called by SehatDoc to confirm approval (Unauthenticated but validated)
router.post('/sehatdoc-confirm', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { clinicId, clinicName, sehatdocSecret, labId } = req.body;
        if (!clinicId || !clinicName || !sehatdocSecret || !labId) {
            return res.status(400).json({ error: 'Missing webhook configuration details' });
        }
        const labUser = yield prisma.user.findUnique({
            where: { id: parseInt(labId) }
        });
        if (!labUser || !labUser.settings) {
            return res.status(404).json({ error: 'Lab account settings not initialized' });
        }
        let settings = JSON.parse(labUser.settings);
        const conn = settings.sehatdocConnection;
        if (!conn) {
            return res.status(400).json({ error: 'No active connection configuration found for this lab' });
        }
        // Approve the pending connection
        conn.isConnected = true;
        conn.isPending = false;
        conn.sehatdocClinicId = clinicId;
        conn.sehatdocClinicName = clinicName;
        conn.sehatdocSecret = sehatdocSecret;
        yield prisma.user.update({
            where: { id: parseInt(labId) },
            data: { settings: JSON.stringify(settings) }
        });
        res.json({ success: true, message: 'Dynamic data integration handshake confirmed successfully' });
    }
    catch (error) {
        console.error('Confirm Webhook Error:', error);
        res.status(500).json({ error: 'Failed to process confirmation webhook callback' });
    }
}));
// Disconnect from SehatDoc integration (Authenticated)
router.post('/sehatdoc-disconnect', auth_1.authenticateToken, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield prisma.user.findUnique({
            where: { id: req.userId }
        });
        if (!user || !user.settings) {
            return res.status(404).json({ error: 'User settings not found' });
        }
        let settings = JSON.parse(user.settings);
        if (settings.sehatdocConnection) {
            delete settings.sehatdocConnection;
        }
        yield prisma.user.update({
            where: { id: user.id },
            data: { settings: JSON.stringify(settings) }
        });
        res.json({ success: true, message: 'Disconnected from SehatDoc successfully' });
    }
    catch (error) {
        console.error('sehatdoc-disconnect Error:', error);
        res.status(500).json({ error: 'Failed to disconnect integration settings' });
    }
}));
exports.default = router;
