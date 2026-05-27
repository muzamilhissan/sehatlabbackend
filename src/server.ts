import path from 'path';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import testTemplateRoutes from './routes/testTemplates';
import labOrderRoutes from './routes/labOrders';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 6010;
const prisma = new PrismaClient();

const allowedOrigins = [
  'http://168.144.26.176:8000',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'https://labs.sehatdoc.com',
  'http://localhost:4010',
  'https://sehatlabvercel.vercel.app',
];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' })); // Increase json payload limit for base64 uploads

app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/sehatlab/api/auth', authRoutes);
app.use('/sehatlab/api/patients', patientRoutes);
app.use('/sehatlab/api/test-templates', testTemplateRoutes);
app.use('/sehatlab/api/lab-orders', labOrderRoutes);

app.get('/sehatlab/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'sehatlab-backend' });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SehatLab backend listening on port ${PORT}`);
});
