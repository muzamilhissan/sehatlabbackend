import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Authenticate all patient routes
router.use(authenticateToken as any);

// Get all patients
router.get('/', async (req: AuthRequest, res) => {
  try {
    const patients = await prisma.patient.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(patients);
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// Create a new patient
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, age, gender, contact, cnic, address, source } = req.body;
    
    const patient = await prisma.patient.create({
      data: {
        userId: req.userId,
        name,
        age,
        gender,
        contact,
        cnic,
        address,
        source: source || 'Walk-in'
      }
    });
    res.status(201).json(patient);
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

export default router;
