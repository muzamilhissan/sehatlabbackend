import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Enforce authentication across all lab orders
router.use(authenticateToken as any);

// Get all lab orders (for Dashboard queue)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const orders = await prisma.labOrder.findMany({
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
  } catch (error) {
    console.error('Error fetching lab orders:', error);
    res.status(500).json({ error: 'Failed to fetch lab orders' });
  }
});

// Create a new lab order (assign test)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { patientId, testTemplateIds, urgency, referringDoctor } = req.body;
    
    if (!patientId || !testTemplateIds || testTemplateIds.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const createdOrders = [];
    
    for (const templateId of testTemplateIds) {
      const sampleId = 'SMP-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      
      const order = await prisma.labOrder.create({
        data: {
          userId: req.userId,
          patientId: patientId as string,
          testTemplateId: templateId as string,
          urgency,
          referringDoctor,
          sampleId
        }
      });
      createdOrders.push(order);
    }
    
    res.status(201).json(createdOrders);
  } catch (error) {
    console.error('Error creating lab order:', error);
    res.status(500).json({ error: 'Failed to create lab order' });
  }
});

// Get a single lab order details
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const order = await prisma.labOrder.findFirst({
      where: { 
        id: req.params.id as string,
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
  } catch (error) {
    console.error('Error fetching lab order:', error);
    res.status(500).json({ error: 'Failed to fetch lab order details' });
  }
});

// Submit results for a lab order
router.post('/:id/results', async (req: AuthRequest, res) => {
  try {
    const { results, remarks } = req.body; // results: { [parameterId]: value }
    const orderId = req.params.id;

    const order = await prisma.labOrder.findFirst({
      where: { 
        id: orderId as string,
        userId: req.userId
      },
      include: {
        testTemplate: {
          include: {
            parameters: true
          }
        }
      }
    }) as any;

    if (!order) {
      return res.status(404).json({ error: 'Lab order not found' });
    }

    // Delete any existing results first to overwrite cleanly
    await prisma.labResult.deleteMany({
      where: { labOrderId: orderId as string }
    });

    // Create results
    for (const param of order.testTemplate.parameters) {
      const value = results[param.id];
      if (value !== undefined && value !== '') {
        // Compare with min and max if float
        let isAbnormal = false;
        const numVal = parseFloat(value);
        if (!isNaN(numVal)) {
          if (param.min !== null && numVal < param.min) isAbnormal = true;
          if (param.max !== null && numVal > param.max) isAbnormal = true;
        }

        await prisma.labResult.create({
          data: {
            labOrderId: orderId as string,
            testParameterId: param.id,
            value: value.toString(),
            isAbnormal
          }
        });
      }
    }

    // Update status to COMPLETED and save remarks
    await prisma.labOrder.update({
      where: { id: orderId as string },
      data: {
        status: 'COMPLETED',
        remarks
      }
    });

    res.json({ success: true, message: 'Results successfully authorized and saved' });
  } catch (error) {
    console.error('Error saving lab results:', error);
    res.status(500).json({ error: 'Failed to save lab results' });
  }
});

export default router;
