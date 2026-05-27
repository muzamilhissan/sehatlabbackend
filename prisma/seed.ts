import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultTemplates = [
  {
    name: 'Complete Blood Count (CBC)',
    category: 'Hematology',
    parameters: [
      { name: 'Hemoglobin (Hb)', unit: 'g/dL', min: 13.5, max: 17.5 },
      { name: 'RBC Count', unit: 'mill/mm3', min: 4.5, max: 5.5 },
      { name: 'Total WBC Count', unit: '/mm3', min: 4000, max: 11000 },
      { name: 'Platelet Count', unit: 'lakhs/mm3', min: 1.5, max: 4.0 },
      { name: 'Hematocrit (HCT)', unit: '%', min: 40, max: 50 },
      { name: 'MCV', unit: 'fL', min: 83, max: 101 },
      { name: 'MCH', unit: 'pg', min: 27, max: 32 },
    ]
  },
  {
    name: 'Liver Function Test (LFT)',
    category: 'Biochemistry',
    parameters: [
      { name: 'Total Bilirubin', unit: 'mg/dL', min: 0.1, max: 1.2 },
      { name: 'Direct Bilirubin', unit: 'mg/dL', min: 0.0, max: 0.3 },
      { name: 'SGPT (ALT)', unit: 'U/L', min: 5, max: 40 },
      { name: 'SGOT (AST)', unit: 'U/L', min: 5, max: 40 },
      { name: 'Alkaline Phosphatase', unit: 'U/L', min: 40, max: 129 },
      { name: 'Total Protein', unit: 'g/dL', min: 6.0, max: 8.3 },
      { name: 'Albumin', unit: 'g/dL', min: 3.5, max: 5.2 },
    ]
  },
  {
    name: 'Renal Function Test (RFT)',
    category: 'Biochemistry',
    parameters: [
      { name: 'Urea', unit: 'mg/dL', min: 15, max: 40 },
      { name: 'Creatinine', unit: 'mg/dL', min: 0.6, max: 1.2 },
      { name: 'Uric Acid', unit: 'mg/dL', min: 3.4, max: 7.0 },
    ]
  },
  {
    name: 'Lipid Profile',
    category: 'Biochemistry',
    parameters: [
      { name: 'Total Cholesterol', unit: 'mg/dL', min: 0, max: 200 },
      { name: 'Triglycerides', unit: 'mg/dL', min: 0, max: 150 },
      { name: 'HDL Cholesterol', unit: 'mg/dL', min: 40, max: 60 },
      { name: 'LDL Cholesterol', unit: 'mg/dL', min: 0, max: 100 },
      { name: 'VLDL', unit: 'mg/dL', min: 5, max: 40 },
    ]
  },
  {
    name: 'Blood Glucose (Fasting)',
    category: 'Biochemistry',
    parameters: [
      { name: 'Fasting Blood Sugar', unit: 'mg/dL', min: 70, max: 100 },
    ]
  },
  {
    name: 'Blood Glucose (Random)',
    category: 'Biochemistry',
    parameters: [
      { name: 'Random Blood Sugar', unit: 'mg/dL', min: 70, max: 140 },
    ]
  },
  {
    name: 'HbA1c',
    category: 'Biochemistry',
    parameters: [
      { name: 'HbA1c', unit: '%', min: 4.0, max: 5.6 },
      { name: 'Estimated Average Glucose', unit: 'mg/dL', min: 70, max: 114 },
    ]
  },
  {
    name: 'Thyroid Profile (T3, T4, TSH)',
    category: 'Immunology',
    parameters: [
      { name: 'Total T3', unit: 'ng/dL', min: 80, max: 200 },
      { name: 'Total T4', unit: 'ug/dL', min: 4.5, max: 12.0 },
      { name: 'TSH', unit: 'uIU/mL', min: 0.4, max: 4.0 },
    ]
  },
  {
    name: 'Serum Electrolytes',
    category: 'Biochemistry',
    parameters: [
      { name: 'Sodium (Na)', unit: 'mEq/L', min: 135, max: 145 },
      { name: 'Potassium (K)', unit: 'mEq/L', min: 3.5, max: 5.0 },
      { name: 'Chloride (Cl)', unit: 'mEq/L', min: 96, max: 106 },
    ]
  },
  {
    name: 'C-Reactive Protein (CRP)',
    category: 'Immunology',
    parameters: [
      { name: 'CRP Quantitative', unit: 'mg/L', min: 0, max: 5.0 },
    ]
  },
  {
    name: 'Vitamin D (25-OH)',
    category: 'Immunology',
    parameters: [
      { name: 'Vitamin D', unit: 'ng/mL', min: 30, max: 100 },
    ]
  },
  {
    name: 'Vitamin B12',
    category: 'Immunology',
    parameters: [
      { name: 'Vitamin B12', unit: 'pg/mL', min: 211, max: 911 },
    ]
  },
  {
    name: 'Iron Profile',
    category: 'Biochemistry',
    parameters: [
      { name: 'Serum Iron', unit: 'ug/dL', min: 60, max: 170 },
      { name: 'TIBC', unit: 'ug/dL', min: 240, max: 450 },
      { name: 'Transferrin Saturation', unit: '%', min: 20, max: 50 },
      { name: 'Ferritin', unit: 'ng/mL', min: 30, max: 400 },
    ]
  },
  {
    name: 'Dengue NS1 Antigen',
    category: 'Serology',
    parameters: [
      { name: 'Dengue NS1', unit: 'Index', min: 0, max: 0.9 }, // Mock ranges
    ]
  },
  {
    name: 'Malaria Parasite (MP)',
    category: 'Microbiology',
    parameters: [
      { name: 'Malaria Antigen', unit: '', min: null, max: null }, // Often reported as Positive/Negative, so min/max null
    ]
  },
  {
    name: 'Widal Test',
    category: 'Serology',
    parameters: [
      { name: 'Salmonella Typhi O', unit: 'Titer', min: 0, max: 80 },
      { name: 'Salmonella Typhi H', unit: 'Titer', min: 0, max: 80 },
    ]
  },
  {
    name: 'Urine Routine Examination',
    category: 'Microbiology',
    parameters: [
      { name: 'Pus Cells', unit: '/HPF', min: 0, max: 5 },
      { name: 'Red Blood Cells', unit: '/HPF', min: 0, max: 2 },
      { name: 'Epithelial Cells', unit: '/HPF', min: 0, max: 5 },
    ]
  },
  {
    name: 'Stool Routine Examination',
    category: 'Microbiology',
    parameters: [
      { name: 'Pus Cells', unit: '/HPF', min: 0, max: 2 },
      { name: 'Ova/Cysts', unit: '', min: null, max: null },
    ]
  },
  {
    name: 'Serum Calcium',
    category: 'Biochemistry',
    parameters: [
      { name: 'Calcium', unit: 'mg/dL', min: 8.5, max: 10.5 },
    ]
  },
  {
    name: 'Prothrombin Time (PT/INR)',
    category: 'Hematology',
    parameters: [
      { name: 'PT', unit: 'seconds', min: 11, max: 13.5 },
      { name: 'INR', unit: 'Ratio', min: 0.8, max: 1.1 },
    ]
  }
];

async function main() {
  console.log('Seeding default test templates...');
  
  for (const template of defaultTemplates) {
    // Check if test template already exists
    const existingTemplate = await prisma.testTemplate.findFirst({
      where: { name: template.name }
    });

    if (!existingTemplate) {
      await prisma.testTemplate.create({
        data: {
          name: template.name,
          category: template.category,
          parameters: {
            create: template.parameters
          }
        }
      });
      console.log(`Created template: ${template.name}`);
    } else {
      console.log(`Template already exists: ${template.name}`);
    }
  }

  console.log('Seeding finished.');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
  });
