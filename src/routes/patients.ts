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
    const { search } = req.query;

    const localWhere: any = { userId: req.userId };
    if (search) {
      localWhere.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { contact: { contains: search as string, mode: 'insensitive' } },
        { cnic: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    const localPatients = await prisma.patient.findMany({
      where: localWhere,
      orderBy: { createdAt: 'desc' }
    });

    // Check if integrated with SehatDoc
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    let integratedPatients: any[] = [];
    if (user && user.settings) {
      try {
        const settings = JSON.parse(user.settings);
        const conn = settings.sehatdocConnection;
        if (conn && conn.isConnected) {
          const sehatdocBaseUrl = process.env.SEHATDOC_API_URL || 'http://localhost:5001';
          const queryUrl = `${sehatdocBaseUrl}/api/public/sehatlab/patients?search=${encodeURIComponent((search as string) || '')}`;
          const searchRes = await fetch(queryUrl, {
            headers: {
              'x-sehatlab-secret': conn.labSecret || ''
            }
          });
          if (searchRes.ok) {
            const data = await searchRes.json();
            if (Array.isArray(data)) {
              integratedPatients = data.map((p: any) => ({
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
      } catch (err) {
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
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ error: 'Failed to fetch patients' });
  }
});

// Create a new patient (supporting identical UUID preservation for SehatDoc sync)
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { id, name, age, gender, contact, cnic, address, source } = req.body;
    
    const patient = await prisma.patient.create({
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
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ error: 'Failed to create patient' });
  }
});

export default router;
