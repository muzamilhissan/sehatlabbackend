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
// Enforce authentication across all template routes
router.use(auth_1.authenticateToken);
// Get all test templates with parameters (include system presets and user-specific templates)
router.get('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const templates = yield prisma.testTemplate.findMany({
            where: {
                OR: [
                    { userId: req.userId },
                    { userId: null } // System default presets
                ]
            },
            include: {
                parameters: true
            },
            orderBy: { createdAt: 'desc' }
        });
        // Map to frontend expected format
        const formatted = templates.map(t => ({
            id: t.id,
            name: t.name,
            category: t.category,
            defaultComments: t.defaultComments || '',
            parametersCount: t.parameters.length,
            lastUpdated: t.updatedAt.toISOString().split('T')[0],
            parameters: t.parameters.map(p => {
                var _a, _b;
                return ({
                    id: p.id,
                    name: p.name,
                    unit: p.unit,
                    min: ((_a = p.min) === null || _a === void 0 ? void 0 : _a.toString()) || '',
                    max: ((_b = p.max) === null || _b === void 0 ? void 0 : _b.toString()) || ''
                });
            })
        }));
        res.json(formatted);
    }
    catch (error) {
        console.error('Error fetching test templates:', error);
        res.status(500).json({ error: 'Failed to fetch test templates' });
    }
}));
// Create or Update a test template
router.post('/', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id, name, category, parameters, defaultComments } = req.body;
        let template;
        if (id && id.length > 10) { // Simple check to see if it's a UUID
            // Verify user owns the template before updating
            const existing = yield prisma.testTemplate.findFirst({
                where: { id, userId: req.userId }
            });
            if (!existing) {
                return res.status(403).json({ error: 'Permission denied: Cannot edit system presets or another lab\'s templates.' });
            }
            // Delete existing parameters first for simple replacement
            yield prisma.testParameter.deleteMany({
                where: { testTemplateId: id }
            });
            template = yield prisma.testTemplate.update({
                where: { id },
                data: {
                    name,
                    category,
                    defaultComments: defaultComments || '',
                    parameters: {
                        create: parameters.map((p) => ({
                            name: p.name,
                            unit: p.unit,
                            min: p.min ? parseFloat(p.min) : null,
                            max: p.max ? parseFloat(p.max) : null
                        }))
                    }
                },
                include: { parameters: true }
            });
        }
        else {
            template = yield prisma.testTemplate.create({
                data: {
                    userId: req.userId,
                    name,
                    category,
                    defaultComments: defaultComments || '',
                    parameters: {
                        create: parameters.map((p) => ({
                            name: p.name,
                            unit: p.unit,
                            min: p.min ? parseFloat(p.min) : null,
                            max: p.max ? parseFloat(p.max) : null
                        }))
                    }
                },
                include: { parameters: true }
            });
        }
        res.status(201).json(template);
    }
    catch (error) {
        console.error('Error saving test template:', error);
        res.status(500).json({ error: 'Failed to save test template' });
    }
}));
// Delete a test template
router.delete('/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        // Verify user owns the template before deleting
        const existing = yield prisma.testTemplate.findFirst({
            where: { id: id, userId: req.userId }
        });
        if (!existing) {
            return res.status(403).json({ error: 'Permission denied: Cannot delete system presets or another lab\'s templates.' });
        }
        yield prisma.testTemplate.delete({
            where: { id: id }
        });
        res.status(200).json({ success: true });
    }
    catch (error) {
        console.error('Error deleting test template:', error);
        res.status(500).json({ error: 'Failed to delete test template' });
    }
}));
exports.default = router;
