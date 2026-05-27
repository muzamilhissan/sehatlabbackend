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
exports.default = router;
