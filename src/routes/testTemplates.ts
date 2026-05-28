import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = express.Router();
const prisma = new PrismaClient();

// Public endpoint for connected SehatDoc clinics to get test templates list
router.get('/public/list', async (req, res) => {
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

    // Retrieve system templates and the specific lab user's custom templates
    const templates = await prisma.testTemplate.findMany({
      where: {
        OR: [
          { userId: labUser.id },
          { userId: null } // System defaults
        ]
      },
      include: {
        parameters: true
      },
      orderBy: { name: 'asc' }
    });

    const formatted = templates.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      parametersCount: t.parameters.length
    }));

    res.json(formatted);
  } catch (error: any) {
    console.error('Public test list error:', error);
    res.status(500).json({ error: 'Failed to retrieve test templates list' });
  }
});

// Enforce authentication across all template routes
router.use(authenticateToken as any);

// Get all test templates with parameters (include system presets and user-specific templates)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const templates = await prisma.testTemplate.findMany({
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
      parameters: t.parameters.map(p => ({
        id: p.id,
        name: p.name,
        unit: p.unit,
        min: p.min?.toString() || '',
        max: p.max?.toString() || ''
      }))
    }));
    
    res.json(formatted);
  } catch (error) {
    console.error('Error fetching test templates:', error);
    res.status(500).json({ error: 'Failed to fetch test templates' });
  }
});

// Create or Update a test template
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { id, name, category, parameters, defaultComments } = req.body;
    
    let template;
    
    if (id && id.length > 10) { // Simple check to see if it's a UUID
      // Verify user owns the template before updating
      const existing = await prisma.testTemplate.findFirst({
        where: { id, userId: req.userId }
      });

      if (!existing) {
        return res.status(403).json({ error: 'Permission denied: Cannot edit system presets or another lab\'s templates.' });
      }

      // Delete existing parameters first for simple replacement
      await prisma.testParameter.deleteMany({
        where: { testTemplateId: id }
      });
      
      template = await prisma.testTemplate.update({
        where: { id },
        data: {
          name,
          category,
          defaultComments: defaultComments || '',
          parameters: {
            create: parameters.map((p: any) => ({
              name: p.name,
              unit: p.unit,
              min: p.min ? parseFloat(p.min) : null,
              max: p.max ? parseFloat(p.max) : null
            }))
          }
        },
        include: { parameters: true }
      });
    } else {
      template = await prisma.testTemplate.create({
        data: {
          userId: req.userId,
          name,
          category,
          defaultComments: defaultComments || '',
          parameters: {
            create: parameters.map((p: any) => ({
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
  } catch (error) {
    console.error('Error saving test template:', error);
    res.status(500).json({ error: 'Failed to save test template' });
  }
});

// Delete a test template
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Verify user owns the template before deleting
    const existing = await prisma.testTemplate.findFirst({
      where: { id: id as string, userId: req.userId }
    });

    if (!existing) {
      return res.status(403).json({ error: 'Permission denied: Cannot delete system presets or another lab\'s templates.' });
    }

    await prisma.testTemplate.delete({
      where: { id: id as string }
    });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error deleting test template:', error);
    res.status(500).json({ error: 'Failed to delete test template' });
  }
});

export default router;
