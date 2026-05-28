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
const client_1 = require("@prisma/client");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
// Authenticate all patient routes
router.use(auth_1.authenticateToken);
// Get all patients
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { search } = req.query;
        const localWhere = { userId: req.userId };
        if (search) {
            localWhere.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { contact: { contains: search, mode: 'insensitive' } },
                { cnic: { contains: search, mode: 'insensitive' } }
            ];
        }
        const localPatients = yield prisma.patient.findMany({
            where: localWhere,
            orderBy: { createdAt: 'desc' }
        });
        // Check if integrated with SehatDoc
        const user = yield prisma.user.findUnique({
            where: { id: req.userId }
        });
        let integratedPatients = [];
        if (user && user.settings) {
            try {
                const settings = JSON.parse(user.settings);
                const conn = settings.sehatdocConnection;
                if (conn && conn.isConnected) {
                    const sehatdocBaseUrl = process.env.SEHATDOC_API_URL || 'http://localhost:5001';
                    const queryUrl = `${sehatdocBaseUrl}/api/public/sehatlab/patients?search=${encodeURIComponent(search || '')}`;
                    const searchRes = yield fetch(queryUrl, {
                        headers: {
                            'x-sehatlab-secret': conn.labSecret || ''
                        }
                    });
                    if (searchRes.ok) {
                        const data = yield searchRes.json();
                        if (Array.isArray(data)) {
                            integratedPatients = data.map((p) => ({
                                id: p.id,
                                name: p.name,
                                age: p.age ? p.age.toString() : '0',
                                gender: p.gender || 'Unknown',
                                contact: p.phone,
                                cnic: p.cnic,
                                address: p.address,
                                source: 'SehatDoc'
                            }));
                        }
                    }
                }
            }
            catch (err) {
                console.error('Failed to search patients from SehatDoc integration:', err);
            }
        }
        // Merge results, removing duplicates based on ID
        const merged = [...localPatients];
        const localIds = new Set(localPatients.map(p => p.id));
        for (const ip of integratedPatients) {
            if (!localIds.has(ip.id)) {
                merged.push(ip);
            }
        }
        res.json(merged);
    }
    catch (error) {
        console.error('Error fetching patients:', error);
        res.status(500).json({ error: 'Failed to fetch patients' });
    }
}));
// Create a new patient (supporting identical UUID preservation for SehatDoc sync)
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id, name, age, gender, contact, cnic, address, source } = req.body;
        const patient = yield prisma.patient.create({
            data: {
                id: id || undefined, // Use incoming UUID if provided to maintain strict consistency!
                userId: req.userId,
                name,
                age: age ? age.toString() : '0',
                gender,
                contact,
                cnic,
                address,
                source: source || 'Walk-in'
            }
        });
        res.status(201).json(patient);
    }
    catch (error) {
        console.error('Error creating patient:', error);
        res.status(500).json({ error: 'Failed to create patient' });
    }
}));
exports.default = router;
