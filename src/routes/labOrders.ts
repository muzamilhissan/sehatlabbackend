import express from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Public endpoint for connected SehatDoc clinics to request a diagnostic test
router.post('/public/request-test', async (req, res) => {
  try {
    const sehatdocSecret = req.headers['x-sehatdoc-secret'] as string;
    const labSecret = req.headers['authorization']?.split(' ')[1] as string;

    if (!sehatdocSecret || !labSecret) {
      res.status(401).json({ error: 'Missing security credentials' });
      return;
    }

    // Verify lab exists and secrets match
    const labUser = await prisma.user.findFirst({
      where: {
        settings: {
          contains: labSecret
        }
      }
    });

    if (!labUser) {
      res.status(401).json({ error: 'Unauthorized: Invalid credentials' });
      return;
    }

    const settings = JSON.parse(labUser.settings || '{}');
    const conn = settings.sehatdocConnection;

    if (!conn || !conn.isConnected || conn.sehatdocSecret !== sehatdocSecret) {
      res.status(401).json({ error: 'Unauthorized: Connection inactive or signature mismatch' });
      return;
    }

    // Handshake successful! Let's extract patient and test request details
    const { patient, testTemplateId, urgency, referringDoctor } = req.body;
    if (!patient || !testTemplateId) {
      res.status(400).json({ error: 'Missing patient or test template ID' });
      return;
    }

    // Find or create patient in SehatLab database to match consistency
    let labPatient = await prisma.patient.findUnique({
      where: { id: patient.id }
    });

    if (!labPatient) {
      labPatient = await prisma.patient.create({
        data: {
          id: patient.id, // Consistent UUID!
          name: patient.name,
          age: patient.age ? patient.age.toString() : '0',
          gender: patient.gender ? patient.gender.toString() : 'UNKNOWN',
          contact: patient.contact || '',
          cnic: patient.cnic || '',
          source: 'SehatDoc'
        }
      });
    }

    // Generate unique Sample ID
    const sampleId = 'SMP-' + crypto.randomBytes(3).toString('hex').toUpperCase();

    // Create the pending lab order!
    const order = await prisma.labOrder.create({
      data: {
        userId: labUser.id, // Owned by the connected lab admin
        patientId: labPatient.id,
        testTemplateId,
        urgency: urgency || 'ROUTINE',
        referringDoctor: referringDoctor || 'SehatDoc Requested',
        sampleId
      },
      include: {
        testTemplate: true,
        patient: true
      }
    });

    res.status(201).json({ success: true, message: 'Lab test request created successfully in SehatLab queue', order });
  } catch (error: any) {
    console.error('Public request-test error:', error);
    res.status(500).json({ error: 'Internal server error while processing request' });
  }
});

// Integration stats endpoint queried by SehatDoc (Unauthenticated but validated)
router.get('/integration-stats', async (req, res) => {
  try {
    const sehatdocSecret = req.headers['x-sehatdoc-secret'] as string;
    if (!sehatdocSecret) {
      return res.status(401).json({ error: 'Unauthorized: Missing x-sehatdoc-secret header' });
    }

    // Search for connected lab settings with this secret
    const users = await prisma.user.findMany({
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
      } catch (e) { /* ignore */ }
    }

    if (!connectedUser) {
      return res.status(401).json({ error: 'Unauthorized: Invalid integration credentials' });
    }

    // Calculate aggregated metrics
    const totalOrders = await prisma.labOrder.count({
      where: { userId: connectedUser.id }
    });

    const pendingOrders = await prisma.labOrder.count({
      where: { userId: connectedUser.id, status: 'PENDING' }
    });

    const completedOrders = await prisma.labOrder.count({
      where: { userId: connectedUser.id, status: 'COMPLETED' }
    });

    const abnormalResults = await prisma.labResult.count({
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
  } catch (error) {
    console.error('integration-stats Error:', error);
    res.status(500).json({ error: 'Failed to retrieve integrated metrics summary' });
  }
});

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

// Approve lab results and trigger SehatDoc integration webhook (Authenticated)
router.post('/:id/approve-report', async (req: AuthRequest, res) => {
  try {
    const { pdfBase64, filename } = req.body;
    const orderId = req.params.id;

    if (!pdfBase64) {
      return res.status(400).json({ error: 'pdfBase64 is required' });
    }

    const order = await prisma.labOrder.findFirst({
      where: {
        id: orderId as string,
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
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    let isSynced = false;
    let syncResult = null;

    if (user && user.settings) {
      try {
        const settings = JSON.parse(user.settings);
        const conn = settings.sehatdocConnection;

        if (conn && conn.isConnected) {
          // Send PDF payload directly to SehatDoc webhook
          const sehatdocBaseUrl = (process.env.SEHATDOC_API_URL || 'http://localhost:5001').replace(/\/api$/, '');

          const uploadRes = await fetch(`${sehatdocBaseUrl}/api/public/sehatlab/webhook/approve-report`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-sehatlab-secret': conn.labSecret || ''
            },
            body: JSON.stringify({
              patientId: order.patientId,
              pdfBase64,
              filename: filename || `LabReport_${order.patient.name.replace(/\s+/g, '_')}_${order.sampleId}.pdf`,
              notes: `Approved lab report uploaded seamlessly by connected SehatLab for order ${order.sampleId}`,
              patientDetails: {
                name: order.patient.name,
                age: order.patient.age,
                gender: order.patient.gender,
                contact: order.patient.contact,
                cnic: order.patient.cnic,
                address: order.patient.address
              }
            })
          });

          if (!uploadRes.ok) {
            const err = await uploadRes.json();
            return res.status(uploadRes.status).json({ error: err.error || 'Failed to sync document with SehatDoc webhook' });
          }

          isSynced = true;
          syncResult = await uploadRes.json();
        }
      } catch (err) {
        console.error('Error parsing settings or connecting to SehatDoc:', err);
      }
    }

    // Update status to APPROVED inside SehatLab
    await prisma.labOrder.update({
      where: { id: orderId as string },
      data: {
        status: 'APPROVED'
      }
    });

    if (isSynced) {
      res.json({ success: true, message: 'Lab report successfully approved and synced to SehatDoc via webhook', file: syncResult?.file });
    } else {
      res.json({ success: true, message: 'Lab report successfully approved locally inside SehatLab' });
    }
  } catch (error: any) {
    console.error('upload-report Error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload report to integration portal' });
  }
});

export default router;
