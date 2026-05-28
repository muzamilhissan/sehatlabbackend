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
const crypto_1 = __importDefault(require("crypto"));
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const prisma = new client_1.PrismaClient();
// Enforce authentication across all lab orders
router.use(auth_1.authenticateToken);
// Get all lab orders (for Dashboard queue)
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const orders = yield prisma.labOrder.findMany({
            where: { userId: req.userId },
            include: {
                patient: true,
                testTemplate: true,
                results: true
            },
            orderBy: { createdAt: 'desc' }
        });
        // Map to frontend expected format for the queue
        const formatted = orders.map(o => ({
            id: o.patient.id, // For routing compatibility
            orderId: o.id,
            name: o.patient.name,
            age: o.patient.age,
            gender: o.patient.gender,
            testType: o.testTemplate.name,
            urgency: o.urgency,
            referringDoctor: o.referringDoctor || 'Self',
            sampleId: o.sampleId,
            status: o.status,
            hasAbnormal: o.results.some(r => r.isAbnormal)
        }));
        res.json(formatted);
    }
    catch (error) {
        console.error('Error fetching lab orders:', error);
        res.status(500).json({ error: 'Failed to fetch lab orders' });
    }
}));
// Create a new lab order (assign test)
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { patientId, testTemplateIds, urgency, referringDoctor } = req.body;
        if (!patientId || !testTemplateIds || testTemplateIds.length === 0) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const createdOrders = [];
        for (const templateId of testTemplateIds) {
            const sampleId = 'SMP-' + crypto_1.default.randomBytes(3).toString('hex').toUpperCase();
            const order = yield prisma.labOrder.create({
                data: {
                    userId: req.userId,
                    patientId: patientId,
                    testTemplateId: templateId,
                    urgency,
                    referringDoctor,
                    sampleId
                }
            });
            createdOrders.push(order);
        }
        res.status(201).json(createdOrders);
    }
    catch (error) {
        console.error('Error creating lab order:', error);
        res.status(500).json({ error: 'Failed to create lab order' });
    }
}));
// Get a single lab order details
router.get('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const order = yield prisma.labOrder.findFirst({
            where: {
                id: req.params.id,
                userId: req.userId
            },
            include: {
                patient: true,
                testTemplate: {
                    include: {
                        parameters: true
                    }
                },
                results: {
                    include: {
                        testParameter: true
                    }
                }
            }
        });
        if (!order) {
            return res.status(404).json({ error: 'Lab order not found' });
        }
        res.json(order);
    }
    catch (error) {
        console.error('Error fetching lab order:', error);
        res.status(500).json({ error: 'Failed to fetch lab order details' });
    }
}));
// Submit results for a lab order
router.post('/:id/results', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { results, remarks } = req.body; // results: { [parameterId]: value }
        const orderId = req.params.id;
        const order = yield prisma.labOrder.findFirst({
            where: {
                id: orderId,
                userId: req.userId
            },
            include: {
                testTemplate: {
                    include: {
                        parameters: true
                    }
                }
            }
        });
        if (!order) {
            return res.status(404).json({ error: 'Lab order not found' });
        }
        // Delete any existing results first to overwrite cleanly
        yield prisma.labResult.deleteMany({
            where: { labOrderId: orderId }
        });
        // Create results
        for (const param of order.testTemplate.parameters) {
            const value = results[param.id];
            if (value !== undefined && value !== '') {
                // Compare with min and max if float
                let isAbnormal = false;
                const numVal = parseFloat(value);
                if (!isNaN(numVal)) {
                    if (param.min !== null && numVal < param.min)
                        isAbnormal = true;
                    if (param.max !== null && numVal > param.max)
                        isAbnormal = true;
                }
                yield prisma.labResult.create({
                    data: {
                        labOrderId: orderId,
                        testParameterId: param.id,
                        value: value.toString(),
                        isAbnormal
                    }
                });
            }
        }
        // Update status to COMPLETED and save remarks
        yield prisma.labOrder.update({
            where: { id: orderId },
            data: {
                status: 'COMPLETED',
                remarks
            }
        });
        res.json({ success: true, message: 'Results successfully authorized and saved' });
    }
    catch (error) {
        console.error('Error saving lab results:', error);
        res.status(500).json({ error: 'Failed to save lab results' });
    }
}));
// Upload PDF report to SehatDoc integration vault (Authenticated)
router.post('/:id/upload-report', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { pdfBase64, filename } = req.body;
        const orderId = req.params.id;
        if (!pdfBase64) {
            return res.status(400).json({ error: 'pdfBase64 is required' });
        }
        const order = yield prisma.labOrder.findFirst({
            where: {
                id: orderId,
                userId: req.userId
            },
            include: {
                patient: true
            }
        });
        if (!order) {
            return res.status(404).json({ error: 'Lab order not found' });
        }
        // Check if integrated with SehatDoc
        const user = yield prisma.user.findUnique({
            where: { id: req.userId }
        });
        if (!user || !user.settings) {
            return res.status(400).json({ error: 'Integration settings not configured' });
        }
        const settings = JSON.parse(user.settings);
        const conn = settings.sehatdocConnection;
        if (!conn || !conn.isConnected || order.patient.source !== 'SehatDoc') {
            return res.status(400).json({ error: 'This patient is not connected to a SehatDoc Clinic' });
        }
        // Send PDF Blob to SehatDoc backend
        const sehatdocBaseUrl = process.env.SEHATDOC_API_URL || 'http://localhost:5001';
        // Construct multi-part form data in memory
        const buffer = Buffer.from(pdfBase64, 'base64');
        const blob = new Blob([buffer], { type: 'application/pdf' });
        const formData = new FormData();
        formData.append('file', blob, filename || `LabReport_${order.patient.name.replace(/\s+/g, '_')}_${order.sampleId}.pdf`);
        formData.append('documentType', 'LAB_REPORT');
        formData.append('notes', `Authorized lab report uploaded by SehatLab for order ${order.sampleId}`);
        const uploadRes = yield fetch(`${sehatdocBaseUrl}/api/public/sehatlab/patients/${order.patientId}/files`, {
            method: 'POST',
            headers: {
                'x-sehatlab-secret': conn.labSecret || ''
            },
            body: formData
        });
        if (!uploadRes.ok) {
            const err = yield uploadRes.json();
            return res.status(uploadRes.status).json({ error: err.error || 'Failed to sync document with SehatDoc' });
        }
        const result = yield uploadRes.json();
        res.json({ success: true, message: 'Lab report successfully synced to SehatDoc and backed by R2', file: result.file });
    }
    catch (error) {
        console.error('upload-report Error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload report to integration portal' });
    }
}));
// Integration stats endpoint queried by SehatDoc (Unauthenticated but validated)
router.get('/integration-stats', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const sehatdocSecret = req.headers['x-sehatdoc-secret'];
        if (!sehatdocSecret) {
            return res.status(401).json({ error: 'Unauthorized: Missing x-sehatdoc-secret header' });
        }
        // Search for connected lab settings with this secret
        const users = yield prisma.user.findMany({
            where: { NOT: { settings: null } }
        });
        let connectedUser = null;
        for (const u of users) {
            try {
                const settings = JSON.parse(u.settings || '{}');
                if (settings.sehatdocConnection && settings.sehatdocConnection.sehatdocSecret === sehatdocSecret && settings.sehatdocConnection.isConnected) {
                    connectedUser = u;
                    break;
                }
            }
            catch (e) { /* ignore */ }
        }
        if (!connectedUser) {
            return res.status(401).json({ error: 'Unauthorized: Invalid integration credentials' });
        }
        // Calculate aggregated metrics
        const totalOrders = yield prisma.labOrder.count({
            where: { userId: connectedUser.id }
        });
        const pendingOrders = yield prisma.labOrder.count({
            where: { userId: connectedUser.id, status: 'PENDING' }
        });
        const completedOrders = yield prisma.labOrder.count({
            where: { userId: connectedUser.id, status: 'COMPLETED' }
        });
        const abnormalResults = yield prisma.labResult.count({
            where: {
                isAbnormal: true,
                labOrder: { userId: connectedUser.id }
            }
        });
        res.json({
            totalOrders,
            pendingOrders,
            completedOrders,
            abnormalResults,
            status: 'ACTIVE'
        });
    }
    catch (error) {
        console.error('integration-stats Error:', error);
        res.status(500).json({ error: 'Failed to retrieve integrated metrics summary' });
    }
}));
exports.default = router;
